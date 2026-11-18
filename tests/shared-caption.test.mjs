import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { fonts: { load: async () => { throw new Error('Finished art must not load template fonts'); } } };
const { db } = await import('../engine/store.js?vm202611011656');
const flow = await import('../engine/posts-flow.js');
const ES = await import('../engine/posts-es.js');
const SB = await import('../engine/supabase.js?vm202611011656');
const originalFetch = globalThis.fetch;
function fixture() {
  db.posts = []; db.publications = []; db.generated_images = []; db.brand_assets = []; db.editions = []; db.sources = []; db.analyses = []; db.newsletter_versions = []; db.renders = []; db.prompt_templates = []; db.audit_log = [];
  db.settings.supabase_url = 'https://isolated.invalid'; db.settings.supabase_anon_key = 'test'; db.settings.functions_base = 'https://isolated.invalid/functions/v1';
  db.session = { access_token: 'test', expires_at: Date.now() + 3600000 }; db.user = null;
  const caption = { hook: '', body: 'Revise as propostas abertas com a equipe.\n\nConverse com a VendaMais.', practical_takeaway: '', cta: '', hashtags: [] };
  const p = { id: 'post-shared-test', status: 'draft', angle: 'training', content_json: { headline: 'As propostas continuam paradas', caption, editorial_version: '2026-11-17.1' }, meta: { artwork_mode: 'final', final_artworks: { pt: { image_id: 'art-pt' }, es: { image_id: 'art-es' } } } };
  db.posts.push(p); return { p, app: { save() {} } };
}
function aiResult() { return { headline: 'Las propuestas siguen estancadas', caption: { hook: 'Do not add this', body: 'Revisa las propuestas abiertas con el equipo.\n\nHabla con VendaMais.', practical_takeaway: 'Do not add this', cta: 'Do not add this', hashtags: ['Unrequested'] }, captions: { instagram: { body: 'Do not use this' }, linkedin: { body: 'Do not use this either' } } }; }

test('one paste becomes the exact caption for both networks without leftover hook, CTA or hashtags', () => {
  const { p, app } = fixture(); p.content_json.captions = { instagram: { body: 'Old Instagram' }, linkedin: { body: 'Old LinkedIn' } };
  const art = JSON.stringify(p.meta.final_artworks), text = 'Texto completo.\n\nVamos conversar?\n#VendaMais';
  flow.setSharedCaption(app, p, text, 'pt');
  assert.equal(flow.captionText(p, 'pt', 'instagram'), text); assert.equal(flow.captionText(p, 'pt', 'linkedin'), text);
  assert.equal(p.content_json.captions, undefined); assert.equal(p.content_json.caption.hook, ''); assert.equal(p.content_json.caption.cta, '');
  assert.equal(JSON.stringify(p.meta.final_artworks), art); assert.equal(p.status, 'draft');
});

test('Spanish manual copy is independent of Portuguese and rejects an unavailable language', () => {
  const { p, app } = fixture(), before = JSON.stringify(p.content_json);
  assert.throws(() => flow.setSharedCaption(app, p, 'Texto', 'es'), /versão em espanhol/);
  p.content_es = aiResult(); flow.setSharedCaption(app, p, 'Una sola leyenda.\n#VendaMais', 'es');
  assert.equal(JSON.stringify(p.content_json), before); assert.equal(flow.captionText(p, 'es', 'instagram'), flow.captionText(p, 'es', 'linkedin'));
});

test('a shared source always generates a shared Spanish copy without artificial template checks', async () => {
  const { p, app } = fixture(), before = JSON.stringify(p.meta.final_artworks); let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ text: JSON.stringify(aiResult()) }); };
  try {
    await ES.adaptToSpanish(app, p); assert.equal(calls, 1); assert.equal(p.content_es.captions, undefined);
    assert.deepEqual(p.content_es.caption, { hook: '', body: aiResult().caption.body, practical_takeaway: '', cta: '', hashtags: [] });
    assert.equal(flow.captionText(p, 'es', 'instagram'), flow.captionText(p, 'es', 'linkedin')); assert.equal(JSON.stringify(p.meta.final_artworks), before);
    const restored = JSON.parse(JSON.stringify(p)); delete restored.content_es_pt_fp;
    assert.equal(ES.esOutdated(restored), false); restored.content_json.caption.body += ' Texto novo.'; assert.equal(ES.esOutdated(restored), true);
  } finally { globalThis.fetch = originalFetch; }
});

test('translation cannot overwrite a Portuguese edit made while the request is in flight', async () => {
  const { p, app } = fixture(); globalThis.fetch = async () => { p.content_json.caption.body = 'Última edição do usuário'; return Response.json({ text: JSON.stringify(aiResult()) }); };
  try { await assert.rejects(ES.adaptToSpanish(app, p), /mudou durante/); assert.equal(p.content_es, undefined); assert.equal(p.content_json.caption.body, 'Última edição do usuário'); } finally { globalThis.fetch = originalFetch; }
});

test('approved and scheduled posts cannot have their copy replaced', () => {
  for (const scheduled of [false, true]) { const { p, app } = fixture(); if (scheduled) db.publications.push({ post_id: p.id, status: 'scheduled' }); else p.status = 'approved'; const before = JSON.stringify(p); assert.throws(() => flow.setSharedCaption(app, p, 'New copy'), /aprovada/); assert.equal(JSON.stringify(p), before); }
});

test('sync includes shared Spanish copy and status in existing database columns', async () => {
  const { p } = fixture(); p.content_es = { caption: { body: 'Copy único en español' } }; p.es_status = 'pending_validation'; const sent = [];
  globalThis.fetch = async (url, options) => { assert.match(url, /isolated.invalid/); sent.push({ url, data: JSON.parse(options.body) }); return Response.json({ ok: true }); };
  try { await SB.pushAll(); const saved = sent.find(r => r.url.endsWith('/posts')).data[0]; assert.deepEqual(saved.content_es, p.content_es); assert.equal(saved.es_status, 'pending_validation'); } finally { globalThis.fetch = originalFetch; }
});

test('both UI entrypoints expose a single full-copy editor', () => {
  for (const file of ['index.html', 'Content Engine.dc.html']) {
    const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8'); assert.match(html, /F\('caption_text', 'Copy completo'/); assert.doesNotMatch(html, /out.postFieldGroups.push\(\{ label: network/);
    const js = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1]; assert.doesNotThrow(() => new Function('DCLogic', 'React', js));
  }
});
