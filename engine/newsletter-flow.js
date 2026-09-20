// Fluxo da newsletter: geração, regeneração local de bloco, QA, aprovação, exportação.
import { db, uid, now, audit, activeRules, assetByType } from './store.js';
import { textJSON } from './providers.js';
import { fill } from './prompts.js';
import { deterministicChecks, combineScore } from './qa.js';
import { renderEmail, renderPlainText } from './newsletter-render.js';

const LENGTH_WORDS = { short: 550, standard: 950, deep: 1500 };
export const BLOCK_LABELS = { subject: 'Assunto do e-mail', preheader: 'Preheader', headline: 'Headline principal', intro: 'Abertura', practical_block: 'Ferramenta da semana', interpretation: 'Como interpretar', action: 'Como agir', common_error: 'Erro comum', meeting_questions: 'Leve para a próxima reunião', question_of_week: 'Pergunta da semana', closing: 'Fechamento', cta: 'CTA', podcast: 'Podcast VendaMais', agenda: 'Agenda VendaMais' };

export const qaOpts = (v) => ({ humanText: v?.meta?.mode === 'ready' || v?.origin === 'human' });
export function versionsOf(editionId) { return db.newsletter_versions.filter(v => v.edition_id === editionId).sort((a, b) => a.n - b.n); }
export function current(editionId) { const vs = versionsOf(editionId); return vs[vs.length - 1] || null; }
export function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setPath(obj, path, value) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = value; }

function briefingText(ed, evidence) {
  const b = ed.brief; const R = activeRules();
  return `Tema central: ${b.theme}. Objetivo: ${b.objective}. Público principal: ${b.audience}. Tom: ${b.tone}. ${b.cta ? `CTA desejado: "${b.cta}" (${b.cta_type}${b.cta_url ? ', ' + b.cta_url : ''}).` : `CTA: sugira um CTA do tipo ${b.cta_type}, proporcional ao conteúdo.`} ${b.angle_hint ? `Ângulo escolhido: ${b.angle_hint}. Tese: ${b.angle_thesis}.` : ''} ${b.notes ? `Notas do editor: ${b.notes}.` : ''} Newsletter: ${R.newsletter.name}, slogan "${R.newsletter.tagline}", edição ${b.number}.`;
}
function evidenceText(evidence) { return evidence.length ? evidence.map(e => `${e.id} [${e.kind}, força ${e.strength}${e.source_id === 'kb_vendamais' ? ', conhecimento institucional VendaMais' : ''}] ${e.text}`).join('\n') : '(nenhuma evidência estruturada; não invente números, cases ou clientes)'; }

