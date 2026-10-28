import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';
import { cannedSocial, hasBookingSignal, safeSocialReply, socialIntent } from '../../apps/api/src/converse.js';

const REF = '2026-10-26T09:00:00+05:30';
const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function boot() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-conv-')), 'api.db');
  const srv = createServer({ dbPath, workshopDate: '2026-10-31', timezone: 'Asia/Kolkata' });
  const port = await srv.listen(0);
  servers.push(srv);
  const post = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json() as Promise<any>);
  return { post };
}

describe('social conversation layer (rules-demo canned replies)', () => {
  test('hi gets a welcome, not a clarification loop, and books nothing', async () => {
    const { post } = await boot();
    const res = await post('/api/turns', { conversationId: 's1', text: 'hi', nowIso: REF });
    expect(res.question).toContain('welcome to ServiceLoop');
    expect(res.question).not.toContain('Before I check availability');
    expect(res.interpreter).toBe('rules-demo');
    expect(res.booking ?? null).toBe(null);
    expect(res.candidates ?? []).toHaveLength(0);
  });

  test('off-topic on a fresh conversation gets a one-line redirect, no entertainment', async () => {
    const { post } = await boot();
    const res = await post('/api/turns', { conversationId: 's2', text: 'tell me a joke about cats', nowIso: REF });
    expect(res.question).toContain('only handle car service bookings');
    expect(res.booking ?? null).toBe(null);
    expect(res.candidates ?? []).toHaveLength(0);
  });

  test('greeting mid-booking preserves state and does not re-ask confirmed fields', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 's3',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.candidates?.length).toBeGreaterThan(0);
    const hi = await post('/api/turns', { conversationId: 's3', text: 'hello', nowIso: REF });
    expect(hi.question).toContain('welcome to ServiceLoop');
    expect(hi.question).not.toContain('Before I check availability');
    // No booking state changed, and the flow still completes afterwards.
    expect(hi.ledgerRev).toBe(t.ledgerRev);
    const again = await post('/api/turns', { conversationId: 's3', text: 'service Saturday morning with pickup at 10', nowIso: REF });
    expect((again.candidates ?? []).length).toBeGreaterThan(0);
  });

  test('help and thanks are answered socially', async () => {
    const { post } = await boot();
    const help = await post('/api/turns', { conversationId: 's4', text: 'help', nowIso: REF });
    expect(help.question).toContain('book a car service');
    const thx = await post('/api/turns', { conversationId: 's4', text: 'thanks', nowIso: REF });
    expect(thx.question).toContain("You're welcome");
  });

  test('booking-shaped greetings still go to the booking flow', () => {
    expect(socialIntent('hi')).toBe('greeting');
    expect(socialIntent('hi, I need a service Saturday')).toBe(null);
    expect(socialIntent('thanks, please cancel my pickup')).toBe(null);
    expect(socialIntent('what can you do')).toBe('help');
  });

  test('booking signal detection separates nonsense from booking fragments', () => {
    expect(hasBookingSignal('who won the football match yesterday')).toBe(false);
    expect(hasBookingSignal('tell me a joke about cats')).toBe(false);
    expect(hasBookingSignal('service before 10 with pickup')).toBe(true);
    expect(hasBookingSignal('morning')).toBe(true);
    expect(hasBookingSignal('my car is making a noise')).toBe(true);
  });

  test('model social output with booking claims or prices falls back to canned', () => {
    const fb = cannedSocial('greeting', []);
    expect(safeSocialReply('You are booked in for Saturday!', fb)).toBe(fb);
    expect(safeSocialReply('That will be £120 please', fb)).toBe(fb);
    expect(safeSocialReply('Hi, welcome to ServiceLoop.', fb)).toBe('Hi, welcome to ServiceLoop.');
  });
});
