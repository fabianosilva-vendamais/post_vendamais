import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLARITY_CHECKS, CLARITY_POLICY, clarityIssues, compatibleRevision, reviewGenerated } from '../engine/editorial-clarity.js';
import { editorialPurpose, generateEditorial } from '../engine/editorial-server.js';

const pass = () => Object.fromEntries(CLARITY_CHECKS.map(k => [k, true]));
const post = () => ({ angle: 'consulting', headline: 'Sua equipe trabalha muito. Por que as vendas não aumentam?', support_line: 'O problema pode estar nas oportunidades que não avançam.', caption: { hook: 'A agenda está cheia, mas os negócios não avançam.', body: 'Antes de ampliar a prospecção, examine onde as negociações param.', practical_takeaway: 'Converse com a equipe sobre as oportunidades sem próximo passo.', cta: 'Como isso acontece na sua operação?', hashtags: ['VendaMais'] }, proof_number: '', source_claims: [] });

test('policy specifies all seven criteria and both languages/platforms', () => {
  for (const token of ['Instagram', 'LinkedIn', 'Espanhol LATAM', 'Uma publicação, uma mensagem', 'sem infantilizar']) assert.ok(CLARITY_POLICY.includes(token));
  assert.equal(CLARITY_CHECKS.length, 7);
});
test('clear executive post passes deterministic visual budgets', () => assert.deepEqual(clarityIssues(post()), []));
test('abstract title is caught even if the model approves it', () => {
  const value = { ...post(), headline: 'O futuro das vendas começa onde termina a execução' };
  assert.ok(clarityIssues(value).some(x => x.message.includes('metáfora')));
});
test('dense support and repeated slide titles fail before approval', () => {
  const value = { ...post(), support_line: 'uma palavra '.repeat(40), slides: [{ title: 'Revise as oportunidades', body: '' }, { title: 'Revise as oportunidades', body: '' }, { title: 'Defina o próximo passo', body: '' }] };
  assert.ok(clarityIssues(value).length >= 2);
});
test('review automatically corrects and independently audits the correction', async () => {
  const original = { ...post(), headline: 'O crescimento invisível está nas conexões que você ainda não explorou' };
  const snapshot = JSON.stringify(original); let calls = 0;
  const result = await reviewGenerated(original, { purpose: 'posts.write:consulting', call: async () => ++calls === 1 ? { checks: { ...pass(), immediate_clarity: false }, revised: post() } : { checks: pass(), revised: null } });
  assert.equal(calls, 2); assert.equal(result.meta.revisions, 1); assert.equal(result.value.headline, post().headline); assert.equal(JSON.stringify(original), snapshot);
});
test('missing semantic criteria never passes', async () => {
  await assert.rejects(reviewGenerated(post(), { call: async () => ({ checks: { immediate_clarity: true }, revised: null }) }), /revisão automática/);
});
test('a positive semantic audit does not override deterministic failures', async () => {
  await assert.rejects(reviewGenerated({ ...post(), support_line: 'x '.repeat(80) }, { call: async () => ({ checks: pass(), revised: null }) }), /revisão automática/);
});
test('bounded retries fail without changing prior content', async () => {
  const original = post(); let calls = 0;
  await assert.rejects(reviewGenerated(original, { call: async () => ({ checks: { ...pass(), coherence: false }, revised: { ...post(), support_line: `Revise a negociação pendente ${++calls}.` } }) }), /revisão automática/);
  assert.equal(calls, 3); assert.deepEqual(original, post());
});
test('review cannot alter workflow, evidence or approval metadata', () => {
  for (const key of ['angle', 'format', 'layout', 'proof_number', 'evidence_ids', 'source_claims', 'approved_hash', 'url']) assert.equal(compatibleRevision({ [key]: 'original' }, { [key]: 'alterado' }), false, key);
});
test('Spanish adaptation preserves slide count and order', () => {
  const before = { slides: [{ role: 'cover', title: 'Título', body: '' }, { role: 'point', title: 'Ponto', body: '' }, { role: 'point', title: 'Ação', body: '' }, { role: 'closing', title: 'Convite', body: '' }] };
  const after = { slides: [before.slides[0], before.slides[1], before.slides[3]] };
  assert.equal(compatibleRevision(before, after, '', true), false);
  assert.equal(compatibleRevision(before, after, '', false), true);
});
test('legacy social clients are covered; analysis and authored newsletter stay out', () => {
  assert.equal(editorialPurpose({ prompt: 'Crie posts. Retorne {"posts":[]}' }), 'posts.derive:legacy');
  assert.equal(editorialPurpose({ prompt: 'Adapte este carrossel. Retorne {"slides":[]}' }), 'posts.derive:legacy');
  assert.equal(editorialPurpose({ prompt: 'Audite esta peça {"posts":[]}' }), '');
  assert.equal(editorialPurpose({ prompt: 'APENAS organizar o texto do autor' }), '');
});
test('server preserves provider envelope and returns compact audit metadata', async () => {
  let calls = 0;
  const result = await generateEditorial({ purpose: 'posts.write:test', prompt: 'Fonte verificada', provider: 'openai' }, async body => {
    assert.ok(body.system.includes('DIRETRIZ CENTRAL'));
    return { text: JSON.stringify(++calls === 1 ? post() : { checks: pass(), revised: null }), provider: 'openai', model: 'configured' };
  });
  assert.equal(result.provider, 'openai'); assert.equal(result.editorial.passed, true); assert.equal(calls, 2); assert.deepEqual(JSON.parse(result.text), post());
});
test('rollback flag returns original response without adding model calls', async () => {
  let calls = 0;
  const result = await generateEditorial({ purpose: 'posts.write:test', prompt: 'Fonte', system: 'Original' }, async body => { calls++; assert.equal(body.system, 'Original'); return { text: '{}' }; }, { enabled: false });
  assert.equal(calls, 1); assert.deepEqual(result, { text: '{}' });
});
test('manual newsletter structuring keeps author instruction intact', async () => {
  let received;
  await generateEditorial({ purpose: 'newsletter.structure', prompt: 'APENAS organizar texto', system: 'Preserve o autor' }, async body => { received = body; return { text: '{}' }; });
  assert.equal(received.system, 'Preserve o autor');
});
test('bundles use the exact same policy and review implementation', () => {
  for (const slug of ['studio-v2', 'text-generate']) for (const file of ['editorial-clarity.js', 'editorial-server.js']) assert.equal(readFileSync(new URL(`../supabase/functions/${slug}/${file}`, import.meta.url), 'utf8'), readFileSync(new URL(`../engine/${file}`, import.meta.url), 'utf8'));
});