// Regras de escrita aplicadas de forma determinística: sem travessão, sem ponto final em título.
export function sanitize(obj, isTitleKey = (k) => /^(headline|title|subject|label)$/.test(k)) {
  if (typeof obj === 'string') return obj.replace(/\s*\[(?:K-[\w-]+|E\d+)\](?:\s*\[(?:K-[\w-]+|E\d+)\])*/g, '').replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/\s+,/g, ',').replace(/\s+\./g, '.').trim();
  if (Array.isArray(obj)) return obj.map(x => sanitize(x, isTitleKey));
  if (obj && typeof obj === 'object') { for (const k of Object.keys(obj)) { if (k === 'url' || k === 'image_prompt') continue; obj[k] = sanitize(obj[k], isTitleKey); if (typeof obj[k] === 'string' && isTitleKey(k) && k !== 'subject') obj[k] = obj[k].replace(/[.]+$/, ''); } }
  return obj;
}
export function normalize(content, ed) {
  const R = activeRules(); const b = ed.brief; const c = sanitize(content || {});
  c.sections = Array.isArray(c.sections) ? c.sections : [];
  c.sections.forEach(s => { s.label = (s.label || 'CONTEXTO').toUpperCase(); s.evidence_ids = s.evidence_ids || []; });
  c.practical_block = { label: 'FERRAMENTA DA SEMANA', title: '', intro: '', steps: [], ...(c.practical_block || {}) };
  c.interpretation = { label: 'COMO INTERPRETAR', title: '', items: [], ...(c.interpretation || {}) };
  c.action = { label: 'COMO AGIR', title: '', steps: [], ...(c.action || {}) };
  c.common_error = { label: 'ERRO COMUM', title: '', body: '', ...(c.common_error || {}) };
  c.meeting_questions = { label: 'LEVE PARA A PRÓXIMA REUNIÃO', title: '', questions: [], ...(c.meeting_questions || {}) };
  c.question_of_week = { label: 'PERGUNTA DA SEMANA', text: '', ...(c.question_of_week || {}) };
  c.cta = { label: '', url: '', type: b.cta_type || 'conversa', ...(c.cta || {}) };
  if (b.cta) c.cta.label = b.cta; if (b.cta_url) c.cta.url = b.cta_url; if (b.cta_type) c.cta.type = b.cta_type;
  c.podcast = { enabled: false, title: '', description: '', spotify_url: '', youtube_url: '', cover_url: '', ...(c.podcast || {}) };
  if (c.podcast.url && !c.podcast.spotify_url && !c.podcast.youtube_url) { if (/youtu/.test(c.podcast.url)) c.podcast.youtube_url = c.podcast.url; else c.podcast.spotify_url = c.podcast.url; }
  if (b.podcast_title) { c.podcast.title = c.podcast.title || b.podcast_title; c.podcast.enabled = true; }
  if (b.podcast_spotify) c.podcast.spotify_url = c.podcast.spotify_url || b.podcast_spotify; if (b.podcast_youtube) c.podcast.youtube_url = c.podcast.youtube_url || b.podcast_youtube; if (b.podcast_url && !c.podcast.spotify_url && !c.podcast.youtube_url) { if (/youtu/.test(b.podcast_url)) c.podcast.youtube_url = b.podcast_url; else c.podcast.spotify_url = b.podcast_url; }
  c.events = { enabled: false, label: 'Convite VendaMais', title: '', text: '', image_url: '', url: '', cta: 'Quero participar', ...(c.events || {}) };
  if (b.event_title || b.event_text) { c.events.enabled = true; c.events.title = c.events.title || b.event_title || ''; c.events.text = c.events.text || b.event_text || ''; c.events.url = c.events.url || b.event_url || ''; c.events.image_url = c.events.image_url || b.event_image_url || ''; }
  delete c.agenda;
  c.claims = c.claims || []; c.sources_used = c.sources_used || [];
  ['subject', 'preheader', 'headline', 'intro', 'closing'].forEach(k => { if (typeof c[k] !== 'string') c[k] = c[k] ? String(c[k]) : ''; });
  c.headline = c.headline.replace(/[.]+$/, '');
  return c;
}
function lockedText(prev) {
  if (!prev?.meta?.locks) return ''; const paths = Object.keys(prev.meta.locks).filter(p => prev.meta.locks[p]); if (!paths.length) return '';
  return `BLOCOS FIXADOS PELO EDITOR (repita exatamente, sem alterar):\n${paths.map(p => `${p}: ${JSON.stringify(getPath(prev.content_json, p))}`).join('\n')}`;
}
function prompt(id) { return db.prompt_templates.find(p => p.id === id && p.active)?.prompt_text || ''; }

