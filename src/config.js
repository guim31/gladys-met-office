// -----------------------------------------------------------------------------
// Integration configuration: defaults (mirroring the manifest `config_schema`),
// normalization, the places to forecast and the refresh pace the free API
// quota allows.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Where the places come from: the houses of Gladys, or coordinates typed in.
export const LOCATION_SOURCES = ['houses', 'coordinates'];

// Choices of the `refresh_minutes` select, in minutes.
export const REFRESH_CHOICES = ['15', '30', '60'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js).
export const DEFAULT_CONFIG = {
  api_key: '',
  location_source: 'houses',
  coordinates: '',
  refresh_minutes: '30',
  language: 'fr',
};

// The free "Site-specific Global Spot" plan of the Met Office Weather DataHub
// allows 360 calls a day, per subscription (the three endpoints share them,
// no carry-over to the next day). The integration keeps 10 % of it for the
// restarts, the "Test" button and the user's other tools sharing the key.
export const DAILY_CALL_BUDGET = 324;
// The daily forecast (7 days ahead, a new run every few hours) is read every
// 3 hours: 8 calls a day per place.
export const DAILY_FORECAST_MINUTES = 180;
// Three places at the fastest pace fit the budget: 3 × (96 + 8) = 312.
export const MAX_LOCATIONS = 3;

/**
 * Merge the user config with the defaults and force the types.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pick = (key, allowed) => {
    const value = String(raw[key] ?? DEFAULT_CONFIG[key]);
    return allowed.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  return {
    api_key: String(raw.api_key ?? '').trim(),
    location_source: pick('location_source', LOCATION_SOURCES),
    coordinates: String(raw.coordinates ?? ''),
    refresh_minutes: pick('refresh_minutes', REFRESH_CHOICES),
    language: pick('language', LANGUAGES),
  };
}

/** A latitude or longitude typed with a dot or a decimal comma. */
function parseDegrees(text, limit) {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

// "London: 51.5072, -0.1276", or the two numbers without a name. They are
// separated by a slash, a comma followed by a space, a lone comma or spaces —
// in that order, so a decimal comma stays possible ("51,5072 / -0,1276").
const NUMBER = /^-?\d{1,3}(?:[.,]\d+)?$/;

function splitPair(text) {
  const attempts = [/\s*\/\s*/, /,\s+/, /\s*,\s*/, /\s+/];
  for (const separator of attempts) {
    const parts = text.split(separator);
    if (parts.length === 2 && parts.every((part) => NUMBER.test(part))) {
      return parts;
    }
  }
  return null;
}

/** One entry of the coordinates field: `{ name, latitude, longitude }` or null. */
export function parseEntry(entry) {
  const colon = entry.indexOf(':');
  const name = colon > 0 ? entry.slice(0, colon).trim().slice(0, 40) : '';
  const pair = splitPair(entry.slice(colon + 1).trim());
  if (!pair) {
    return null;
  }
  const latitude = parseDegrees(pair[0], 90);
  const longitude = parseDegrees(pair[1], 180);
  if (latitude === null || longitude === null) {
    return null;
  }
  return { name: name || null, latitude, longitude };
}

/**
 * The places typed in the `coordinates` field: entries separated by
 * semicolons or line breaks, deduplicated, capped at MAX_LOCATIONS.
 * The platform id is the position rounded to 3 decimals (about 100 m): the
 * same place typed again with more digits stays the same device.
 * @param {string} text
 * @returns {{ locations: object[], invalid: string[], ignored: string[] }}
 */
export function parseCoordinates(text) {
  const locations = [];
  const invalid = [];
  const ignored = [];
  const seen = new Set();
  for (const raw of String(text).split(/[;\n]+/)) {
    const entry = raw.trim();
    if (entry === '') {
      continue;
    }
    const parsed = parseEntry(entry);
    if (!parsed) {
      invalid.push(entry.slice(0, 60));
      continue;
    }
    const { name, latitude, longitude } = parsed;
    const platformId = `${latitude.toFixed(3)}_${longitude.toFixed(3)}`;
    if (seen.has(platformId)) {
      continue;
    }
    seen.add(platformId);
    if (locations.length >= MAX_LOCATIONS) {
      ignored.push(entry.slice(0, 60));
      continue;
    }
    locations.push({
      platformId,
      name,
      latitude,
      longitude,
    });
  }
  return { locations, invalid, ignored };
}

/**
 * The places of the houses of Gladys (getHouses): the located ones, capped at
 * MAX_LOCATIONS. The platform id is the house selector, so moving the house
 * pin keeps the device.
 * @param {Array<{ name: string, selector: string, latitude: number|null, longitude: number|null }>} houses
 * @returns {{ locations: object[], unlocated: string[], ignored: string[] }}
 */
export function locationsFromHouses(houses) {
  const locations = [];
  const unlocated = [];
  const ignored = [];
  for (const house of houses ?? []) {
    const located =
      Number.isFinite(house?.latitude) &&
      Number.isFinite(house?.longitude) &&
      Math.abs(house.latitude) <= 90 &&
      Math.abs(house.longitude) <= 180;
    if (!located) {
      unlocated.push(house?.name ?? '?');
      continue;
    }
    if (locations.length >= MAX_LOCATIONS) {
      ignored.push(house.name);
      continue;
    }
    locations.push({
      platformId: `house-${house.selector}`,
      name: house.name,
      latitude: house.latitude,
      longitude: house.longitude,
    });
  }
  return { locations, unlocated, ignored };
}

/**
 * Minutes between two reads of the hourly forecast of each place: the user's
 * choice, slowed down when the places would exceed the daily budget.
 * @param {{ refresh_minutes: string }} config
 * @param {number} locationCount
 */
export function refreshMinutes(config, locationCount) {
  const chosen = Number(config.refresh_minutes);
  const count = Math.max(locationCount, 1);
  const dailyReads = (24 * 60) / DAILY_FORECAST_MINUTES;
  const left = DAILY_CALL_BUDGET - count * dailyReads;
  const floor = Math.ceil((count * 24 * 60) / left);
  return Math.max(chosen, floor);
}

/** API calls a day for these places at this pace (said in the test report). */
export function callsPerDay(config, locationCount) {
  const minutes = refreshMinutes(config, locationCount);
  return Math.ceil(locationCount * ((24 * 60) / minutes + (24 * 60) / DAILY_FORECAST_MINUTES));
}
