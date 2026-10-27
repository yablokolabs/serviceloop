// Persistent follow-up worker. Jobs live in SQLite; leases make delivery
// safe across restarts and concurrent tickers. Bounded attempts, quiet hours,
// opt-out and booked rechecks. No live calls; browser-channel only.
import type Database from 'better-sqlite3';

export interface JobRow {
  id: string;
  convo: string;
  kind: string;
  due_at: number;
  channel: string;
  payload_json: string;
  status: string;
  attempt: number;
  max_attempts: number;
}

export type Sender = (job: JobRow) => void;

const LEASE_MS = 60000;
const QUIET_START = 21;
const QUIET_END = 9;

function hourInTz(nowMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(
    new Date(nowMs),
  );
  return Number(parts);
}

export function tick(
  raw: Database.Database,
  sender: Sender,
  nowMs: number = Date.now(),
  timezone = 'Asia/Kolkata',
): { delivered: number } {
  let delivered = 0;
  for (;;) {
    const job = raw
      .prepare(
        `SELECT * FROM jobs WHERE status = 'scheduled' AND due_at <= ? AND (lease_until IS NULL OR lease_until < ?) ORDER BY due_at LIMIT 1`,
      )
      .get(nowMs, nowMs) as (JobRow & { lease_until: number | null }) | undefined;
    if (!job) return { delivered };
    const claimed = raw
      .prepare(`UPDATE jobs SET lease_until = ? WHERE id = ? AND (lease_until IS NULL OR lease_until < ?)`)
      .run(nowMs + LEASE_MS, job.id, nowMs);
    if (claimed.changes === 0) return { delivered };

    const finish = (status: string, dueAt?: number) => {
      if (dueAt === undefined) raw.prepare(`UPDATE jobs SET status = ?, lease_until = NULL WHERE id = ?`).run(status, job.id);
      else
        raw
          .prepare(`UPDATE jobs SET status = ?, due_at = ?, lease_until = NULL WHERE id = ?`)
          .run(status, dueAt, job.id);
    };

    const convo = raw.prepare(`SELECT status FROM conversations WHERE id = ?`).get(job.convo) as
      | { status: string }
      | undefined;
    if (convo?.status === 'opted_out') {
      finish('cancelled');
      continue;
    }
    const booked = raw
      .prepare(`SELECT 1 FROM proposals WHERE convo = ? AND status = 'confirmed' LIMIT 1`)
      .get(job.convo);
    if (booked && ['followup', 'blocker', 'winback', 'winback-blocker', 'service-reminder'].includes(job.kind)) {
      finish('cancelled');
      continue;
    }
    if (convo?.status === 'snoozed' && job.kind.startsWith('winback')) {
      finish('cancelled');
      continue;
    }
    if (job.kind === 'winback') {
      const code = (JSON.parse(job.payload_json) as { code?: string }).code ?? 'WINBACK10';
      const approved = raw
        .prepare('SELECT 1 FROM offer_approvals WHERE convo = ? AND code = ?')
        .get(job.convo, code);
      if (!approved) {
        // Staff may approve later: defer a few minutes, bounded by attempts,
        // instead of dropping the job before approval can happen.
        const attempt = job.attempt + 1;
        if (attempt >= job.max_attempts) finish('cancelled');
        else
          raw
            .prepare(`UPDATE jobs SET status = 'scheduled', attempt = ?, due_at = ?, lease_until = NULL WHERE id = ?`)
            .run(attempt, nowMs + 5 * 60000, job.id);
        continue;
      }
    }
    const h = hourInTz(nowMs, timezone);
    if (h >= QUIET_START || h < QUIET_END) {
      finish('scheduled', nowMs + 3600000);
      continue;
    }
    try {
      sender(job);
      raw.prepare(`UPDATE jobs SET status = 'done', lease_until = NULL WHERE id = ?`).run(job.id);
      raw.prepare(`UPDATE conversations SET status = 'negotiating' WHERE id = ?`).run(job.convo);
      delivered++;
      if (job.kind === 'winback') {
        // Stage 2: still no booking -> ask what is blocking them.
        raw
          .prepare(
            `INSERT INTO jobs (id, convo, kind, due_at, channel, payload_json, status, created_at, max_attempts) VALUES (?, ?, 'winback-blocker', ?, ?, ?, 'scheduled', ?, 2)`,
          )
          .run(
            `job-wb2-${job.id}`,
            job.convo,
            nowMs + 30 * 60000,
            job.channel,
            JSON.stringify({
              text: 'No pressure — what is stopping you? Price, timing, pickup, or was our last service not good? Tell us what we can improve (simulated workshop).',
            }),
            nowMs,
          );
      }
    } catch {
      const attempt = job.attempt + 1;
      if (attempt >= job.max_attempts) {
        raw.prepare(`UPDATE jobs SET status = 'failed', attempt = ?, lease_until = NULL WHERE id = ?`).run(attempt, job.id);
      } else {
        raw
          .prepare(`UPDATE jobs SET attempt = ?, due_at = ?, lease_until = NULL WHERE id = ?`)
          .run(attempt, nowMs + attempt * 300000, job.id);
      }
    }
  }
}
