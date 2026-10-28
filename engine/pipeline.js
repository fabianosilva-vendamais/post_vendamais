// Pipeline "Artigo → Edição completa": uma ação cria a edição, estrutura a newsletter (Markdown, sem IA), roda a revisão,
// aprova se não houver bloqueio, escreve os 3 posts + meme com a voz editorial, escolhe formato, gera carrossel quando for o caso,
// adapta para espanhol e gera as imagens-base. Cada etapa reporta progresso e falhas isoladas não param as seguintes.
import { db, uid, now, audit, nextEditionNumber } from './store.js?vmvhcom96';
import { deterministicChecks } from './qa.js?vmvhcom96';
import * as NL from './newsletter-flow.js?vmvhcom96';
import * as PF from './posts-flow.js?vmvhcom96';
import * as ES from './posts-es.js?vmvhcom96';
import { imageProviderStatus } from './providers.js?vmvhcom96';

export const STEPS = [
  { id: 'edition', label: 'Criar edição' }, { id: 'newsletter', label: 'Montar newsletter a partir do texto' }, { id: 'qa', label: 'Revisão VendaMais da newsletter' }, { id: 'approve', label: 'Aprovar newsletter (fonte-mãe)' },
  { id: 'post_training', label: 'Post Treinamento' }, { id: 'post_consulting', label: 'Post Consultoria' }, { id: 'post_business', label: 'Post Negócio' }, { id: 'meme', label: 'Meme da Semana' },
  { id: 'carousel', label: 'Carrossel (quando a ideia pedir)' }, { id: 'es', label: 'Versões em espanhol (normalmente geradas na aprovação de cada post)' }, { id: 'images', label: 'Imagens-base' }, { id: 'sync', label: 'Sincronizar com o Supabase' } ];

export function nextTuesday(from = new Date()) { const d = new Date(from); d.setHours(12, 0, 0, 0); const day = d.getDay(); const add = ((2 - day + 7) % 7) || 7; d.setDate(d.getDate() + add); return d.toISOString().slice(0, 10); }

