# Changelog

## 2.1.0: Interface redesign

### New
- Landing page at `/` with an original logo, real dashboard screenshots (light and dark) and an interactive chart of the real 10-year SPY history coloured by market condition. The dashboard home moved to `/overview`; every other route is unchanged.
- Reusable UI kit in `frontend/src/components/ui`: buttons, an accessible searchable dropdown (`Select`), segmented controls, switches, sliders, fields, tabs, info tips, alerts, confirm dialog and skeleton loaders.
- Design tokens for light and dark themes built only from the five brand colours (`src/index.css`), self-hosted IBM Plex fonts, mobile navigation drawer.
- Price charts: market-condition background bands, area/line/candle views, 50/200-day averages, volume, period buttons and a live readout under the cursor.
- Backtest results: plain-language summary, per-condition table, price chart with trade markers, sortable and filterable trade list, yearly totals in the monthly table, CSV exports. The last result survives a page refresh.
- Parameter Stability: editable grids with validation and a plateau / slope / spike verdict based on neighbouring cells.
- Research History: search, filter, sort, overlay chart when comparing, detail view with reproducibility check, delete confirmation.
- Settings: default costs and risk-free rate now persist and pre-fill every form.
- Plain-English labels throughout ("Calm uptrend" instead of "Bull/Low Vol"; the API values are unchanged).

### Fixed
- Parameter Stability and Out-of-Sample sent invalid settings: mean reversion used positive entry z-scores (rejected by the API) and the moving-average crossover used `fast_period`/`slow_period`, which the API ignored, so every cell showed the same result.
- Backtest benchmark line plotted raw share price against dollar equity; it is now buy and hold scaled to the same starting amount.
- Strategy Testing sent the risk-free rate as a whole number (4 meant 400%).
- Out-of-Sample "degradation %" showed 0.41 as "0.4%" instead of 41%.
- Weekly and monthly bar sizes did nothing for the built-in SPY data; the backend now resamples it (`resample_ohlcv`, with tests).
- Risk Analysis ignored the adjusted-prices setting; Settings referenced non-existent interval codes.
- Added the missing `backend/requirements.txt` referenced by the README and Dockerfile.
