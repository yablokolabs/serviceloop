#!/usr/bin/env bash
# Reset the public demo database so the single-bay workshop has slots again.
# Only resets when at least one booking exists, and conversations still
# negotiating keep every row (their holds just expire). Terminal
# conversations lose all their rows. Safe to run on a timer.
#
# The production path is Modal (reset_demo -> POST /api/admin/reset-demo);
# this script is the VM rollback equivalent and applies the same row-level
# semantics through one short SQLite transaction. The running API keeps its
# own connection and sees the committed deletions, so no restart is needed.
set -euo pipefail

DIR="${SERVICELOOP_DEMO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DB="$DIR/data/prod-live.db"
PORT="${SERVICELOOP_API_PORT:-3102}"

RESULT=skipped
if [ -f "$DB" ]; then
  RESULT=$(cd "$DIR" && node -e '
    const Database = require("better-sqlite3");
    const db = new Database("data/prod-live.db");
    let count = 0;
    try { count = db.prepare("SELECT COUNT(*) c FROM bookings").get().c; } catch { count = 0; }
    if (count > 0) {
      const keep = "(SELECT id FROM conversations WHERE status = \x27negotiating\x27)";
      db.transaction(() => {
        db.exec("DELETE FROM bookings");
        db.exec("DELETE FROM sqlite_sequence WHERE name = \x27bookings\x27");
        for (const t of ["proposals", "jobs", "inbox", "ledger_entries", "pending_ambiguities", "mentioned_times", "turns", "review_tasks", "feedback_responses", "offer_approvals"]) {
          db.exec(`DELETE FROM ${t} WHERE convo NOT IN ${keep}`);
        }
        db.exec(`DELETE FROM conversations WHERE id NOT IN ${keep}`);
        db.exec("DELETE FROM holds WHERE hold_token NOT IN (SELECT hold_token FROM proposals)");
      })();
    }
    console.log(count);
  ' 2>/dev/null || echo skipped)
fi

start_api() {
  cd "$DIR"
  setsid -f env INTERPRET_MODE="${INTERPRET_MODE:-live}" PORT="$PORT" DB_PATH=data/prod-live.db \
    WORKSHOP_DATE="${WORKSHOP_DATE:-2026-10-31}" WORKSHOP_END_DATE="${WORKSHOP_END_DATE:-2026-11-30}" \
    node dist/apps/api/src/start.js </dev/null >>/tmp/sl-api-reset.log 2>&1
  sleep 2
}

# Nothing reset (or no db yet): just make sure the API is actually up.
if ! ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  start_api
  echo "api was down, restarted (reset result: $RESULT)"
  exit 0
fi

if [ "$RESULT" = "skipped" ] || [ "$RESULT" = "0" ]; then
  echo "no bookings in demo db; nothing to reset"
  exit 0
fi

curl -sf --max-time 15 https://serviceloop.yablokolabs.com/healthz >/dev/null
echo "demo db reset (was $RESULT booking(s)); api healthy"
