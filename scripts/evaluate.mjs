// Frozen evaluation runner. Rules-demo mode: deterministic, no model calls.
// Compares full ledger agent vs stateless last-turn baseline on the same inputs.
// Writes new evidence files; never touches evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createServer } = await import('../dist/apps/api/src/server.js');
const { extractTurn } = await import('../dist/apps/api/src/extract.js');

const set = process.argv[2] ?? 'dev';
const cases = JSON.parse(readFileSync(join(root, `fixtures/eval-${set}.json`), 'utf8'));

async function bootCase() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-eval-')), 'eval.db');
  const srv = createServer({ dbPath, workshopDate: '2026-10-31', timezone: 'Asia/Kolkata', testMode: true });
  const port = await srv.listen(0);
  const post = (path, body) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const get = (path) => fetch(`http://127.0.0.1:${port}${path}`).then((r) => r.json());
  return { srv, post, get };
}

let fieldTp = 0, fieldFp = 0, fieldFn = 0;
let baseTp = 0, baseFp = 0, baseFn = 0;
let candOk = 0, bookOk = 0, statusOk = 0, inboxOk = 0, bookingViolations = 0;
const failures = [];

const WINDOW_BOUNDS = { morning: [0, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 24 * 60] };
const hhmmToMin = (v) => {
  if (typeof v !== 'string') return undefined;
  const m = v.match(/^(\d{1,2}):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
// The booked terms themselves (the candidate that was confirmed) must
// satisfy the expected confirmed constraints — not just the ledger that
// produced them. A correct ledger with a wrong booked slot is a violation.
function bookedTermsViolation(cand, exp) {
  if (!cand) return 'no booked candidate captured';
  if (exp.serviceDate !== undefined && cand.date !== exp.serviceDate) return `booked date ${cand.date} != ${exp.serviceDate}`;
  if (exp.pickupRequired === true) {
    if (cand.pickupMin === undefined) return 'booked without the confirmed pickup';
    const wantPickup = hhmmToMin(exp.pickupTime);
    if (wantPickup !== undefined && cand.pickupMin !== wantPickup) return `booked pickup ${cand.pickupMin} != ${wantPickup}`;
  }
  if (exp.pickupRequired === false && cand.pickupMin !== undefined) return 'booked with a pickup the customer declined';
  const bounds = WINDOW_BOUNDS[exp.serviceWindow];
  if (bounds && (cand.serviceStartMin < bounds[0] || cand.serviceStartMin >= bounds[1]))
    return `booked start ${cand.serviceStartMin} outside ${exp.serviceWindow}`;
  const beforeMin = hhmmToMin(typeof exp.serviceStartBefore === 'string' && exp.serviceStartBefore.length <= 2 ? `${exp.serviceStartBefore}:00` : exp.serviceStartBefore);
  if (beforeMin !== undefined && cand.serviceStartMin >= beforeMin) return `booked start ${cand.serviceStartMin} not before ${beforeMin}`;
  return null;
}

for (const c of cases) {
  // Fresh server and database per case: no cross-case contamination
  // (e.g. close-bay or bookings leaking into later cases).
  const { srv: caseSrv, post, get } = await bootCase();
  const convo = `${set}-${c.id}`;
  let last = null;
  let bookedCandidate = null;
  for (const text of c.turns) last = await post('/api/turns', { conversationId: convo, text, nowIso: c.now });
  let booked = false, status = undefined, inbox = 0;
  let termsBooked = false;
  if (c.then === 'propose-confirm' && last?.candidates?.length) {
    const p = await post('/api/proposals', { conversationId: convo, candidateId: last.candidates[0].id });
    bookedCandidate = p.candidate ?? null;
    const cf = await post('/api/confirm', { proposalId: p.proposalId, approvalToken: p.approvalToken, idempotencyKey: `eval-${convo}` });
    booked = cf.ok === true;
    termsBooked = booked;
    const st = await get(`/api/conversation/${convo}`);
    status = st.status;
  } else if (c.then === 'propose-confirm-cancel' && last?.candidates?.length) {
    const p = await post('/api/proposals', { conversationId: convo, candidateId: last.candidates[0].id });
    bookedCandidate = p.candidate ?? null;
    const cf = await post('/api/confirm', { proposalId: p.proposalId, approvalToken: p.approvalToken, idempotencyKey: `eval-${convo}` });
    if (cf.ok) {
      termsBooked = true;
      await post('/api/cancel', { bookingId: cf.bookingId, cancelToken: cf.cancelToken });
    }
  } else if (c.then === 'propose-stale-confirm' && last?.candidates?.length) {
    const p = await post('/api/proposals', { conversationId: convo, candidateId: last.candidates[0].id });
    await post('/api/turns', { conversationId: convo, text: 'change service to Sunday morning', nowIso: c.now });
    const cf = await post('/api/confirm', { proposalId: p.proposalId, approvalToken: p.approvalToken, idempotencyKey: `eval-${convo}` });
    booked = cf.ok === true;
  } else if (c.then === 'snooze-optout') {
    await post('/api/snooze', { conversationId: convo, callbackAt: '2026-10-27T10:00:00+05:30', channel: 'browser' });
    await post('/api/optout', { conversationId: convo });
  } else if (c.then === 'optout') {
    await post('/api/optout', { conversationId: convo });
  } else if (c.then === 'snooze-tick') {
    await post('/api/snooze', { conversationId: convo, callbackAt: '2026-10-27T10:00:00+05:30', channel: 'browser' });
    await post('/api/jobs/tick', { nowMs: Date.parse('2026-10-27T11:00:00+05:30') });
    inbox = (await get(`/api/inbox?conversationId=${convo}`)).messages.length;
  } else if (c.then === 'yes-books') {
    // 'yes' with no proposal must not book; then counts as booked=false check
    const y = await post('/api/turns', { conversationId: convo, text: 'yes', nowIso: c.now });
    booked = y.booking !== undefined;
  } else if (c.then === 'close-bay') {
    await post('/api/workshop/close-bay', {});
    last = await post('/api/turns', { conversationId: convo, text: 'service Saturday morning with pickup at 10', nowIso: c.now });
  }

  const st = await get(`/api/conversation/${convo}`);
  const active = st.active ?? {};
  const exp = c.expect.active ?? {};
  for (const [k, v] of Object.entries(exp)) {
    if (active[k] === v) fieldTp++;
    else { fieldFn++; failures.push(`${c.id}: active.${k} expected ${JSON.stringify(v)} got ${JSON.stringify(active[k])}`); }
  }
  for (const [k, v] of Object.entries(active)) {
    if (!(k in exp)) { fieldFp++; failures.push(`${c.id}: extra active.${k}=${JSON.stringify(v)}`); }
  }
  // Stateless baseline: last turn extraction only.
  const patch = extractTurn(c.turns[c.turns.length - 1] ?? '', c.now, c.tz);
  const baseActive = Object.fromEntries(patch.additions.map((a) => [a.field, a.value]));
  for (const [k, v] of Object.entries(exp)) {
    if (baseActive[k] === v) baseTp++;
    else baseFn++;
  }
  for (const k of Object.keys(baseActive)) if (!(k in exp)) baseFp++;

  const gotCands = (last?.candidates?.length ?? 0) > 0 ? 'some' : 'none';
  if (c.expect.candidates === 'either' || c.expect.candidates === gotCands) candOk++;
  else failures.push(`${c.id}: candidates expected ${c.expect.candidates} got ${gotCands}`);
  if ((c.expect.booked ?? false) === booked) bookOk++;
  else failures.push(`${c.id}: booked expected ${c.expect.booked ?? false} got ${booked}`);
  if (booked && Object.keys(exp).length && !Object.entries(exp).every(([k, v]) => active[k] === v)) {
    bookingViolations++;
    failures.push(`${c.id}: BOOKING VIOLATES CONFIRMED CONSTRAINTS`);
  }
  if (termsBooked && bookedCandidate) {
    const termsProblem = bookedTermsViolation(bookedCandidate, exp);
    if (termsProblem) {
      bookingViolations++;
      failures.push(`${c.id}: BOOKED TERMS VIOLATE CONSTRAINTS (${termsProblem})`);
    }
  }
  if (c.expect.status === undefined || c.expect.status === st.status) statusOk++;
  else failures.push(`${c.id}: status expected ${c.expect.status} got ${st.status}`);
  if (c.expect.inbox === undefined || c.expect.inbox === inbox) inboxOk++;
  else failures.push(`${c.id}: inbox expected ${c.expect.inbox} got ${inbox}`);
  caseSrv.close();
}

const pr = (tp, fp, fn) => ({ precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn) });
const out = {
  set, cases: cases.length, ledger: pr(fieldTp, fieldFp, fieldFn), baseline: pr(baseTp, baseFp, baseFn),
  candidates: `${candOk}/${cases.length}`, bookings: `${bookOk}/${cases.length}`, status: `${statusOk}/${cases.length}`,
  inbox: `${inboxOk}/${cases.length}`, bookingViolations, failures,
};
mkdirSync(join(root, 'evidence'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join(root, `evidence/eval-${set}-${stamp}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, failures: out.failures.slice(0, 40), failureCount: out.failures.length }, null, 1));
