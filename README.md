# CostPulse AI

CostPulse AI is a modular full-stack SaaS prototype for PS 3. It includes:

- a FastAPI backend with a normalized enterprise cost domain
- synthetic organization seeding without hardcoded records
- cost leakage, SLA risk, resource optimization, and vendor discrepancy alerts
- approval and action workflows
- natural-language investigative querying
- audit feed and PDF report generation
- a Vite React frontend with a business-grade dashboard
- Docker Compose for local end-to-end execution

## Stack

- Frontend: Vite + React + TypeScript
- Backend: FastAPI + SQLAlchemy + uv
- DB: PostgreSQL
- Support: Redis

## Local Run

### Docker

```bash
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

Then use the `Generate Enterprise Dataset` button in the sidebar.

### Backend without Docker

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

This path now defaults to a local SQLite database at `backend/costpulse_local.db`.

If you want to use PostgreSQL outside Docker, create `backend/.env` with:

```bash
POSTGRES_USER=costpulse
POSTGRES_PASSWORD=costpulse
POSTGRES_DB=costpulse
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### Frontend without Docker

```bash
cd frontend
npm install
npm run dev
```

## Seed Pipeline

Enterprise-like datasets are generated from YAML profiles in [`data/seed_profiles`](./data/seed_profiles). Each profile defines:

- organization metadata
- department structure
- vendor mix
- workload scale
- resource pools
- anomaly probabilities
- sample source schemas for normalization

The backend converts these profiles into normalized relational data, then scans for alerts and generates executive PDF reports.

## Quick-Commerce Synthetic Data

A richer Blinkit-style synthetic dataset is available under [`data/synthetic/delivra_india`](./data/synthetic/delivra_india). It includes dark stores, teams, employees, drivers, orders, delivery events, inventory snapshots, work items, invoices, and ground-truth anomalies.

To regenerate it:

```bash
cd backend
uv run python ../scripts/generate_delivra_synthetic_data.py --output-dir ../data/synthetic/delivra_india --days 14
```

The generation spec used for this bundle lives in [`docs/blinkit_synthetic_data_guide.md`](./docs/blinkit_synthetic_data_guide.md).

### Load It Into The App Database

The website should consume normalized SLA.ck entities, not Delivra-specific tables. To test that path, import the synthetic bundle into the app database through the generic bundle adapter.

Start the Docker stack with PostgreSQL:

```bash
docker compose up --build -d postgres redis backend frontend
```

Then import the bundle into the app DB:

```bash
cd backend
uv run python ../scripts/import_synthetic_bundle_to_app.py --bundle-name delivra_india
```

Or through the API:

```bash
curl -X POST http://localhost:8000/api/bootstrap/import-synthetic-bundle \
  -H "Content-Type: application/json" \
  -d '{"bundle_name":"delivra_india","reset":true}'
```

The importer maps the raw quick-commerce CSVs into the app’s generic models:

- `work_items -> Workflow`
- `invoices -> Invoice`
- `contracts -> Contract`
- `inventory_snapshots -> ResourceSnapshot`
- `teams -> Department`
- `vendors -> Vendor`

That keeps the product dynamic: the synthetic bundle is just one ingestion adapter, not a hardcoded UI-specific dataset.

### Load It Through An External Postgres Source

If you want to test the SaaS against a real source database instead of local CSV files, the repo now includes a separate Dockerized Postgres source path.

Start the app database and the raw source database:

```bash
docker compose up --build -d postgres source-postgres redis backend frontend
```

Load the raw bundle into the source Postgres instance:

```bash
cd backend
uv run python ../scripts/load_synthetic_bundle_into_postgres.py \
  --database-url postgresql+psycopg://source_demo:source_demo@localhost:5433/source_demo \
  --schema synthetic_demo
```

Then import that relational source into the app through the generic relational adapter:

```bash
curl -X POST http://localhost:8000/api/bootstrap/import-relational-source \
  -H "Content-Type: application/json" \
  -d '{"database_url":"postgresql+psycopg://source_demo:source_demo@source-postgres:5432/source_demo","schema":"synthetic_demo","reset":true}'
```

Or from the CLI:

```bash
cd backend
uv run python ../scripts/import_relational_source_to_app.py \
  --database-url postgresql+psycopg://source_demo:source_demo@localhost:5433/source_demo \
  --schema synthetic_demo
```

This path keeps the app generic: the UI sees normalized `Workflow`, `Invoice`, `ResourceSnapshot`, `Department`, and `Vendor` records, while `Data Sources` still shows the connected raw source tables and their schemas.
