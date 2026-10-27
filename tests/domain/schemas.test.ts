import { describe, expect, test } from 'vitest';
import { ModelPatchSchema, ProposalSchema } from '../../packages/domain/src/schemas.js';

describe('model output guards', () => {
  test('patch with unknown tool is rejected', () => {
    const r = ModelPatchSchema.safeParse({
      intent: 'book',
      additions: [],
      suggestedTool: 'send_email',
    });
    expect(r.success).toBe(false);
  });

  test('proposal without constraints revision is rejected', () => {
    const r = ProposalSchema.safeParse({
      proposalId: 'p1',
      serviceStartMin: 630,
      bayId: 'bay-1',
      holdExpiresAt: '2026-10-31T05:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  test('valid patch and proposal pass', () => {
    expect(
      ModelPatchSchema.safeParse({
        intent: 'change date',
        additions: [{ field: 'serviceDate', value: '2026-10-31' }],
        suggestedTool: 'propose_booking',
      }).success,
    ).toBe(true);
  });
});
