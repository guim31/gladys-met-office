// -----------------------------------------------------------------------------
// The dashboard widget "forecast": the Met Office forecast of one place.
//
// Served from the last forecasts the poller read, never from a new API call
// (the quota). Two views, a widget setting: the next 7 days (a list, a tap
// opens the details of a day) or the next 24 hours (the temperature curve and
// the next hours). The tiles of a place added to Gladys are bound to its
// features, so they move with the published states without a refresh.
//
// Content budget of the core (applied before resolving the references): at
// most 8 components, 2 texts, 6 tiles, 1 focal, 1 status list. Here: a
// heading, a caption, three tiles, one focal (list or chart), at most one
// status list.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  COMPASS,
  LOCALES,
  WIDGET_TEXT,
  formatNumber,
  pick,
  weatherIcon,
  weatherText,
} from './i18n.js';
import { compassPoint, localDate, nextSteps, upcomingDays } from './metoffice/forecast.js';

export const WIDGET = { FORECAST: 'forecast' };
export const VIEWS = ['days', 'hours'];

const text = (value, variant = 'body') => ({ type: 'text', text: value, variant });

/** Temperature and wind in the user's unit system (`metric` or `us`). */
function unitsOf(units) {
  const us = units === 'us';
  return {
    temperature: (c) => (us ? c * 1.8 + 32 : c),
    temperatureUnit: us ? '°F' : '°C',
    wind: (kmh) => (us ? kmh / 1.609344 : kmh),
    windUnit: us ? 'mph' : 'km/h',
  };
}

/** "Thursday 23" in the language. */
function dayTitle(date, language) {
  const label = new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "14:00" in the time zone of Gladys. */
function hourOf(ms, language, timeZone) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(ms));
}

/**
 * @param {object} options
 * @param {string} options.name the name of the place
 * @param {object | null} options.hourly parsed hourly forecast
 * @param {object | null} options.daily parsed daily forecast
 * @param {object | null} options.current the hourly step of now (null: out of date)
 * @param {(key: string) => string} options.featureId external id of a feature
 * @param {Set<string> | null} options.createdFeatures features of the device in Gladys
 * @param {string} options.view 'days' | 'hours'
 * @param {string} options.language
 * @param {string} [options.units] 'metric' | 'us'
 * @param {number} options.now
 * @param {string} [options.timeZone]
 */
