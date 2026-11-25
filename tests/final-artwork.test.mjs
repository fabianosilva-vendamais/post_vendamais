// Isolated fixtures only: every HTTP call is intercepted; no production writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/artwork-test.cjs` : import.meta.url);
const { createCanvas, Image } = require('@napi-rs/canvas');
globalThis.Image = Image;
globalThis.localStorage = { getItem: () => null, setItem() {} };
const downloads = [];
globalThis.document = { fonts: { load: async () => { throw new Error('Finished art must not load template fonts'); } }, createElement: tag => {
  if (tag === 'canvas') return createCanvas(1080, 1350);
  if (tag === 'a') { const a = { click() { downloads.push({ href: a.href, download: a.download }); } }; return a; }
  throw new Error('Unexpected DOM access: ' + tag);
} };
const { db, blobs } = await import('../engine/store.js?vm202611011656');
const flow = await import('../engine/posts-flow.js?vm202611011656');
const art = await import('../engine/final-artwork.js');
const publisher = await import('../engine/publisher.js');
const SB = await import('../engine/supabase.js?vm202611011656');
const initialRules = structuredClone(db.brand_rules);
const files = new Map(); blobs.put = async (id, data) => files.set(id, data); blobs.get = async id => files.get(id); blobs.del = async id => files.delete(id);
const realFetch = globalThis.fetch;
function picture(color, w = 1080, h = 1350, mime = 'image/png') {
  const c = createCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(37, 93, 193, 51);
  return { canvas: c, dataUrl: c.toDataURL(mime) };
}
const pt = picture('#176352'), es = picture('#632384', 1000, 1000, 'image/jpeg');
function fixture() {
  for (const k of ['posts', 'generated_images', 'publications', 'editions', 'newsletter_versions', 'sources', 'analyses', 'renders', 'audit_log', 'brand_assets', 'brand_rules', 'prompt_templates']) db[k] = [];
  db.brand_rules = structuredClone(initialRules); files.clear(); downloads.length = 0;
  Object.assign(db.settings, { supabase_url: 'https://isolated.invalid', supabase_anon_key: 'test', functions_base: 'https://isolated.invalid/functions/v1', metricool_blog_id: 'BR', metricool_blog_id_es: 'LATAM' });
  db.session = { access_token: 'isolated-test', expires_at: Date.now() + 3600000 }; db.user = null;
  const edition = { id: 'test-edition', brief: { number: 999 }, edition_date: '2099-11-18' }; db.editions.push(edition);
  const caption = body => ({ hook: 'Revise a carteira', body, cta: 'Converse com a VendaMais', hashtags: ['VendaMais'] });
  const p = { id: 'test-post', edition_id: edition.id, angle: 'training', status: 'draft', format: 'carousel', image_id: 'previous-base', meta: { locks: { headline: true }, edited: {} }, carousel: { slides: [{ role: 'cover', title: 'Original' }] }, content_json: { headline: 'Sua equipe trabalha muito e as vendas não aumentam', caption: caption('Conteúdo em português'), captions: { instagram: caption('Instagram PT'), linkedin: caption('LinkedIn PT') } }, content_es: { headline: 'El equipo trabaja mucho y las ventas no aumentan', caption: caption('Contenido en español'), captions: { instagram: caption('Instagram ES'), linkedin: caption('LinkedIn ES') } } }; db.posts.push(p);
  return { p, edition, app: { edition: () => edition, evidence: () => [], assetUrl() { throw new Error('No template logos should load'); }, save() {}, setStatus(e, status) { e.status = status; } } };
}
async function both(f) { await art.uploadArtwork(f.app, f.p, { lang: 'pt', dataUrl: pt.dataUrl, name: 'post-pt.png' }); await art.uploadArtwork(f.app, f.p, { lang: 'es', dataUrl: es.dataUrl, name: 'post-es.jpg' }); }