// Modo "texto pronto": o editor traz a newsletter escrita; a IA só estrutura em blocos, sem reescrever.
async function structureReady(app, ed, evidence, prev) {
  const R = activeRules();
  // Limpeza determinística: remove cabeçalho/slogan/rodapé que o template já imprime.
  const junk = [new RegExp('^\\s*' + R.newsletter.name.replace(/\s+/g, '\\s*') + '\\s*([•·|-].*)?$', 'i'), new RegExp('^\\s*' + R.newsletter.tagline + '\\s*$', 'i'), /^\s*edi[çc][aã]o\s*(piloto|n?º?\s*\d+).*$/i, /^\s*(cancelar inscri[çc][aã]o|unsubscribe|newsletter semanal).*$/i];
  const text = (ed.brief.ready_text || '').split('\n').filter(l => !junk.some(rx => rx.test(l))).join('\n').trim();
  if (text.split(/\s+/).length < 80) throw new Error('Cole o texto completo da newsletter (mínimo 80 palavras) no campo "Texto pronto".');
  const out = await textJSON({ system: 'Você organiza texto em JSON sem alterar as palavras do autor. Retorne apenas JSON válido; dentro das strings use aspas simples para citações.', prompt: fill(prompt('newsletter_structure'), { text }), purpose: 'newsletter.structure', maxTokens: 9000 });
  const content = normalize(out, ed);
  const isJunk = (s) => !s || new RegExp('^' + R.newsletter.name.replace(/\s+/g, '\\s*') + '$', 'i').test(s.trim()) || s.trim().toLowerCase() === R.newsletter.tagline.toLowerCase();
  if (isJunk(content.headline)) { const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 20 && l.length < 140) || ''; content.headline = firstLine.replace(/[.]+$/, ''); }
  if (isJunk(content.intro)) content.intro = '';
  if (!content.cta?.label) content.cta = { label: ed.brief.cta || 'Fale com a VendaMais', url: ed.brief.cta_url || 'https://vendamais.com.br/contato-2/', type: ed.brief.cta_type || 'conversa' };
  const stripNum = (s = '') => String(s).replace(/^\s*\d+\s*[.)-]\s*/, '');
  ['practical_block.steps', 'action.steps', 'interpretation.items'].forEach(k => { const arr = getPath(content, k); if (Array.isArray(arr)) arr.forEach(it => { it.title = stripNum(it.title); }); });
  // Seções que o template já cobre em blocos próprios (podcast, agenda, rodapé) ou que duplicam interpretação
  const interpTitle = (content.interpretation?.title || '').trim().toLowerCase();
  content.sections = (content.sections || []).filter(s => { const t = (s.title || '').toLowerCase(), l = (s.label || '').toLowerCase(); if (/podcast|agenda|cancelar|newsletter semanal/.test(t + ' ' + l)) return false; if (interpTitle && t === interpTitle && content.interpretation.items?.length) return false; return (s.body || '').trim().length > 0 || (s.title || '').trim().length > 0; });
  // Fechamento: se veio vazio e a última seção é curta e conclusiva, promove
  if (!content.closing && content.sections.length && (content.sections[content.sections.length - 1].body || '').split(/\s+/).length < 60 && !content.sections[content.sections.length - 1].evidence_ids?.length) { const last = content.sections.pop(); content.closing = [last.title, last.body].filter(Boolean).join('\n\n'); }
  content.intro = content.intro.split('\n').filter(l => !isJunk(l)).join('\n').trim();
  const v = { id: uid('nlv'), edition_id: ed.id, n: (prev?.n || 0) + 1, content_json: content, meta: { locks: {}, edited: {}, mode: 'ready' }, origin: 'human', score: null, qa_json: null, is_approved: false, created_at: now(), provider: db.settings.text_provider, note: 'Texto do editor, estruturado pelo sistema' };
  const det = deterministicChecks(content, evidence, 'newsletter', qaOpts(v)); v.qa_json = { deterministic: det };
  db.newsletter_versions.push(v); app.setStatus(ed, 'newsletter_generated'); audit('newsletter.structure', 'newsletter_version', v.id, { n: v.n, words: det.wordCount }); app.save(); return v;
}
export async function generate(app) {
  const ed = app.edition(); const evidence = app.evidence(ed.id); const prev = current(ed.id);
  if (ed.brief.mode === 'ready') return structureReady(app, ed, evidence, prev);
  const p = fill(prompt('newsletter_generate'), { length_words: LENGTH_WORDS[ed.brief.length] || 950, briefing: briefingText(ed, evidence), evidence: evidenceText(evidence), locked: lockedText(prev) });
  // Geração em duas etapas (mesmo schema): parte 1 = tese e desenvolvimento; parte 2 = aplicação e fechamento, com a parte 1 como contexto. Respostas menores = menos timeout e JSON mais confiável.
  const part1 = await textJSON({ system: prompt('editor_base'), prompt: p + '\n\nETAPA 1 DE 2: retorne SOMENTE estas chaves do JSON: subject, preheader, headline, intro, sections, practical_block, sources_used, claims.', purpose: 'newsletter.generate.1', maxTokens: 6000 });
  const part2 = await textJSON({ system: prompt('editor_base'), prompt: p + `\n\nETAPA 2 DE 2: a etapa 1 já produziu (não repita, mantenha coerência):\n${JSON.stringify({ headline: part1.headline, intro: part1.intro, sections: part1.sections, practical_block: part1.practical_block }).slice(0, 9000)}\nRetorne SOMENTE estas chaves do JSON: interpretation, action, common_error, meeting_questions, question_of_week, closing, cta, claims.`, purpose: 'newsletter.generate.2', maxTokens: 6000 });
  const out = { ...part1, ...part2, claims: [...(part1.claims || []), ...(part2.claims || [])], sources_used: part1.sources_used || [] };
  const content = normalize(out, ed);
  if (prev?.meta?.locks) for (const path of Object.keys(prev.meta.locks)) if (prev.meta.locks[path]) setPath(content, path, JSON.parse(JSON.stringify(getPath(prev.content_json, path))));
  const v = { id: uid('nlv'), edition_id: ed.id, n: (prev?.n || 0) + 1, content_json: content, meta: { locks: { ...(prev?.meta?.locks || {}) }, edited: {} }, origin: 'ai', score: null, qa_json: null, is_approved: false, created_at: now(), provider: db.settings.text_provider };
  const det = deterministicChecks(content, evidence, 'newsletter', qaOpts(v)); v.qa_json = { deterministic: det };
  db.newsletter_versions.push(v); app.setStatus(ed, 'newsletter_generated'); audit('newsletter.generate', 'newsletter_version', v.id, { n: v.n, words: det.wordCount, blockers: det.blockers.length });
  app.save(); return v;
}
export async function rewriteBlock(app, path, instruction, { keepReview = false } = {}) {
  const ed = app.edition(); const v = current(ed.id); const evidence = app.evidence(ed.id);
  if (v.meta.locks?.[path]) throw new Error('Bloco fixado. Desafixe para regenerar.');
  const block = getPath(v.content_json, path);
  const ctx = JSON.parse(JSON.stringify(v.content_json)); setPath(ctx, path, '[BLOCO EM REESCRITA]');
  const p = fill(prompt('block_rewrite'), { instruction: instruction || 'melhore clareza, prova e utilidade prática, mantendo o sentido', block_path: path, block_json: JSON.stringify(block), context: JSON.stringify(ctx).slice(0, 12000), evidence: evidenceText(evidence) });
  let out = await textJSON({ system: prompt('editor_base'), prompt: p, purpose: `newsletter.rewrite:${path}` });
  if (typeof block === 'string') out = typeof out === 'string' ? out : (out.value ?? out[path.split('.').pop()] ?? out.text ?? out.body ?? JSON.stringify(out));
  else if (out && typeof out === 'object' && !Array.isArray(block) && out.value && typeof out.value === 'object') out = out.value;
  snapshot(app, v); setPath(v.content_json, path, sanitize(out)); v.meta.edited[path] = 'ai'; v.qa_json = { ...(v.qa_json || {}), deterministic: deterministicChecks(v.content_json, evidence, 'newsletter', qaOpts(v)), ...(keepReview ? {} : { ai: null }) }; if (!keepReview) v.score = null;
  ed.updated_at = now(); audit('newsletter.rewrite_block', 'newsletter_version', v.id, { path, instruction }); app.save(); return out;
}
export function snapshot(app, v) { app.pushUndo(JSON.stringify(v.content_json)); }
export function edit(app, path, value) {
  const ed = app.edition(); const v = current(ed.id); if (!v) return; if (JSON.stringify(getPath(v.content_json, path)) === JSON.stringify(value)) return;
  snapshot(app, v); setPath(v.content_json, path, value); v.meta.edited[path] = 'human'; v.score = null;
  if (path.startsWith('podcast.')) v.content_json.podcast.enabled = !!(v.content_json.podcast.title || '').trim();
  if (path.startsWith('events.')) v.content_json.events.enabled = !!((v.content_json.events.title || '').trim() || (v.content_json.events.text || '').trim()); v.qa_json = { ...(v.qa_json || {}), deterministic: deterministicChecks(v.content_json, app.evidence(ed.id), 'newsletter', qaOpts(v)), ai: null }; ed.updated_at = now(); app.save('Autosave');
}
export function toggleLock(app, path) { const v = current(app.edition().id); v.meta.locks = v.meta.locks || {}; v.meta.locks[path] = !v.meta.locks[path]; audit(v.meta.locks[path] ? 'newsletter.lock' : 'newsletter.unlock', 'newsletter_version', v.id, { path }); app.save(); }
export function saveAsVersion(app, note = 'Versão salva manualmente') { const ed = app.edition(); const v = current(ed.id); const nv = { ...JSON.parse(JSON.stringify(v)), id: uid('nlv'), n: v.n + 1, origin: 'human', is_approved: false, created_at: now(), note }; db.newsletter_versions.push(nv); audit('newsletter.version.save', 'newsletter_version', nv.id, { n: nv.n, note }); app.save(); return nv; }
export function restoreVersion(app, versionId) { const ed = app.edition(); const src = db.newsletter_versions.find(v => v.id === versionId); if (!src) return; const nv = { ...JSON.parse(JSON.stringify(src)), id: uid('nlv'), n: current(ed.id).n + 1, origin: 'restore', is_approved: false, created_at: now(), note: `Restaurada da v${src.n}` }; db.newsletter_versions.push(nv); audit('newsletter.version.restore', 'newsletter_version', nv.id, { from: src.n }); app.save(); }