export async function run(app, { text, number, date, podcast = {}, ctaUrl, withImages = true, withEs = false, withMeme = false, postsText = '', onStep }) {
  const report = []; const step = (id, status, note = '') => { report.push({ id, status, note }); onStep?.(id, status, note, report); };
  const guard = async (id, fn) => { step(id, 'running'); try { const r = await fn(); step(id, 'done', typeof r === 'string' ? r : ''); return r; } catch (e) { console.error('pipeline', id, e); step(id, 'error', e.message); return null; } };
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length; if (words < 80) throw new Error('Cole o artigo completo (mínimo 80 palavras).');
  const n = Number(number) || nextEditionNumber(); const edDate = date || nextTuesday();
  // 1. edição
  const ed = await guard('edition', async () => {
    const firstH1 = (text.match(/^#\s+(?!\**\s*(radar|vendamais))(.+)$/im) || [])[2] || (text.split('\n').map(l => l.trim()).find(l => l.length > 20 && l.length < 140) || `Newsletter ${n}`);
    const theme = firstH1.replace(/\*/g, '').trim();
    const e = { id: uid('ed'), status: 'draft', created_at: now(), updated_at: now(), title: `Newsletter ${n} · ${theme}`, theme, audience: 'Gestor comercial', objective: 'Educar', edition_date: edDate,
      brief: { mode: 'ready', ready_text: text, theme, title: `Newsletter ${n} · ${theme}`, objective: 'Educar', audience: 'Gestor comercial', tone: 'provocativo', length: 'standard', edition_date: edDate, number: n, cta: 'Vamos conversar?', cta_type: 'conversa', cta_url: ctaUrl || db.settings.default_cta_url || '', notes: '', podcast_title: podcast.title || '', podcast_url: podcast.youtube_url || '', agenda_enabled: false } };
    db.editions.unshift(e); db.settings.last_edition_number = Math.max(db.settings.last_edition_number || 0, n); audit('pipeline.edition', 'edition', e.id, { number: n }); app._editionId = e.id; app.setState({ editionId: e.id }); app.save(); return e; });
  if (!ed) return report;
  // 2. newsletter
  const v = await guard('newsletter', async () => { const v = await NL.generate(app); if (podcast.title || podcast.youtube_url || podcast.spotify_url) { v.content_json.podcast = { ...(v.content_json.podcast || {}), enabled: true, title: podcast.title || '', description: podcast.description || '', youtube_url: podcast.youtube_url || '', spotify_url: podcast.spotify_url || '' }; } if (ctaUrl) v.content_json.cta = { ...(v.content_json.cta || {}), url: ctaUrl }; app.save(); return v; });
  if (!v) return report;
  // 3. QA + 4. aprovação
  let approved = false;
  await guard('qa', async () => { const q = await NL.runQA(app); const cur = NL.current(ed.id); return `nota ${cur.score}${q.blockers?.length ? `, ${q.blockers.length} bloqueio(s)` : ''}`; });
  await guard('approve', async () => { const cur = NL.current(ed.id); const det = deterministicChecks(cur.content_json, app.evidence(ed.id), 'newsletter', NL.qaOpts(cur)); if (det.blockers.length) throw new Error(`${det.blockers.length} bloqueio(s): ${det.blockers.map(b => b.text).join(' | ')}. Corrija no Editor da Newsletter e aprove; depois use "Gerar os posts".`); NL.approve(app); approved = true; return 'aprovada'; });
  if (!approved) return report;
  // 5-8. posts: colados pelo editor (sem IA) ou escritos pela IA
  const pasted = postsText && postsText.trim() ? parsePostsText(postsText) : null;
  if (pasted) { for (const a of PF.ANGLES) await guard(`post_${a}`, async () => { const c = pasted[a]; if (!c) throw new Error('não encontrado no texto colado (use o título "## TREINAMENTO", "## CONSULTORIA" ou "## NEGÓCIO")'); applyPasted(app, ed, a, c); return c.headline; }); if (withMeme || pasted.meme) await guard('meme', async () => { const m = PF.createMeme(app, ed.id); if (pasted.meme) applyPasted(app, ed, 'meme', pasted.meme, m); ed.meme_included = true; return m.content_json.headline || 'criado'; }); }
  else { for (const a of PF.ANGLES) await guard(`post_${a}`, async () => { await PF.deriveOne(app, a); const p = PF.post(ed.id, a); return p?.content_json?.headline || ''; }); if (withMeme) await guard('meme', async () => { const m = PF.createMeme(app, ed.id); if (!m.content_json.headline && PF.deriveMeme) await PF.deriveMeme(app, m); ed.meme_included = true; return m.content_json.headline || 'criado (preencha a frase)'; }); }
  // 9. carrossel: a IA marcou format = 'carousel' em no máximo um post; se nenhum, o de maior sequência (consultoria) fica único.
  await guard('carousel', async () => { const posts = PF.ANGLES.map(a => PF.post(ed.id, a)).filter(Boolean); let car = posts.filter(p => p.format === 'carousel'); if (car.length > 1) { car.slice(1).forEach(p => { p.format = 'single'; }); car = [car[0]]; } for (const p of car) if (!p.carousel?.slides?.length) await PF.deriveCarousel(app, p, 7); app.save(); return car.length ? `carrossel: ${car[0].angle}` : 'nenhum post pediu carrossel'; });
  // 10. espanhol
  if (withEs) await guard('es', async () => { const thesis = NL.current(ed.id)?.content_json?.thesis || ''; let k = 0; for (const p of PF.postsOf(ed.id)) { if (!p.content_json?.headline) continue; await ES.adaptToSpanish(app, p, thesis); if (p.format === 'carousel' && p.carousel?.slides?.length) await ES.adaptCarouselToSpanish(app, p); k++; } return `${k} post(s)`; });
  // 11. imagens
  if (withImages) await guard('images', async () => { const st = imageProviderStatus(); if (!st.ok) throw new Error(`geração de imagem não configurada (${st.hint})`); let k = 0, fails = []; for (const p of PF.postsOf(ed.id)) { if (p.angle === 'meme' || !p.content_json?.image_prompt) continue; try { await PF.generateImage(app, p, { prompt: p.content_json.image_prompt, provider: db.settings.image_provider_default, mode: db.settings.image_mode }); k++; } catch (e) { fails.push(`${p.angle}: ${e.message}`); } } return `${k} imagem(ns)${fails.length ? `; falhou: ${fails.join(' | ')}` : ''}`; });
  // 12. sync
  await guard('sync', async () => { if (!app.M.supabase?.signedIn()) return 'sem login: dados ficam neste navegador'; await app.M.supabase.pushAll(); return 'sincronizado'; });
  audit('pipeline.run', 'edition', ed.id, { steps: report.filter(r => r.status === 'done').length, errors: report.filter(r => r.status === 'error').map(r => r.id) });
  return report;
}

// Texto colado dos posts, no formato entregue pelo editor:
// ## TREINAMENTO · Carrossel | ## CONSULTORIA · Post único | ## NEGÓCIO | ## MEME
// Linhas "- Campo: valor" (Kicker, Headline/Título, Linha de apoio/Apoio, Número de prova, Legenda, Gancho, Corpo, Ponto aplicável, CTA, Hashtags, Prompt da imagem)
// Carrossel: "**Slide N · Papel** (fundo)" seguido de "- Título:", "- Texto:", "- Kicker:", "- CTA:".
export function parsePostsText(txt) {
  const out = {}; const secs = String(txt).replace(/\r/g, '').split(/^##\s+/m).slice(1);
  const key = (s) => s.toLowerCase().replace(/[*_]/g, '').trim();
  const field = (k) => ({ kicker: 'kicker', headline: 'headline', 'título': 'headline', titulo: 'headline', 'linha de apoio': 'support_line', apoio: 'support_line', 'número de prova': 'proof_number', 'numero de prova': 'proof_number', complemento: 'proof_label', gancho: 'hook', corpo: 'body', 'ponto aplicável': 'practical_takeaway', 'ponto aplicavel': 'practical_takeaway', cta: 'cta', hashtags: 'hashtags', legenda: 'caption_single', 'prompt da imagem': 'image_prompt', prompt: 'image_prompt', texto: 'body', 'conceito visual': 'visual_concept' })[k] || null;
  for (const sec of secs) {
    const head = sec.split('\n')[0]; const hk = key(head); const angle = /trein/.test(hk) ? 'training' : /consult/.test(hk) ? 'consulting' : /neg[óo]cio|vendamais/.test(hk) ? 'business' : /meme/.test(hk) ? 'meme' : null; if (!angle) continue;
    const c = { angle, format: /carrossel/.test(hk) ? 'carousel' : 'single', caption: { hashtags: [] }, slides: [] }; let cur = null; let slide = null;
    for (const raw of sec.split('\n').slice(1)) { const l = raw.trim(); if (!l) continue;
      const sm = l.match(/^\**\s*slide\s*(\d+)\s*[·\-:]\s*([^*(]+)\**\s*(?:\(([^)]+)\))?(?:.*?kicker:\s*(.+))?$/i); if (sm) { const role = /capa/i.test(sm[2]) ? 'cover' : /fecha/i.test(sm[2]) ? 'closing' : /prova/i.test(sm[2]) ? 'proof' : /a[çc][aã]o/i.test(sm[2]) ? 'action' : 'point'; const st = (sm[3] || '').toLowerCase(); slide = { role, kicker: '', title: '', body: '', proof_number: '', proof_label: '', cta: '', style: /navy/.test(st) ? 'navy' : /areia/.test(st) ? 'sand' : /branco/.test(st) ? 'white' : /foto/.test(st) ? 'photo' : undefined }; if (sm[4]) slide.kicker = sm[4].replace(/\*/g, '').trim(); c.slides.push(slide); cur = null; continue; }
      const fm = l.match(/^[-•*]\s*([^:]{2,30}):\s*(.*)$/); if (fm) { const f = field(key(fm[1])); const v = fm[2].replace(/^[`"“]|[`"”]$/g, '').trim(); if (slide && (f === 'headline' || f === 'body' || f === 'kicker' || f === 'cta' || f === 'support_line' || f === 'proof_number' || f === 'proof_label')) { slide[f === 'headline' ? 'title' : f === 'support_line' ? 'body' : f] = v; cur = null; continue; } if (!f) continue; if (f === 'hashtags') c.caption.hashtags = v.split(/[,\s#]+/).filter(Boolean); else if (['hook', 'body', 'practical_takeaway', 'cta'].includes(f)) { c.caption[f] = v; cur = ['caption', f]; } else if (f === 'caption_single') { cur = null; } else { c[f] = v; cur = [f]; } continue; }
      if (/^\**legenda\**$/i.test(l)) { slide = null; continue; }
      if (cur) { if (cur[0] === 'caption') c.caption[cur[1]] += '\n' + l; else c[cur[0]] += '\n' + l; }
    }
    c.headline = (c.headline || c.slides[0]?.title || '').replace(/[.]+$/, ''); c.support_line = c.support_line || c.slides[0]?.body || ''; if (c.slides.length && !c.slides.find(s => s.role === 'closing')?.cta && c.caption.cta) { const cl = c.slides.find(s => s.role === 'closing'); if (cl) cl.cta = cl.cta || ''; }
    out[angle] = c;
  }
  return Object.keys(out).length ? out : null;
}
function applyPasted(app, ed, angle, c, existing) {
  const p = existing || PF.post(ed.id, angle) || (() => { const np = { id: uid('post'), edition_id: ed.id, angle, content_json: {}, template_id: { training: 'T01', consulting: 'T06', business: 'T03', meme: 'T07' }[angle], image_id: null, crop: { scale: 1, x: 0.5, y: 0.5 }, partner_id: null, format: 'single', status: 'draft', score: null, qa_json: null, origin: 'human', meta: { locks: {}, edited: {} }, versions: [], created_at: now(), updated_at: now() }; db.posts.push(np); return np; })();
  const R = app.M.store.activeRules();
  p.content_json = { angle, thesis: c.thesis || '', headline: c.headline, support_line: c.support_line || '', proof_number: c.proof_number || '', proof_label: c.proof_label || '', visual_concept: c.visual_concept || '', image_prompt: c.image_prompt || '', negative_space: 'bottom', template_id: p.template_id, kicker: c.kicker ?? (R.angles[angle]?.kicker || ''), caption: { hook: (c.caption.hook || '').trim(), body: (c.caption.body || '').trim(), practical_takeaway: (c.caption.practical_takeaway || '').trim(), cta: (c.caption.cta || '').trim(), hashtags: (c.caption.hashtags || []).slice(0, 5) }, source_claims: [] };
  p.origin = 'human'; p.status = 'draft'; p.score = null; p.qa_json = null; p.updated_at = now(); delete p.content_es; delete p.carousel_es; p.meta.edited = { headline: 'human', format: 'human' };
  if (c.format === 'carousel' && c.slides.length) { p.format = 'carousel'; p.carousel = { slides: c.slides.map((s, i) => ({ ...s, index: i })), meta: { edited: {} }, at: now() }; } else { p.format = 'single'; delete p.carousel; }
  if (angle === 'meme') { p.template_id = 'T07'; p.meme_layout = p.meme_layout || 'bottom'; }
  audit('pipeline.post_pasted', 'post', p.id, { angle, format: p.format }); app.save(); return p;
}
