#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BASE_URL:-}" ]]; then
  echo "Usage: BASE_URL=https://your-service.onrender.com bash scripts/smoke-render.sh" >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"

check_route() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}${path}")"
  echo "${path}: ${actual}"
  [[ "$actual" == "$expected" ]]
}

check_route /health 200
check_route /api/pipa 200
check_route /api/polygon 200
check_route /api/marker 200
check_route /api/session 401

echo "Render smoke test passed"