export async function runQA(app) {
  const ed = app.edition(); const v = current(ed.id); const evidence = app.evidence(ed.id); const R = activeRules();
  const det = deterministicChecks(v.content_json, evidence, 'newsletter', qaOpts(v));
  const human = qaOpts(v).humanText;
  const p = fill(prompt('qa_audit'), { channel: 'newsletter por e-mail, 700 a 1.200 palavras, nível A institucional' + (human ? '. ATENÇÃO: este texto foi escrito pelo editor humano da VendaMais, não pela IA. Números de instrução (30 minutos, 90 dias, 10 negócios, 20% melhores) são parâmetros do método, não afirmações de prova: NÃO os marque como bloqueio. Só use severidade "bloqueio" para grafia errada da marca, superlativo sem prova, promessa sem base ou linguagem de BU. Voz em imperativo direto ao leitor é aceitável no bloco prático. Escreva "where" em português simples (ex.: "Ferramenta da semana, passo 2"), nunca em nomes de campo, e "text"/"fix" sem códigos de evidência: cite a prova pelo nome (ex.: "mais de 2.500 clientes atendidos").' : ''), piece: JSON.stringify(v.content_json).slice(0, 20000), evidence: evidenceText(evidence) });
  const ai = await textJSON({ system: prompt('editor_base'), prompt: p, purpose: 'newsletter.qa' });
  const visual = 100; // e-mail: template determinístico; logo oficial verificado no export
  const blockers = [...det.blockers, ...(ai.issues || []).filter(i => i.severity === 'bloqueio').map(i => ({ code: 'ai', where: i.where, text: i.text + (i.fix ? ` Correção: ${i.fix}` : '') }))];
  const { score, ready } = combineScore(ai.scores || {}, visual, blockers);
  v.score = score; v.qa_json = { deterministic: det, ai, blockers, ready, threshold: R.qa.threshold, at: now() };
  audit('newsletter.qa', 'newsletter_version', v.id, { score, blockers: blockers.length, ready }); app.save(); return v.qa_json;
}
export function approve(app) {
  const ed = app.edition(); const v = current(ed.id); const det = deterministicChecks(v.content_json, app.evidence(ed.id), 'newsletter', qaOpts(v));
  const blockers = [...det.blockers, ...((v.qa_json?.ai?.issues || []).filter(i => i.severity === 'bloqueio'))];
  if (blockers.length) throw new Error(`${blockers.length} bloqueio(s) impedem a aprovação. Resolva-os na Revisão VendaMais.`);
  db.newsletter_versions.filter(x => x.edition_id === ed.id).forEach(x => x.is_approved = false); v.is_approved = true; v.approved_at = now();
  const rendered = renderOutputs(ed, v, app); v.html = rendered.html; v.plain = rendered.text;
  app.setStatus(ed, 'newsletter_approved'); audit('newsletter.approve', 'newsletter_version', v.id, { n: v.n, score: v.score }); app.save();
}
export function unapprove(app) { const ed = app.edition(); db.newsletter_versions.filter(x => x.edition_id === ed.id).forEach(x => x.is_approved = false); ed.status = 'newsletter_generated'; audit('newsletter.unapprove', 'edition', ed.id, {}); app.save(); }

