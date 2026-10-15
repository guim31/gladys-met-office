// -----------------------------------------------------------------------------
// The DataHub answers normalized: the real answers of Home Assistant's tests
// (Wavertree, King's Lynn, 23 November 2024), their units converted.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  compassPoint,
  currentStep,
  localDate,
  nextSteps,
  parseDaily,
  parseHourly,
  upcomingDays,
} from '../src/metoffice/forecast.js';
import { NOW, fixture } from './helpers/world.js';

test('the hourly forecast: the place, the model point and 49 steps', () => {
  const hourly = parseHourly(fixture('hourly-wavertree.json'));
  assert.equal(hourly.name, 'Wavertree');
  assert.equal(hourly.latitude, 53.3986);
  assert.equal(hourly.longitude, -2.9256);
  assert.equal(hourly.elevation, 47);
  assert.equal(Math.round(hourly.distance), 1975);
  assert.equal(hourly.modelRunAt, Date.parse('2024-11-23T12:00:00Z'));
  assert.equal(hourly.steps.length, 49);
});

test('the step of now, in the units of Gladys (the values Home Assistant shows)', () => {
  const step = currentStep(parseHourly(fixture('hourly-kingslynn.json')), NOW);
  assert.deepEqual(step, {
    time: Date.parse('2024-11-23T12:00:00Z'),
    temperature: 7.9,
    feelsLike: 3.4,
    dewPoint: 7.5,
    humidity: 97.5,
    pressure: 998.2, // 99820 Pa
    windSpeed: 35.7, // 9.93 m/s
    windGust: 64.8, // 18 m/s
    windDirection: 180,
    visibility: 7.5, // 7478 m
    uvIndex: 1,
    code: 12,
    precipitationRate: 0.75,
    precipitationProbability: 67,
  });
});

test('the step of now is the nearest one, and none past the forecast', () => {
  const hourly = parseHourly(fixture('hourly-wavertree.json'));
  const at = (iso) => currentStep(hourly, Date.parse(iso))?.time;
  assert.equal(at('2024-11-23T13:29:00Z'), Date.parse('2024-11-23T13:00:00Z'));
  assert.equal(at('2024-11-23T13:31:00Z'), Date.parse('2024-11-23T14:00:00Z'));
  assert.equal(at('2024-11-25T12:59:00Z'), Date.parse('2024-11-25T12:00:00Z'));
  assert.equal(at('2024-11-25T13:30:00Z'), undefined);
  assert.equal(at('2024-11-23T10:30:00Z'), undefined);
  assert.equal(nextSteps(hourly, NOW, 3).length, 3);
  assert.equal(nextSteps(hourly, NOW, 3)[0].time, Date.parse('2024-11-23T13:00:00Z'));
});

test('a step with missing or odd values keeps the others', () => {
  const raw = fixture('hourly-wavertree.json');
  const first = raw.features[0].properties.timeSeries[0];
  delete first.uvIndex;
  first.screenTemperature = 'NaN';
  first.significantWeatherCode = 'NA';
  const step = parseHourly(raw).steps[0];
  assert.equal(step.uvIndex, null);
  assert.equal(step.temperature, null);
  assert.equal(step.code, null);
  assert.equal(step.humidity, 95.1);
});

test('the daily forecast: one entry per date, day and the night after it', () => {
  const daily = parseDaily(fixture('daily-wavertree.json'));
  assert.equal(daily.days.length, 8);
  const [yesterday, today] = daily.days;
  // The past date of the answer only carries its night.
  assert.equal(yesterday.date, '2024-11-22');
  assert.equal(yesterday.dayCode, null);
  assert.equal(yesterday.nightCode, 12);
  assert.equal(today.date, '2024-11-23');
  assert.equal(today.maxTemperature, 12.6); // 12.56
  assert.equal(today.minTemperature, 11.5); // the night after: 11.46
  assert.equal(today.dayCode, 12);
  assert.equal(today.windGust, 55.5);
  assert.deepEqual(
    upcomingDays(daily, '2024-11-23', 7).map((d) => d.date),
    [
      '2024-11-23',
      '2024-11-24',
      '2024-11-25',
      '2024-11-26',
      '2024-11-27',
      '2024-11-28',
      '2024-11-29',
    ],
  );
});

test('dates in the time zone of Gladys, the compass', () => {
  assert.equal(localDate(Date.parse('2024-11-23T23:30:00Z'), 'Europe/London'), '2024-11-23');
  assert.equal(localDate(Date.parse('2024-06-23T23:30:00Z'), 'Europe/London'), '2024-06-24');
  assert.equal(addDays('2024-12-31', 1), '2025-01-01');
  assert.equal(addDays('2024-03-30', 2), '2024-04-01');
  assert.deepEqual([0, 22, 90, 180, 270, 349, 360].map(compassPoint), [0, 1, 4, 8, 12, 0, 0]);
});