test('PT and ES files remain independent; copies, base photo, locks and carousel survive', async () => {
  const f = fixture(), before = JSON.stringify([f.p.content_json, f.p.content_es, f.p.carousel]); await both(f);
  assert.equal(JSON.stringify([f.p.content_json, f.p.content_es, f.p.carousel]), before);
  assert.equal(f.p.image_id, 'previous-base'); assert.equal(f.p.meta.locks.headline, true);
  assert.equal(f.p.format, 'single'); assert.equal(art.isFinalArtwork(f.p), true);
  assert.notEqual(art.artworkFor(f.p, 'pt').image_id, art.artworkFor(f.p, 'es').image_id);
  assert.equal((await art.artworkData(f.p, 'pt')).dataUrl, pt.dataUrl); assert.equal((await art.artworkData(f.p, 'es')).dataUrl, es.dataUrl);
});

test('preview preserves PNG pixels and native dimensions with no text, logo, crop or fonts', async () => {
  const f = fixture(); await both(f); const canvas = createCanvas(1, 1);
  const result = await flow.renderPost(f.app, f.p, canvas, 'pt'); assert.equal(result.meta.finalArtwork, true);
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1350);
  assert.deepEqual(canvas.getContext('2d').getImageData(0, 0, 1080, 1350).data, pt.canvas.getContext('2d').getImageData(0, 0, 1080, 1350).data);
  await flow.renderPost(f.app, f.p, canvas, 'es'); assert.equal(canvas.width, 1000); assert.equal(canvas.height, 1000);
  assert.notDeepEqual(canvas.getContext('2d').getImageData(0, 0, 1, 1).data, pt.canvas.getContext('2d').getImageData(0, 0, 1, 1).data);
});

test('missing ES blocks approval/ES preview and clears previously rendered PT', async () => {
  const f = fixture(); await art.uploadArtwork(f.app, f.p, { lang: 'pt', dataUrl: pt.dataUrl });
  const canvas = createCanvas(1, 1); await flow.renderPost(f.app, f.p, canvas, 'pt');
  await assert.rejects(flow.renderPost(f.app, f.p, canvas, 'es'), /espanhol/);
  assert.equal(canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3], 0);
  assert.throws(() => flow.approvePost(f.app, f.p), /bloqueio/);
});

test('invalid, unsupported or incompatible uploads leave previous images unchanged', async () => {
  const f = fixture(); await both(f); const before = JSON.stringify(f.p), count = db.generated_images.length;
  for (const dataUrl of ['data:image/svg+xml;base64,AAAA', 'data:image/png;base64,AAAA', picture('red', 400, 800).dataUrl, picture('red', 200, 250).dataUrl]) await assert.rejects(art.uploadArtwork(f.app, f.p, { lang: 'pt', dataUrl }));
  await assert.rejects(art.uploadArtwork(f.app, f.p, { lang: 'fr', dataUrl: pt.dataUrl }), /Idioma/);
  assert.equal(JSON.stringify(f.p), before); assert.equal(db.generated_images.length, count);
});

test('approved and scheduled posts reject uploads and mode changes', async () => {
  for (const state of ['approved', 'exported', 'scheduled']) {
    const f = fixture(); f.p.status = state === 'scheduled' ? 'draft' : state;
    if (state === 'scheduled') db.publications.push({ post_id: f.p.id, status: 'scheduled' });
    const before = JSON.stringify(f.p);
    await assert.rejects(art.uploadArtwork(f.app, f.p, { lang: 'pt', dataUrl: pt.dataUrl }), /preservada/);
    assert.throws(() => art.useStudioArtwork(f.app, f.p), /preservada/); assert.equal(JSON.stringify(f.p), before);
  }
});

test('restoring Studio composition preserves uploaded originals and original format', async () => {
  const f = fixture(); await both(f); const before = JSON.stringify(f.p.meta.final_artworks);
  art.useStudioArtwork(f.app, f.p); assert.equal(art.isFinalArtwork(f.p), false); assert.equal(f.p.format, 'carousel');
  assert.equal(JSON.stringify(f.p.meta.final_artworks), before); assert.equal(f.p.carousel.slides[0].title, 'Original');
});

