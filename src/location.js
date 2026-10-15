// -----------------------------------------------------------------------------
// One Gladys device per forecast place.
//
// External ids are forever: the device is `location` + the platform id of the
// place (`house-<selector>` for a house of Gladys, the position rounded to
// 3 decimals for typed coordinates), each feature key below is frozen once
// published. Read-only sensors only: nothing here is a command.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, pick, weatherText } from './i18n.js';

export const DEVICE_TYPE = 'location';

/**
 * Feature key → definition. `value` reads the current hourly step (see
 * metoffice/forecast.js). Bounds are display bounds (the core never clamps
 * a state); temperatures are symmetric so a gauge needle stays right.
 */
export const FEATURES = {
  temperature: {
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -50,
    max: 50,
    value: (s) => s.temperature,
  },
  feels_like: {
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -60,
    max: 60,
    value: (s) => s.feelsLike,
  },
  humidity: {
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    value: (s) => s.humidity,
  },
  pressure: {
    category: C.PRESSURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.HECTO_PASCAL,
    min: 900,
    max: 1100,
    value: (s) => s.pressure,
  },
  wind_speed: {
    category: C.SPEED_SENSOR,
    type: T.SPEED_SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
    value: (s) => s.windSpeed,
  },
  wind_gust: {
    category: C.SPEED_SENSOR,
    type: T.SPEED_SENSOR.DECIMAL,
    unit: U.KILOMETER_PER_HOUR,
    min: 0,
    max: 300,
    value: (s) => s.windGust,
  },
  wind_direction: {
    category: C.ANGLE_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.DEGREE,
    min: 0,
    max: 360,
    value: (s) => (s.windDirection === null ? null : Math.round(s.windDirection)),
  },
  // Gladys has no "probability" category: the precipitation sensor in percent
  // keeps the umbrella icon and the history, and its name says what it is.
  precipitation_probability: {
    category: C.PRECIPITATION_SENSOR,
    type: T.PRECIPITATION_SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    value: (s) => s.precipitationProbability,
  },
  precipitation_rate: {
    category: C.PRECIPITATION_SENSOR,
    type: T.PRECIPITATION_SENSOR.DECIMAL,
    unit: U.MILLIMETER_PER_HOUR,
    min: 0,
    max: 200,
    value: (s) => s.precipitationRate,
  },
  visibility: {
    category: C.DISTANCE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.KM,
    min: 0,
    max: 100,
    value: (s) => s.visibility,
  },
  uv_index: {
    category: C.UV_SENSOR,
    type: T.UV_SENSOR.INTEGER,
    unit: U.UV_INDEX,
    min: 0,
    max: 20,
    value: (s) => s.uvIndex,
  },
  // The weather of the hour, in the language of the configuration (a text
  // state is never translated by Gladys). min/max are NOT NULL in the core.
  weather: {
    category: C.TEXT,
    type: T.TEXT.TEXT,
    min: 0,
    max: 0,
    text: true,
    value: (s, language) => (s.code === null ? null : weatherText(s.code, language)),
  },
};

/** The external ids of a place (device and features). */
export function locationIds(gladys, location) {
  return gladys.externalIds(DEVICE_TYPE, location.platformId);
}

/** The name of the place: the house or typed name, else the model point's. */
export function locationName(location, hourly) {
  return location.name ?? hourly?.name ?? `${location.latitude}, ${location.longitude}`;
}

/**
 * The discovery payload of one place.
 * @param {object} gladys
 * @param {object} location see config.js
 * @param {object | null} hourly the parsed hourly forecast, if read
 * @param {string} language feature names
 */
export function buildLocationDevice(gladys, location, hourly, language) {
  const ids = locationIds(gladys, location);
  const names = pick(FEATURE_NAMES, language);
  return {
    name: `Met Office ${locationName(location, hourly)}`.slice(0, 100),
    external_id: ids.device,
    model: 'Met Office site-specific forecast',
    // Gladys calls onPoll only with both fields; the container refreshes by
    // itself anyway (src/poller.js, GladysAssistant/Gladys#3198).
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: Object.entries(FEATURES).map(([key, def]) => {
      const feature = {
        name: names[key],
        external_id: ids.feature(key),
        category: def.category,
        type: def.type,
        min: def.min,
        max: def.max,
        read_only: true,
        has_feedback: false,
        keep_history: !def.text,
      };
      if (def.unit) {
        feature.unit = def.unit;
      }
      return feature;
    }),
  };
}

/**
 * The states of one place for the current step: every feature of the device
 * as created in Gladys (`createdFeatures`, external ids) whose value is known.
 * @param {object} gladys
 * @param {object} location
 * @param {object} step the current hourly step
 * @param {string} language of the weather text
 * @param {Set<string>} [createdFeatures]
 */
export function locationStates(gladys, location, step, language, createdFeatures) {
  const ids = locationIds(gladys, location);
  const states = [];
  for (const [key, def] of Object.entries(FEATURES)) {
    const externalId = ids.feature(key);
    if (createdFeatures && !createdFeatures.has(externalId)) {
      continue;
    }
    const value = def.value(step, language);
    if (value === null || value === undefined || value === '') {
      continue;
    }
    states.push(
      def.text
        ? { device_feature_external_id: externalId, text: value }
        : { device_feature_external_id: externalId, state: value },
    );
  }
  return states;
}
