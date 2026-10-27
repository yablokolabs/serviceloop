// Deterministic workshop offer rules. Synthetic policy for the demo workshop,
// labeled as such. The model can never create or override an offer: there is
// no creation route, and quotes evaluate only seeded rows.
import type Database from 'better-sqlite3';

export const SERVICE_PRICES: Record<string, number> = { basic: 149, full: 499 };

export interface OfferRow {
  code: string;
  pct: number;
  cap_gbp: number;
  service: string;
  valid_from: number;
  valid_to: number;
  needs_approval: number;
}

export function seedOffers(raw: Database.Database): void {
  raw.exec(`CREATE TABLE IF NOT EXISTS offers (
    code TEXT PRIMARY KEY, pct REAL NOT NULL, cap_gbp INTEGER NOT NULL,
    service TEXT NOT NULL, valid_from INTEGER NOT NULL, valid_to INTEGER NOT NULL,
    needs_approval INTEGER NOT NULL DEFAULT 0)`);
  // Legacy INR databases: add the GBP cap column scaled 10:1.
  const offerCols = (raw.prepare('PRAGMA table_info(offers)').all() as { name: string }[]).map((c) => c.name);
  if (!offerCols.includes('cap_gbp')) {
    raw.exec('ALTER TABLE offers ADD COLUMN cap_gbp INTEGER NOT NULL DEFAULT 0');
    raw.exec('UPDATE offers SET cap_gbp = CAST(cap_inr / 10 AS INTEGER) WHERE cap_gbp = 0');
  }
  raw.exec(`CREATE TABLE IF NOT EXISTS offer_approvals (
    convo TEXT NOT NULL, code TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY (convo, code))`);
  const seed: OfferRow[] = [
    { code: 'WELCOME10', pct: 10, cap_gbp: 20, service: 'any', valid_from: Date.parse('2026-01-01T00:00:00Z'), valid_to: Date.parse('2026-12-31T23:59:59Z'), needs_approval: 0 },
    { code: 'EXPIRED5', pct: 5, cap_gbp: 10, service: 'any', valid_from: Date.parse('2025-01-01T00:00:00Z'), valid_to: Date.parse('2026-01-01T00:00:00Z'), needs_approval: 0 },
    { code: 'STAFF20', pct: 20, cap_gbp: 50, service: 'basic', valid_from: Date.parse('2026-01-01T00:00:00Z'), valid_to: Date.parse('2026-12-31T23:59:59Z'), needs_approval: 1 },
    { code: 'WINBACK10', pct: 10, cap_gbp: 50, service: 'any', valid_from: Date.parse('2026-01-01T00:00:00Z'), valid_to: Date.parse('2026-12-31T23:59:59Z'), needs_approval: 1 },
  ];
  for (const o of seed) {
    raw
      .prepare(
        'INSERT OR IGNORE INTO offers (code, pct, cap_gbp, service, valid_from, valid_to, needs_approval) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(o.code, o.pct, o.cap_gbp, o.service, o.valid_from, o.valid_to, o.needs_approval);
  }
}

export interface Quote {
  eligible: boolean;
  finalPriceGbp?: number;
  reasons: string[];
  needsStaffApproval?: boolean;
}

export function evaluateOffer(raw: Database.Database, convo: string, code: string, serviceType: string): Quote {
  const offer = raw.prepare('SELECT * FROM offers WHERE code = ?').get(code) as OfferRow | undefined;
  const now = Date.now();
  if (!offer) return { eligible: false, reasons: [`unknown offer code ${code}`] };
  const price = SERVICE_PRICES[serviceType];
  if (price === undefined) return { eligible: false, reasons: [`unknown service ${serviceType}`] };
  if (now < offer.valid_from || now > offer.valid_to) {
    return { eligible: false, reasons: [`offer ${code} is outside its validity window`] };
  }
  if (offer.service !== 'any' && offer.service !== serviceType) {
    return { eligible: false, reasons: [`offer ${code} applies to ${offer.service}, not ${serviceType}`] };
  }
  if (offer.needs_approval) {
    const approved = raw
      .prepare('SELECT 1 FROM offer_approvals WHERE convo = ? AND code = ?')
      .get(convo, code);
    if (!approved) {
      return { eligible: false, reasons: [`offer ${code} requires staff approval`], needsStaffApproval: true };
    }
  }
  const rawDiscount = Math.round((price * offer.pct) / 100);
  const discount = Math.min(rawDiscount, offer.cap_gbp);
  const reasons = [`${offer.pct}% off ${serviceType} (£${price})`];
  if (rawDiscount > offer.cap_gbp) reasons.push(`capped at £${offer.cap_gbp}`);
  return { eligible: true, finalPriceGbp: price - discount, reasons };
}
