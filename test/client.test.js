// -----------------------------------------------------------------------------
// The DataHub client: the request it sends (key in a header, never in the
// URL), and how each answer is classified.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_URL,
  ERROR_KINDS,
  MetOfficeApiError,
  fetchForecast,
  forecastUrl,
} from '../src/metoffice/client.js';
import { fixture } from './helpers/world.js';

const KEY = 'secret-key';

function answering(status, body, record = []) {
  return async (url, init) => {
    record.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
}

test('the request: the documented endpoint, the key in the apikey header only', async () => {
  const record = [];
  const raw = await fetchForecast({
    apiKey: KEY,
    endpoint: 'hourly',
    latitude: 53.38374,
    longitude: -2.90929,
    fetch: answering(200, fixture('hourly-wavertree.json'), record),
  });
  assert.equal(raw.features[0].properties.location.name, 'Wavertree');
  const [{ url, init }] = record;
  assert.ok(url.startsWith(`${API_URL}/hourly?`));
  assert.equal(API_URL, 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point');
  const query = new URL(url).searchParams;
  assert.equal(query.get('latitude'), '53.38374');
  assert.equal(query.get('longitude'), '-2.90929');
  assert.equal(query.get('includeLocationName'), 'true');
  assert.equal(init.headers.apikey, KEY);
  assert.doesNotMatch(url, new RegExp(KEY));
  assert.equal(forecastUrl('daily', 1, 2).split('?')[0], `${API_URL}/daily`);
});

const cases = [
  [401, ERROR_KINDS.AUTH],
  [403, ERROR_KINDS.AUTH],
  [429, ERROR_KINDS.RATE_LIMIT],
  [400, ERROR_KINDS.BAD_REQUEST],
  [500, ERROR_KINDS.SERVER],
  [503, ERROR_KINDS.SERVER],
];
for (const [status, kind] of cases) {
  test(`HTTP ${status} is a ${kind} error, without the key in its message`, async () => {
    await assert.rejects(
      fetchForecast({
        apiKey: KEY,
        endpoint: 'daily',
        latitude: 1,
        longitude: 2,
        fetch: answering(status, fixture('error-401.json')),
      }),
      (err) => {
        assert.ok(err instanceof MetOfficeApiError);
        assert.equal(err.kind, kind);
        assert.equal(err.status, status);
        assert.doesNotMatch(err.message, new RegExp(KEY));
        return true;
      },
    );
  });
}

test('a network failure and a timeout are network errors', async () => {
  const refused = async () => {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'ECONNREFUSED' };
    throw err;
  };
  await assert.rejects(
    fetchForecast({ apiKey: KEY, endpoint: 'hourly', latitude: 1, longitude: 2, fetch: refused }),
    { kind: ERROR_KINDS.NETWORK, message: 'DataHub unreachable (ECONNREFUSED)' },
  );
  // The timeout's timer does not hold the event loop: a pending timer does.
  const slow = (url, { signal }) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 5000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
  await assert.rejects(
    fetchForecast({
      apiKey: KEY,
      endpoint: 'hourly',
      latitude: 1,
      longitude: 2,
      fetch: slow,
      timeoutMs: 20,
    }),
    { kind: ERROR_KINDS.NETWORK },
  );
});

test('a 200 that is not the documented GeoJSON is an invalid response', async () => {
  for (const body of [
    '<html>maintenance</html>',
    { features: [] },
    { type: 'FeatureCollection' },
  ]) {
    await assert.rejects(
      fetchForecast({
        apiKey: KEY,
        endpoint: 'hourly',
        latitude: 1,
        longitude: 2,
        fetch: answering(200, body),
      }),
      { kind: ERROR_KINDS.INVALID_RESPONSE },
    );
  }
});
