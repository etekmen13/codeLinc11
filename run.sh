#!/usr/bin/env bash
# Install dependencies and run the backend and frontend dev servers.
# Backend: http://127.0.0.1:8000  Frontend: http://localhost:5173
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v uv >/dev/null; then
  echo "Installing uv..."
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex" ;;
    *)
      if command -v curl >/dev/null; then
        curl -LsSf https://astral.sh/uv/install.sh | sh
      else
        wget -qO- https://astral.sh/uv/install.sh | sh
      fi ;;
  esac
  export PATH="$HOME/.local/bin:$PATH"
  command -v uv >/dev/null || { echo "uv install failed: https://docs.astral.sh/uv/" >&2; exit 1; }
fi
command -v npm >/dev/null || { echo "Node.js 20+ is required" >&2; exit 1; }

[ -f backend/.env ] || cp backend/.env.example backend/.env

(cd backend && uv sync)
(cd frontend && npm install)

trap 'kill 0' EXIT INT TERM

(cd backend && uv run --env-file .env fastapi dev main.py) &
(cd frontend && npm run dev) &

wait
