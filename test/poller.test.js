// -----------------------------------------------------------------------------
// The container refreshes the places by itself: the core may never call
// onPoll (GladysAssistant/Gladys#3198, a device created without should_poll
// keeps it). This test never calls onPoll.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { NOW, createAll, createWorld, fixture, ids } from './helpers/world.js';

test('the states refresh on the internal timer, without any onPoll', async () => {
  // 1 ms of test time is 10 s of forecast time: the 30-minute period is 180 ms.
  const start = Date.now();
  const clock = {
    get value() {
      return NOW + (Date.now() - start) * 10000;
    },
  };
  const world = await createWorld({ clock, timers: true, tickMs: 5 });
  const { gladys, api, app } = world;
  let corePolls = 0;
  const pollFromCore = app.poller.pollFromCore;
  app.poller.pollFromCore = (device) => {
    corePolls += 1;
    return pollFromCore(device);
  };
  await createAll(world);
  const temperature = ids(gladys).feature('temperature');
  assert.equal(gladys.fake.lastState(temperature), 9.3);

  // A new model run, 5 degrees warmer.
  const raw = fixture('hourly-wavertree.json');
  for (const step of raw.features[0].properties.timeSeries) {
    step.screenTemperature += 5;
  }
  const place = Object.keys(api.places)[0];
  api.places[place].hourly = raw;
  for (let i = 0; i < 400 && (gladys.fake.lastState(temperature) ?? 0) < 14; i += 1) {
    await sleep(5);
  }
  assert.ok(gladys.fake.lastState(temperature) >= 14, 'the new run is published');
  assert.ok(api.callsOf('hourly') >= 2, 'read again by the timer');
  assert.equal(corePolls, 0);
  await app.stop();

  // Stopped: no more reads.
  const calls = api.calls.length;
  await sleep(60);
  assert.equal(api.calls.length, calls);
});

test('the hour moves between two reads: no call, a new state', async () => {
  const clock = { value: NOW };
  const world = await createWorld({ clock });
  await createAll(world);
  const temperature = ids(world.gladys).feature('temperature');
  const calls = world.api.calls.length;
  // 12:50, read at 12:40: the nearest step is now 13:00.
  clock.value = Date.parse('2024-11-23T12:50:00Z');
  world.hub.cache.get('house-maison').hourlyReadAt = clock.value - 10 * 60000;
  await world.app.poller.cycle();
  assert.equal(world.api.calls.length, calls, 'read 10 minutes ago: served from cache');
  assert.equal(world.gladys.fake.lastState(temperature), 9.9, 'the step of 13:00');
  await world.app.stop();
});

test('the daily forecast is read every 3 hours, the hourly one every period', async () => {
  const clock = { value: NOW };
  const world = await createWorld({ clock });
  await createAll(world);
  for (let i = 0; i < 12; i += 1) {
    clock.value += 30 * 60000;
    await world.app.poller.cycle();
  }
  // 6 hours: 1 + 12 hourly reads, 1 + 2 daily reads.
  assert.equal(world.api.callsOf('hourly'), 13);
  assert.equal(world.api.callsOf('daily'), 3);
  await world.app.stop();
});

test('only the places added to Gladys are read by the timer', async () => {
  const clock = { value: NOW };
  const world = await createWorld({
    clock,
    config: {
      location_source: 'coordinates',
      coordinates: 'A: 53.38374, -2.90929; B: 52.75556, 0.44231',
    },
  });
  const { gladys, api, app } = world;
  await gladys.fake.deviceCreated(structuredClone(gladys.fake.discoveredDevices[0]));
  clock.value += 30 * 60000;
  await app.poller.cycle();
  const of = (lat) => api.calls.filter((c) => c.latitude === lat && c.endpoint === 'hourly').length;
  assert.equal(of('53.38374'), 2);
  assert.equal(of('52.75556'), 1, 'read at start only');
  await app.stop();
});

test('Gladys away: the cycle waits', async () => {
  const clock = { value: NOW };
  const world = await createWorld({ clock });
  await createAll(world);
  await world.gladys.disconnect();
  clock.value += 30 * 60000;
  const calls = world.api.calls.length;
  await world.app.poller.cycle();
  assert.equal(world.api.calls.length, calls);
  await world.app.stop();
});
