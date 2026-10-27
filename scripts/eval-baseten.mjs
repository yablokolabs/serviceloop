// Baseten vs Meta-direct comparison on frozen cases. Explicit backends, no fallback.
// Bounded: concurrency 2, 90 s timeout per call, 120 k token budget, then stop.
// Usage: node scripts/eval-baseten.mjs [maxCases]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { liveInterpret } = await import('../dist/apps/api/src/modelInterpret.js');

const frozen = JSON.parse(readFileSync(join(root, 'fixtures/eval-frozen.json'), 'utf8'));
// Required coverage: late constraints, changed preferences, negation, ambiguous
// dates, opt-out, plus noise and multi-turn.
const IDS = ['F06', 'F26', 'F09', 'F10', 'F11', 'F28', 'F33', 'F15', 'F25', 'F05', 'F22', 'F39'];
const EXTRA = [
  { id: 'X1', text: 'apply WELCOME10 to my basic service Saturday morning', now: '2026-10-26T09:00:00+05:30', tz: 'Asia/Kolkata', want: 'WELCOME10' },
  { id: 'X2', text: 'is STAFF20 still valid for basic service', now: '2026-10-26T09:00:00+05:30', tz: 'Asia/Kolkata', want: 'STAFF20' },
];
const maxCases = Number(process.argv[2] ?? IDS.length);
const selected = frozen.filter((c) => IDS.includes(c.id)).slice(0, maxCases);

const BUDGET = 120000;
const TIMEOUT_MS = 90000;
const CONCURRENCY = 2;
let spent = 0;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function runOne(c, backend) {
  const text = [...c.turns].reverse().find((t) => t.trim().length > 0) ?? '';
  const started = Date.now();
  try {
    const r = await withTimeout(liveInterpret(text, c.now, c.tz, backend), TIMEOUT_MS);
    const got = Object.fromEntries(r.patch.additions.map((a) => [a.field, a.value]));
    let tp = 0, fn = 0;
    for (const [k, v] of Object.entries(c.expect.active ?? {})) {
      if (got[k] === v) tp++;
      else fn++;
    }
    let fp = 0;
    for (const k of Object.keys(got)) if (!(k in (c.expect.active ?? {}))) fp++;
    spent += r.usage?.total ?? 0;
    return { id: c.id, ok: true, tp, fn, fp, latencyMs: Date.now() - started, tokens: r.usage?.total ?? 0, interpreter: r.interpreter, modelError: r.modelError ?? null };
  } catch (e) {
    return { id: c.id, ok: false, error: String(e).slice(0, 120), latencyMs: Date.now() - started, tokens: 0 };
  }
}

async function runExtra(x, backend) {
  try {
    const r = await withTimeout(liveInterpret(x.text, x.now, x.tz, backend), TIMEOUT_MS);
    spent += r.usage?.total ?? 0;
    const blob = JSON.stringify(r.patch);
    return { id: x.id, mentioned: blob.includes(x.want), interpreter: r.interpreter, latencyMs: r.latencyMs ?? 0, tokens: r.usage?.total ?? 0 };
  } catch (e) {
    return { id: x.id, mentioned: false, error: String(e).slice(0, 120) };
  }
}

const results = { meta: [], baseten: [], extraMeta: [], extraBaseten: [] };
const queue = [...selected];
async function worker(backend, store) {
  while (queue.length && spent < BUDGET) {
    const c = queue.shift();
    store.push(await runOne(c, backend));
  }
}
// Sequential per backend to keep ordering deterministic; concurrency inside backend.
for (const backend of ['meta', 'baseten']) {
  queue.length = 0;
  queue.push(...selected);
  const store = backend === 'meta' ? results.meta : results.baseten;
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(backend, store)));
  const exStore = backend === 'meta' ? results.extraMeta : results.extraBaseten;
  for (const x of EXTRA) {
    if (spent >= BUDGET) break;
    exStore.push(await runExtra(x, backend));
  }
}

function summarize(rows) {
  const ok = rows.filter((r) => r.ok);
  const tp = ok.reduce((a, r) => a + (r.tp ?? 0), 0);
  const fn = ok.reduce((a, r) => a + (r.fn ?? 0), 0);
  const fp = ok.reduce((a, r) => a + (r.fp ?? 0), 0);
  const lat = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    cases: rows.length,
    recall: tp / Math.max(1, tp + fn),
    precision: tp / Math.max(1, tp + fp),
    p50ms: lat[Math.floor(lat.length / 2)] ?? 0,
    p95ms: lat[Math.floor(lat.length * 0.95)] ?? 0,
    tokens: ok.reduce((a, r) => a + (r.tokens ?? 0), 0),
    errors: rows.filter((r) => !r.ok).map((r) => `${r.id}:${r.error ?? r.modelError}`),
  };
}

const out = {
  date: new Date().toISOString(),
  budget: BUDGET,
  spent,
  meta: summarize(results.meta),
  baseten: summarize(results.baseten),
  offerMentions: {
    meta: results.extraMeta.map((r) => `${r.id}:${r.mentioned}`),
    baseten: results.extraBaseten.map((r) => `${r.id}:${r.mentioned}`),
  },
  rows: results,
};
mkdirSync(join(root, 'evidence'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join(root, `evidence/eval-baseten-${stamp}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, rows: undefined }, null, 1));
