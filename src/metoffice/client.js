// -----------------------------------------------------------------------------
// The Met Office Weather DataHub "Site-specific" API (Global Spot), the one
// Home Assistant's `metoffice` integration reads since its move away from the
// retired DataPoint service:
//   https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/{hourly|three-hourly|daily}
//     ?latitude=..&longitude=..&includeLocationName=true
//
// The key travels in the `apikey` header (never in the URL), so the URL can be
// logged; the key itself never is, nor put in an error message.
//
// What it answers (DataHub documentation and FAQ, Home Assistant's tests):
//   200  a GeoJSON FeatureCollection: one Feature, the model grid point
//        nearest to the requested position, with `location.name`,
//        `requestPointDistance` (metres), `modelRunDate` and `timeSeries`;
//   401  no key or an unknown key (403 is treated the same way: a plan that
//        does not include the product);
//   429  the daily quota of the plan is spent (360 calls on the free plan);
//   400  a position the API refuses.
// -----------------------------------------------------------------------------

export const API_URL = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point';
export const ENDPOINTS = { HOURLY: 'hourly', DAILY: 'daily' };
const TIMEOUT_MS = 15000;

/** Why a request failed, for the status message and the back-off. */
export const ERROR_KINDS = {
  AUTH: 'auth', // 401/403: the key is refused
  RATE_LIMIT: 'rate_limit', // 429: the daily quota is spent
  BAD_REQUEST: 'bad_request', // 400/404: a position the API rejects
  SERVER: 'server', // 5xx, other statuses
  NETWORK: 'network', // DNS, refused connection, timeout
  INVALID_RESPONSE: 'invalid_response', // not the documented GeoJSON
};

export class MetOfficeApiError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message never contains the API key
   * @param {{ status?: number }} [details]
   */
  constructor(kind, message, { status } = {}) {
    super(message);
    this.name = 'MetOfficeApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** The request URL (no secret in it: the key goes in a header). */
export function forecastUrl(endpoint, latitude, longitude) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    includeLocationName: 'true',
    // The units are documented and fixed: the metadata block is not needed.
    excludeParameterMetadata: 'true',
  });
  return `${API_URL}/${endpoint}?${query}`;
}

/**
 * Read one forecast of one position.
 * @param {object} options
 * @param {string} options.apiKey
 * @param {'hourly' | 'daily'} options.endpoint
 * @param {number} options.latitude
 * @param {number} options.longitude
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object>} the raw GeoJSON
 * @throws {MetOfficeApiError}
 */
export async function fetchForecast({
  apiKey,
  endpoint,
  latitude,
  longitude,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = TIMEOUT_MS,
}) {
  let response;
  try {
    response = await fetchImpl(forecastUrl(endpoint, latitude, longitude), {
      headers: {
        accept: 'application/json',
        apikey: apiKey,
        'user-agent': 'gladys-met-office',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? `no answer within ${timeoutMs / 1000} s`
        : (err?.cause?.code ?? err?.code ?? 'connection failed');
    throw new MetOfficeApiError(ERROR_KINDS.NETWORK, `DataHub unreachable (${reason})`);
  }

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    const status = response.status;
    const suffix = `HTTP ${status}`;
    if (status === 401 || status === 403) {
      throw new MetOfficeApiError(ERROR_KINDS.AUTH, `API key refused (${suffix})`, { status });
    }
    if (status === 429) {
      throw new MetOfficeApiError(ERROR_KINDS.RATE_LIMIT, `daily API quota spent (${suffix})`, {
        status,
      });
    }
    if (status === 400 || status === 404) {
      throw new MetOfficeApiError(ERROR_KINDS.BAD_REQUEST, `position refused (${suffix})`, {
        status,
      });
    }
    throw new MetOfficeApiError(ERROR_KINDS.SERVER, `DataHub error (${suffix})`, { status });
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const series = body?.features?.[0]?.properties?.timeSeries;
  if (!Array.isArray(series)) {
    throw new MetOfficeApiError(ERROR_KINDS.INVALID_RESPONSE, 'unexpected answer from DataHub', {
      status: response.status,
    });
  }
  return body;
}
