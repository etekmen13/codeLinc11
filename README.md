# codeLinc11

Dental Benefits Optimizer: lays out when to have a dental procedure and how to pay for it, with costs and risks across simulated futures. FastAPI backend, React + TypeScript + Vite frontend. All plans, members and dentists are sample data.

## Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js 20+

## Setup

Backend (http://127.0.0.1:8000, API docs at `/docs`):

```sh
cd backend
cp .env.example .env
uv sync
uv run --env-file .env fastapi dev main.py
```

Frontend (http://localhost:5173), in a second terminal:

```sh
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to the backend, so frontend code can call `fetch("/api/...")` directly.

To try it, open http://localhost:5173 and click **Fill with demo data** on the first onboarding step.

## AI features (optional)

Two features can use AWS Bedrock: matching a free-text treatment description to a procedure, and plain-English explanations of insurance terms. No AWS account is needed to run the app. Without one, treatment descriptions are matched by keyword against the procedures the app can price, and terms show their built-in definitions.

To turn the AI features on, set `BEDROCK_MODEL_ID` (and AWS credentials) in `backend/.env`; see `backend/.env.example`. If Bedrock fails, the app falls back to the same behavior as without it.

## Project layout

```
backend/
  main.py             FastAPI app; registers each module's routes
  catalog.py          Sample plans, members, procedures and dentists
  cost.py             Cost engine: what one procedure costs, insured or cash
  monte_carlo.py      How an untreated tooth may progress (simulation)
  sequencer.py        Care plan options across simulated futures
  fsa.py              FSA funding and election
  *_api.py, provider.py, onboarding.py   HTTP endpoints
  cdt_mapper.py       Treatment description to procedure (Bedrock or keywords)
  care_plan.py        Cost and term explanations
  tests/              pytest suite
frontend/
  src/App.tsx         App shell and flow between screens
  src/onboarding/     Onboarding steps
  src/screens/        Tooth risk screen
  src/careplan/       Dentist comparison and care plan screens
  src/api.ts          Backend calls; src/types.ts mirrors the API models
  vite.config.ts      Dev server and /api proxy
```

## Formatting and linting

- Python: `uv run ruff format` and `uv run ruff check` (from `backend/`)
- Python tests: `uv run pytest` (from `backend/`)
- TypeScript: `npm run lint` (from `frontend/`)

In VS Code, format on save is configured in `.vscode/settings.json`. Install the Ruff and Prettier extensions.