test('automatic base-image generation skips finished-art posts', async () => {
  const f = fixture(); await both(f); globalThis.fetch = async () => { throw new Error('No AI HTTP call allowed'); };
  try { assert.equal(await flow.hasImageFile(f.p), true); assert.deepEqual(await flow.generateAllImages(f.app, f.edition.id, { force: true }), { done: [], failed: [] }); } finally { globalThis.fetch = realFetch; }
});

test('QA checks finished-file integrity without requiring template logos and still requires approval', async () => {
  const f = fixture(); await both(f); globalThis.fetch = async () => Response.json({ text: JSON.stringify({ scores: { clarity: 95, specificity: 95, evidence: 95, voice: 95, rhythm: 95, cta: 95 }, issues: [] }) });
  try { const qa = await flow.runQA(f.app, f.p); assert.equal(qa.visual.scope, 'file_integrity'); assert.deepEqual(qa.visual.issues, []); assert.equal(f.p.status, 'draft'); flow.approvePost(f.app, f.p); assert.equal(f.p.status, 'approved'); } finally { globalThis.fetch = realFetch; }
});

test('download returns original JPEG bytes, extension and actual dimensions', async () => {
  const f = fixture(); await both(f); await flow.exportPost(f.app, f.p, { lang: 'es', copy: false });
  assert.equal(downloads[0].href, es.dataUrl); assert.match(downloads[0].download, /-es-arte-final.jpg$/);
  assert.equal(db.renders[0].dimensions, '1000x1000'); assert.equal(db.renders[0].image_id, art.artworkFor(f.p, 'es').image_id);
});

test('publisher sends original bytes to the correct brand and language-specific network copies', async () => {
  const f = fixture(); await both(f); f.p.status = 'approved'; const sent = [], uploaded = [];
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('data:')) return realFetch(url);
    if (url.includes('/storage/v1/object/sign/')) return Response.json({ signedURL: '/object/sign/test/' + uploaded.length });
    if (url.includes('/storage/v1/object/renders/')) { uploaded.push({ url, type: options.body.type, bytes: Buffer.from(await options.body.arrayBuffer()) }); return Response.json({ ok: true }); }
    if (url.endsWith('/publish-schedule')) { sent.push(JSON.parse(options.body)); return Response.json({ result: { id: 'mock-' + sent.length } }); }
    throw new Error('Unexpected HTTP request: ' + url);
  };
  try {
    for (const lang of ['pt', 'es']) await publisher.schedule(f.app, f.p, { lang, networks: ['instagram', 'linkedin'], dateTime: '2099-11-18T06:00:00-03:00' });
    assert.equal(sent.length, 4); assert.equal(uploaded.length, 4);
    for (let i = 0; i < 4; i++) {
      const lang = i < 2 ? 'pt' : 'es', original = lang === 'pt' ? pt : es;
      assert.deepEqual(uploaded[i].bytes, Buffer.from(original.dataUrl.split(',')[1], 'base64'));
      assert.equal(sent[i].blogId, lang === 'pt' ? 'BR' : 'LATAM'); assert.equal(sent[i].mediaUrls.length, 1);
      assert.match(sent[i].text, new RegExp((i % 2 ? 'LinkedIn' : 'Instagram') + ' ' + lang.toUpperCase()));
      assert.equal(sent[i].linkedinDocumentTitle, '');
    }
    await publisher.schedule(f.app, f.p, { lang: 'es', networks: ['instagram', 'linkedin'], dateTime: '2099-11-18T06:00:00-03:00' }); assert.equal(sent.length, 4, 'repeat must reuse existing publications');
  } finally { globalThis.fetch = realFetch; }
});

test('publisher never falls back to another language when the original is missing', async () => {
  const f = fixture(); await both(f); f.p.status = 'approved'; files.delete(art.artworkFor(f.p, 'es').image_id); let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No outbound requests allowed'); };
  try { await assert.rejects(publisher.schedule(f.app, f.p, { lang: 'es', networks: ['instagram'], dateTime: '2099-11-18T06:00:00-03:00' }), /indisponível/); assert.equal(calls, 0); } finally { globalThis.fetch = realFetch; }
});

