// Fluxo dos posts derivados: derivação, edição/regeneração local, imagens, QA, aprovação, exportação.
import { db, uid, now, audit, activeRules, assetByType, blobs } from './store.js';
import { textJSON, imageGenerate } from './providers.js';
import { fill } from './prompts.js';
import { guideForPrompt, EDITORIAL_GUIDE_V1 } from './editorial-guide.js';
import { deterministicChecks, combineScore, visualChecks } from './qa.js';
import { render, renderSlide, loadImage, ensureFonts, canvasToBlob } from './social-render.js';
import { current as currentNL, getPath, setPath, download, sanitize } from './newsletter-flow.js';

export const ANGLES = ['training', 'consulting', 'business'];
const DEFAULT_TEMPLATE = { training: 'T01', consulting: 'T02', business: 'T03' };
export function postsOf(editionId) { return ANGLES.map(a => db.posts.find(p => p.edition_id === editionId && p.angle === a)).filter(Boolean); }
export function post(editionId, angle) { return db.posts.find(p => p.edition_id === editionId && p.angle === angle) || null; }
function prompt(id) { return db.prompt_templates.find(p => p.id === id && p.active)?.prompt_text || ''; }
function evidenceText(ev) { return ev.length ? ev.map(e => `${e.id} [${e.kind}] ${e.text}`).join('\n') : '(sem evidências estruturadas; não invente números)'; }