globalThis.localStorage = { getItem: () => null, setItem() {} };
const store = await import('../engine/store.js?vm202611011656');
const flow = await import('../engine/posts-flow.js');
const spanish = await import('../engine/posts-es.js');
const publisher = await import('../engine/publisher.js');
test('legacy caption output stays identical for existing posts', () => {
  const value = { content_json: { caption: { hook: 'Abertura', body: 'Texto', cta: 'Converse', hashtags: ['VendaMais'] } } };
  assert.equal(flow.captionText(value), 'Abertura\n\nTexto\n\n\n\nConverse\n\n#VendaMais');
});
test('channel and language copies are selected without mutating the post', () => {
  const value = { content_json: { caption: { body: 'Principal' }, captions: { instagram: { body: 'Instagram PT' }, linkedin: { body: 'LinkedIn PT' } } }, content_es: { caption: { body: 'Principal ES' }, captions: { instagram: { body: 'Instagram ES' }, linkedin: { body: 'LinkedIn ES' } } } };
  const snapshot = JSON.stringify(value);
  assert.equal(flow.captionText(value, 'pt', 'instagram'), 'Instagram PT'); assert.equal(flow.captionText(value, 'pt', 'linkedin'), 'LinkedIn PT'); assert.equal(flow.captionText(value, 'es', 'instagram'), 'Instagram ES'); assert.equal(JSON.stringify(value), snapshot);
});
test('approved posts reject generation before any model call', async () => {
  const frozen = { id: 'approved-post', status: 'approved', content_json: post() }; const snapshot = JSON.stringify(frozen);
  await assert.rejects(flow.rewriteField({}, frozen, 'headline', 'clareza'), /aprovada/);
  await assert.rejects(flow.deriveCarousel({}, frozen), /aprovada/);
  assert.equal(JSON.stringify(frozen), snapshot);
});
test('Spanish generation cannot replace an approved Spanish draft', async () => {
  const frozen = { id: 'es-approved', status: 'approved', content_es: { headline: 'Original' } };
  await assert.rejects(spanish.adaptToSpanish({}, frozen), /aprovada/);
});
test('scheduled drafts reject regeneration regardless of local status', async () => {
  const frozen = { id: 'scheduled-post', status: 'draft', content_json: post() };
  store.db.publications.push({ post_id: frozen.id, status: 'scheduled' });
  await assert.rejects(flow.rewriteSlide({}, frozen, 0), /aprovada/);
});
test('new per-channel scheduling reuses a recorded publication rather than duplicating', async () => {
  const p = { id: 'channel-id', status: 'approved', content_json: { captions: { instagram: { body: 'PT' } } } };
  store.db.settings.metricool_blog_id = 'configured'; store.db.session = { access_token: 'fixture' }; store.db.user = { id: 'fixture' };
  const recorded = { post_id: p.id, lang: 'pt', networks: ['instagram'], date_time: '2099-01-01T06:00:00', status: 'scheduled' };
  store.db.publications.push(recorded);
  const result = await publisher.schedule({}, p, { networks: ['instagram'], dateTime: recorded.date_time });
  assert.equal(result, recorded);
});

