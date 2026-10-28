// Quota fallback chain, owner-authorized 2026-10-28: Meta-direct (the
// default) -> Baseten -> Modal. Only quota/auth failures (never invalid
// model output, never other errors) switch a turn, each leg bounded per
// hour. Every fallback answer is labeled with its provider.
import { BASETEN_MODEL, basetenKey } from '../../../packages/meta/src/baseten.js';
import { MODAL_MODEL, modalAuth } from '../../../packages/meta/src/modal.js';

export const FALLBACK_LABEL = `baseten:${BASETEN_MODEL} (meta quota fallback)`;
export const MODAL_FALLBACK_LABEL = `modal:${MODAL_MODEL} (meta+baseten fallback)`;
export const DIRECT_BASETEN_LABEL = `baseten:${BASETEN_MODEL} (direct)`;

// Meta client errors carry the HTTP status (`meta chat 429`). Auth-adjacent
// failures (bad/expired key, missing key) count as quota-class: Meta is
// unusable either way, so the only question is whether Baseten can serve.
export function isQuotaError(e: unknown): boolean {
  const m = String(e);
  return /meta chat (401|402|403|429)\b/.test(m) || m.includes('META_API_KEY missing');
}

// Baseten-side quota/auth failures advance the chain to Modal. Anything
// else from Baseten (including invalid output) ends the chain honestly.
export function isBasetenQuotaError(e: unknown): boolean {
  const m = String(e);
  return /baseten chat (401|402|403|429)\b/.test(m) || m.includes('BASETEN_API_KEY missing');
}

// Sliding one-hour window of consumed fallback slots. Hourly bound, shared
// by every Meta call site in this single-instance API process.
const slots: number[] = [];

export function fallbackLimitPerHour(): number {
  const raw = (process.env.FALLBACK_LIMIT_PER_HOUR ?? '').trim();
  if (raw === '') return 60;
  const n = Number(raw);
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

export function modalAvailable(): boolean {
  try {
    modalAuth();
    return true;
  } catch {
    return false;
  }
}
