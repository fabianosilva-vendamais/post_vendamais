// QA: bloqueios determinísticos + score ponderado (IA + checagens do sistema).
import { activeRules } from './store.js';

const NUM_RE = /(?<![\w.,])(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(%|por cento|mil|milh|bilh|clientes|projetos|empresas|diagn|vendedores|dias|anos|reais|R\$)?/gi;

function flatText(obj, path = '', out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') { out.push({ path, text: obj }); return out; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => flatText(v, `${path}[${i}]`, out)); return out; }
  if (typeof obj === 'object') { for (const k of Object.keys(obj)) { if (['evidence_ids', 'source_claims', 'claims', 'sources_used', 'url', 'image_prompt', 'template_id', 'angle', 'negative_space', 'hashtags'].includes(k)) continue; flatText(obj[k], path ? `${path}.${k}` : k, out); } }
  return out;
}
export function collectClaimIds(content) {
  const ids = new Set();
  const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); for (const k of Object.keys(o)) { if (k === 'evidence_ids' && Array.isArray(o[k])) o[k].forEach(i => ids.add(i)); if ((k === 'claims' || k === 'source_claims') && Array.isArray(o[k])) o[k].forEach(c => c?.evidence_id && ids.add(c.evidence_id)); if (k === 'evidence_id' && o[k]) ids.add(o[k]); walk(o[k]); } };
  walk(content); return ids;
}
// Retorna {blockers:[], warnings:[]} para newsletter ou post (content JSON) contra as evidências.
export function deterministicChecks(content, evidence = [], kind = 'newsletter', opts = {}) {
  const R = activeRules(); const blockers = [], warnings = []; const human = !!opts.humanText;
  const numSink = human ? warnings : blockers; // texto do editor: dado sem fonte é alerta para conferir, não bloqueio
  const evIds = new Set(evidence.map(e => e.id));
  const evText = evidence.map(e => e.text).join(' \n ').toLowerCase();
  const claimIds = collectClaimIds(content);
  const texts = flatText(content);
  const normNum = (n) => n.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const numbersInEvidence = new Set((evText.match(/\d+(?:[.,]\d+)*/g) || []).map(normNum));
  const UNIT = /^(%|por cento|mil\b|milh|bilh|pontos?|p\.p\.|clientes|projetos|empresas|equipes|diagn|vendedores|opera|reais|lojas|unidades|colaboradores|pessoas|leads|neg[óo]cios fechados)/i; // prazos ("30 dias", "24 horas") são instrução, não prova
  for (const { path, text } of texts) {
    // 1. Grafia da marca
    for (const bad of R.brand.forbidden_spellings) if (text.includes(bad)) blockers.push({ code: 'spelling', where: path, text: `Grafia "${bad}" encontrada. Use VendaMais.` });
    // 2. Superlativo sem evidência
    for (const s of R.voice.superlatives) { const m = new RegExp(`\\b${s}\\b`, 'i').exec(text); if (m) { const i = m.index; const window_ = text.slice(Math.max(0, i - 80), i + 120); if (!/\d/.test(window_)) numSink.push({ code: 'superlative', where: path, text: `Superlativo "${s}" sem número ao lado.` }); } }
    // 3. Linguagem de BU
    if (/\bBUs?\b|pela ótica d[ae]/i.test(text)) blockers.push({ code: 'bu', where: path, text: 'Linguagem de BU exposta ao leitor.' });
    // 4. Construções proibidas
    for (const c of R.voice.forbidden_constructions) if (!/^BU $|ótica/.test(c) && text.toLowerCase().includes(c.toLowerCase())) warnings.push({ code: 'construction', where: path, text: `Construção proibida: "${c}".` });
    // 5. Travessão
    if (/[—–]/.test(text)) warnings.push({ code: 'dash', where: path, text: 'Travessão encontrado. Use vírgula, ponto ou dois pontos.' });
    // 6. Vocabulário evitado
    for (const w of R.voice.avoid) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) warnings.push({ code: 'vocab', where: path, text: `Termo evitado pela marca: "${w}".` });
    // 7. Ponto final em título
    if (/(^|\.)(headline|title)$/.test(path) && /[.!]$/.test(text.trim())) warnings.push({ code: 'title_period', where: path, text: 'Título termina com ponto final.' });
    // 8. Números sem evidência
    const re = /(R\$\s*)?(\d+(?:[.,]\d+)*)\s*([%\p{L}.]*)/gu; let m;
    while ((m = re.exec(text))) {
      const raw = m[2]; const unit = m[3] || ''; const value = parseFloat(normNum(raw));
      const isData = !!m[1] || UNIT.test(unit) || /[,]/.test(raw) || /\.\d{3}\b/.test(raw) || value >= 100; // números estruturais (passos, "10 negócios", "30 dias") não são prova
      if (!isData) continue;
      if (/^(podcast|agenda)\./.test(path)) continue;
      if (!numbersInEvidence.has(normNum(raw))) numSink.push({ code: 'number_no_source', where: path, text: human ? `Dado "${raw}${unit ? ' ' + unit : ''}" sem fonte registrada: confirme a origem antes de enviar.` : `Dado numérico "${raw}${unit ? ' ' + unit : ''}" não consta nas evidências.` });
    }
  }
  // 9. Evidence ids inexistentes
  for (const id of claimIds) if (!evIds.has(id)) warnings.push({ code: 'bad_evidence', where: 'claims', text: `Referência ${id} não existe na análise de fontes.` });
  if (evidence.length && claimIds.size === 0 && kind !== 'slide' && !human) blockers.push({ code: 'no_claims', where: 'claims', text: 'Nenhuma afirmação rastreada a fonte (mapa claim -> source vazio).' });
  // 10. Regras de canal
  const h = content.headline || '';
  if (kind === 'post' || kind === 'slide') {
    if (h.split(/\s+/).length > R.voice.length.headline_words_max) warnings.push({ code: 'headline_long', where: 'headline', text: `Headline com mais de ${R.voice.length.headline_words_max} palavras compromete leitura em mobile.` });
    if (h.length > 90) blockers.push({ code: 'headline_mobile', where: 'headline', text: 'Headline longa demais para ficar legível no preview mobile.' });
  }
  if (kind === 'post') {
    const tags = content.caption?.hashtags || []; if (tags.length > R.voice.length.hashtags_max) blockers.push({ code: 'hashtags', where: 'caption.hashtags', text: `Mais de ${R.voice.length.hashtags_max} hashtags.` });
    const cap = [content.caption?.hook, content.caption?.body, content.caption?.practical_takeaway, content.caption?.cta].filter(Boolean).join('\n');
    if (cap && (cap.includes(h) && h.length > 20)) warnings.push({ code: 'caption_repeat', where: 'caption', text: 'Legenda repete a headline da arte.' });
    if (cap.length < R.voice.length.instagram_caption_chars[0]) warnings.push({ code: 'caption_short', where: 'caption', text: 'Legenda abaixo de 400 caracteres.' });
    if (cap.length > R.voice.length.linkedin_post_chars[1] + 300) warnings.push({ code: 'caption_long', where: 'caption', text: 'Legenda acima de 1.800 caracteres.' });
    if (/(com|incluindo|inclua|adicione|escreva|insira|contendo|with|include|including|add|write|containing|featuring)\s+(o\s+|a\s+|um\s+|uma\s+|the\s+|a\s+)?(texto|t[íi]tulo|logo|logotipo|letras|marca d'?[áa]gua|headline|text|title|logo|lettering|watermark|caption)/i.test(content.image_prompt || '')) blockers.push({ code: 'prompt_text', where: 'image_prompt', text: 'Prompt de imagem pede texto ou logo. A imagem-base não pode conter texto, logo ou marca.' });
  }
  if (kind === 'newsletter') {
    const words = flatText(content).map(t => t.text).join(' ').split(/\s+/).length;
    if (!content.practical_block?.steps?.length || !content.action?.steps?.length) blockers.push({ code: 'no_practical', where: 'practical_block', text: 'Falta bloco de aplicação prática (o que fazer / como fazer).' });
    if (!content.cta?.label) blockers.push({ code: 'no_cta', where: 'cta', text: 'CTA ausente.' });
    if (words < 350) warnings.push({ code: 'short', where: 'newsletter', text: `Newsletter com ${words} palavras, abaixo do mínimo.` });
    if (content.preheader && content.subject && content.preheader.trim() === content.subject.trim()) warnings.push({ code: 'preheader', where: 'preheader', text: 'Preheader repete o assunto.' });
  }
  return { blockers: dedupe(blockers), warnings: dedupe(warnings), wordCount: flatText(content).map(t => t.text).join(' ').split(/\s+/).filter(Boolean).length };
}
function dedupe(a) { const s = new Set(); return a.filter(x => { const k = x.code + x.where + x.text; if (s.has(k)) return false; s.add(k); return true; }); }

// Combina score IA (7 critérios) + visual (sistema) em 0-100 ponderado.
export function combineScore(aiScores = {}, visualScore = 100, blockers = []) {
  const R = activeRules(); let total = 0;
  for (const c of R.qa.criteria) { const v = c.id === 'visual' ? visualScore : (aiScores[c.id] ?? 0); total += (Math.max(0, Math.min(100, v)) * c.weight) / 100; }
  total = Math.round(total);
  return { score: total, ready: total >= R.qa.threshold && blockers.length === 0 };
}
// Checagens visuais do render (post): cores fora da paleta, logo oficial, contraste, headline legível.
export function visualChecks({ templateId, hasImage, logoAssetOk, headline, headlineFontPx, portraitOk, partner }) {
  const issues = []; let score = 100;
  if (!logoAssetOk) { issues.push({ code: 'logo', text: 'Logo oficial ausente no Brand Center.' }); score -= 40; }
  if (['T01', 'T02', 'T03'].includes(templateId) && !hasImage) { issues.push({ code: 'image', text: 'Template exige imagem-base.' }); score -= 30; }
  if (templateId === 'T05' && (!portraitOk || !partner)) { issues.push({ code: 'portrait', text: 'T05 exige retrato oficial e sócio assinante.' }); score -= 50; }
  if ((headline || '').length > 90 || headlineFontPx < 40) { issues.push({ code: 'legibility', text: 'Headline pequena demais para leitura em mobile.' }); score -= 25; }
  return { score: Math.max(0, score), issues };
}