test('Spanish fingerprints of existing approved posts remain byte-for-byte stable', () => {
  const p = { content_json: post() };
  const get = (o, path) => path.split('.').reduce((value, key) => value?.[key], o);
  const baseline = JSON.stringify([...spanish.TEXT_FIELDS.map(f => get(p.content_json, f) || ''), p.content_json.caption.hashtags.join(',')]);
  assert.equal(spanish.ptFingerprint(p), baseline);
});

test('unnecessary English jargon in headlines requires revision in PT and ES', () => {
  for (const headline of ['Pipeline cheio, mas quem faz o próximo contato?', 'Pipeline lleno, ¿quién contacta al cliente?']) assert.ok(clarityIssues({ ...post(), headline }).some(x => x.message.includes('estrangeirismo')));
});

test('automatic revision retains omitted workflow and evidence fields', async () => {
  const original = { ...post(), headline: 'Pipeline cheio, mas quem faz o próximo contato?', editorial_version: '2026-11-17.1', proof_number: '20%', source_claims: [{ text: 'Origem', evidence_id: 'E1' }] };
  let count = 0;
  const result = await reviewGenerated(original, { call: async () => ++count === 1 ? { checks: { ...pass(), simplicity: false }, revised: { headline: 'Quem faz o próximo contato com o cliente?' } } : { checks: pass(), revised: null } });
  assert.equal(result.value.proof_number, '20%'); assert.deepEqual(result.value.source_claims, original.source_claims); assert.equal(result.value.editorial_version, original.editorial_version); assert.equal(count, 2);
});

test('an audit without a usable revision triggers a writer and a fresh audit', async () => {
  let count = 0;
  const original = { ...post(), headline: 'Pipeline cheio, mas quem faz o próximo contato?' };
  const result = await reviewGenerated(original, { call: async () => { count++; if (count === 1) return { checks: { ...pass(), simplicity: false }, revised: null }; if (count === 2) return { revised: post() }; return { checks: pass(), revised: null }; } });
  assert.equal(count, 3); assert.equal(result.meta.revisions, 1); assert.equal(result.value.headline, post().headline);
});

test('internal plans and source anchors are context, never audited as public copy', async () => {
  const value = { ...post(), plan: { scene: 'pipeline, análise interna' }, anchors: ['pipeline na fonte'] };
  await reviewGenerated(value, { call: async request => { const candidate = JSON.parse(request.prompt.split('CANDIDATO: ').at(-1)); assert.equal(candidate.plan, undefined); assert.equal(candidate.anchors, undefined); return { checks: pass(), revised: null }; } });
});
