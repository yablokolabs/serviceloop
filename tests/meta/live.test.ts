// Genuine model-backed tests: real Meta direct calls, synthetic inputs only.
// Costs a few small chat calls plus one short transcription.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { chat, transcribe } from '../../packages/meta/src/client.js';
import { parseModelOutput } from '../../apps/api/src/modelInterpret.js';

describe('spark interpretation', () => {
  test('automotive context survives: no taxi language, pickup kept', async () => {
    const r = await chat(
      'muse-spark-1.3',
      [
        {
          role: 'system',
          content:
            'You interpret car-workshop booking messages (automotive maintenance: service bay, pickup driver). Never taxi or transport. Reply in one short paragraph.',
        },
        { role: 'user', content: 'Customer wants car service Saturday before 10 AM, with pickup. List known constraints and missing information.' },
      ],
      { maxTokens: 300 },
    );
    expect(r.finishReason).toBe('stop');
    const low = r.text.toLowerCase();
    expect(low).toMatch(/pickup/);
    expect(low).not.toMatch(/taxi|airport transfer|ride-share|rideshare|passenger/);
  }, 60000);
});

describe('wonder ambiguity routing', () => {
  test('bare "before ten" gets a clarifying question, not an invented slot', async () => {
    const r = await chat(
      'muse-wonder-1.0',
      [
        {
          role: 'system',
          content:
            'Reference: Monday 2026-10-26 09:00 Asia/Kolkata. A customer says "service before ten with pickup" without naming pickup, arrival, or service start. Ask exactly what the cutoff applies to. Do not invent a time.',
        },
        { role: 'user', content: 'service before ten with pickup' },
      ],
      { maxTokens: 300 },
    );
    expect(r.text).toContain('?');
    expect(r.text.toLowerCase()).not.toMatch(/booked|confirmed|see you at/);
  }, 60000);
});

describe('voice transcribe wiring', () => {
  test('synthetic pickup clip transcribes with semantic content', async () => {
    const wav = readFileSync('fixtures/audio/pickup-wednesday.wav');
    const r = await transcribe(wav);
    const low = r.text.toLowerCase();
    expect(low).toMatch(/pickup/);
    expect(low).toMatch(/wednesday/);
    expect(low).toMatch(/eight thirty|8\.30|8:30/);
  }, 60000);
});

describe('malformed model output handling (pure, no inference)', () => {
  test('garbage text parses to null so the server asks instead of booking', () => {
    expect(parseModelOutput('Sure thing! All set, see you Saturday!')).toBe(null);
    expect(parseModelOutput('{"intent": "x"}')).toBe(null);
  });

  test('unknown tool name fails closed', () => {
    expect(
      parseModelOutput('{"intent": "book", "suggestedTool": "send_email", "additions": []}'),
    ).toBe(null);
  });

  test('invented unresolved fields are dropped, known ones kept', () => {
    const p = parseModelOutput(
      '{"intent": "book", "suggestedTool": "list_slots", "additions": [], "unresolvedFields": ["2pm", "serviceDate", "free-text"]}',
    );
    expect(p?.unresolvedFields).toEqual(['serviceDate']);
  });
});
