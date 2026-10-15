# API fixtures

Real answers of the Met Office Weather DataHub, Site-specific forecast
(`GET https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/{hourly|daily}`), taken as they are
from Home Assistant's tests (`tests/components/metoffice/fixtures/metoffice.json`, Apache-2.0,
captured on 23 November 2024 at 12:00 UTC). The positions are two public places of the UK, the
Wavertree and King's Lynn grid points.

- `hourly-wavertree.json`, `hourly-kingslynn.json`: 49 hourly steps, from the model run time.
- `daily-wavertree.json`, `daily-kingslynn.json`: 8 days, the first one (the day before) with its
  night fields only.
- `error-401.json`: the body of a 401 for a refused key. **Not a capture**: written in the shape of
  the IBM API Connect gateway the DataHub parameter metadata points to. The integration only reads the
  status code. `scripts/probe.mjs` shows the real body.

The development session could not reach the DataHub; `scripts/probe.mjs` checks the live shapes.
