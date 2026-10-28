# ServiceLoop on Modal: the same Node API + front pair as the VM deploy, in
# one container, with the demo SQLite DB on a persistent Volume. A single
# container (min=max=1) preserves the SQLite single-writer assumption; the
# hourly reset is the only second writer and takes one short transaction.
#
# Deploy: modal deploy modal/modal_app.py  (needs the serviceloop-data
# volume and the serviceloop-env secret, see docs/HOSTING.md)
import modal

app = modal.App("serviceloop")
data = modal.Volume.from_name("serviceloop-data")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "node --version",
    )
    .add_local_dir(
        ".",
        "/app",
        ignore=[
            ".git",
            ".venv",
            "node_modules",
            "apps/web/node_modules",
            "apps/web/dist",
            "dist",
            "data",
            "*.db",
            "*.db-wal",
            "*.db-shm",
            "evidence",
            "*.mp4",
        ],
    )
    .run_commands(
        "cd /app && npm ci",
        "cd /app && npm run build",
        "cd /app/apps/web && npm ci && npm run build",
    )
)

ENV = {
    "WEB_HOST": "0.0.0.0",
    "WEB_PORT": "8080",
    "API_PORT": "3101",
    "DB_PATH": "/data/demo.db",
    # Network volume + second writer: DELETE journal, never WAL.
    "SQLITE_JOURNAL_MODE": "delete",
    "INTERPRET_MODE": "live",
    "WORKSHOP_DATE": "2026-10-29",
    "WORKSHOP_END_DATE": "2026-11-30",
    "WORKSHOP_TZ": "Asia/Kolkata",
    "TURN_LIMIT_PER_MIN": "20",
    "API_LIMIT_PER_MIN": "180",
}


@app.function(
    image=image,
    volumes={"/data": data},
    secrets=[modal.Secret.from_name("serviceloop-env")],
    env=ENV,
    min_containers=1,
    max_containers=1,
)
@modal.concurrent(max_inputs=50)
@modal.web_server(8080)
def serve():
    import subprocess

    subprocess.Popen(["node", "scripts/serve-modal.mjs"], cwd="/app")


# Demo reset, mirroring scripts/reset-public-demo.sh: wipe demo state only
# when a booking exists, so an in-progress conversation is never cleared.
# The offers seed stays; the server reseeds nothing at runtime.
RESET_TABLES = [
    "bookings",
    "holds",
    "proposals",
    "jobs",
    "inbox",
    "ledger_entries",
    "pending_ambiguities",
    "mentioned_times",
    "turns",
    "conversations",
    "review_tasks",
    "feedback_responses",
    "offer_approvals",
]
RESET_SEQUENCES = ["bookings", "inbox", "review_tasks", "turns"]


@app.function(
    image=image,
    volumes={"/data": data},
    schedule=modal.Cron("7 * * * *"),
)
def reset_demo():
    import os
    import sqlite3
    import time

    if not os.path.exists("/data/demo.db"):
        print("no demo db yet; nothing to reset")
        return
    for attempt in range(5):
        try:
            db = sqlite3.connect("/data/demo.db", timeout=10)
            try:
                count = db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0]
            except sqlite3.OperationalError:
                print("bookings table missing; nothing to reset")
                return
            if count == 0:
                print("no bookings in demo db; nothing to reset")
                return
            with db:
                for table in RESET_TABLES:
                    db.execute(f"DELETE FROM {table}")
                for seq in RESET_SEQUENCES:
                    db.execute("DELETE FROM sqlite_sequence WHERE name = ?", (seq,))
            print(f"demo db reset (was {count} booking(s))")
            data.commit()
            return
        except sqlite3.OperationalError as e:
            print(f"reset attempt {attempt + 1} hit {e}; retrying")
            time.sleep(5)
    print("reset failed after retries; leaving db untouched")
