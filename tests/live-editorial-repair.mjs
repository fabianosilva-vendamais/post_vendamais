import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { reviewGenerated, clarityIssues } from '../engine/editorial-clarity.js';
const cfg = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const base = cfg.match(/window.__VM_SUPABASE_URL__\s*=\s*"([^"]+)"/)[1];
const anon = cfg.match(/window.__VM_SUPABASE_ANON__\s*=\s*"([^"]+)"/)[1];
const dir = '/workspace/scratch/a800e365f35b/editorial-test-results';
const original = JSON.parse(readFileSync(`${dir}/real-post-studio-flow.json`, 'utf8'));
const after = {}, diagnostics = [];
try {
  for (const language of ['pt', 'es']) {
    const result = await reviewGenerated(original[language], { purpose: 'posts.write:jargon-correction', context: 'Preserve o conteúdo. Substitua estrangeirismos dispensáveis por termos imediatamente compreensíveis para empresários e gestores. Sem fatos ou resultados novos.', call: async request => {
      const response = await fetch(`${base}/functions/v1/text-generate`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, provider: 'openai', max_tokens: 10000 }), signal: AbortSignal.timeout(120000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const audit = JSON.parse(data.text); diagnostics.push({ language, checks: audit.checks, issues: audit.issues, headline: audit.revised?.headline }); return audit;
    } });
    assert.equal(result.meta.passed, true); assert.deepEqual(clarityIssues(result.value), []);
    assert.ok(!/pipeline|forecast|follow-up/i.test(result.value.headline));
    assert.deepEqual(result.value.anchors, original[language].anchors);
    after[language] = result;
    console.log(JSON.stringify({ language, before: original[language].headline, after: result.value.headline, revisions: result.meta.revisions }));
  }
  writeFileSync(`${dir}/jargon-correction.json`, JSON.stringify(after, null, 2));
} finally { writeFileSync(`${dir}/jargon-diagnostics.json`, JSON.stringify(diagnostics, null, 2)); }
