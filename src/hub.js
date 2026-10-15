// -----------------------------------------------------------------------------
// The forecast places: their last forecasts, the reads against the API quota,
// the states published to Gladys, the connection status and the transport
// badges.
//
// Quota first. The free DataHub plan allows 360 calls a day: each place reads
// its hourly forecast once per period (15 minutes at the fastest, slowed down
// when the places would exceed the budget, see config.refreshMinutes) and its
// daily forecast every 3 hours. Everything else — the dashboard widget, the
// scene action, a device just added in Gladys, the core's onPoll inside the
// period — is served from the last forecasts, never from a new call.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import {
  DAILY_FORECAST_MINUTES,
  MAX_LOCATIONS,
  callsPerDay,
  locationsFromHouses,
  parseCoordinates,
  refreshMinutes,
} from './config.js';
import { REPORT, STATUS, TRANSPORT, formatNumber, translate, weatherText } from './i18n.js';
import { createIssueLog } from './issues.js';
import { buildLocationDevice, locationIds, locationName, locationStates } from './location.js';
import { ENDPOINTS, ERROR_KINDS, fetchForecast } from './metoffice/client.js';
import { currentStep, parseDaily, parseHourly } from './metoffice/forecast.js';

const logger = createLogger({ name: 'met-office' });

// An unchanged value is sent again every 6 hours, so it stays recently dated
// in Gladys (the front flags a value older than 48 h).
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// A forecast not refreshed for this long is out of date: its values are no
// longer published (the hourly steps of an old run would still "move").
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
// After a 429 (daily quota spent) or a refused key, every read waits this long.
export const RATE_LIMIT_BACKOFF_MS = 60 * 60 * 1000;
export const AUTH_BACKOFF_MS = 60 * 60 * 1000;

const DAILY_PERIOD_MS = DAILY_FORECAST_MINUTES * 60000;

