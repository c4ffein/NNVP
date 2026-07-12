#!/usr/bin/env bash
#
# One-command contract run:
#   1. throwaway sqlite DB in a temp dir for the Django backend
#   2. migrate + runserver on a dedicated port (background)
#   3. wait for readiness (poll /api/docs)
#   4. run the bun contract suite (real ApiClient -> real backend)
#   5. kill the server, delete the temp DB
#
# Overrides:
#   NNVP_BACKEND_DIR   path to the Django backend checkout (default: ../../nnvp-backend)
#   NNVP_BACKEND_PORT  port to serve on (default: 8123)
set -euo pipefail

SPA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${NNVP_BACKEND_DIR:-$(cd "$SPA_DIR/../.." && pwd)/nnvp-backend}"
PORT="${NNVP_BACKEND_PORT:-8123}"
BASE_URL="http://127.0.0.1:${PORT}"

if [ ! -f "$BACKEND_DIR/manage.py" ]; then
  echo "error: backend not found at $BACKEND_DIR (set NNVP_BACKEND_DIR)" >&2
  exit 1
fi

# --- backend python: reuse the venv the backend Makefile builds (via uv) ---
PYTHON="$BACKEND_DIR/.venv/bin/python"
# Note: `import ninja` needs DJANGO_SETTINGS_MODULE, so only check it's findable.
if ! "$PYTHON" -c 'import sys, importlib.util as u, django; sys.exit(0 if u.find_spec("ninja") else 1)' >/dev/null 2>&1; then
  echo "backend venv unusable; rebuilding via the backend Makefile ..."
  make -C "$BACKEND_DIR" install
fi

# --- throwaway database + mailbox in a fresh temp dir ---
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nnvp-contract.XXXXXX")"
export DJANGO_DB_PATH="$TMP_DIR/db.sqlite3"
# Magic-link emails land as files here; the contract suite reads the links out.
export EMAIL_BACKEND="django.core.mail.backends.filebased.EmailBackend"
export EMAIL_FILE_PATH="$TMP_DIR/mail"
mkdir -p "$EMAIL_FILE_PATH"

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

echo "==> migrating throwaway sqlite DB ($DJANGO_DB_PATH)"
(cd "$BACKEND_DIR" && "$PYTHON" manage.py migrate --noinput) >"$TMP_DIR/migrate.log" 2>&1 \
  || { cat "$TMP_DIR/migrate.log" >&2; exit 1; }

echo "==> starting backend on $BASE_URL"
(cd "$BACKEND_DIR" && exec "$PYTHON" manage.py runserver "127.0.0.1:${PORT}" --noreload) \
  >"$TMP_DIR/server.log" 2>&1 &
SERVER_PID=$!

echo "==> waiting for readiness (GET /api/docs)"
ready=0
for _ in $(seq 1 60); do
  if curl --noproxy '*' -fsS -o /dev/null "$BASE_URL/api/docs" 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "error: backend exited during startup:" >&2
    cat "$TMP_DIR/server.log" >&2
    exit 1
  fi
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  echo "error: backend never became ready on $BASE_URL" >&2
  cat "$TMP_DIR/server.log" >&2
  exit 1
fi

echo "==> running contract suite"
status=0
(cd "$SPA_DIR" && NNVP_BACKEND_URL="$BASE_URL" NNVP_MAIL_DIR="$EMAIL_FILE_PATH" bun run test:contract) || status=$?

exit "$status"
