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
