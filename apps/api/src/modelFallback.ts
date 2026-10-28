// Baseten quota fallback. Meta-direct stays the default and the only
// implicitly used provider; only quota/auth failures (never invalid model
// output, never other errors) switch a turn to the exact Meta-hosted open
// model on Baseten, bounded per hour. Every fallback answer is labeled.
import { BASETEN_MODEL, basetenKey } from '../../../packages/meta/src/baseten.js';

export const FALLBACK_LABEL = `baseten:${BASETEN_MODEL} (meta quota fallback)`;

// Meta client errors carry the HTTP status (`meta chat 429`). Auth-adjacent
// failures (bad/expired key, missing key) count as quota-class: Meta is
// unusable either way, so the only question is whether Baseten can serve.
export function isQuotaError(e: unknown): boolean {
  const m = String(e);
  return /meta chat (401|402|403|429)\b/.test(m) || m.includes('META_API_KEY missing');
}

// Sliding one-hour window of consumed fallback slots. Hourly bound, shared
// by every Meta call site in this single-instance API process.
const slots: number[] = [];

export function fallbackLimitPerHour(): number {
  const n = Number(process.env.FALLBACK_LIMIT_PER_HOUR ?? 60);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 60;
}

export function fallbackSlotsLeft(): number {
  const now = Date.now();
  while (slots.length > 0 && now - slots[0] > 3_600_000) slots.shift();
  return Math.max(0, fallbackLimitPerHour() - slots.length);
}

export function consumeFallbackSlot(): boolean {
  if (fallbackSlotsLeft() <= 0) return false;
  slots.push(Date.now());
  return true;
}

export function basetenAvailable(): boolean {
  try {
    basetenKey();
    return true;
  } catch {
    return false;
  }
}