export async function derive(app) {
  const ed = app.edition(); const nl = currentNL(ed.id); if (!nl?.is_approved) throw new Error('Aprove a newsletter antes de gerar os posts.');
  const evidence = app.evidence(ed.id); const R = activeRules(); const existing = postsOf(ed.id);
  const lockedNote = existing.filter(p => Object.values(p.meta?.locks || {}).some(Boolean)).map(p => `Post ${p.angle}: manter exatamente ${Object.keys(p.meta.locks).filter(k => p.meta.locks[k]).map(k => `${k}=${JSON.stringify(getPath(p.content_json, k))}`).join('; ')}`).join('\n');
  const recent = db.posts.filter(x => x.edition_id !== ed.id && (x.status === 'approved' || x.status === 'exported')).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 6).map(x => `${x.format === 'carousel' ? 'carrossel' : 'peça única'} ${x.template_id}`);
  const guide = guideForPrompt(db.editorial_guide || EDITORIAL_GUIDE_V1, recent);
  const p = fill(prompt('posts_derive'), { newsletter: JSON.stringify(nl.content_json).slice(0, 16000), evidence: evidenceText(evidence), guide }) + (lockedNote ? `\nCAMPOS FIXADOS PELO EDITOR:\n${lockedNote}` : '') + `\nDireção de imagem por ângulo: ${ANGLES.map(a => `${a}: preferir ${R.angles[a].image}; evitar ${R.angles[a].image_avoid}`).join(' | ')}`;
  const out = await textJSON({ system: prompt('editor_base'), prompt: p, purpose: 'posts.derive', maxTokens: 10000 });
  const list = Array.isArray(out.posts) ? out.posts : [];
  for (const a of ANGLES) {
    const c = list.find(x => x.angle === a) || {}; const prev = post(ed.id, a);
    const content = normalizePost(c, a);
    if (prev?.meta?.locks) for (const k of Object.keys(prev.meta.locks)) if (prev.meta.locks[k]) setPath(content, k, JSON.parse(JSON.stringify(getPath(prev.content_json, k))));
    if (prev) { prev.versions = prev.versions || []; prev.versions.push({ content_json: JSON.parse(JSON.stringify(prev.content_json)), at: prev.updated_at || prev.created_at, origin: prev.origin }); prev.content_json = content; prev.origin = 'ai'; prev.score = null; prev.qa_json = null; prev.status = 'draft'; prev.updated_at = now(); if (!prev.template_id || !prev.meta?.edited?.template_id) prev.template_id = content.template_id || DEFAULT_TEMPLATE[a]; if (!prev.meta?.edited?.format) prev.format = c.format === 'carousel' ? 'carousel' : 'single'; }
    else db.posts.push({ id: uid('post'), edition_id: ed.id, angle: a, content_json: content, template_id: ['T01', 'T02', 'T03', 'T04', 'T06'].includes(content.template_id) ? content.template_id : DEFAULT_TEMPLATE[a], image_id: null, crop: { scale: 1, x: 0.5, y: 0.5 }, partner_id: null, format: c.format === 'carousel' ? 'carousel' : 'single', status: 'draft', score: null, qa_json: null, origin: 'ai', meta: { locks: {}, edited: {} }, versions: [], created_at: now(), updated_at: now() });
  }
  app.setStatus(ed, 'posts_generated'); audit('posts.derive', 'edition', ed.id, { count: list.length }); app.save();
}
export function normalizePost(c, angle) {
  const R = activeRules(); c = sanitize(c || {}); const cap = c.caption || {};
  // Número de prova deve ser curto ("38%", "7 em 10", "2.500"); se vier frase, extrai o número e move o resto para proof_label.
  let pn = String(c.proof_number || '').trim(), pl = String(c.proof_label || '').trim();
  if (pn.length > 14) { const m = pn.match(/(\d+(?:[.,]\d+)*\s*(?:%|em cada \d+|de cada \d+|em \d+|mil|milhões|bilhões|pontos|p\.p\.)?)/i); if (m) { pl = pl || pn.replace(m[0], '').replace(/^[\s,.:;]+|[\s,.:;]+$/g, '').replace(/\s{2,}/g, ' '); pn = m[0].replace(/\s+(de|em) cada\s+/i, ' em ').trim(); } else { pl = pl || pn; pn = ''; } }
  if (pl.length > 90) pl = pl.slice(0, 87).replace(/\s\S*$/, '') ;
  return { angle, anchors: Array.isArray(c.anchors) ? c.anchors : [], brief: c.brief || null, format_reason: c.format_reason || '', thesis: c.thesis || '', headline: String(c.headline || '').replace(/[.]+$/, ''), support_line: c.support_line || '', proof_number: pn, proof_label: pl, visual_concept: c.visual_concept || '', image_prompt: c.image_prompt || '', negative_space: c.negative_space || 'bottom', template_id: c.template_id || '', kicker: c.kicker || R.angles[angle].kicker,
    caption: { hook: cap.hook || '', body: cap.body || '', practical_takeaway: cap.practical_takeaway || '', cta: cap.cta || '', hashtags: Array.isArray(cap.hashtags) ? cap.hashtags.slice(0, R.voice.length.hashtags_max) : [] }, source_claims: Array.isArray(c.source_claims) ? c.source_claims : [] };
}
export function edit(app, p, path, value) { if (JSON.stringify(getPath(p.content_json, path)) === JSON.stringify(value)) return; p.versions = p.versions || []; p.versions.push({ content_json: JSON.parse(JSON.stringify(p.content_json)), at: now(), origin: 'autosave' }); if (p.versions.length > 40) p.versions.shift(); setPath(p.content_json, path, value); p.meta.edited[path] = 'human'; p.score = null; p.updated_at = now(); app.save('Autosave'); }
export function toggleLock(app, p, path) { p.meta.locks[path] = !p.meta.locks[path]; audit(p.meta.locks[path] ? 'post.lock' : 'post.unlock', 'post', p.id, { path }); app.save(); }
export async function rewriteField(app, p, field, instruction) {
  if (p.meta.locks?.[field]) throw new Error('Campo fixado.');
  const evidence = app.evidence(p.edition_id); const value = getPath(p.content_json, field);
  const pr = fill(prompt('post_rewrite'), { angle: p.angle, instruction: instruction || 'melhore especificidade, prova e utilidade prática', field, value: JSON.stringify(value), post: JSON.stringify(p.content_json), evidence: evidenceText(evidence) });
  const out = await textJSON({ system: prompt('editor_base'), prompt: pr, purpose: `post.rewrite:${field}` });
  let v = out && typeof out === 'object' && 'value' in out ? out.value : out; if (typeof value === 'string' && typeof v !== 'string') v = typeof v === 'object' ? (v.text || v.body || JSON.stringify(v)) : String(v);
  p.versions.push({ content_json: JSON.parse(JSON.stringify(p.content_json)), at: now(), origin: 'pre-regen' }); setPath(p.content_json, field, field === 'image_prompt' ? v : sanitize(v)); p.meta.edited[field] = 'ai'; p.score = null; p.updated_at = now(); audit('post.rewrite_field', 'post', p.id, { field, instruction }); app.save(); return v;
}
export function setTemplate(app, p, id) { p.template_id = id; p.meta.edited.template_id = 'human'; p.updated_at = now(); audit('post.template', 'post', p.id, { template_id: id }); app.save(); }
export function setCrop(app, p, crop) { p.crop = { ...p.crop, ...crop }; app.save('Autosave'); }
export function setPartner(app, p, id) { p.partner_id = id || null; app.save(); }

