// Social conversation layer. Greetings, thanks, help and farewells get a
// natural reply; everything else stays on the deterministic booking flow.
// The model only speaks here — it never books, prices, or offers anything.
import { chat } from '../../../packages/meta/src/client.js';

export type SocialIntent = 'greeting' | 'thanks' | 'help' | 'farewell';

// Any booking signal in the message means it is not small talk.
const BOOKING_SIGNAL =
  /\b(car|service|repair|maintenance|servicing|workshop|brake|oil|tyre|tire|pickup|book|slot|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|before|after|cancel|discount|price|cost)\b|\d/i;

export function hasBookingSignal(text: string): boolean {
  return BOOKING_SIGNAL.test(text.toLowerCase());
}

export function socialIntent(text: string): SocialIntent | null {
  const t = text.toLowerCase().trim();
  if (t.length > 80 || BOOKING_SIGNAL.test(t)) return null;
  if (/^(hi+|hello|hey|namaste|good (morning|afternoon|evening))\b/.test(t)) return 'greeting';
  if (/^(thanks|thank you|thankyou|thx)\b/.test(t)) return 'thanks';
  if (/^(bye|goodbye|see you|that'?s all)\b/.test(t)) return 'farewell';
  if (/\b(help|what can you do|how does this work|who are you|what is this)\b/.test(t)) return 'help';
  return null;
}

export function cannedSocial(intent: SocialIntent, known: string[]): string {
  const soFar = known.length > 0 ? ` So far I have: ${known.join(', ')}.` : '';
  switch (intent) {
    case 'greeting':
      return `Hi, welcome to ServiceLoop. I can book a car service, arrange pickup, or help with an existing booking.${soFar} Tell me a day and whether you need pickup to start.`;
    case 'thanks':
      return `You're welcome.${soFar} Anything else on your service booking?`;
    case 'help':
      return `I can book a car service at this workshop, arrange a pickup, check slots, and help with an existing booking.${soFar} Tell me a day and whether you need pickup to start.`;
    case 'farewell':
      return `Goodbye.${soFar} Message anytime to continue.`;
  }
}

// Model output is only trusted after this check: no booking claims, no
// prices, no discounts, bounded length. Anything else falls back to canned.
export function safeSocialReply(text: string, fallback: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 300) return fallback;
  if (/booked|confirmed|£|\$|discount|% off|\bfree\b/i.test(t)) return fallback;
  return t;
}

const SOCIAL_SYSTEM = `You are the ServiceLoop front desk for an automotive workshop: car service bookings and pickup arrangement. Never taxis or travel.
Reply in at most two short sentences, warm and plain. Use only the facts given to you.
Never say anything is booked or confirmed. Never invent slots, prices, discounts, or policies.
Anything outside car-service booking: decline in one line and redirect to booking a service.`;

export async function socialReply(
  intent: SocialIntent,
  known: string[],
  useModel: boolean,
): Promise<{ text: string; modelUsed: boolean }> {
  const fallback = cannedSocial(intent, known);
  if (!useModel) return { text: fallback, modelUsed: false };
  try {
    const r = await chat(
      'muse-spark-1.3-contributor',
      [
        { role: 'system', content: SOCIAL_SYSTEM },
        {
          role: 'user',
          content: `Intent: ${intent}. Confirmed facts so far: ${known.length ? known.join(', ') : 'none'}. Write the reply.`,
        },
      ],
      { maxTokens: 120 },
    );
    return { text: safeSocialReply(r.text, fallback), modelUsed: true };
  } catch {
    return { text: fallback, modelUsed: false };
  }
}

export const OFF_TOPIC_REPLY =
  "I can't help with that — I only handle car service bookings at this workshop. Tell me a day and whether you need pickup, and I'll check available slots.";
