// Held-out single-turn extraction benchmark. Meta-direct vs Baseten
// (meta-models/muse-spark-open-1026 only). Cases live in
// fixtures/eval-heldout.json and never enter dev/frozen sets.
// Bounded: concurrency 2, 90 s timeout, 120 k token budget.
// Usage: node scripts/eval-heldout.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { liveInterpret } = await import('../dist/apps/api/src/modelInterpret.js');
const cases = JSON.parse(readFileSync(join(root, 'fixtures/eval-heldout.json'), 'utf8'));

const BUDGET = 120000;
const TIMEOUT_MS = 90000;
let spent = 0;

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function runOne(c, backend) {
  const started = Date.now();
  try {
    const r = await withTimeout(liveInterpret(c.turns[0], c.now, c.tz, backend), TIMEOUT_MS);
    const got = Object.fromEntries(r.patch.additions.map((a) => [a.field, a.value]));
    let tp = 0, fn = 0, fp = 0;
    for (const [k, v] of Object.entries(c.expect.active ?? {})) {
      if (got[k] === v) tp++;
      else fn++;
    }
    for (const k of Object.keys(got)) if (!(k in (c.expect.active ?? {}))) fp++;
    spent += r.usage?.total ?? 0;
    return { id: c.id, ok: true, tp, fn, fp, latencyMs: Date.now() - started, tokens: r.usage?.total ?? 0, interpreter: r.interpreter };
  } catch (e) {
    return { id: c.id, ok: false, error: String(e).slice(0, 120), latencyMs: Date.now() - started, tokens: 0 };
  }
}

async function runBackend(backend) {
  const rows = [];
  for (let i = 0; i < cases.length; i += 2) {
    if (spent > BUDGET) break;
    rows.push(...(await Promise.all(cases.slice(i, i + 2).map((c) => runOne(c, backend)))));
  }
  const tp = rows.reduce((s, r) => s + (r.tp ?? 0), 0);
  const fn = rows.reduce((s, r) => s + (r.fn ?? 0), 0);
  const fp = rows.reduce((s, r) => s + (r.fp ?? 0), 0);
  const lat = rows.filter((r) => r.ok).map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    backend,
    cases: rows.length,
    errors: rows.filter((r) => !r.ok).length,
    precision: tp + fp ? +(tp / (tp + fp)).toFixed(3) : 0,
    recall: tp + fn ? +(tp / (tp + fn)).toFixed(3) : 0,
    f1: 2 * tp + fp + fn ? +((2 * tp) / (2 * tp + fp + fn)).toFixed(3) : 0,
    tokens: rows.reduce((s, r) => s + (r.tokens ?? 0), 0),
    latencyP50: lat.length ? lat[Math.floor(lat.length / 2)] : null,
    misses: rows.filter((r) => (r.fn ?? 0) > 0 || (r.fp ?? 0) > 0 || !r.ok).map((r) => r.id),
  };
}

const results = [];
for (const b of ['meta', 'baseten']) results.push(await runBackend(b));
const out = { at: new Date().toISOString(), cases: cases.length, totalTokens: spent, results };
const path = join(root, `evidence/eval-heldout-${out.at.replace(/[:.]/g, '-')}.json`);
writeFileSync(path, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
console.log('wrote', path);