export class ForecastHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] for "today" (default: the container's TZ)
   */
  constructor({ gladys, fetch, now = () => Date.now(), timeZone }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.now = now;
    this.timeZone = timeZone;
    this.issues = createIssueLog(logger);
    this.config = null;
    this.locations = [];
    this.invalid = [];
    this.ignored = [];
    this.unlocated = [];
    /** platformId → { hourly, hourlyReadAt, hourlyOkAt, daily, dailyReadAt, error } */
    this.cache = new Map();
    /** `${platformId}:${endpoint}` → read in progress */
    this.inFlight = new Map();
    /** No API call before this instant (429, refused key). */
    this.backoffUntil = 0;
    this.backoffReason = null;
    this.lastStatus = null;
    /** device external_id → JSON of the last published transport entry */
    this.lastTransports = new Map();
  }

  /** Milliseconds between two reads of the hourly forecast of a place. */
  periodMs() {
    return refreshMinutes(this.config, this.locations.length) * 60000;
  }

  /**
   * A new configuration (or new houses): the places to forecast. The cache of
   * a place that stays is kept, so reloading the houses costs no call.
   * @param {object} config normalized
   * @param {Array} [houses] the houses of Gladys (getHouses)
   */
  setConfig(config, houses = []) {
    const keyChanged = this.config?.api_key !== config.api_key;
    this.config = config;
    if (config.location_source === 'coordinates') {
      const { locations, invalid, ignored } = parseCoordinates(config.coordinates);
      this.locations = locations;
      this.invalid = invalid;
      this.ignored = ignored;
      this.unlocated = [];
    } else {
      const { locations, unlocated, ignored } = locationsFromHouses(houses);
      this.locations = locations;
      this.invalid = [];
      this.ignored = ignored;
      this.unlocated = unlocated;
    }
    const kept = new Set(this.locations.map((l) => l.platformId));
    for (const id of this.cache.keys()) {
      if (keyChanged || !kept.has(id)) {
        this.cache.delete(id);
      }
    }
    if (keyChanged) {
      this.backoffUntil = 0;
      this.backoffReason = null;
    }
    this.lastTransports.clear();
    if (this.invalid.length > 0) {
      logger.warn(`Ignored, not coordinates: ${this.invalid.join(' | ')}`);
    }
    if (this.ignored.length > 0) {
      logger.warn(`Ignored, ${MAX_LOCATIONS} places at most: ${this.ignored.join(' | ')}`);
    }
  }

  isConfigured() {
    return this.config !== null && this.config.api_key !== '';
  }

  /** Configured and with at least one place: the API can be read. */
  isReady() {
    return this.isConfigured() && this.locations.length > 0;
  }

  backingOff() {
    return this.now() < this.backoffUntil ? this.backoffReason : null;
  }

  locationByDevice(externalId) {
    return this.locations.find((l) => locationIds(this.gladys, l).device === externalId);
  }

  /** The places whose device the user added to Gladys. */
  createdLocations() {
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    return this.locations.filter((l) => created.has(locationIds(this.gladys, l).device));
  }

  /** The feature external ids of the device as created in Gladys, null if not created. */
  createdFeatures(location) {
    const id = locationIds(this.gladys, location).device;
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === id);
    if (!device) {
      return null;
    }
    return new Set((device.features ?? []).map((f) => f.external_id));
  }

  entry(location) {
    let entry = this.cache.get(location.platformId);
    if (!entry) {
      entry = {
        hourly: null,
        hourlyReadAt: 0,
        hourlyOkAt: 0,
        daily: null,
        dailyReadAt: 0,
        error: null,
      };
      this.cache.set(location.platformId, entry);
    }
    return entry;
  }

  // --- Reading the API -------------------------------------------------------

  /**
   * Read one forecast of one place now (one API call), unless the same read
   * is in progress or the key is backing off. Never throws.
   * @param {object} location
   * @param {'hourly' | 'daily'} endpoint
   * @returns {Promise<{ outcome: 'ok' | 'error' | 'skipped', error?: Error }>}
   */
  async read(location, endpoint) {
    const key = `${location.platformId}:${endpoint}`;
    const running = this.inFlight.get(key);
    if (running) {
      return running;
    }
    if (this.backingOff()) {
      logger.debug(`${location.platformId}: ${endpoint} read skipped (${this.backoffReason})`);
      return { outcome: 'skipped' };
    }
    const run = this.#read(location, endpoint).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  async #read(location, endpoint) {
    const entry = this.entry(location);
    const now = this.now();
    if (endpoint === ENDPOINTS.HOURLY) {
      entry.hourlyReadAt = now;
    } else {
      entry.dailyReadAt = now;
    }
    try {
      const raw = await fetchForecast({
        apiKey: this.config.api_key,
        endpoint,
        latitude: location.latitude,
        longitude: location.longitude,
        fetch: this.fetch,
      });
      entry.error = null;
      this.issues.ok('api', 'Met Office DataHub answers again');
      this.issues.ok(`refused:${location.platformId}`, `${location.platformId}: accepted again`);
      if (endpoint === ENDPOINTS.HOURLY) {
        entry.hourly = parseHourly(raw);
        entry.hourlyOkAt = now;
        const step = currentStep(entry.hourly, now);
        logger.debug(
          `${location.platformId}: hourly read, ${entry.hourly.steps.length} steps, ` +
            `now ${step?.temperature ?? '?'} °C, code ${step?.code ?? '?'}`,
        );
      } else {
        entry.daily = parseDaily(raw);
        logger.debug(`${location.platformId}: daily read, ${entry.daily.days.length} days`);
      }
      return { outcome: 'ok' };
    } catch (err) {
      entry.error = err;
      this.#onReadError(location, err);
      return { outcome: 'error', error: err };
    }
  }

  #onReadError(location, err) {
    if (err.kind === ERROR_KINDS.RATE_LIMIT) {
      this.backoffUntil = this.now() + RATE_LIMIT_BACKOFF_MS;
      this.backoffReason = 'quota';
      this.issues.fail('api', `Met Office: ${err.message}, pausing one hour`);
    } else if (err.kind === ERROR_KINDS.AUTH) {
      this.backoffUntil = this.now() + AUTH_BACKOFF_MS;
      this.backoffReason = 'refused key';
      this.issues.fail('api', `Met Office: ${err.message}`);
    } else if (err.kind === ERROR_KINDS.BAD_REQUEST) {
      this.issues.fail(`refused:${location.platformId}`, `${location.platformId}: ${err.message}`);
    } else {
      this.issues.fail('api', `Met Office: ${err.message}`);
    }
  }

  // --- What is known ---------------------------------------------------------

  /** The forecast of the place was not refreshed for STALE_AFTER_MS. */
  isStale(location) {
    const entry = this.cache.get(location.platformId);
    return !entry?.hourly || this.now() - entry.hourlyOkAt > STALE_AFTER_MS;
  }

  /** The hourly step of now, null when unknown or out of date. */
  current(location) {
    if (this.isStale(location)) {
      return null;
    }
    return currentStep(this.cache.get(location.platformId).hourly, this.now());
  }

  hourlyOf(location) {
    return this.cache.get(location.platformId)?.hourly ?? null;
  }

  dailyOf(location) {
    return this.cache.get(location.platformId)?.daily ?? null;
  }

  // --- Publishing to Gladys --------------------------------------------------

  /**
   * Publish what is known of one place (no API call): the values of the
   * current hour while the forecast is fresh, nothing once it is out of date
   * — a heartbeat would date an old value as current. Then its transport.
   */
  async publish(location) {
    const createdFeatures = this.createdFeatures(location);
    if (createdFeatures === null) {
      return;
    }
    const step = this.current(location);
    if (step) {
      const states = locationStates(
        this.gladys,
        location,
        step,
        this.config.language,
        createdFeatures,
      );
      if (states.length > 0) {
        await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      }
    }
    if (this.cache.get(location.platformId)?.hourlyOkAt) {
      if (step) {
        this.issues.ok(
          `stale:${location.platformId}`,
          `${location.platformId}: forecast fresh again`,
        );
      } else {
        this.issues.fail(
          `stale:${location.platformId}`,
          `${location.platformId}: forecast out of date`,
        );
      }
    }
    await this.publishTransport(location);
  }

  /** The transport badge of one place, sent when it changes. */
  async publishTransport(location) {
    const externalId = locationIds(this.gladys, location).device;
    const entry = this.cache.get(location.platformId);
    if (!entry || (!entry.hourlyReadAt && !entry.dailyReadAt)) {
      return;
    }
    let item;
    if (this.isStale(location) && entry.error && entry.error.kind !== ERROR_KINDS.RATE_LIMIT) {
      item = { external_id: externalId, transport: DEVICE_TRANSPORTS.UNREACHABLE };
    } else if (this.isStale(location) || !this.current(location)) {
      item = {
        external_id: externalId,
        transport: DEVICE_TRANSPORTS.CLOUD,
        degraded: true,
        message: TRANSPORT.stale,
      };
    } else {
      item = { external_id: externalId, transport: DEVICE_TRANSPORTS.CLOUD };
    }
    const key = JSON.stringify(item);
    if (this.lastTransports.get(externalId) === key) {
      return;
    }
    await this.gladys.publishTransports([item]);
    this.lastTransports.set(externalId, key);
  }

  /** The connection status of the Configuration screen, sent when it changes. */
  async updateStatus() {
    let status;
    if (!this.isConfigured()) {
      status = { connected: false, message: STATUS.notConfigured };
    } else if (this.locations.length === 0) {
      status = { connected: false, message: STATUS.noLocation };
    } else if (this.backingOff() === 'refused key') {
      status = { connected: false, message: STATUS.authFailed };
    } else if (this.backingOff() === 'quota') {
      status = { connected: false, message: STATUS.rateLimited };
    } else {
      const entries = this.locations.map((l) => this.cache.get(l.platformId));
      const read = entries.filter((e) => e && (e.hourlyReadAt > 0 || e.dailyReadAt > 0));
      const allDown =
        read.length > 0 &&
        read.length === entries.length &&
        read.every((e) => [ERROR_KINDS.NETWORK, ERROR_KINDS.SERVER].includes(e.error?.kind));
      status = allDown
        ? { connected: false, message: STATUS.unreachable }
        : { connected: true, message: undefined };
    }
    const key = JSON.stringify(status);
    if (key === this.lastStatus) {
      return;
    }
    await this.gladys.setConnectionStatus(status.connected, status.message);
    this.lastStatus = key;
  }

  // --- The flows -------------------------------------------------------------

  /**
   * Read every place (hourly and daily, one call each) and publish the
   * devices. Used at start, on a new configuration and by the Discovery tab's
   * scan — the scan reuses forecasts younger than half a period.
   * @param {{ reuseFresh?: boolean }} [options]
   */
  async discover({ reuseFresh = false } = {}) {
    if (!this.isReady()) {
      await this.updateStatus();
      return;
    }
    for (const location of this.locations) {
      await this.refresh(location, { minGap: reuseFresh ? 0.5 : 0 });
    }
    await this.updateStatus();
    if (this.backingOff() === 'refused key') {
      return;
    }
    const devices = this.locations.map((location) =>
      buildLocationDevice(this.gladys, location, this.hourlyOf(location), this.config.language),
    );
    try {
      await this.gladys.publishDiscoveredDevices(devices);
    } catch (err) {
      logger.error(`Publishing the forecast devices failed: ${err.message}`);
      await this.gladys.setConnectionStatus(false, STATUS.publishFailed);
      this.lastStatus = null;
      return;
    }
    for (const location of this.createdLocations()) {
      await this.publish(location);
    }
  }

  /**
   * Read the forecasts of a place that are due: the hourly one when not read
   * for `minGap` periods, the daily one when not read for 90 % of 3 hours.
   * @returns {Promise<boolean>} the API was called
   */
  async refresh(location, { minGap = 0.5 } = {}) {
    const entry = this.entry(location);
    const now = this.now();
    let called = false;
    if (now - entry.hourlyReadAt >= this.periodMs() * minGap || !entry.hourlyReadAt) {
      called = (await this.read(location, ENDPOINTS.HOURLY)).outcome !== 'skipped' || called;
    }
    if (now - entry.dailyReadAt >= DAILY_PERIOD_MS * 0.9 || !entry.dailyReadAt) {
      called = (await this.read(location, ENDPOINTS.DAILY)).outcome !== 'skipped' || called;
    }
    return called;
  }

  /**
   * One poll of a place: read what is due, publish, refresh the status.
   * Errors are logged by the issue log, never thrown.
   * @returns {Promise<boolean>} the API was called
   */
  async poll(location, { minGap = 0.5 } = {}) {
    const called = await this.refresh(location, { minGap });
    await this.publish(location).catch((err) => {
      this.issues.fail('gladys', `Publishing the states failed: ${err.message}`);
    });
    await this.updateStatus().catch(() => {});
    return called;
  }

  /** A device was just added (or updated) in Gladys: send what is known now. */
  async onDeviceCreated(device) {
    const location = this.locationByDevice(device.external_id);
    if (!location) {
      return false;
    }
    this.lastTransports.delete(device.external_id);
    if (!this.hourlyOf(location)) {
      await this.refresh(location, { minGap: 0 });
    }
    await this.publish(location);
    return true;
  }

  /**
   * The "Test the connection" action: read every place now and say how each
   * one answered.
   * @returns {Promise<Record<string, string>>} multi-language report
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return translate(REPORT, (t) => t.notConfigured);
    }
    if (this.locations.length === 0) {
      return translate(REPORT, (t) => t.noLocation);
    }
    // A user asking for a test lifts the back-off: one call per place.
    this.backoffUntil = 0;
    this.backoffReason = null;
    const results = await Promise.all(
      this.locations.map(async (location) => {
        const result = await this.read(location, ENDPOINTS.HOURLY);
        await this.publish(location).catch(() => {});
        return { location, result };
      }),
    );
    await this.updateStatus().catch(() => {});
    if (results.some(({ result }) => result.error?.kind === ERROR_KINDS.AUTH)) {
      return translate(REPORT, (t) => t.authFailed);
    }
    if (results.some(({ result }) => result.error?.kind === ERROR_KINDS.RATE_LIMIT)) {
      return translate(REPORT, (t) => t.rateLimited);
    }
    const minutes = refreshMinutes(this.config, this.locations.length);
    const calls = callsPerDay(this.config, this.locations.length);
    return Object.fromEntries(
      Object.entries(REPORT).map(([lang, t]) => {
        const lines = results.map(({ location, result }) => {
          const hourly = this.hourlyOf(location);
          const name = locationName(location, hourly);
          if (result.outcome === 'ok') {
            const step = currentStep(hourly, this.now());
            const temperature =
              step?.temperature === null || !step
                ? '?'
                : `${formatNumber(step.temperature, lang)} °C`;
            const km = hourly.distance === null ? '?' : formatNumber(hourly.distance / 1000, lang);
            return t.ok(name, temperature, weatherText(step?.code ?? null, lang), km);
          }
          return result.error?.kind === ERROR_KINDS.BAD_REQUEST ? t.refused(name) : t.failed(name);
        });
        if (this.invalid.length > 0) {
          lines.push(t.invalid(this.invalid.join(' | ')));
        }
        if (this.ignored.length > 0) {
          lines.push(t.ignored(this.ignored.join(', '), MAX_LOCATIONS));
        }
        if (this.unlocated.length > 0) {
          lines.push(t.unlocated(this.unlocated.join(', ')));
        }
        lines.push(t.pace(minutes, calls));
        return [lang, lines.join('\n')];
      }),
    );
  }
}
