#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real Met Office Weather DataHub, read-only, through the
// integration's own client (src/metoffice/client.js). Needs network access to
// data.hub.api.metoffice.gov.uk.
//
//   node scripts/probe.mjs
//       1. a fake key must be refused: 401 (or 403), with the shape of the body;
//       2. no key at all: refused the same way.
//
//   METOFFICE_API_KEY=<your key> node scripts/probe.mjs [latitude longitude]
//       3. the hourly and daily answers for the position (default: Exeter,
//          the Met Office headquarters): the field names and types of a step
//          (the fixtures of test/fixtures/metoffice/ assume them), the place,
//          the distance, then the values the integration would publish;
//       4. an impossible position (latitude 95): the status the API answers.
//
// The key is read from the environment, never printed (it travels in a
// header, not in the URL). Each run with a key costs 3 calls of the 360 a day.
// Nothing is written, nothing is sent but GET requests.
// -----------------------------------------------------------------------------

import {
  ENDPOINTS,
  MetOfficeApiError,
  fetchForecast,
  forecastUrl,
} from '../src/metoffice/client.js';
import { currentStep, parseDaily, parseHourly } from '../src/metoffice/forecast.js';
import { weatherText } from '../src/i18n.js';

const FAKE_KEY = 'not-a-real-key-0000000000000000';
const realKey = process.env.METOFFICE_API_KEY?.trim();
const [latitude = 50.7184, longitude = -3.5339] = process.argv.slice(2).map(Number);
let failures = 0;

function check(label, ok, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

/** Never let the key reach the output, whatever the error says. */
const safe = (text) => (realKey ? String(text).split(realKey).join('<key>') : String(text));

/** Field name → type of one object. */
const shape = (object) =>
  Object.fromEntries(
    Object.entries(object ?? {}).map(([k, v]) => [k, v === null ? 'null' : typeof v]),
  );

async function attempt(label, fn) {
  try {
    return { value: await fn() };
  } catch (err) {
    if (err instanceof MetOfficeApiError) {
      return { error: err };
    }
    console.log(`FAIL ${label} — unexpected ${err?.name}: ${safe(err?.message)}`);
    failures += 1;
    return { error: err };
  }
}

// 1-2. A fake key, then no key: the status, and the body the gateway sends.
for (const [label, apiKey] of [
  ['fake key', FAKE_KEY],
  ['no key', ''],
]) {
  const { value, error } = await attempt(label, () =>
    fetchForecast({ apiKey, endpoint: ENDPOINTS.HOURLY, latitude, longitude }),
  );
  check(
    `${label} refused`,
    error?.kind === 'auth',
    error ? `${error.kind}, HTTP ${error.status}` : `got ${typeof value}`,
  );
  try {
    const response = await fetch(forecastUrl(ENDPOINTS.HOURLY, latitude, longitude), {
      headers: { accept: 'application/json', ...(apiKey ? { apikey: apiKey } : {}) },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    console.log(`     body (${response.status}): ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
  } catch (err) {
    console.log(`     body: ${err?.cause?.code ?? err?.message}`);
  }
}

if (!realKey) {
  console.log('No METOFFICE_API_KEY: steps 3 and 4 skipped.');
} else {
  // 3. The real answers.
  for (const endpoint of [ENDPOINTS.HOURLY, ENDPOINTS.DAILY]) {
    const { value: raw, error } = await attempt(endpoint, () =>
      fetchForecast({ apiKey: realKey, endpoint, latitude, longitude }),
    );
    if (error) {
      check(`${endpoint} read`, false, `${error.kind}: ${safe(error.message)}`);
      continue;
    }
    const series = raw.features[0].properties.timeSeries;
    check(`${endpoint} read`, series.length > 0, `${series.length} steps`);
    console.log(`     properties: ${JSON.stringify(shape(raw.features[0].properties))}`);
    console.log(`     step: ${JSON.stringify(shape(series[1] ?? series[0]))}`);
    if (endpoint === ENDPOINTS.HOURLY) {
      const hourly = parseHourly(raw);
      console.log(
        `     place: ${hourly.name}, ${Math.round(hourly.distance ?? 0)} m away, run ` +
          `${new Date(hourly.modelRunAt).toISOString()}`,
      );
      const step = currentStep(hourly, Date.now());
      check('a step for now', step !== null);
      console.log(`     now: ${JSON.stringify(step)} — ${weatherText(step?.code ?? null, 'en')}`);
    } else {
      const daily = parseDaily(raw);
      console.log(`     days: ${daily.days.map((d) => d.date).join(', ')}`);
      console.log(
        `     first full day: ${JSON.stringify(daily.days.find((d) => d.dayCode !== null))}`,
      );
    }
  }

  // 4. An impossible position.
  const { error } = await attempt('latitude 95', () =>
    fetchForecast({ apiKey: realKey, endpoint: ENDPOINTS.HOURLY, latitude: 95, longitude: 0 }),
  );
  console.log(
    `INFO latitude 95: ${error ? `${error.kind}, HTTP ${error.status}` : 'accepted (!)'}`,
  );
}

console.log(failures === 0 ? 'Probe passed.' : `Probe: ${failures} failure(s).`);
process.exitCode = failures === 0 ? 0 : 1;
