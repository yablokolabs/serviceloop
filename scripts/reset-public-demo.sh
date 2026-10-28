#!/usr/bin/env bash
# Reset the public demo database so the single-bay workshop has slots again.
# Only resets when at least one booking exists: an in-progress conversation
# (no booking yet) is never wiped. Safe to run on a timer.
set -euo pipefail

DIR="${SERVICELOOP_DEMO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DB="$DIR/data/prod-live.db"
PORT="${SERVICELOOP_API_PORT:-3102}"

count=0
if [ -f "$DB" ]; then
  count=$(cd "$DIR" && node -e "
    const Database = require('better-sqlite3');
    const db = new Database('data/prod-live.db', { readonly: true });
    try { console.log(db.prepare('SELECT COUNT(*) c FROM bookings').get().c); }
    catch { console.log(0); }
  " 2>/dev/null || echo 0)
fi

start_api() {
  cd "$DIR"
  setsid -f env INTERPRET_MODE="${INTERPRET_MODE:-live}" PORT="$PORT" DB_PATH=data/prod-live.db \
    node dist/apps/api/src/start.js </dev/null >>/tmp/sl-api-reset.log 2>&1
  sleep 2
}

if [ "$count" = "0" ]; then
  # Nothing to reset, but make sure the API is actually up.
  if ! ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    start_api
    echo "no bookings in demo db; api was down, restarted"
  else
    echo "no bookings in demo db; nothing to reset"
  fi
  exit 0
fi

PID=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)
if [ -n "${PID:-}" ]; then
  kill "$PID" || true
  sleep 1
fi

rm -f "$DB" "$DB-wal" "$DB-shm"

start_api
curl -sf --max-time 15 https://serviceloop.yablokolabs.com/healthz >/dev/null
echo "demo db reset (was $count booking(s)); api healthy"
