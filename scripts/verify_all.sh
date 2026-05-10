#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PORT="${VERIFY_PORT:-8012}"
BASE_HTTP="http://127.0.0.1:${PORT}"

print_step() {
  printf "\n==> %s\n" "$1"
}

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

print_step "Checking frontend lint"
cd "$ROOT_DIR"
npm run lint

print_step "Checking frontend production build"
npm run build

print_step "Starting backend on port ${PORT}"
cd "$ROOT_DIR"
source ".venv/bin/activate"
cd "$BACKEND_DIR"
uvicorn main:app --host 127.0.0.1 --port "$PORT" > /tmp/mockmate_verify_backend.log 2>&1 &
BACKEND_PID=$!

for _ in {1..30}; do
  if curl -fsS "$BASE_HTTP/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "$BASE_HTTP/" >/dev/null 2>&1; then
  echo "Backend failed to start. Check /tmp/mockmate_verify_backend.log"
  exit 1
fi

print_step "Running backend regression tests"
BASE_URL="$BASE_HTTP" python test_context.py
BASE_URL="$BASE_HTTP" python test_session_flow.py
BASE_URL="$BASE_HTTP/api" python test_early_end.py
BASE_URL="$BASE_HTTP" python test_summary.py
BASE_URL="$BASE_HTTP/api" python final_verify_flow.py

print_step "All verification checks passed"
