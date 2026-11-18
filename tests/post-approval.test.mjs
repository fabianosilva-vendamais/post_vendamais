import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const [store, flow, qa, newsletter, providers, publisher, es, knowledge] = await Promise.all(['store', 'posts-flow', 'qa', 'newsletter-flow', 'providers', 'publisher', 'posts-es', 'knowledge'].map(n => import(`../engine/${n}.js?vm202611011656`)));
const db = store.db, evidence = knowledge.knowledgeEvidence(knowledge.KNOWLEDGE_V1);
function fixture() {
  const ed = { id: 'approval-test', brief: { number: 29 }, edition_date: '2026-11-18' };
  const p = { id: 'approval-post', edition_id: ed.id, angle: 'training', status: 'draft', format: 'single', template_id: 'T03', content_json: { angle: 'training', headline: 'Uma referência antiga que não aparece no arquivo', proof_label: '99999 clientes', image_prompt: 'com texto e logo', plan: { stolen_line: '2027 começa nas decisões de 2026' }, anchors: ['Metas de 2027'], thesis: 'Um planejamento interno de 2026', caption: { body: '2026 ainda não acabou. Sua empresa já parou?\n\nRevise as propostas e converse com os clientes.', hashtags: [] }, source_claims: ['K-P2'] }, content_es: { caption: { body: '2026 todavía no terminó. Revise las propuestas y converse con los clientes.', hashtags: [] } }, meta: { locks: {}, edited: { 'caption.body': 'human' }, artwork_mode: 'final', final_artworks: { pt: { image_id: 'pt' }, es: { image_id: 'es' } } }, qa_json: { deterministic: { blockers: [{ code: 'number_no_source', text: 'Old cached template audit' }], warnings: [] } } };
  db.posts = [p]; db.editions = [ed]; db.publications = []; db.generated_images = []; db.newsletter_versions = []; db.analyses = []; db.sources = [];
  return { ed, p, app: { evidence: () => evidence, edition: () => ed, save() {}, setStatus() {} } };
}
test('finished art audits only the published copy; hidden template and planning fields do not block', () => {
  const { p } = fixture(); assert.ok(qa.deterministicChecks(p.content_json, evidence, 'post').blockers.length);
  assert.deepEqual(flow.postChecks(p, evidence).blockers, []);
  assert.deepEqual(flow.postChecks(p, evidence, 'es').blockers, []);
  assert.equal(flow.postReviewContent(p).headline, undefined);
  assert.equal(flow.postReviewContent(p).image_prompt, undefined);
});
test('human-copy approval retains data warnings without requiring an AI claim map', () => {
  const { p, app } = fixture(); const det = flow.postChecks(p, evidence);
  assert.ok(det.warnings.some(w => w.code === 'number_no_source')); flow.approvePost(app, p); assert.equal(p.status, 'approved');
});
test('generated copy still requires evidence and brand spelling remains blocking for human copy', () => {
  const { p, app } = fixture(); p.meta.edited = {}; p.content_json.caption.body = 'A receita cresceu 73%';
  assert.ok(flow.postChecks(p, evidence).blockers.some(b => b.code === 'number_no_source'));
  p.meta.edited['caption.body'] = 'human'; p.content_json.caption.body = 'Converse com a Venda Mais';
  assert.throws(() => flow.approvePost(app, p), /bloqueio/); assert.equal(p.status, 'draft');
});
test('missing final ES artwork still prevents approval', () => {
  const { p, app } = fixture(); delete p.meta.final_artworks.es; assert.throws(() => flow.approvePost(app, p), /bloqueio/);
});
test('legacy template QA remains unchanged', () => {
  const { p } = fixture(); p.meta.artwork_mode = 'studio';
  assert.deepEqual(flow.postChecks(p, evidence), qa.deterministicChecks(p.content_json, evidence, 'post'));
});
for (const filename of ['index.html', 'Content Engine.dc.html']) test(`${filename}: approval button is enabled for the actual finished-art workflow`, () => {
  const { p, ed } = fixture(); const html = readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
  const code = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
  const Component = new Function('DCLogic', 'React', code + ';return Component;')(class {}, { createRef: () => ({ current: null }) });
  const app = new Component(); app.M = { store, posts: flow, qa, newsletter, providers, publisher, es, knowledge, supabase: { signedIn: () => false } };
  app.state = { ...app.state, editionId: ed.id, activeAngle: p.angle, busy: false }; app.loadImgUrls = () => {};
  for (const lang of ['pt', 'es']) { app.state.lang = lang; const out = app.postsVals(ed, db, () => 'teste'); assert.equal(out.pqa.approveDisabled, false); }
  delete p.meta.final_artworks.es; assert.equal(app.postsVals(ed, db, () => 'teste').pqa.approveDisabled, true);
});
