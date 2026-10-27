import { z } from 'zod';

// Runtime validation for model output. Only these tools exist server-side;
// anything else is rejected before it touches state.
export const TOOL_NAMES = [
  'list_slots',
  'describe_service',
  'propose_booking',
  'request_confirmation',
  'confirm_booking',
  'cancel_booking',
  'snooze',
  'handoff',
] as const;

export const ModelPatchSchema = z.object({
  intent: z.string().min(1),
  additions: z.array(z.object({ field: z.string().min(1), value: z.unknown() })).default([]),
  supersessions: z.array(z.string()).default([]),
  revocations: z.array(z.string()).default([]),
  unresolvedFields: z.array(z.string()).default([]),
  userVisibleQuestion: z.string().optional(),
  suggestedTool: z.enum(TOOL_NAMES),
});

export const ProposalSchema = z.object({
  proposalId: z.string().min(1),
  customerRef: z.string().min(1),
  serviceStartMin: z.number().int().min(0),
  pickupMin: z.number().int().min(0).optional(),
  bayId: z.string().min(1),
  driverId: z.string().optional(),
  constraintsRev: z.number().int().min(0),
  approvalToken: z.string().min(1),
  holdExpiresAt: z.string().datetime(),
});
