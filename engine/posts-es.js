// Adaptação dos posts para espanhol (Paraguai e América Latina). Não é tradução literal: parte do sentido do PT aprovado.
import { db, now, audit } from './store.js';
import { textJSON } from './providers.js';
import { sanitize } from './newsletter-flow.js';

const PROMPT = `Você é um redator comercial nativo de espanhol rioplatense/paraguaio, com experiência B2B na América Latina. Recebe um post da VendaMais aprovado em português e cria a versão em espanhol.
Regras: não traduza palavra por palavra; recrie a partir do sentido e da intenção. Preserve a tese central e o objetivo comercial. Espanhol profissional e natural, compreensível no Paraguai, Uruguai, Argentina e demais países da região. Adapte expressões brasileiras; remova referências que não façam sentido localmente. Nada de portunhol. Tom executivo, provocativo e próximo. Sem travessão. Título sem ponto final. Até 5 hashtags em espanhol (mantenha #VendaMais). O CTA convida a conversar com a VendaMais.
Tese da edição: {{thesis}}
Post aprovado (PT): {{post}}
Retorne JSON com as mesmas chaves: {"kicker":string,"headline":string,"support_line":string,"proof_number":string,"proof_label":string,"thesis":string,"visual_concept":string,"caption":{"hook":string,"body":string,"practical_takeaway":string,"cta":string,"hashtags":[string]}}`;

export async function adaptToSpanish(app, p, thesis = '') {
  const c = p.content_json;
  const src = { kicker: c.kicker, headline: c.headline, support_line: c.support_line, proof_number: c.proof_number, proof_label: c.proof_label, thesis: c.thesis, visual_concept: c.visual_concept, caption: c.caption };
  const out = await textJSON({ system: 'Retorne apenas JSON válido; dentro das strings use aspas simples para citações.', prompt: PROMPT.replace('{{thesis}}', thesis).replace('{{post}}', JSON.stringify(src)), purpose: `post.es:${p.angle}` });
  const es = sanitize({ ...c, ...out, angle: p.angle, caption: { ...(c.caption || {}), ...(out.caption || {}), hashtags: (out.caption?.hashtags || []).map(h => String(h).replace(/^#/, '')).slice(0, 5) } });
  es.headline = String(es.headline || '').replace(/[.]+$/, '');
  p.content_es_versions = p.content_es_versions || []; if (p.content_es) p.content_es_versions.push({ content: p.content_es, at: now() });
  p.content_es = es; p.es_status = 'pending_validation'; p.updated_at = now();
  audit('post.es.generate', 'post', p.id, {}); app.save(); return es;
}
export function editSpanish(app, p, path, value) { if (!p.content_es) return; const ks = path.split('.'); let o = p.content_es; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {}; if (JSON.stringify(o[ks[ks.length - 1]]) === JSON.stringify(value)) return; o[ks[ks.length - 1]] = value; p.es_edited = { ...(p.es_edited || {}), [path]: 'human' }; p.updated_at = now(); app.save('Autosave'); }
export function setSpanishStatus(app, p, status) { p.es_status = status; p.updated_at = now(); audit('post.es.status', 'post', p.id, { status }); app.save(); }
export const ES_STATUS = { pending_validation: 'Aguardando validação (Valcir)', validated: 'Validada', rejected: 'Reprovada' };

const CAR_PROMPT = `Você é um redator comercial nativo de espanhol rioplatense/paraguaio, B2B, América Latina. Adapte este carrossel da VendaMais (aprovado em português) para espanhol. Não traduza palavra por palavra: recrie a partir do sentido, preservando a tese, a ordem e o papel de cada slide. Espanhol profissional, natural, compreensível no Paraguai, Uruguai, Argentina e região. Sem portunhol, sem travessão. Títulos sem ponto final e até 10 palavras; textos de apoio até 40 palavras. Mantenha os números de prova exatamente iguais.
Carrossel (PT): {{slides}}
Retorne JSON: {"slides":[{"kicker":string,"title":string,"body":string,"proof_number":string,"proof_label":string,"cta":string}]} com a mesma quantidade e ordem de slides.`;
export async function adaptCarouselToSpanish(app, p) {
  const L = p.carousel?.slides || []; if (!L.length) return null;
  const src = L.map(s => ({ role: s.role, kicker: s.kicker, title: s.title, body: s.body, proof_number: s.proof_number, proof_label: s.proof_label, cta: s.cta }));
  const out = await textJSON({ system: 'Retorne apenas JSON válido; dentro das strings use aspas simples para citações.', prompt: CAR_PROMPT.replace('{{slides}}', JSON.stringify(src)), purpose: 'carousel.es' });
  const list = Array.isArray(out.slides) ? out.slides : [];
  const slides = L.map((s, i) => { const o = list[i] || {}; const c = sanitize({ kicker: o.kicker ?? s.kicker, title: o.title ?? s.title, body: o.body ?? s.body, proof_label: o.proof_label ?? s.proof_label, cta: o.cta ?? s.cta }); return { ...s, ...c, title: String(c.title || '').replace(/[.]+$/, ''), proof_number: s.proof_number }; });
  p.carousel_es = { slides, at: now() }; p.updated_at = now(); audit('carousel.es.generate', 'post', p.id, { slides: slides.length }); app.save(); return p.carousel_es;
}
export function editSpanishSlide(app, p, i, field, value) { const s = p.carousel_es?.slides?.[i]; if (!s || JSON.stringify(s[field]) === JSON.stringify(value)) return; s[field] = value; p.updated_at = now(); app.save('Autosave'); }
