// Exercises the real Post Studio functions in an isolated in-memory workspace.
// Only text-generate HTTP calls leave this process; no save/sync/publisher is invoked.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/editorial-flow.cjs`);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { fonts: { load: async () => [] }, createElement: tag => { if (tag === 'canvas') return createCanvas(1080, 1350); throw new Error(`Unexpected DOM access: ${tag}`); } };
const { db } = await import('../engine/store.js?vm202611011656');
const flow = await import('../engine/posts-flow.js');
const spanish = await import('../engine/posts-es.js');
const { render } = await import('../engine/social-render.js');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
db.settings.supabase_url = config.match(/window.__VM_SUPABASE_URL__\s*=\s*"([^"]+)"/)[1];
db.settings.supabase_anon_key = config.match(/window.__VM_SUPABASE_ANON__\s*=\s*"([^"]+)"/)[1];
db.settings.functions_base = db.settings.supabase_url + '/functions/v1';
const { PROMPTS } = await import('../engine/prompts.js');
db.prompt_templates = structuredClone(PROMPTS);
const edition = { id: 'isolated-editorial-test', status: 'draft' };
db.editions.push(edition);
db.newsletter_versions.push({ id: 'isolated-newsletter', edition_id: edition.id, n: 1, is_approved: true, content_json: { headline: 'A equipe está ocupada. As negociações continuam paradas', thesis: 'A gestão deve rever as negociações sem próximo passo antes de ampliar a prospecção', intro: 'A agenda da equipe comercial está cheia. Mesmo assim, algumas oportunidades não avançam. A reunião cobra resultados, mas termina sem definir a ação para retomar cada negociação.', sections: [{ title: 'O que examinar antes de buscar mais contatos', body: 'Use as informações do CRM para identificar as oportunidades sem próximo passo. Converse com a equipe para entender o motivo da paralisação. Combine uma ação concreta, um responsável e um prazo para retomar a negociação. Não conclua que falta esforço do vendedor antes de entender a situação.' }], cta: { label: 'Leve essa pergunta à próxima reunião comercial' } } });
const app = { edition: () => edition, evidence: () => [], save() {}, setStatus: (e, status) => { e.status = status; } };
const started = Date.now();
const post = await flow.deriveOne(app, 'consulting');
assert.ok(post.content_json.captions?.instagram?.body);
assert.ok(post.content_json.captions?.linkedin?.body);
assert.notDeepEqual(post.content_json.captions.instagram, post.content_json.captions.linkedin);
assert.equal(post.status, 'draft');
const ptBefore = JSON.stringify(post.content_json);
const es = await spanish.adaptToSpanish(app, post, db.newsletter_versions[0].content_json.thesis);
assert.equal(JSON.stringify(post.content_json), ptBefore);
assert.ok(es.captions?.instagram?.body && es.captions?.linkedin?.body);
assert.notEqual(es.headline, post.content_json.headline);
for (const content of [post.content_json, es]) {
  const meta = render(createCanvas(1080, 1350), { templateId: content.template_id, headline: content.headline, support: content.support_line, kicker: content.kicker, editorialVersion: content.editorial_version });
  assert.equal(meta.textOverflow, false);
}
const dir = process.env.EDITORIAL_TEST_OUTPUT || '/workspace/scratch/a800e365f35b/editorial-test-results';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/real-post-studio-flow.json`, JSON.stringify({ passed: true, elapsed_ms: Date.now() - started, pt: post.content_json, es, audit: db.audit_log.filter(x => x.action === 'ai.text').map(x => ({ action: x.metadata, entity: x.entity })) }, null, 2));
console.log(JSON.stringify({ passed: true, elapsed_ms: Date.now() - started, headline_pt: post.content_json.headline, headline_es: es.headline, channel_copies: 4, production_writes: 0, publication_calls: 0 }));
