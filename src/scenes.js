// -----------------------------------------------------------------------------
// The scene action "get_forecast": the daily forecast of today, tomorrow or
// the day after, as outputs the next steps of a scene can test or quote
// ("tomorrow's chance of rain above 70 %: notify, fold the awning").
//
// What the device features cannot give: they carry the hour of now, the
// days ahead live only here and in the widget. No scene trigger on purpose:
// "it rains now" is the precipitation features, which a scene already
// watches with a threshold.
//
// Served from the last daily forecast (read every 3 hours); one read only
// when the place has none yet. The outputs speak the configuration's
// language: a scene action does not receive the user's.
// -----------------------------------------------------------------------------

import { ENDPOINTS } from './metoffice/client.js';
import { addDays, localDate } from './metoffice/forecast.js';
import { weatherText } from './i18n.js';
import { locationName } from './location.js';

export const SCENE_ACTION = { GET_FORECAST: 'get_forecast' };
export const DAYS = { today: 0, tomorrow: 1, day_after_tomorrow: 2 };

/**
 * @param {import('./hub.js').ForecastHub} hub
 * @param {{ device?: string, day?: string }} fields resolved by the core
 * @returns {Promise<object>} the declared outputs
 */
export async function getForecast(hub, fields = {}) {
  if (!hub.isReady()) {
    throw new Error('Met Office: not configured, or no place to forecast');
  }
  const location = fields.device
    ? hub.locationByDevice(fields.device)
    : (hub.createdLocations()[0] ?? hub.locations[0]);
  if (!location) {
    throw new Error('Met Office: this place is no longer in the configuration');
  }
  const offset = DAYS[fields.day] ?? DAYS.tomorrow;
  if (!hub.dailyOf(location)) {
    await hub.read(location, ENDPOINTS.DAILY);
  }
  const daily = hub.dailyOf(location);
  const date = addDays(localDate(hub.now(), hub.timeZone), offset);
  const day = daily?.days.find((d) => d.date === date);
  if (!day) {
    throw new Error(`Met Office: no daily forecast for ${date} yet`);
  }
  const language = hub.config.language;
  const code = day.dayCode ?? day.nightCode;
  const outputs = {
    place: locationName(location, hub.hourlyOf(location)),
    date,
    weather: weatherText(code, language),
    weather_code: code,
    max_temperature: day.maxTemperature,
    min_temperature: day.minTemperature,
    rain_probability_day: day.dayPrecipitationProbability,
    rain_probability_night: day.nightPrecipitationProbability,
    wind_gust: day.windGust,
    uv_index: day.uvIndex,
  };
  // An unknown value is left out rather than sent as null: the core drops
  // what it cannot coerce, and a scene then sees the variable empty.
  return Object.fromEntries(Object.entries(outputs).filter(([, v]) => v !== null));
}

export const SCENE_ACTIONS = {
  [SCENE_ACTION.GET_FORECAST]: getForecast,
};
