// Social conversation layer. Greetings, thanks, help and farewells get a
// natural reply; everything else stays on the deterministic booking flow.
// The model only chooses a reply style here — it never writes reply text,
// and it never books, prices, or offers anything.
import { chat } from '../../../packages/meta/src/client.js';
import { basetenChat } from '../../../packages/meta/src/baseten.js';
import { modalChat } from '../../../packages/meta/src/modal.js';
import { basetenAvailable, consumeFallbackSlot, isBasetenQuotaError, isQuotaError, modalAvailable } from './modelFallback.js';

export type SocialIntent = 'greeting' | 'thanks' | 'help' | 'farewell';

// Any booking signal in the message means it is not small talk.
const BOOKING_SIGNAL =
  /\b(car|service|repair|maintenance|servicing|workshop|brake|oil|tyre|tire|pickup|book|slot|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|before|after|cancel|discount|price|cost)\b|\d/i;

export function hasBookingSignal(text: string): boolean {
  return BOOKING_SIGNAL.test(text.toLowerCase());
}

export function socialIntent(text: string): SocialIntent | null {
  const t = text.toLowerCase().trim();
  if (t.length > 80) return null;
  // Standalone greetings first: "good morning" is a greeting, not a service
  // window. Only a complete greeting counts; a greeting prefix followed by
  // a request ("Hi, please reschedule my appointment") is not social.
  if (/^(hi+|hello|hey|namaste|good (morning|afternoon|evening))( there)?[!. ]*$/.test(t)) return 'greeting';
  if (/^(hi+|hello|hey)[,!. ]+how are you[?!. ]*$/.test(t)) return 'greeting';
  if (BOOKING_SIGNAL.test(t)) return null;
  if (/^(thanks|thank you|thankyou|thx)( a lot| so much)?[!. ]*$/.test(t)) return 'thanks';
  if (/^(bye|goodbye|see you)( soon)?[!. ]*$/.test(t) || /^that'?s all[!. ]*$/.test(t)) return 'farewell';
  if (/^(help|what can you do|how does this work|who are you|what is this)[?!. ]*$/.test(t)) return 'help';
  return null;
}

export type ReplyVariant = 'A' | 'B';

// Every word of a social reply is written here, on the server. The model
// never supplies reply text; in live mode it only picks which of these
// server-written variants fits the tone. Confirmed facts and the
// continuation prompt are composed here too, so a social turn can neither
// invent a claim nor drop the booking state.
const VARIANT_TEXT: Record<SocialIntent, Record<ReplyVariant, string>> = {
  greeting: {
    A: 'Hi, welcome to ServiceLoop. I can book a car service, arrange pickup, or help with an existing booking.',
    B: 'Hello, welcome to ServiceLoop. I can help you book a car service, arrange a pickup, or check an existing booking.',
  },
  thanks: { A: "You're welcome.", B: 'Anytime — happy to help.' },
  help: {
    A: 'I can book a car service at this workshop, arrange a pickup, check slots, and help with an existing booking.',
    B: 'Here is what I can do: book a car service, arrange a pickup, and help with an existing booking.',
  },
  farewell: { A: 'Goodbye.', B: 'See you soon.' },
};

export function renderSocial(intent: SocialIntent, known: string[], variant: ReplyVariant = 'A'): string {
  const base = VARIANT_TEXT[intent][variant];
  const soFar = known.length > 0 ? ` So far I have: ${known.join(', ')}.` : '';
  switch (intent) {
    case 'greeting':
    case 'help':
      return known.length > 0
        ? `${base}${soFar} Just tell me the next detail when you are ready.`
        : `${base} Tell me a day and whether you need pickup to start.`;
    case 'thanks':
      return `${base}${soFar} Anything else on your service booking?`;
    case 'farewell':
      return `${base}${soFar} Message anytime to continue.`;
  }
}

export function cannedSocial(intent: SocialIntent, known: string[]): string {
  return renderSocial(intent, known, 'A');
}

// The model's whole output contract: one JSON choice of variant. Anything
// else — free text, claims, malformed JSON — parses to null and the
// server default ships instead.
export function parseReplyVariant(text: string): ReplyVariant | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = (JSON.parse(m[0]) as { variant?: unknown }).variant;
    return v === 'A' || v === 'B' ? v : null;
  } catch {
    return null;
  }
}

const SOCIAL_SYSTEM = `You choose a reply style for the ServiceLoop front desk (automotive workshop bookings, never taxis or travel).
Variant A is warm and complete. Variant B is short and friendly.
Reply with JSON only: {"variant": "A"} or {"variant": "B"}. No other text.`;

export async function socialReply(
  intent: SocialIntent,
  known: string[],
  useModel: boolean,
): Promise<{ text: string; modelUsed: boolean; provider?: 'meta' | 'baseten' | 'modal' }> {
  const fallback = cannedSocial(intent, known);
  if (!useModel) return { text: fallback, modelUsed: false };
  const messages = [
    { role: 'system', content: SOCIAL_SYSTEM },
    {
      role: 'user',
      content: `Intent: ${intent}. The customer has confirmed facts: ${known.length ? 'yes' : 'no'}. Choose the variant.`,
    },
  ];
  try {
    // The contributor model occasionally returns an empty completion
    // (finish_reason: length, no text). Retry once on empty, at a larger
    // cap; an invalid choice ships the server default without a retry.
    const caps = [300, 600];
    for (let attempt = 0; attempt < caps.length; attempt++) {
      const r = await chat('muse-spark-1.3-contributor', messages, { maxTokens: caps[attempt] });
      if (!r.text.trim()) continue;
      const variant = parseReplyVariant(r.text);
      if (!variant) return { text: fallback, modelUsed: false };
      return { text: renderSocial(intent, known, variant), modelUsed: true, provider: 'meta' };
    }
    return { text: fallback, modelUsed: false };
  } catch (e) {
    // Variant-choice fallback chain: Baseten, then Modal, one hourly slot
    // per provider attempt. Each leg runs only on a quota/auth failure of
    // the previous leg; anything else ships canned text.
    if (!isQuotaError(e)) return { text: fallback, modelUsed: false };
    if (basetenAvailable() && consumeFallbackSlot()) {
      try {
        const r = await basetenChat(messages, { maxTokens: 300 });
        const variant = parseReplyVariant(r.text);
        if (variant) return { text: renderSocial(intent, known, variant), modelUsed: true, provider: 'baseten' };
        return { text: fallback, modelUsed: false };
      } catch (e2) {
        if (!isBasetenQuotaError(e2) || !modalAvailable() || !consumeFallbackSlot()) {
          return { text: fallback, modelUsed: false };
        }
        try {
          const r = await modalChat(messages, { maxTokens: 1000 });
          const variant = parseReplyVariant(r.text);
          if (variant) return { text: renderSocial(intent, known, variant), modelUsed: true, provider: 'modal' };
        } catch {
          // Modal failed too: fall through to canned text below.
        }
        return { text: fallback, modelUsed: false };
      }
    }
    if (modalAvailable() && consumeFallbackSlot()) {
      try {
        const r = await modalChat(messages, { maxTokens: 1000 });
        const variant = parseReplyVariant(r.text);
        if (variant) return { text: renderSocial(intent, known, variant), modelUsed: true, provider: 'modal' };
      } catch {
        // Modal failed too: fall through to canned text below.
      }
    }
    return { text: fallback, modelUsed: false };
  }
}

export const OFF_TOPIC_REPLY =
  "I can't help with that — I only handle car service bookings at this workshop. Tell me a day and whether you need pickup, and I'll check available slots.";
