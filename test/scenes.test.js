// -----------------------------------------------------------------------------
// The scene action "get_forecast": the daily forecast of a day, from the
// cache, in the language of the configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAll, createWorld, ids } from './helpers/world.js';

test('tomorrow, by default, for the first place', async () => {
  const world = await createWorld();
  const calls = world.api.calls.length;
  const ack = await world.gladys.fake.sceneAction('get_forecast', {});
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, {
    place: 'Maison',
    date: '2024-11-24',
    weather: 'Nuageux',
    weather_code: 7,
    max_temperature: 12.7,
    min_temperature: 8.2,
    rain_probability_day: 26,
    rain_probability_night: 23,
    wind_gust: 42.7,
    uv_index: 1,
  });
  assert.equal(world.api.calls.length, calls, 'served from the cache');
  await world.app.stop();
});

test('today and the day after, for a chosen place, in English', async () => {
  const world = await createWorld({
    config: {
      location_source: 'coordinates',
      coordinates: 'Home: 53.38374, -2.90929; Lynn: 52.75556, 0.44231',
      language: 'en',
    },
  });
  await createAll(world);
  const lynn = world.gladys.externalIds('location', '52.756_0.442').device;
  const today = await world.gladys.fake.sceneAction('get_forecast', { device: lynn, day: 'today' });
  assert.equal(today.data.outputs.place, 'Lynn');
  assert.equal(today.data.outputs.date, '2024-11-23');
  assert.equal(today.data.outputs.weather, 'Heavy rain');
  const after = await world.gladys.fake.sceneAction('get_forecast', {
    device: lynn,
    day: 'day_after_tomorrow',
  });
  assert.equal(after.data.outputs.date, '2024-11-25');
  await world.app.stop();
});

test('a place removed from the configuration fails the action, not the scene', async () => {
  const world = await createWorld();
  const ack = await world.gladys.fake.sceneAction('get_forecast', {
    device: ids(world.gladys, 'house-gone').device,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /no longer in the configuration/);
  await world.app.stop();
});

test('no daily forecast yet: one read, then the answer', async () => {
  const world = await createWorld();
  world.hub.cache.get('house-maison').daily = null;
  const calls = world.api.callsOf('daily');
  const ack = await world.gladys.fake.sceneAction('get_forecast', { day: 'today' });
  assert.equal(ack.success, true);
  assert.equal(world.api.callsOf('daily'), calls + 1);
  await world.app.stop();
});
