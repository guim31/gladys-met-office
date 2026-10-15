# Met Office for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that brings the forecasts
of the **[Met Office](https://www.metoffice.gov.uk)**, the UK's national weather service, into Gladys,
through the free plan of the **Met Office Weather DataHub** ("Site-specific" forecast, Global Spot) — the
API Home Assistant's `metoffice` integration moved to when the old DataPoint service closed.
Read-only.

> **Developed without the hardware: feedback welcome.** There is no device to own, but the integration
> was built without a DataHub account either: it is tested against the real API answers published in
> Home Assistant's tests, not against the live API. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-met-office/issues).

## Features

- **One device per place**: the houses of Gladys (their location, read with the manifest's
  `location: true`), or up to 3 places typed as coordinates. Each device carries the forecast of the
  current hour: temperature, feels-like temperature, humidity, sea-level pressure, wind speed, gusts
  and direction, chance of precipitation, precipitation rate, visibility, UV index, and the weather
  conditions as a text in the configured language (the 32 Met Office weather codes, in English,
  French, German and Spanish).
- **Met Office forecast widget**: the temperature, chance of rain and wind of now, then the next
  7 days (tap a day for its details) or the next 24 hours (temperature curve, next 6 hours), in the
  user's units.
- **Scene action "Met Office: forecast of a day"**: today's, tomorrow's or the day after's maximum,
  night minimum, chance of rain (day and night), gusts, UV index and weather, for the next steps of a
  scene (skip the watering, frost warning, morning briefing).
- **Test the connection** button: reads every place and reports its temperature, weather, the distance
  to the model point and the API calls a day the settings use.
- **Quota-aware**: the free plan allows 360 calls a day. Each place reads its hourly forecast every
  15, 30 (default) or 60 minutes and its daily forecast every 3 hours — 56 calls a day for one place at
  30 minutes; 3 places at most, slowed down by itself when needed. The widget, the scene action, a
  device just added and the core's polls are served from the cache.
- Quiet logs, the API key never written anywhere but in the `apikey` header of the requests.
- Feature names, messages, widget and documentation in English, French, German and Spanish.

## Requirements

- Gladys **5.1.0** or later.
- A free **Met Office Weather DataHub** account, subscribed to the free plan of **Site Specific**
  (Global Spot), and the API key of that subscription:
  [datahub.metoffice.gov.uk](https://datahub.metoffice.gov.uk/).
- A house of Gladys located in its settings, or the coordinates of the places to forecast.
- Internet access from Gladys to `data.hub.api.metoffice.gov.uk`.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the address of this repository:
   `https://github.com/guim31/gladys-met-office` (or install **Met Office** from the catalog once it
   is listed). The install screen says the integration reads the location of the houses.
2. In **Configuration**, paste the API key, choose the places (the houses of Gladys, or coordinates
   such as `Exeter: 50.7184, -3.5339`), the refresh interval and the language of the texts. Save, then
   click **Test the connection**.
3. Open the **Discovery** tab and add the places.

The user guide is in [`docs/en.md`](docs/en.md) (also in [French](docs/fr.md), [German](docs/de.md)
and [Spanish](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

- `GET https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=…&longitude=…&includeLocationName=true`
  (and `/daily`), the key in the `apikey` header. The answer is a GeoJSON feature: the model point
  nearest to the position, its name, its distance, the model run time and a time series (49 hourly
  steps, or 8 days). `401` for a refused key, `429` once the daily quota is spent.
- The "now" of a place is the hourly step nearest to the clock (as Home Assistant does): it moves on
  its own between two reads. After 6 hours without a successful read, nothing is published any more (a
  heartbeat would date an old run as current) and the transport badge turns orange or red.
- The container refreshes by itself (`src/poller.js`): Gladys 5.2.x does not reliably poll external
  devices (GladysAssistant/Gladys#3198). The devices still declare `should_poll` with a one-minute
  frequency, and the core's `onPoll` reads the API only for a place not read for 90 % of a period.
- States go through `publishChangedStates` (only changes, a 6-hour heartbeat). Everything is re-sent
  from the cache when a device is added and after a reconnection.
- Units: °C, km/h (Gladys speed sensors know km/h and m/s, not mph), hPa, km, mm/h, %.

## Limitations

- Forecasts of the current hour, not observations.
- 3 places at most (the free quota); a paid plan is not taken into account.
- The weather text is in the language of the configuration, not of each user (a device integration
  does not receive it).
- No Met Office weather warnings (not part of this API).
- The free plan belongs to the Met Office, which may change it at any time.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`) and a fake
DataHub (`test/helpers/world.js`) serving the real answers of `test/fixtures/metoffice/`. With network
access, `node scripts/probe.mjs` checks that a fake key is refused, and
`METOFFICE_API_KEY=… node scripts/probe.mjs 50.7184 -3.5339` prints the real shape of the answers
and the values the integration would publish (never the key). See [`CLAUDE.md`](CLAUDE.md) for the
project rules.

Releases go through **Actions → Release** (version bump, changelog, tag, multi-arch image, GitHub
Release). A hand-pushed `vX.Y.Z` tag also builds the image and the Release, but does not touch the
files: bump `version` in `package.json` and in `gladys-assistant-integration.json` (with the
`docker_image` tag) and commit before tagging.

## Credits

- The [Met Office](https://www.metoffice.gov.uk) for the Weather DataHub, its free plan and its
  documentation (parameters, units, significant weather codes).
- Home Assistant's [`metoffice` integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components/metoffice)
  by @MrHarcombe and @avee87 (Apache-2.0): the endpoints, the 15-minute pace, the sensor list, the
  "nearest hourly step" rule. The fixtures of `test/fixtures/metoffice/` are the API answers of its
  tests (`tests/components/metoffice/fixtures/metoffice.json`, Apache-2.0).
- [datapoint-python](https://github.com/EJEP/datapoint-python) by Emily Price, Jacob Tomlinson and
  contributors (GPL-3.0): read to understand the request (the `apikey` header) and the day/night split
  of the daily answer. No code was copied.
- The architecture, refresh timer and conformity tests follow
  [gladys-wunderground](https://github.com/guim31/gladys-wunderground),
  [gladys-wled](https://github.com/guim31/gladys-wled) and
  [gladys-subsonic](https://github.com/guim31/gladys-subsonic).

## Disclaimer

This project is not affiliated with the Met Office, nor endorsed or sponsored by it. "Met Office" is a
trademark of its owner.

## License

Apache-2.0