test('existing Supabase sync persists file references, metadata and original image bytes', async () => {
  const f = fixture(); await both(f); const requests = [];
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('data:')) return realFetch(url);
    if (url.includes('/storage/v1/object/images/')) return Response.json({ ok: true });
    if (url.includes('/rest/v1/')) { requests.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true }); }
    throw new Error('Unexpected HTTP request: ' + url);
  };
  try {
    await SB.pushAll(); const saved = requests.find(x => x.url.endsWith('/posts')).body[0];
    assert.equal(saved.meta.artwork_mode, 'final'); assert.equal(saved.meta.final_artworks.es.name, 'post-es.jpg');
    const images = requests.find(x => x.url.endsWith('/generated_images')).body;
    for (const l of ['pt', 'es']) assert.ok(images.some(i => i.id === saved.meta.final_artworks[l].image_id && i.file_url.startsWith('storage://images/')));
    const reloaded = JSON.parse(JSON.stringify(saved)); assert.equal(art.isFinalArtwork(reloaded), true);
    assert.equal((await art.artworkData(reloaded, 'pt')).dataUrl, pt.dataUrl);
  } finally { globalThis.fetch = realFetch; }
});

test('both entrypoints expose uploads and keep approval copies intact', () => {
  for (const name of ['index.html', 'Content Engine.dc.html']) {
    const html = readFileSync(new URL('../' + name, import.meta.url), 'utf8');
    assert.match(html, /Enviar artes prontas/); assert.match(html, /data-lang="\{\{ art.lang \}\}" onChange="\{\{ uploadFinalArtwork \}\}"/);
    assert.match(html, /Copies preservados/); assert.match(html, /p.meta\?\.final_artworks/);
    const script = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new Function('DCLogic', 'React', script + '; return Component;'));
  }
});

test('full week simulation: six originals produce twelve automatic posts across the four profiles', async () => {
  const f = fixture(), originals = new Map(), sent = [], uploaded = [];
  for (const [i, angle] of ['training', 'consulting', 'business'].entries()) {
    const p = i === 0 ? f.p : { ...structuredClone(f.p), id: 'test-' + angle, angle, status: 'draft', meta: {} };
    if (i) db.posts.push(p);
    for (const [j, lang] of ['pt', 'es'].entries()) {
      const image = picture(`rgb(${40 + i * 45},${60 + j * 90},${90 + i * 20})`);
      originals.set(`${angle}/${lang}`, Buffer.from(image.dataUrl.split(',')[1], 'base64'));
      await art.uploadArtwork(f.app, p, { lang, dataUrl: image.dataUrl, name: `${angle}-${lang}.png` });
    }
    p.status = 'approved';
  }
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('data:')) return realFetch(url);
    if (url.includes('/storage/v1/object/sign/')) return Response.json({ signedURL: '/object/sign/test/' + uploaded.length });
    if (url.includes('/storage/v1/object/renders/')) { const match = url.match(/\/(training|consulting|business)\/[^/]+\/arte-final-(pt|es)\.png$/); assert.ok(match); assert.deepEqual(Buffer.from(await options.body.arrayBuffer()), originals.get(`${match[1]}/${match[2]}`)); uploaded.push(url); return Response.json({ ok: true }); }
    if (url.endsWith('/publish-schedule')) { sent.push(JSON.parse(options.body)); return Response.json({ result: { id: 'week-' + sent.length } }); }
    throw new Error('Unexpected HTTP: ' + url);
  };
  try {
    const rows = publisher.weekPlan(f.edition, db.posts).map(r => ({ ...r, time: '06:00', include: true }));
    assert.equal(rows.length, 6); const result = await publisher.scheduleWeek(f.app, rows);
    assert.equal(result.filter(r => r.ok).length, 6); assert.equal(sent.length, 12); assert.equal(uploaded.length, 12);
    for (const brand of ['BR', 'LATAM']) for (const network of ['instagram', 'linkedin']) assert.equal(sent.filter(r => r.blogId === brand && r.networks[0] === network).length, 3);
    assert.ok(sent.every(r => r.draft === false && r.dateTime.endsWith('T06:00:00') && r.mediaUrls.length === 1));
  } finally { globalThis.fetch = realFetch; }
});
