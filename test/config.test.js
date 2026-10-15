// -----------------------------------------------------------------------------
// Configuration: defaults, the places typed or taken from the houses, and the
// refresh pace the free quota allows.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_CALL_BUDGET,
  DEFAULT_CONFIG,
  MAX_LOCATIONS,
  REFRESH_CHOICES,
  callsPerDay,
  locationsFromHouses,
  normalizeConfig,
  parseCoordinates,
  parseEntry,
  refreshMinutes,
} from '../src/config.js';

test('normalizeConfig fills the defaults and refuses unknown choices', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(
    normalizeConfig({
      api_key: '  key ',
      location_source: 'moon',
      refresh_minutes: '5',
      language: 'it',
    }),
    { ...DEFAULT_CONFIG, api_key: 'key' },
  );
  assert.equal(normalizeConfig({ refresh_minutes: 60 }).refresh_minutes, '60');
});

test('a coordinates entry: dots, decimal commas, an optional name', () => {
  assert.deepEqual(parseEntry('Exeter: 50.7184, -3.5339'), {
    name: 'Exeter',
    latitude: 50.7184,
    longitude: -3.5339,
  });
  assert.deepEqual(parseEntry('50.7184,-3.5339'), {
    name: null,
    latitude: 50.7184,
    longitude: -3.5339,
  });
  assert.deepEqual(parseEntry('Maison : 50,7184 / -3,5339'), {
    name: 'Maison',
    latitude: 50.7184,
    longitude: -3.5339,
  });
  assert.deepEqual(parseEntry('50.7 -3.5'), { name: null, latitude: 50.7, longitude: -3.5 });
  for (const wrong of ['Exeter', '91, 0', '0, 181', '50,7,-3,5', 'a: b, c', '']) {
    assert.equal(parseEntry(wrong), null, wrong);
  }
});

test('the typed places: deduplicated by position, capped, invalid ones reported', () => {
  const { locations, invalid, ignored } = parseCoordinates(
    'Exeter: 50.7184, -3.5339; 50.71841, -3.53392\nLeeds: 53.8, -1.55; nowhere; 51.5, -0.12; 55.9, -3.2',
  );
  assert.deepEqual(
    locations.map((l) => [l.platformId, l.name]),
    [
      ['50.718_-3.534', 'Exeter'],
      ['53.800_-1.550', 'Leeds'],
      ['51.500_-0.120', null],
    ],
  );
  assert.equal(locations.length, MAX_LOCATIONS);
  assert.deepEqual(invalid, ['nowhere']);
  assert.deepEqual(ignored, ['55.9, -3.2']);
});

test('the houses: the located ones, keyed by their selector', () => {
  const { locations, unlocated } = locationsFromHouses([
    { name: 'Maison', selector: 'maison', latitude: 53.38, longitude: -2.9 },
    { name: 'Chalet', selector: 'chalet', latitude: null, longitude: null },
  ]);
  assert.deepEqual(locations, [
    { platformId: 'house-maison', name: 'Maison', latitude: 53.38, longitude: -2.9 },
  ]);
  assert.deepEqual(unlocated, ['Chalet']);
  assert.deepEqual(locationsFromHouses(undefined).locations, []);
});

test('the refresh pace always fits the daily quota of the free plan', () => {
  for (const choice of REFRESH_CHOICES) {
    for (let count = 1; count <= MAX_LOCATIONS; count += 1) {
      const config = { refresh_minutes: choice };
      assert.ok(refreshMinutes(config, count) >= Number(choice));
      assert.ok(
        callsPerDay(config, count) <= DAILY_CALL_BUDGET,
        `${count} place(s) every ${choice} min: ${callsPerDay(config, count)} calls`,
      );
    }
  }
  // The default: one house every 30 minutes, 48 + 8 calls.
  assert.equal(callsPerDay(normalizeConfig(), 1), 56);
  assert.ok(DAILY_CALL_BUDGET < 360);
});
