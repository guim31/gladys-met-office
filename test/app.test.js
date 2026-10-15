// -----------------------------------------------------------------------------
// The flows of the integration, end to end on the SDK's fake Gladys and a fake
// DataHub: start, places, refused key, spent quota, devices added, Gladys
// restarting, a forecast going out of date.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS } from '../src/i18n.js';
import { FEATURES } from '../src/location.js';
import { API_KEY, NOW, createAll, createWorld, fixture, ids } from './helpers/world.js';

const HOUR = 60 * 60000;

test('not configured: a status, no device, no call', async () => {
  const { gladys, api, app } = await createWorld({ config: { api_key: '' } });
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: STATUS.notConfigured,
  });
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(api.calls.length, 0);
  await app.stop();
});

test('no located house: a status that says where to fix it', async () => {
  const { gladys, api, app } = await createWorld({
    houses: [{ id: 'h', name: 'Maison', selector: 'maison', latitude: null, longitude: null }],
  });
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: STATUS.noLocation,
  });
  assert.equal(api.calls.length, 0);
  await app.stop();
});

test('a house of Gladys: one device, read hourly and daily, connected', async () => {
  const { gladys, api, app } = await createWorld();
  assert.deepEqual(
    api.calls.map((c) => [c.endpoint, c.latitude, c.longitude]),
    [
      ['hourly', '53.38374', '-2.90929'],
      ['daily', '53.38374', '-2.90929'],
    ],
  );
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'Met Office Maison');
  assert.equal(device.external_id, ids(gladys).device);
  assert.deepEqual(
    device.features.map((f) => f.external_id),
    Object.keys(FEATURES).map((key) => ids(gladys).feature(key)),
  );
  assert.equal(
    device.features.find((f) => f.external_id.endsWith(':weather')).name,
    'Conditions météo',
  );
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  // Nothing published before the user adds the device: Gladys would drop it.
  assert.deepEqual(gladys.fake.states, []);
  await app.stop();
});

test('typed coordinates: the name typed, else the one of the model point', async () => {
  const { gladys, app } = await createWorld({
    config: {
      location_source: 'coordinates',
      coordinates: 'Home: 53.38374, -2.90929; 52.75556, 0.44231',
      language: 'en',
    },
  });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => [d.name, d.external_id]),
    [
      ['Met Office Home', gladys.externalIds('location', '53.384_-2.909').device],
      ["Met Office King's Lynn", gladys.externalIds('location', '52.756_0.442').device],
    ],
  );
  await app.stop();
});

test('a device added: every state at once, then the widget is nudged', async () => {
  const world = await createWorld();
  const { gladys } = world;
  await createAll(world);
  const id = ids(gladys);
  assert.equal(gladys.fake.lastState(id.feature('temperature')), 9.3);
  assert.equal(gladys.fake.lastState(id.feature('feels_like')), 5.8);
  assert.equal(gladys.fake.lastState(id.feature('humidity')), 95.1);
  assert.equal(gladys.fake.lastState(id.feature('pressure')), 987.5);
  assert.equal(gladys.fake.lastState(id.feature('wind_speed')), 28.3);
  assert.equal(gladys.fake.lastState(id.feature('wind_gust')), 55.5);
  assert.equal(gladys.fake.lastState(id.feature('wind_direction')), 176);
  assert.equal(gladys.fake.lastState(id.feature('precipitation_probability')), 61);
  assert.equal(gladys.fake.lastState(id.feature('precipitation_rate')), 0.53);
  assert.equal(gladys.fake.lastState(id.feature('visibility')), 5.1);
  assert.equal(gladys.fake.lastState(id.feature('uv_index')), 1);
  assert.equal(gladys.fake.lastState(id.feature('weather')), 'Pluie faible');
  assert.equal(gladys.fake.states.length, Object.keys(FEATURES).length);
  assert.ok(gladys.fake.widgetRefreshes.includes('forecast'));
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: id.device,
    transport: 'cloud',
  });
  await world.app.stop();
});

test('only the changes are published, and a stable value every 6 hours', async (t) => {
  // A forecast where nothing changes hour after hour.
  const flat = fixture('hourly-wavertree.json');
  const first = flat.features[0].properties.timeSeries[0];
  flat.features[0].properties.timeSeries = flat.features[0].properties.timeSeries.map((s) => ({
    ...first,
    time: s.time,
  }));
  // The SDK dates its heartbeat with Date.now(): the whole world runs on a mocked Date.
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const clock = {
    get value() {
      return Date.now();
    },
    set value(ms) {
      t.mock.timers.setTime(ms);
    },
  };
  const world = await createWorld({ clock, places: { '53.38374,-2.90929': { hourly: flat } } });
  await createAll(world);
  const temperature = ids(world.gladys).feature('temperature');
  const count = () =>
    world.gladys.fake.states.filter((s) => s.device_feature_external_id === temperature).length;
  assert.equal(count(), 1);
  for (let i = 0; i < 5 * 2; i += 1) {
    clock.value += HOUR / 2;
    world.api.places['53.38374,-2.90929'].hourly = structuredClone(flat);
    await world.app.poller.cycle();
  }
  assert.equal(count(), 1, 'unchanged for 5 hours: nothing sent');
  clock.value += 1.5 * HOUR;
  await world.app.poller.cycle();
  assert.equal(count(), 2, 'the 6-hour heartbeat');
  await world.app.stop();
});

