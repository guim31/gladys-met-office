// -----------------------------------------------------------------------------
// The "forecast" widget: both views fit the content budget of the core
// (validateWidgetContent of the SDK), its tiles are bound to features that
// exist, it speaks the user's language and units, and it never calls the API.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildLocationDevice } from '../src/location.js';
import { HOUSES, NOW, createAll, createWorld } from './helpers/world.js';

const content = (ack) => {
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};
const ofType = (c, type) => c.components.filter((x) => x.type === type);

for (const view of ['days', 'hours']) {
  for (const language of ['en', 'fr', 'de', 'es']) {
    test(`the ${view} view in ${language} fits the content budget`, async () => {
      const world = await createWorld();
      await createAll(world);
      const calls = world.api.calls.length;
      const c = content(
        await world.gladys.fake.widgetGet('forecast', { settings: { view }, language }),
      );
      assert.deepEqual(validateWidgetContent(c), []);
      assert.equal(world.api.calls.length, calls, 'served from the cache');
      assert.ok(c.components.length <= 8);
      assert.ok(ofType(c, 'text').length <= 2);
      // Every bound tile points to a feature of the device as discovered.
      const device = buildLocationDevice(world.gladys, world.hub.locations[0], null, 'en');
      const known = new Set(device.features.map((f) => f.external_id));
      for (const tile of ofType(c, 'value')) {
        assert.ok(known.has(tile.device_feature), tile.device_feature);
      }
      await world.app.stop();
    });
  }
}

test('the days view: today and the next six days, the details on tap', async () => {
  const world = await createWorld();
  const c = content(await world.gladys.fake.widgetGet('forecast', { language: 'en' }));
  const [list] = ofType(c, 'card-list');
  assert.equal(list.items.length, 7);
  assert.deepEqual(list.items[0], {
    title: 'Saturday 23',
    subtitle: 'Light rain · 13° / 12°',
    badge: { text: '74 %', color: 'info' },
    description: 'Day: Light rain\nNight: Light rain\nWind S 28 km/h, gusts 56\nUV 1',
  });
  assert.equal(list.items[6].title, 'Friday 29');
  await world.app.stop();
});

test('the hours view: the temperature curve and the next six hours', async () => {
  const world = await createWorld();
  const c = content(
    await world.gladys.fake.widgetGet('forecast', { settings: { view: 'hours' }, language: 'fr' }),
  );
  const [chart] = ofType(c, 'chart');
  assert.equal(chart.series[0].points.length, 24);
  assert.equal(chart.series[0].points[0].t, '2024-11-23T13:00:00.000Z');
  assert.equal(chart.annotations.length, 2);
  const [status] = ofType(c, 'status');
  assert.equal(status.items.length, 6);
  assert.deepEqual(status.items[0], {
    label: '13:00',
    value: 'Pluie faible · 10° · 65 %',
    icon: 'cloud-rain',
    color: 'info',
  });
  await world.app.stop();
});

test('a place not added to Gladys: inline tiles, in the user units', async () => {
  const world = await createWorld();
  const c = content(await world.gladys.fake.widgetGet('forecast', { language: 'en', units: 'us' }));
  assert.deepEqual(
    ofType(c, 'value').map((v) => [v.label, v.value, v.unit]),
    [
      ['Temperature', 48.7, '°F'],
      ['Chance of rain', 61, '%'],
      ['Wind', 18, 'mph'],
    ],
  );
  await world.app.stop();
});

test('the messages: not configured, no place, out of date', async () => {
  const notConfigured = await createWorld({ config: { api_key: '' } });
  let c = content(await notConfigured.gladys.fake.widgetGet('forecast', { language: 'fr' }));
  assert.match(c.components[0].text, /clé d'API/);
  await notConfigured.app.stop();

  const noPlace = await createWorld({ houses: [HOUSES[1]] });
  c = content(await noPlace.gladys.fake.widgetGet('forecast', { language: 'en' }));
  assert.match(c.components[0].text, /No place/);
  await noPlace.app.stop();

  const clock = { value: NOW };
  const old = await createWorld({ clock });
  old.api.fail = 'ENOTFOUND';
  clock.value += 7 * 60 * 60000;
  await old.app.poller.cycle();
  c = content(await old.gladys.fake.widgetGet('forecast', { language: 'en' }));
  assert.equal(c.components[1].text, 'Forecast out of date');
  assert.deepEqual(ofType(c, 'value'), [], 'no value presented as current');
  await old.app.stop();
});
