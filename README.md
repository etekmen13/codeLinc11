# codeLinc11

FastAPI + SQLite backend, React + TypeScript + Vite frontend.

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

## Project layout

```
backend/
  main.py         FastAPI app and routes
  app.db          SQLite database (created on startup, not committed)
frontend/
  src/App.tsx     Main React component
  vite.config.ts  Dev server and /api proxy
```

## Formatting and linting

- Python: `uv run ruff format` and `uv run ruff check` (from `backend/`)
- TypeScript: `npm run lint` (from `frontend/`)

In VS Code, format on save is configured in `.vscode/settings.json`. Install the Ruff and Prettier extensions.
