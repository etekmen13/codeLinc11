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

## Coverage intake demo

The insurer labels are Lincoln Financial, Delta Dental and MetLife. All demo plan
names, ID formats, coverage values, networks, fees, claims history and FSA values
are fictional; there is no insurer eligibility lookup or affiliation.

On the plan step, select a demo plan and sample ID, optionally upload a text-based
coverage PDF, review the page evidence, and explicitly apply extracted candidates.
Edit the annual maximum, deductible, plan-paid percentages, current benefit-year
start, coverage start, balance date, insurer benefits used and deductible met.
The same submitted values are validated by onboarding, providers, simulation and
care planning. Unedited rules and history remain demo assumptions.

`POST /api/coverage/extract` accepts a multipart `file` (PDF, at most 10 MB and
40 pages), returns candidate fields with page evidence, and does not save uploads.
General product brochures never supply exact numeric benefits. Conflicting
values are omitted. Scanned documents need manual entry; OCR is not implemented.
The extractor currently handles simple labeled text, not arbitrary insurer tables,
network-specific percentages, exclusions, waiting periods or rollover rules.
It never applies a candidate automatically or changes the selected insurer.

Run `uv sync` in backend after updating, and `npm run build` in frontend.
