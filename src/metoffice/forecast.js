// -----------------------------------------------------------------------------
// The raw DataHub answers, normalized in the units Gladys uses.
//
// DataHub units (its parameter metadata): temperatures in °C, wind in m/s,
// pressure in Pa, visibility in metres, rates in mm/h, probabilities in %.
// Gladys gets km/h (its speed sensors know m/s and km/h, not mph), hPa, km.
//
// Every value is a forecast of the model run, the current one included: the
// "now" of a place is the hourly time step nearest to the clock, as Home
// Assistant does. Nothing here is an observation.
// -----------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

/** A finite number, or null (missing or not a number). */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const round = (value, digits = 1) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const msToKmh = (value) => (value === null ? null : round(value * 3.6));
const paToHpa = (value) => (value === null ? null : round(value / 100));
const mToKm = (value) => (value === null ? null : round(value / 1000));

/** "2024-11-23T12:00Z" → milliseconds, or null. */
function parseTime(text) {
  const ms = typeof text === 'string' ? Date.parse(text) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** What every answer shares: the grid point the forecast is for. */
function site(raw) {
  const feature = raw?.features?.[0] ?? {};
  const properties = feature.properties ?? {};
  const [longitude, latitude, elevation] = feature.geometry?.coordinates ?? [];
  const name = properties.location?.name;
  return {
    name: typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
    latitude: num(latitude),
    longitude: num(longitude),
    elevation: num(elevation),
    // How far the model point is from the requested position, in metres.
    distance: num(properties.requestPointDistance),
    modelRunAt: parseTime(properties.modelRunDate),
    series: Array.isArray(properties.timeSeries) ? properties.timeSeries : [],
  };
}

/** A weather code of the documented list (-1 to 30), or null. */
function weatherCode(value) {
  const code = num(value);
  return code !== null && Number.isInteger(code) && code >= -1 && code <= 30 ? code : null;
}

/**
 * The hourly answer: the place and its steps, oldest first.
 * @param {object} raw GeoJSON of the `hourly` endpoint
 */
export function parseHourly(raw) {
  const { series, ...place } = site(raw);
  const steps = series
    .map((step) => ({
      time: parseTime(step.time),
      temperature: round(num(step.screenTemperature)),
      feelsLike: round(num(step.feelsLikeTemperature)),
      dewPoint: round(num(step.screenDewPointTemperature)),
      humidity: round(num(step.screenRelativeHumidity)),
      pressure: paToHpa(num(step.mslp)),
      windSpeed: msToKmh(num(step.windSpeed10m)),
      windGust: msToKmh(num(step.windGustSpeed10m)),
      windDirection: num(step.windDirectionFrom10m),
      visibility: mToKm(num(step.visibility)),
      uvIndex: num(step.uvIndex),
      code: weatherCode(step.significantWeatherCode),
      precipitationRate: round(num(step.precipitationRate), 2),
      precipitationProbability: num(step.probOfPrecipitation),
    }))
    .filter((step) => step.time !== null)
    .sort((a, b) => a.time - b.time);
  return { ...place, steps };
}

/**
 * The daily answer: one entry per date. A date's `day` is its daytime, its
 * `night` the night that follows it (Met Office "today" and "tonight"). The
 * first entry can be a past date carrying its night only.
 * @param {object} raw GeoJSON of the `daily` endpoint
 */
export function parseDaily(raw) {
  const { series, ...place } = site(raw);
  const days = series
    .map((step) => ({
      date: typeof step.time === 'string' ? step.time.slice(0, 10) : null,
      dayCode: weatherCode(step.daySignificantWeatherCode),
      nightCode: weatherCode(step.nightSignificantWeatherCode),
      maxTemperature: round(num(step.dayMaxScreenTemperature)),
      minTemperature: round(num(step.nightMinScreenTemperature)),
      dayPrecipitationProbability: num(step.dayProbabilityOfPrecipitation),
      nightPrecipitationProbability: num(step.nightProbabilityOfPrecipitation),
      uvIndex: num(step.maxUvIndex),
      windSpeed: msToKmh(num(step.midday10MWindSpeed)),
      windGust: msToKmh(num(step.midday10MWindGust)),
      windDirection: num(step.midday10MWindDirection),
    }))
    .filter((day) => day.date !== null && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...place, days };
}

/**
 * The hourly step nearest to `now`, or null when the forecast no longer
 * covers it (more than an hour past its last step, or before its first).
 * @param {{ steps: object[] }} hourly
 * @param {number} now
 */
export function currentStep(hourly, now) {
  let best = null;
  for (const step of hourly?.steps ?? []) {
    if (best === null || Math.abs(step.time - now) < Math.abs(best.time - now)) {
      best = step;
    }
  }
  if (best === null || Math.abs(best.time - now) > HOUR_MS) {
    return null;
  }
  return best;
}

/** The hourly steps after the current one, `count` at most. */
export function nextSteps(hourly, now, count) {
  return (hourly?.steps ?? []).filter((step) => step.time > now).slice(0, count);
}

/** The local date (YYYY-MM-DD) of an instant, in the container's time zone (TZ). */
export function localDate(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The YYYY-MM-DD date `offset` days after `date`. */
export function addDays(date, offset) {
  const ms = Date.parse(`${date}T12:00:00Z`) + offset * 24 * HOUR_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The days of the daily forecast from today on, `count` at most.
 * @param {{ days: object[] }} daily
 * @param {string} today YYYY-MM-DD
 */
export function upcomingDays(daily, today, count) {
  return (daily?.days ?? []).filter((day) => day.date >= today).slice(0, count);
}

/** The point of a 16-point compass (0 = N, 4 = E, 8 = S, 12 = W) of a direction in degrees. */
export function compassPoint(degrees) {
  return Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
}
