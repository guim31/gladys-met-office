// -----------------------------------------------------------------------------
// Quiet logs: a normal cycle writes nothing at the info level, a failure that
// lasts writes one line when it starts and one when it ends, and no secret of
// the configuration ever reaches the logs — even at the debug level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY, NOW, createAll, createWorld, fixture } from './helpers/world.js';

/** Capture what the SDK logger writes (console.log / console.error). */
function captureLogs(t) {
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({ stream, text: args.map(String).join(' ') });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return lines;
}

const atLevel = (lines, level) => lines.filter((l) => l.text.includes(`[${level}]`));

/** The hourly fixture, its temperatures shifted (a new model run). */
function warmer(delta) {
  const raw = fixture('hourly-wavertree.json');
  for (const step of raw.features[0].properties.timeSeries) {
    step.screenTemperature += delta;
  }
  return raw;
}

test('a normal cycle writes nothing at the info level', async (t) => {
  const clock = { value: NOW };
  const world = await createWorld({ clock });
  await createAll(world);
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = captureLogs(t);
  const place = Object.keys(world.api.places)[0];
  for (let i = 0; i < 3; i += 1) {
    clock.value += 30 * 60000;
    world.api.places[place].hourly = warmer(i + 1);
    await world.app.poller.cycle();
    await world.gladys.fake.poll(world.gladys.fake.devices[0]);
    await world.gladys.fake.widgetGet('forecast', { language: 'fr' });
  }
  assert.ok(world.api.callsOf('hourly') >= 4, 'the cycles read the API');
  assert.deepEqual(lines, []);
  await world.app.stop();
});

test('a lasting failure: one warning, then one line when it ends', async (t) => {
  const clock = { value: NOW };
  const world = await createWorld({ clock });
  await createAll(world);
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = captureLogs(t);
  world.api.fail = 'ECONNREFUSED';
  for (let i = 0; i < 4; i += 1) {
    clock.value += 30 * 60000;
    await world.app.poller.cycle();
  }
  world.api.fail = null;
  clock.value += 30 * 60000;
  await world.app.poller.cycle();
  assert.deepEqual(
    lines.map((l) => l.text.replace(/^\[[^\]]+\] /, '')),
    [
      '[WARN] [met-office] Met Office: DataHub unreachable (ECONNREFUSED)',
      '[INFO] [met-office] Met Office DataHub answers again',
    ],
  );
  await world.app.stop();
});

test('no secret in the logs, whatever happens, even at the debug level', async (t) => {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = captureLogs(t);
  const clock = { value: NOW };
  // Every path: start, refused key, fixed key, device added, polls, errors,
  // quota, test action, scene action, widget.
  const world = await createWorld({ clock, config: { api_key: 'secret-key-that-is-refused' } });
  await world.gladys.fake.action('test_connection');
  await world.gladys.fake.configUpdated({
    api_key: API_KEY,
    location_source: 'coordinates',
    coordinates: 'Here: 53.38374, -2.90929; 52.75556, 0.44231; nowhere',
  });
  await createAll(world);
  world.api.fail = 'ETIMEDOUT';
  clock.value += 30 * 60000;
  await world.app.poller.cycle();
  world.api.fail = null;
  for (const place of Object.values(world.api.places)) {
    place.hourly = { status: 429, body: '' };
  }
  clock.value += 30 * 60000;
  await world.app.poller.cycle();
  await world.gladys.fake.action('test_connection');
  await world.gladys.fake.sceneAction('get_forecast', {});
  await world.gladys.fake.widgetGet('forecast', { language: 'en' });
  await world.app.stop();

  assert.ok(lines.length > 10, 'the debug level shows the details');
  assert.ok(atLevel(lines, 'DEBUG').length > 0);
  for (const { text } of lines) {
    assert.doesNotMatch(text, new RegExp(API_KEY), text);
    assert.doesNotMatch(text, /secret-key-that-is-refused/, text);
    assert.doesNotMatch(text, /apikey/i, text);
  }
});