export function buildForecastContent({
  name,
  hourly,
  daily,
  current,
  featureId,
  createdFeatures,
  view,
  language,
  units,
  now,
  timeZone,
}) {
  const t = pick(WIDGET_TEXT, language);
  const u = unitsOf(units);
  const fmt = (value, digits = 0) => formatNumber(value, language, digits);
  const components = [text(name.slice(0, 40), 'heading')];

  if (!hourly && !daily) {
    components.push(text(t.waiting));
    return { ttl_seconds: 60, components };
  }

  if (!current) {
    components.push(text(t.stale, 'caption'));
  } else if (hourly?.modelRunAt) {
    components.push(text(t.issued(hourOf(hourly.modelRunAt, language, timeZone)), 'caption'));
  }

  // Tiles: live when the device is in Gladys (the core converts its units).
  const tiles = [
    {
      key: 'temperature',
      label: t.temperature,
      value: current?.temperature,
      render: (v) => Math.round(u.temperature(v) * 10) / 10,
      unit: u.temperatureUnit,
    },
    {
      key: 'precipitation_probability',
      label: t.rain,
      value: current?.precipitationProbability,
      render: (v) => v,
      unit: '%',
    },
    {
      key: 'wind_speed',
      label: t.wind,
      value: current?.windSpeed,
      render: (v) => Math.round(u.wind(v)),
      unit: u.windUnit,
    },
  ];
  for (const tile of tiles) {
    const id = featureId(tile.key);
    if (createdFeatures?.has(id)) {
      components.push({ type: 'value', label: tile.label, device_feature: id });
    } else if (tile.value !== null && tile.value !== undefined) {
      components.push({
        type: 'value',
        label: tile.label,
        value: tile.render(tile.value),
        unit: tile.unit,
      });
    }
  }

  const degrees = (c) => `${fmt(u.temperature(c))}°`;

  if (view === 'hours') {
    const steps = nextSteps(hourly, now, 24).filter((s) => s.temperature !== null);
    if (steps.length > 1) {
      const points = steps.map((s) => ({
        t: new Date(s.time).toISOString(),
        v: Math.round(u.temperature(s.temperature) * 10) / 10,
      }));
      const max = points.reduce((a, b) => (b.v > a.v ? b : a));
      const min = points.reduce((a, b) => (b.v < a.v ? b : a));
      components.push({
        type: 'chart',
        chart_type: 'line',
        unit: u.temperatureUnit,
        series: [{ name: t.temperatureSeries, points }],
        annotations: [
          {
            t: max.t,
            value: max.v,
            label: `${t.max} ${fmt(max.v)}°`,
            color: WIDGET_COLORS.WARNING,
          },
          { t: min.t, value: min.v, label: `${t.min} ${fmt(min.v)}°`, color: WIDGET_COLORS.INFO },
        ],
      });
    }
    const items = nextSteps(hourly, now, 6).map((s) => {
      const parts = [weatherText(s.code, language)];
      if (s.temperature !== null) {
        parts.push(degrees(s.temperature));
      }
      if (s.precipitationProbability !== null) {
        parts.push(`${fmt(s.precipitationProbability)} %`);
      }
      return {
        label: hourOf(s.time, language, timeZone),
        value: parts.join(' · ').slice(0, 40),
        icon: weatherIcon(s.code),
        color: (s.precipitationProbability ?? 0) >= 50 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
      };
    });
    if (items.length > 0) {
      components.push({ type: 'status', items });
    }
    return { ttl_seconds: 300, components };
  }

  // The days: today and the next six.
  const today = localDate(now, timeZone);
  const days = upcomingDays(daily, today, 7);
  if (days.length === 0) {
    components.push(text(t.waiting));
    return { ttl_seconds: 300, components };
  }
  components.push({
    type: 'card-list',
    display: 'list',
    items: days.map((day) => {
      // Today after dusk, the day part may be gone: the night speaks.
      const code = day.dayCode ?? day.nightCode;
      const temperatures = [day.maxTemperature, day.minTemperature]
        .filter((v) => v !== null)
        .map(degrees)
        .join(' / ');
      const rain = Math.max(
        day.dayPrecipitationProbability ?? 0,
        day.nightPrecipitationProbability ?? 0,
      );
      const details = [];
      if (day.dayCode !== null) {
        details.push(t.day(weatherText(day.dayCode, language)));
      }
      if (day.nightCode !== null) {
        details.push(t.night(weatherText(day.nightCode, language)));
      }
      if (day.windSpeed !== null) {
        const direction =
          day.windDirection === null
            ? ''
            : ` ${pick(COMPASS, language)[compassPoint(day.windDirection)]}`;
        const gust = day.windGust === null ? '' : `, ${t.gust} ${fmt(u.wind(day.windGust))}`;
        details.push(`${t.wind}${direction} ${fmt(u.wind(day.windSpeed))} ${u.windUnit}${gust}`);
      }
      if (day.uvIndex !== null) {
        details.push(`${t.uv} ${fmt(day.uvIndex)}`);
      }
      return {
        title: dayTitle(day.date, language),
        subtitle: [weatherText(code, language), temperatures]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 60),
        badge: {
          text: `${fmt(rain)} %`,
          color: rain >= 50 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
        },
        description: details.join('\n'),
      };
    }),
  });
  return { ttl_seconds: 300, components };
}

/** The content when the integration is not configured, or has no place. */
export function messageContent(language, key) {
  const t = pick(WIDGET_TEXT, language);
  return { ttl_seconds: 60, components: [text(t[key])] };
}