test('a refused key: a status, no device, one hour of silence, a new key resumes', async () => {
  const clock = { value: NOW };
  const world = await createWorld({ clock, config: { api_key: 'wrong' } });
  const { gladys, api, app } = world;
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: STATUS.authFailed });
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(api.calls.length, 1, 'the daily read is skipped once the key is refused');
  await gladys.fake.configUpdated({ api_key: API_KEY });
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  await app.stop();
});

test('the daily quota spent: reads pause one hour, then resume', async () => {
  const clock = { value: NOW };
  const world = await createWorld({ clock });
  const { gladys, api, app } = world;
  await createAll(world);
  const place = api.places['53.38374,-2.90929'];
  const good = place.hourly;
  place.hourly = { status: 429, body: '' };
  clock.value += HOUR / 2;
  await app.poller.cycle();
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: STATUS.rateLimited,
  });
  const calls = api.calls.length;
  for (let i = 0; i < 3; i += 1) {
    clock.value += 15 * 60000;
    await app.poller.cycle();
  }
  assert.equal(api.calls.length, calls, 'no call while backing off');
  place.hourly = good;
  clock.value += 20 * 60000;
  await app.poller.cycle();
  assert.ok(api.calls.length > calls);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  await app.stop();
});

test('a forecast not refreshed for 6 hours: no more states, an orange then red badge', async () => {
  const clock = { value: NOW };
  const world = await createWorld({ clock });
  const { gladys, api, app } = world;
  await createAll(world);
  const id = ids(gladys);
  api.fail = 'ENOTFOUND';
  clock.value += HOUR / 2;
  await app.poller.cycle();
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: STATUS.unreachable,
  });
  // Still within 6 hours: the steps of the last run go on.
  clock.value += HOUR / 2;
  await app.poller.cycle();
  assert.equal(gladys.fake.lastState(id.feature('temperature')), 9.9);
  const published = gladys.fake.states.length;
  clock.value += 6 * HOUR;
  await app.poller.cycle();
  assert.equal(gladys.fake.states.length, published, 'an old run is not presented as now');
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  api.fail = null;
  clock.value += HOUR / 2;
  await app.poller.cycle();
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  await app.stop();
});

test('Gladys restarted: the states, the status and the houses are sent again, no call', async () => {
  const world = await createWorld();
  const { gladys, api, app } = world;
  await createAll(world);
  const states = gladys.fake.states.length;
  const calls = api.calls.length;
  gladys.fake.houses[0].latitude = 52.75556;
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(gladys.fake.states.length, states * 2);
  assert.equal(api.calls.length, calls);
  assert.equal(world.hub.locations[0].latitude, 52.75556, 'the house moved: same device');
  assert.equal(world.hub.locations[0].platformId, 'house-maison');
  await app.stop();
});

test('the Discovery scan reuses a fresh forecast', async () => {
  const world = await createWorld();
  const calls = world.api.calls.length;
  await world.gladys.fake.scanRequest();
  assert.equal(world.api.calls.length, calls);
  assert.equal(world.gladys.fake.discoveredDevices.length, 1);
  await world.app.stop();
});

test('the test action: a report per place, and the pace of the quota', async () => {
  const world = await createWorld({ config: { language: 'en' } });
  const ack = await world.gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.match(ack.data.message.en, /^Maison: OK, 9\.3 °C, Light rain \(model point 2 km away\)\./);
  assert.match(ack.data.message.en, /house without a location: Chalet/);
  assert.match(ack.data.message.fr, /56 appels d'API par jour sur 360/);
  const refused = await createWorld({ config: { api_key: 'wrong' } });
  const report = await refused.gladys.fake.action('test_connection');
  assert.equal(report.data.message.en, STATUS.authFailed.en);
  await world.app.stop();
  await refused.app.stop();
});

test('a position the API refuses: reported, the other places still work', async () => {
  const world = await createWorld({
    config: { location_source: 'coordinates', coordinates: '53.38374, -2.90929; 0, 0' },
    places: { '0,0': { hourly: { status: 400, body: '' }, daily: { status: 400, body: '' } } },
  });
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
  const ack = await world.gladys.fake.action('test_connection');
  assert.match(ack.data.message.en, /0, 0: position refused by the Met Office\./);
  await world.app.stop();
});
