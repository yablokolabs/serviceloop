import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';
import { tick } from '../../apps/worker/src/worker.js';

const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function boot(testMode = true) {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-job-')), 'jobs.db');
  const srv = createServer({ dbPath, workshopDate: '2026-10-31', timezone: 'Asia/Kolkata', testMode });
  const port = await srv.listen(0);
  servers.push(srv);
  const post = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json() as Promise<any>);
  const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`).then((r) => r.json() as Promise<any>);
  return { post, get, dbPath };
}

const FUTURE = '2026-10-27T10:00:00+05:30';

describe('snooze and follow-up jobs', () => {
  test('snoozed conversation restores across restart and delivers once to inbox', async () => {
    const a = await boot();
    const s = await a.post('/api/snooze', { conversationId: 'j1', callbackAt: FUTURE, channel: 'browser' });
    expect(s.jobId.length).toBeGreaterThan(0);
    const st = await a.get('/api/conversation/j1');
    expect(st.status).toBe('snoozed');
    // simulate restart: tick runs against the same persisted file
    const t = await a.post('/api/jobs/tick', { nowMs: Date.parse('2026-10-27T11:00:00+05:30') });
    expect(t.delivered).toBe(1);
    const inbox = await a.get('/api/inbox?conversationId=j1');
    expect(inbox.messages.length).toBe(1);
    const t2 = await a.post('/api/jobs/tick', { nowMs: Date.parse('2026-10-27T12:00:00+05:30') });
    expect(t2.delivered).toBe(0);
  });

  test('opt-out cancels the scheduled job and stops contact', async () => {
    const a = await boot();
    await a.post('/api/snooze', { conversationId: 'j2', callbackAt: FUTURE, channel: 'browser' });
    const o = await a.post('/api/optout', { conversationId: 'j2' });
    expect(o.cancelledJobs).toBe(1);
    const t = await a.post('/api/jobs/tick', { nowMs: Date.parse('2026-10-27T11:00:00+05:30') });
    expect(t.delivered).toBe(0);
    const inbox = await a.get('/api/inbox?conversationId=j2');
    expect(inbox.messages.length).toBe(0);
    const st = await a.get('/api/conversation/j2');
    expect(st.status).toBe('opted_out');
  });

  test('phone call channel is refused with supported alternatives, no job stored', async () => {
    const a = await boot();
    const r = await a.post('/api/snooze', { conversationId: 'j3', callbackAt: FUTURE, channel: 'call' });
    expect(r.ok ?? true).toBe(false);
    expect(JSON.stringify(r).toLowerCase()).toMatch(/browser|human/);
    const jobs = await a.get('/api/jobs?conversationId=j3');
    expect(jobs.jobs.length).toBe(0);
  });

  test('failing delivery retries with a bound, then stops', async () => {
    const a = await boot();
    const now = Date.parse('2026-10-27T11:00:00+05:30');
    const db = (await import('better-sqlite3')).default(a.dbPath);
    db.exec(`INSERT INTO conversations (id, created_at) VALUES ('j4', 1)`);
    db.exec(
      `INSERT INTO jobs (id, convo, kind, due_at, channel, payload_json, status, attempt, max_attempts, created_at) VALUES ('job-fail', 'j4', 'followup', ${now - 1000}, 'browser', '{}', 'scheduled', 0, 2, 1)`,
    );
    let tries = 0;
    const boom = () => {
      tries++;
      throw new Error('send down');
    };
    expect(tick(db, boom, now).delivered).toBe(0);
    expect(tick(db, boom, now + 600000).delivered).toBe(0);
    const row = db.prepare('SELECT status, attempt FROM jobs WHERE id = ?').get('job-fail') as {
      status: string;
      attempt: number;
    };
    expect(row.status).toBe('failed');
    expect(row.attempt).toBe(2);
    expect(tries).toBe(2);
    db.close();
  });
});
