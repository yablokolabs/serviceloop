// Vision timestamp pass: ask Baseten Spark Open what demo state each frame shows.
// Bounded: one 640px frame per call, concurrency 2, JSON answer.
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const parsed = parse(readFileSync('/home/azureuser/.hermes/.env', 'utf8'));
const key = (parsed.BASETEN_API_KEY ?? '').trim().replace(/^"|"$/g, '');
const Q = `Visible chat states, reply JSON only: {"states":[<labels>]}. Labels from: msg1-vague, clarification-q, msg2-cutoff, ambiguity-q, msg3-full, slots-shown, held-shown, approve-panel, booked-msg, receipt. Include a label only if visible.`;
async function ask(path) {
  const img = readFileSync(path).toString('base64');
  const r = await fetch('https://inference.baseten.co/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'meta-models/muse-spark-open-1026', reasoning_effort: 'minimal',
      max_completion_tokens: 900,
      messages: [{ role: 'user', content: [{ type: 'text', text: Q },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }] }] }),
  });
  const j = await r.json();
  return { finish: j.choices?.[0]?.finish_reason, tokens: j.usage?.total_tokens,
    text: j.choices?.[0]?.message?.content };
}
const files = process.argv.slice(2);
let total = 0;
for (let i = 0; i < files.length; i += 2) {
  const batch = files.slice(i, i + 2);
  const res = await Promise.all(batch.map((f) => ask(f).catch((e) => ({ error: String(e) }))));
  batch.forEach((f, k) => { total += res[k].tokens ?? 0; console.log(f, JSON.stringify(res[k])); });
}
console.log('total_tokens', total);