// ---- imagens-base ----
export function imagesOf(postId) { return db.generated_images.filter(i => i.post_id === postId).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
export async function generateImage(app, p, { prompt: pr, provider, mode, references }) {
  const started = Date.now();
  const res = await imageGenerate({ prompt: pr, provider, mode, references });
  const id = uid('img'); await blobs.put(id, res.dataUrl);
  const rec = { id, post_id: p.id, edition_id: p.edition_id, source: 'ai', provider: res.provider, model: res.model, mode, prompt: res.prompt, cost_meta: res.cost_meta, ms: Date.now() - started, created_at: now() };
  db.generated_images.push(rec); p.image_id = id; p.crop = { scale: 1, x: 0.5, y: 0.5 }; audit('image.generate', 'generated_image', id, { provider: rec.provider, model: rec.model, mode, ms: rec.ms, cost: res.cost_meta }); app.save(); return rec;
}
export async function addImageFromDataUrl(app, p, dataUrl, source, label) { const id = uid('img'); await blobs.put(id, dataUrl); const rec = { id, post_id: p.id, edition_id: p.edition_id, source, provider: source, model: null, prompt: label || '', created_at: now() }; db.generated_images.push(rec); p.image_id = id; p.crop = { scale: 1, x: 0.5, y: 0.5 }; audit('image.add', 'generated_image', id, { source, label }); app.save(); return rec; }
export function chooseImage(app, p, id) { p.image_id = id; p.updated_at = now(); audit('image.choose', 'post', p.id, { image_id: id }); app.save(); }

// ---- render ----
export function contentFor(p, lang) { return lang === 'es' && p.content_es ? p.content_es : p.content_json; }
export async function buildSpec(app, p, lang = 'pt') {
  const R = activeRules(); const c = contentFor(p, lang);
  const url = (a) => a ? app.assetUrl(a) : '';
  const [logoPrimary, logoNegative, image, portrait] = await Promise.all([loadImage(url(assetByType('logo_primary'))), loadImage(url(assetByType('logo_negative'))), p.image_id ? blobs.get(p.image_id).then(loadImage) : null, p.partner_id ? loadImage(url(db.brand_assets.find(a => a.type === 'portrait' && a.partner_id === p.partner_id && a.active))) : null]);
  const partner = R.partners.find(x => x.id === p.partner_id) || null;
  return { templateId: p.template_id, headline: c.headline, support: c.support_line, kicker: c.kicker || R.angles[p.angle].kicker, proofNumber: c.proof_number, proofLabel: c.proof_label, image, crop: p.crop, logoPrimary, logoNegative, portrait, partner };
}
export async function renderPost(app, p, canvas, lang = 'pt') { await ensureFonts(); const spec = await buildSpec(app, p, lang); const meta = render(canvas, spec); return { spec, meta }; }

// ---- Carrossel ----
export function setFormat(app, p, format) { p.format = format; p.meta.edited.format = 'human'; p.updated_at = now(); audit('post.format', 'post', p.id, { format }); app.save(); }
export async function deriveCarousel(app, p, slides = 6) {
  const evidence = app.evidence(p.edition_id); const R = activeRules();
  const pr = fill(prompt('carousel_derive'), { angle: p.angle, slides, post: JSON.stringify(p.content_json), evidence: evidenceText(evidence) });
  const out = await textJSON({ system: prompt('editor_base'), prompt: pr, purpose: 'carousel.derive', maxTokens: 6000 });
  let list = Array.isArray(out.slides) ? out.slides.map(s => sanitize({ role: s.role || 'point', kicker: s.kicker || '', title: s.title || '', body: s.body || '', proof_number: s.proof_number || '', proof_label: s.proof_label || '', evidence_ids: s.evidence_ids || [] })) : [];
  if (!list.length || list[0].role !== 'cover') list.unshift({ role: 'cover', kicker: p.content_json.kicker || R.angles[p.angle].kicker, title: p.content_json.headline, body: p.content_json.support_line, proof_number: '', proof_label: '', evidence_ids: [] });
  if (list[list.length - 1].role !== 'closing') list.push({ role: 'closing', kicker: 'PRÓXIMO PASSO', title: p.content_json.caption?.cta || 'Fale com a VendaMais', body: '', proof_number: '', proof_label: '', evidence_ids: [] });
  p.carousel = { slides: list, created_at: now(), meta: { edited: {} } }; p.format = 'carousel'; p.updated_at = now(); p.score = null;
  audit('carousel.derive', 'post', p.id, { slides: list.length }); app.save(); return p.carousel;
}
export function editSlide(app, p, i, field, value) { const s = p.carousel?.slides?.[i]; if (!s || s[field] === value) return; s[field] = value; p.carousel.meta.edited[`${i}.${field}`] = 'human'; p.updated_at = now(); app.save('Autosave'); }
export function removeSlide(app, p, i) { const L = p.carousel.slides; if (L.length <= 3 || L[i].role === 'cover' || L[i].role === 'closing') return; L.splice(i, 1); app.save(); }
export function addSlide(app, p, i) { const L = p.carousel.slides; if (L.length >= 10) return; L.splice(i + 1, 0, { role: 'point', kicker: 'PONTO', title: 'Novo slide', body: '', proof_number: '', proof_label: '', evidence_ids: [] }); app.save(); }
export function moveSlide(app, p, i, dir) { const L = p.carousel.slides; const j = i + dir; if (j <= 0 || j >= L.length - 1 || i <= 0 || i >= L.length - 1) return; [L[i], L[j]] = [L[j], L[i]]; app.save(); }
export async function renderCarouselSlide(app, p, i, canvas) { await ensureFonts(); const spec = await buildSpec(app, p); const s = p.carousel.slides[i]; const R = activeRules(); return renderSlide(canvas, { ...spec, slide: { ...s, index: i, total: p.carousel.slides.length }, cta: p.content_json.caption?.cta || '', tagline: R.newsletter.tagline }); }
export function carouselChecks(p, evidence) { const issues = []; const L = p.carousel?.slides || []; for (let i = 0; i < L.length; i++) { const d = deterministicChecks({ headline: L[i].title, body: L[i].body, proof_label: L[i].proof_label, proof_number: L[i].proof_number, evidence_ids: L[i].evidence_ids }, evidence, 'slide'); d.blockers.forEach(b => issues.push({ kind: 'Bloqueio', where: `slide ${i + 1}`, text: b.text })); d.warnings.forEach(w => issues.push({ kind: 'Alerta', where: `slide ${i + 1}`, text: w.text })); if (L[i].title.split(/\s+/).length > 12) issues.push({ kind: 'Alerta', where: `slide ${i + 1}`, text: 'Título com mais de 12 palavras.' }); } return issues; }
// Exporta todos os slides em ZIP (PNG numerados + legenda). ZIP "store" sem compressão, escrito à mão.
export async function exportCarousel(app, p) {
  const ed = app.edition(); const base = `radar-ed${String(ed.brief.number).padStart(2, '0')}-${p.angle}-carrossel`; const files = [];
  for (let i = 0; i < p.carousel.slides.length; i++) { const cv = document.createElement('canvas'); await renderCarouselSlide(app, p, i, cv); const blob = await canvasToBlob(cv); files.push({ name: `${base}/${String(i + 1).padStart(2, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) }); }
  files.push({ name: `${base}/legenda.txt`, data: new TextEncoder().encode(captionText(p)) });
  const zip = buildZip(files); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); a.download = `${base}.zip`; a.click();
  db.renders.push({ id: uid('render'), post_id: p.id, template_id: 'carousel', image_id: p.image_id, dimensions: `1080x1350 x${p.carousel.slides.length}`, created_at: now() });
  if (p.status === 'approved') p.status = 'exported'; ed.exports = ed.exports || {}; ed.exports.posts = now(); audit('carousel.export', 'post', p.id, { slides: p.carousel.slides.length }); app.save();
}
function crc32(u8) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < u8.length; n++) { c = (crc ^ u8[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function buildZip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) { const name = enc.encode(f.name); const crc = crc32(f.data); const head = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0)]); parts.push(head, name, f.data); central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name); offset += head.length + name.length + f.data.length; }
  const cdSize = central.reduce((s, c) => s + c.length, 0); const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of all) { out.set(a, o); o += a.length; } return out;
}
export async function runQA(app, p) {
  const evidence = app.evidence(p.edition_id); const R = activeRules(); const det = deterministicChecks(p.content_json, evidence, 'post');
  const G = db.editorial_guide || EDITORIAL_GUIDE_V1; const ga = G.angles[p.angle];
  const pr = fill(prompt('qa_audit'), { channel: `post social 1080x1350 (LinkedIn + Instagram) com legenda de 400 a 1.500 caracteres, ângulo ${ga.label} para ${ga.audience}. LINHA EDITORIAL: reprove (severity bloqueio) se ${G.quality_gate.join('; ')}. Voz: ${G.voice.traits.join('; ')}. CTA nunca: ${G.cta.avoid.join(' / ')}`, piece: JSON.stringify(p.content_json), evidence: evidenceText(evidence) });
  const ai = await textJSON({ system: prompt('editor_base'), prompt: pr, purpose: 'post.qa' });
  const canvas = document.createElement('canvas'); const { spec, meta } = await renderPost(app, p, canvas);
  const vis = visualChecks({ templateId: p.template_id, hasImage: !!spec.image, logoAssetOk: !!(spec.logoPrimary && spec.logoNegative), headline: p.content_json.headline, headlineFontPx: meta.headlineFontPx, portraitOk: !!spec.portrait, partner: spec.partner });
  const blockers = [...det.blockers, ...vis.issues.map(i => ({ code: i.code, where: 'render', text: i.text })), ...(ai.issues || []).filter(i => i.severity === 'bloqueio').map(i => ({ code: 'ai', where: i.where, text: i.text + (i.fix ? ` Correção: ${i.fix}` : '') }))];
  const { score, ready } = combineScore(ai.scores || {}, vis.score, blockers);
  p.score = score; p.qa_json = { deterministic: det, ai, visual: vis, blockers, ready, threshold: R.qa.threshold, at: now() }; p.updated_at = now();
  audit('post.qa', 'post', p.id, { score, blockers: blockers.length, ready }); app.save(); return p.qa_json;
}
export function approvePost(app, p) {
  const det = deterministicChecks(p.content_json, app.evidence(p.edition_id), 'post'); const blockers = [...det.blockers, ...(p.qa_json?.visual?.issues || []), ...((p.qa_json?.ai?.issues || []).filter(i => i.severity === 'bloqueio'))];
  if (blockers.length) throw new Error(`${blockers.length} bloqueio(s) impedem a aprovação deste post.`);
  p.status = 'approved'; p.approved_at = now(); audit('post.approve', 'post', p.id, { score: p.score }); const ed = app.edition();
  if (postsOf(ed.id).length === 3 && postsOf(ed.id).every(x => x.status === 'approved' || x.status === 'exported')) app.setStatus(ed, 'approved'); app.save();
}
export function captionText(p, lang = 'pt') { const c = contentFor(p, lang).caption || {}; return [c.hook, '', c.body, '', c.practical_takeaway, '', c.cta, '', (c.hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' ')].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim(); }
export async function exportPost(app, p, { png = true, copy = true, lang = 'pt' } = {}) {
  const ed = app.edition(); const base = `vendamais-radar-${ed.brief.number}-${p.angle}${lang === 'es' ? '-es' : ''}`;
  if (png) { const canvas = document.createElement('canvas'); await renderPost(app, p, canvas, lang); const blob = await canvasToBlob(canvas); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${base}-1080x1350.png`; a.click(); const rid = uid('render'); db.renders.push({ id: rid, post_id: p.id, template_id: p.template_id, image_id: p.image_id, dimensions: '1080x1350', created_at: now() }); }
  if (copy) download(`${base}-legenda.txt`, captionText(p, lang));
  if (p.status === 'approved') p.status = 'exported'; ed.exports = ed.exports || {}; ed.exports.posts = now(); if (postsOf(ed.id).every(x => x.status === 'exported') && ed.exports.newsletter) app.setStatus(ed, 'exported');
  audit('post.export', 'post', p.id, { png, copy }); app.save();
}

export async function generateAllImages(app, editionId, opts = {}) {
  const done = [], failed = [];
  for (const p of postsOf(editionId)) { if (p.image_id && !opts.force) continue; try { await generateImage(app, p, { prompt: p.content_json.image_prompt, provider: opts.provider, mode: opts.mode, references: [] }); done.push(p.angle); } catch (e) { failed.push(`${p.angle}: ${e.message}`); } }
  return { done, failed };
}
