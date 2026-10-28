# Continue ServiceLoop
Read AGENTS.md, PROJECT_BUILD.md, docs/PROGRESS.md, actual repo status and original smoke report. Recall Hindsight serviceloop-ai if actual service reachable. Continue one next action; do not restart completed milestones or overwrite original evidence.

Current state (2026-10-28): the application is built and hosted at https://serviceloop.yablokolabs.com (Modal + Cloudflare Worker; the VM stack is rollback only). Direct Meta remains the default; Baseten (exact `meta-models/muse-spark-open-1026`) and Modal's Muse endpoint form the owner-authorized, labeled quota-fallback chain. WhatsApp and voice transcription are not connected and must not be claimed. No footer anywhere. Checkpoint every milestone/30 minutes.

The paragraph below is the original kickoff brief, kept for history; its "app not built / no Baseten" state is superseded by the state above.
Initial state kit/branding plus user-supplied external model tests; app not built. Direct Meta key already at ~/.hermes/.env; don't request/create another or inspect unrelated secrets. Three models selected, no Baseten. Spark/Wonder need domain/oracle revision; deterministic booking guards unconditional. WhatsApp access/telephony unknown, no real garage integration. No footer anywhere. Checkpoint every milestone/30 minutes.
