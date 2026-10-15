// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the hub, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MAX_LOCATIONS, normalizeConfig, refreshMinutes } from './config.js';
import { ForecastHub } from './hub.js';
import { STATUS } from './i18n.js';
import { locationIds, locationName } from './location.js';
import { createPoller } from './poller.js';
import { SCENE_ACTIONS } from './scenes.js';
import { VIEWS, WIDGET, buildForecastContent, messageContent } from './widgets.js';

const logger = createLogger({ name: 'met-office-app' });

export const ACTION = { TEST: 'test_connection' };

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {string} [options.timeZone]
 * @param {boolean} [options.timers] run the refresh timer
 * @param {number} [options.tickMs] timer tick override
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new ForecastHub({
    gladys,
    fetch: options.fetch,
    now: options.now,
    timeZone: options.timeZone,
  });
  const poller = createPoller({
    hub,
    timers: options.timers ?? true,
    tickMs: options.tickMs,
    // New forecasts: the widget's lists changed. One nudge per cycle (the
    // core rate-limits it to one per 10 s per widget).
    onPolled: () => requestRefresh(),
  });

  // Resolved once the first configuration is applied; every handler waits
  // for it, so a poll arriving during the first reads is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  /** The houses of Gladys, when they are the source of the places. */
  async function houses(config) {
    if (config.location_source !== 'houses') {
      return [];
    }
    try {
      return await gladys.getHouses();
    } catch (err) {
      logger.warn(`The houses of Gladys could not be read (${err.message})`);
      return [];
    }
  }

  /** Read the houses again (they have no update event), keeping the config. */
  async function reloadPlaces() {
    if (hub.config) {
      hub.setConfig(hub.config, await houses(hub.config));
    }
  }

  /** Apply a configuration: read every place, publish, (re)start the timer. */
  async function apply(config) {
    poller.stop();
    hub.setConfig(config, await houses(config));
    if (!hub.isConfigured()) {
      logger.info('Not configured yet: waiting for the API key');
    } else if (hub.locations.length === 0) {
      logger.info(
        config.location_source === 'houses'
          ? 'No located house in Gladys: nothing to forecast'
          : 'No valid coordinates: nothing to forecast',
      );
    } else {
      logger.info(
        `Forecasting ${hub.locations.length} place(s), the hourly forecast read every ` +
          `${refreshMinutes(config, hub.locations.length)} min` +
          (hub.ignored.length > 0 ? ` (${MAX_LOCATIONS} at most)` : ''),
      );
    }
    await hub.discover();
    requestRefresh();
    poller.start();
  }

  /** "Re-pull the widget now": fire-and-forget, dropped while Gladys is away. */
  function requestRefresh() {
    try {
      gladys.requestWidgetRefresh(WIDGET.FORECAST);
    } catch (err) {
      logger.debug(`Widget refresh not sent (${err.message})`);
    }
  }

  gladys.on('connected', async () => {
    try {
      if (started) {
        // A reconnection (Gladys restarted): it may have lost the last
        // states and statuses, and the houses may have moved.
        hub.lastStatus = null;
        hub.lastTransports.clear();
        gladys.forgetPublishedStates();
        await reloadPlaces();
        for (const location of hub.createdLocations()) {
          await hub.publish(location).catch(() => {});
        }
        await hub.updateStatus();
        return;
      }
      started = true;
      await apply(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, STATUS.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(
    whenReady(async () => {
      logger.info('Discovery requested: publishing the places');
      await reloadPlaces();
      await hub.discover({ reuseFresh: true });
    }),
  );

  gladys.onPoll(
    whenReady(async (device) => {
      await poller.pollFromCore(device);
    }),
  );

  // A device just added (or updated): Gladys dropped the states it received
  // before, send everything now, from the last forecast.
  const onDeviceChanged = whenReady(async (device) => {
    if (await hub.onDeviceCreated(device)) {
      requestRefresh();
    }
  });
  gladys.onDeviceCreated(onDeviceChanged);
  gladys.onDeviceUpdated(onDeviceChanged);

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      logger.info('New configuration received');
      await apply(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    ACTION.TEST,
    whenReady(async () => {
      logger.info('Action: test the connection');
      await reloadPlaces();
      const report = await hub.testConnection();
      requestRefresh();
      return report;
    }),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady(async (fields) => {
        logger.info(`Scene action: ${key}`);
        return handler(hub, fields);
      }),
    );
  }

  gladys.onWidgetGet(
    WIDGET.FORECAST,
    whenReady(async ({ settings = {}, language, units } = {}) => {
      if (!hub.isConfigured()) {
        return messageContent(language, 'notConfigured');
      }
      const location = settings.location
        ? hub.locationByDevice(settings.location)
        : (hub.createdLocations()[0] ?? hub.locations[0]);
      if (!location) {
        return messageContent(language, 'noLocation');
      }
      const ids = locationIds(gladys, location);
      const hourly = hub.hourlyOf(location);
      return buildForecastContent({
        name: locationName(location, hourly),
        hourly,
        daily: hub.dailyOf(location),
        current: hub.current(location),
        featureId: (key) => ids.feature(key),
        createdFeatures: hub.createdFeatures(location),
        view: VIEWS.includes(settings.view) ? settings.view : 'days',
        language,
        units,
        now: hub.now(),
        timeZone: hub.timeZone,
      });
    }),
  );

  return {
    hub,
    poller,
    ready,
    async stop() {
      poller.stop();
    },
  };
}