export function logoUrls(app) {
  const abs = (a) => { if (!a) return ''; const u = app.assetUrl(a); return u.startsWith('data:') || u.startsWith('http') ? u : new URL(u, document.baseURI).href; };
  return { logoUrl: abs(assetByType('logo_primary')), logoNegUrl: abs(assetByType('logo_negative')) };
}
export function renderOutputs(ed, v, app) {
  const R = activeRules(); const urls = app ? logoUrls(app) : { logoUrl: '', logoNegUrl: '' };
  const opts = { ...urls, editionNumber: ed.brief.number, editionDate: ed.edition_date ? new Date(ed.edition_date + 'T12:00:00').toLocaleDateString('pt-BR') : '', name: R.newsletter.name, tagline: R.newsletter.tagline };
  return { html: renderEmail(v.content_json, opts), text: renderPlainText(v.content_json, opts), preview: renderEmail(v.content_json, { ...opts, previewOnly: true }) };
}
export function download(name, content, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

// Aplica uma correção do revisor: reescreve só o bloco indicado seguindo a instrução, marca como aplicada e recalcula o QA determinístico.
export async function applyFix(app, issueIdx) {
  const ed = app.edition(); const v = current(ed.id); const issue = v.qa_json?.ai?.issues?.[issueIdx]; if (!issue) throw new Error('Correção não encontrada.');
  const path = resolvePath(v.content_json, issue.path || issue.where); if (!path) throw new Error('Não identifiquei o bloco desta correção. Aplique manualmente no editor.');
  if (v.meta.locks?.[path]) throw new Error('Bloco fixado. Desafixe para aplicar.');
  const instruction = `Aplique exatamente esta correção do revisor, alterando o mínimo necessário e preservando o restante do texto e o estilo do autor. NUNCA escreva códigos de evidência como [K-P1] ou [E3] no texto: cite a prova em linguagem natural (ex.: 'mais de 2.500 clientes atendidos'). Correção: ${issue.fix || issue.text}`;
  await rewriteBlock(app, path, instruction, { keepReview: true });
  const cur = current(ed.id); cur.qa_json = cur.qa_json || {}; cur.qa_json.applied = cur.qa_json.applied || {}; cur.qa_json.applied[issueIdx] = { at: now(), path };
  audit('newsletter.apply_fix', 'newsletter_version', cur.id, { path, category: issue.category }); app.save(); return path;
}
export async function applyAllFixes(app) {
  const ed = app.edition(); const v = current(ed.id); const issues = v.qa_json?.ai?.issues || []; const done = [], failed = [];
  for (let i = 0; i < issues.length; i++) { if (v.qa_json?.applied?.[i]) continue; try { done.push(await applyFix(app, i)); } catch (e) { failed.push(`${issues[i].where}: ${e.message}`); } }
  return { done, failed };
}
// Resolve o caminho informado pela IA (ou um "where" humano) para um caminho real do JSON.
export function resolvePath(content, hint = '') {
  if (!hint) return null; let h = String(hint).trim().replace(/\[(\d+)\]/g, '.$1');
  if (getPath(content, h) !== undefined) return h;
  const low = h.toLowerCase();
  const map = [[/assunto|subject/, 'subject'], [/preheader/, 'preheader'], [/headline|t[ií]tulo principal/, 'headline'], [/abertura|intro/, 'intro'], [/fechamento|closing|conclus/, 'closing'], [/cta/, 'cta.label'], [/pergunta da semana|question_of_week/, 'question_of_week.text'], [/erro comum|common_error/, 'common_error.body'], [/podcast/, 'podcast.title']];
  for (const [rx, path] of map) if (rx.test(low) && getPath(content, path) !== undefined) return path;
  const num = (low.match(/passo\s*(\d+)|item\s*(\d+)|se[çc][aã]o\s*(\d+)|pergunta\s*(\d+)/) || []).slice(1).find(Boolean);
  if (/ferramenta|diagn[oó]stico|practical/.test(low)) { if (num) return `practical_block.steps.${num - 1}.text`; return 'practical_block.intro'; }
  if (/como agir|action/.test(low)) return num ? `action.steps.${num - 1}.text` : 'action.title';
  if (/interpretar|interpretation/.test(low)) return num ? `interpretation.items.${num - 1}.text` : 'interpretation.title';
  if (/reuni[aã]o|meeting/.test(low)) return num ? `meeting_questions.questions.${num - 1}` : 'meeting_questions.title';
  if (/se[çc][aã]o|section/.test(low)) return `sections.${(num || 1) - 1}.body`;
  // busca por título de passo/seção citado no where
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9à-ú ]/g, '').trim();
  for (const [k, arrPath] of [['practical_block.steps', 'text'], ['action.steps', 'text'], ['interpretation.items', 'text']]) { const arr = getPath(content, k) || []; const j = arr.findIndex(it => it.title && norm(low).includes(norm(it.title))); if (j >= 0) return `${k}.${j}.${arrPath}`; }
  const secs = content.sections || []; const j = secs.findIndex(s => s.title && norm(low).includes(norm(s.title))); if (j >= 0) return `sections.${j}.body`;
  return null;
}
