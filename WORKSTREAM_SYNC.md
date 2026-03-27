# Workstream sync

## Backend status (composite adapter)

All flags in [`frontend/src/config/liveEndpoints.ts`](frontend/src/config/liveEndpoints.ts) are **`true`**: the SLA.ck UI uses the FastAPI backend for impact, cases, live ops, data sources (including connect, datasets, preview, agent memory, anomaly queries), detectors (including create, prompt draft, test, enable toggle), SLA rulebook and extractions, actions, auto mode, and alert rescan.

When adding a new adapter method, extend `LIVE_ENDPOINTS` and wire it in [`frontend/src/adapters/business-sentry/index.ts`](frontend/src/adapters/business-sentry/index.ts).
