// Constraint ledger: every utterance is a proposed patch, history is append-only.
// Statuses: proposed, confirmed, superseded, revoked. Corrections add revisions.

export type ConstraintStatus = 'proposed' | 'confirmed' | 'superseded' | 'revoked';

export interface ConstraintRecord {
  id: string;
  field: string;
  value: unknown;
  scope: 'booking' | 'session' | 'contact';
  status: ConstraintStatus;
  supersedesId?: string;
  turnId: string;
  excerpt: string;
  revision: number;
  recordedAt: string;
}

export interface ConstraintState {
  revision: number;
  records: ConstraintRecord[];
}

export interface Patch {
  turnId: string;
  excerpt: string;
  additions?: { field: string; value: unknown; scope: ConstraintRecord['scope'] }[];
  supersessions?: string[];
  revocations?: string[];
}

function latestActive(records: ConstraintRecord[], field: string): ConstraintRecord | undefined {
  const act = records.filter((r) => r.field === field && (r.status === 'proposed' || r.status === 'confirmed'));
  return act[act.length - 1];
}

export function applyPatch(state: ConstraintState, patch: Patch): ConstraintState {
  const additions = patch.additions ?? [];
  const supersessions = patch.supersessions ?? [];
  const revocations = patch.revocations ?? [];
  if (additions.length === 0 && supersessions.length === 0 && revocations.length === 0) return state;

  const revision = state.revision + 1;
  const records = state.records.map((r) => ({ ...r }));
  const byId = new Map(records.map((r) => [r.id, r]));

  for (const field of revocations) {
    const cur = latestActive(records, field);
    if (cur) {
      const rec = byId.get(cur.id)!;
      rec.status = 'revoked';
      rec.revision = revision;
    }
  }
  for (const field of supersessions) {
    const cur = latestActive(records, field);
    if (cur) {
      const rec = byId.get(cur.id)!;
      rec.status = 'superseded';
      rec.revision = revision;
    }
  }
  for (const a of additions) {
    const prior = records.filter((r) => r.field === a.field && r.status === 'superseded').pop()
      ?? latestActive(records, a.field);
    // A new value for an active field supersedes it; history stays linked.
    const live = latestActive(records, a.field);
    if (live) {
      const rec = byId.get(live.id)!;
      rec.status = 'superseded';
      rec.revision = revision;
    }
    const rec: ConstraintRecord = {
      id: `${patch.turnId}-${a.field}-r${revision}`,
      field: a.field,
      value: a.value,
      scope: a.scope,
      status: 'proposed',
      turnId: patch.turnId,
      excerpt: patch.excerpt,
      revision,
      recordedAt: new Date().toISOString(),
    };
    if (prior && (prior.status === 'superseded' || prior.status === 'proposed' || prior.status === 'confirmed')) {
      if (supersessions.includes(a.field) || prior.status !== 'proposed') rec.supersedesId = prior.id;
    }
    records.push(rec);
  }
  return { revision, records };
}
