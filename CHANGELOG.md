# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The Met Office forecasts in Gladys, through the free plan of the Met Office Weather DataHub
  (Site-specific forecast, the API Home Assistant uses): one device per place — the houses located in
  Gladys, or up to 3 places typed as coordinates.
- The forecast of the current hour on each device: temperature, feels-like temperature, humidity,
  pressure, wind speed, gusts and direction, chance of precipitation, precipitation rate, visibility,
  UV index, and the weather conditions as a text ("Light rain", "Sunny"…).
- Refresh every 15, 30 or 60 minutes, the 7-day forecast every 3 hours, within the 360 calls a day of
  the free plan; the reads pause one hour when the quota is spent anyway. A forecast not refreshed for
  6 hours is no longer published, and its badge turns orange in the device list.
- **Met Office forecast** dashboard widget: now, then the next 7 days or the next 24 hours.
- **Met Office: forecast of a day** scene action: today's, tomorrow's or the day after's maximum,
  minimum, chance of rain, gusts, UV index and weather, for the next steps of a scene.
- **Test the connection** button: reads every place and says what it got and how many API calls a day
  the settings use.
- Feature names, weather conditions, messages, widget and documentation in English, French, German
  and Spanish.

[Unreleased]: https://github.com/guim31/gladys-met-office/commits/main
