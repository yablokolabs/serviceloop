import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const parsed = parse(readFileSync('/home/azureuser/.hermes/.env', 'utf8'));
const key = (parsed.BASETEN_API_KEY ?? '').trim().replace(/^"|"$/g, '');
const img = readFileSync(process.argv[2]).toString('base64');
const q = process.argv[3] ?? 'Describe this image in one sentence.';
const r = await fetch('https://inference.baseten.co/v1/chat/completions', {
  method: 'POST',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'meta-models/muse-spark-open-1026',
    reasoning_effort: 'minimal',
    max_completion_tokens: 900,
    messages: [{ role: 'user', content: [
      { type: 'text', text: q },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } },
    ] }],
  }),
});
const t = await r.text();
console.log('status', r.status);
const j = JSON.parse(t);
console.log('finish', j.choices?.[0]?.finish_reason, 'usage', JSON.stringify(j.usage));
console.log('answer:', j.choices?.[0]?.message?.content);
if (j.choices?.[0]?.message?.reasoning_content) console.log('(reasoning present, not stored)');
