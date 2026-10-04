#!/usr/bin/env bash
# Install dependencies and run the backend and frontend dev servers.
# Backend: http://127.0.0.1:8000  Frontend: http://localhost:5173
set -euo pipefail

cd "$(dirname "$0")"

command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/" >&2; exit 1; }
command -v npm >/dev/null || { echo "Node.js 20+ is required" >&2; exit 1; }

[ -f backend/.env ] || cp backend/.env.example backend/.env

(cd backend && uv sync)
(cd frontend && npm install)

trap 'kill 0' EXIT INT TERM

(cd backend && uv run --env-file .env fastapi dev main.py) &
(cd frontend && npm run dev) &

wait
