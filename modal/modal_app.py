# ServiceLoop on Modal: the same Node API + front pair as the VM deploy, in
# one container, with the demo SQLite DB on a persistent Volume. The API is
# the only SQLite writer: the hourly reset asks it (over HTTP, key-gated)
# to clear demo state through its own connection.
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
        copy=True,
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
        # One root install covers all npm workspaces; never npm-ci inside
        # apps/web alone, which breaks hoisted binaries like vite.
        "cd /app && npm ci",
        "cd /app && npm run build",
        "cd /app && npm run build --workspace=@serviceloop/web",
    )
)

ENV = {
    "WEB_HOST": "0.0.0.0",
    "WEB_PORT": "8080",
    "API_PORT": "3101",
    "DB_PATH": "/data/demo.db",
    # The API is the only SQLite writer, and the network volume makes WAL
    # visibility unsafe: DELETE journal, never WAL.
    "SQLITE_JOURNAL_MODE": "delete",
    "INTERPRET_MODE": "live",
    "WORKSHOP_DATE": "2026-10-31",
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


# Demo reset: ask the API to clear demo state through its own SQLite
# connection (POST /api/admin/reset-demo, key-gated by SL_RESET_KEY). The
# API is the only writer; this function never touches the DB file. The API
# itself decides: it resets only when a booking exists and preserves
# conversations still negotiating.
APP_URL = "https://yablokolabs--serviceloop-serve.us-east.modal.run"


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("serviceloop-env")],
    schedule=modal.Cron("7 * * * *"),
)
def reset_demo():
    import os
    import time
    import urllib.request

    key = os.environ.get("SL_RESET_KEY", "")
    if not key:
        print("SL_RESET_KEY not configured; cannot trigger reset")
        return
    headers = {"content-type": "application/json", "x-reset-key": key}
    # The public front only serves /api/* to the trusted Worker proxy; the
    # reset proves the same proxy secret instead of bypassing it.
    proxy_secret = os.environ.get("SL_PROXY_SECRET", "")
    if proxy_secret:
        headers["x-proxy-secret"] = proxy_secret
    req = urllib.request.Request(
        f"{APP_URL}/api/admin/reset-demo",
        data=b"{}",
        headers=headers,
        method="POST",
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                print("reset:", resp.read().decode()[:200])
            return
        except Exception as e:
            print(f"reset attempt {attempt + 1} failed: {e}")
            time.sleep(5)
    raise RuntimeError("demo reset failed after retries")
