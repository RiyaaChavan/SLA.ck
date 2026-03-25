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
