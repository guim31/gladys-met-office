// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Met Office DataHub
// serving the fixtures, and the integration wired on top through
// registerHandlers. No network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/metoffice/${name}`, import.meta.url), 'utf8'));

export const API_KEY = 'test-metoffice-api-key-0123456789';
export const TIME_ZONE = 'Europe/London';

// 10 minutes after the first hourly step of the fixtures (2024-11-23T12:00Z).
export const NOW = Date.parse('2024-11-23T12:10:00Z');

// The two places of Home Assistant's tests.
export const WAVERTREE = { latitude: 53.38374, longitude: -2.90929 };
export const KINGSLYNN = { latitude: 52.75556, longitude: 0.44231 };

export const HOUSES = [
  { id: 'h1', name: 'Maison', selector: 'maison', ...WAVERTREE },
  { id: 'h2', name: 'Chalet', selector: 'chalet', latitude: null, longitude: null },
];

const positionKey = (latitude, longitude) => `${Number(latitude)},${Number(longitude)}`;

/**
 * A fake DataHub. `places` maps "lat,lon" to `{ hourly, daily }`, each a raw
 * GeoJSON or `{ status, body }`; an unknown position gets the Wavertree
 * fixtures. `fail` makes every request throw (network down).
 */
export function createFakeApi(places = {}) {
  const api = {
    places: {
      [positionKey(WAVERTREE.latitude, WAVERTREE.longitude)]: {
        hourly: fixture('hourly-wavertree.json'),
        daily: fixture('daily-wavertree.json'),
      },
      [positionKey(KINGSLYNN.latitude, KINGSLYNN.longitude)]: {
        hourly: fixture('hourly-kingslynn.json'),
        daily: fixture('daily-kingslynn.json'),
      },
      ...places,
    },
    calls: [],
    fail: null,
    async fetch(url, init = {}) {
      const parsed = new URL(url);
      const endpoint = parsed.pathname.split('/').pop();
      const query = Object.fromEntries(parsed.searchParams);
      const call = { endpoint, ...query, url };
      api.calls.push(call);
      if (api.fail) {
        const err = new TypeError('fetch failed');
        err.cause = { code: api.fail };
        throw err;
      }
      if (init.headers?.apikey !== API_KEY) {
        return new Response(JSON.stringify(fixture('error-401.json')), { status: 401 });
      }
      const place = api.places[positionKey(query.latitude, query.longitude)] ?? {
        hourly: fixture('hourly-wavertree.json'),
        daily: fixture('daily-wavertree.json'),
      };
      const answer = place[endpoint];
      if (answer?.status) {
        const body = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
        return new Response(body ?? null, { status: answer.status });
      }
      return new Response(JSON.stringify(answer), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    /** Number of calls of one endpoint (all places). */
    callsOf(endpoint) {
      return api.calls.filter((c) => c.endpoint === endpoint).length;
    },
  };
  return api;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.places] see createFakeApi
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {{ value: number }} [options.clock] mutable time
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 * @param {number} [options.tickMs]
 */
export async function createWorld({
  config = {},
  houses = HOUSES,
  places = {},
  devices = [],
  clock = { value: NOW },
  connect = true,
  timers = false,
  tickMs,
} = {}) {
  const api = createFakeApi(places);
  const gladys = createFakeGladys({
    config: { api_key: API_KEY, ...config },
    houses,
    devices,
  });
  const app = registerHandlers(gladys, {
    fetch: api.fetch,
    now: () => clock.value,
    timeZone: TIME_ZONE,
    timers,
    tickMs,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, api, app, hub: app.hub, clock };
}

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.gladys.fake.discoveredDevices) {
    await world.gladys.fake.deviceCreated(structuredClone(device));
  }
}

/** External ids of the device of a place, and of its features. */
export const ids = (gladys, platformId = 'house-maison') =>
  gladys.externalIds('location', platformId);
