// Publisher Adapter: agenda publicação dos posts aprovados via Metricool (Edge Function publish-schedule).
// Regra: só post aprovado entra na fila. Sem publicação sem aprovação humana.
import { db, uid, now, audit, blobs } from './store.js?vmvhcom96';
import { supabaseConfigured, ConfigError, functionsBase, functionsConfigured } from './providers.js?vmvhcom96';
import { renderPost, renderCarouselSlide, captionText } from './posts-flow.js?vmvhcom96';
import { canvasToBlob } from './social-render.js?vmvhcom96';
import * as SB from './supabase.js?vmvhcom96';

export const NETWORKS = [{ id: 'linkedin', label: 'LinkedIn' }, { id: 'instagram', label: 'Instagram' }];
export const BRANDS = [{ lang: 'pt', key: 'metricool_blog_id', nameKey: 'metricool_brand_name', label: 'VendaMais (Brasil, PT)' }, { lang: 'es', key: 'metricool_blog_id_es', nameKey: 'metricool_brand_name_es', label: 'VendaMais LATAM (ES)' }];
export const blogIdFor = (lang) => lang === 'es' ? (db.settings.metricool_blog_id_es || '') : (db.settings.metricool_blog_id || '');
export function status() {
  const s = db.settings; const ok = supabaseConfigured() && !!s.metricool_blog_id;
  return { ok, label: 'Metricool', hint: !supabaseConfigured() ? 'Requer Supabase + Edge Function publish-schedule com METRICOOL_USER_TOKEN e METRICOOL_USER_ID nos secrets.' : !s.metricool_blog_id ? 'Escolha a marca (blogId) em Configurações → Publicação.' : `Marca ${s.metricool_brand_name || s.metricool_blog_id} · fuso ${s.timezone || 'America/Sao_Paulo'}` };
}
async function edge(body) {
  if (!functionsConfigured()) throw new ConfigError('Supabase não configurado', 'Informe URL e anon key em Configurações e publique a Edge Function publish-schedule com METRICOOL_USER_TOKEN e METRICOOL_USER_ID.');
  const url = `${functionsBase()}/publish-schedule`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: db.settings.supabase_anon_key, Authorization: `Bearer ${db.session?.access_token || db.settings.supabase_anon_key}` }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || `publish-schedule ${r.status}`); return d;
}
export async function listBrands() { const d = await edge({ action: 'brands' }); return (Array.isArray(d.brands) ? d.brands : d.brands?.data || []).map(b => ({ blogId: b.blogId ?? b.id, label: b.label || b.title || b.name || String(b.blogId), timezone: b.timezone })); }
export async function bestTimes(network, start, end) { return edge({ action: 'best_time', blogId: db.settings.metricool_blog_id, network, start, end, timezone: db.settings.timezone || 'America/Sao_Paulo' }); }
export async function listScheduled(start, end) { return edge({ action: 'list', blogId: db.settings.metricool_blog_id, start, end, timezone: db.settings.timezone || 'America/Sao_Paulo' }); }

// Renderiza as artes finais, sobe para o Storage (bucket renders, URL pública assinada longa) e agenda no Metricool.
export async function schedule(app, p, { networks, dateTime, draft = false, firstComment = '', lang = 'pt' }) {
  if (p.status !== 'approved' && p.status !== 'exported') throw new Error('Só posts aprovados podem ser agendados.');
  if (!SB.signedIn()) throw new Error('Faça login no Supabase para publicar (as artes precisam de URL pública).');
  if (!networks?.length) throw new Error('Escolha ao menos uma rede.');
  if (!blogIdFor(lang)) throw new Error(lang === 'es' ? 'Marca VendaMais LATAM não escolhida em Configurações → Publicação.' : 'Marca VendaMais não escolhida em Configurações → Publicação.');
  if (lang === 'es' && !p.content_es) throw new Error('Este post ainda não tem versão em espanhol.');
  if (!dateTime || new Date(dateTime) < new Date()) throw new Error('Escolha data e hora futuras.');
  const ed = app.edition(); const base = `ed${String(ed.brief.number).padStart(2, '0')}/${p.angle}/${Date.now()}`;
  const urls = [];
  const up = async (canvas, name) => { const blob = await canvasToBlob(canvas); const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); return SB.uploadPublic('renders', `${base}/${name}.png`, dataUrl); };
  const isCar = p.format === 'carousel' && p.carousel?.slides?.length;
  if (isCar) { for (let i = 0; i < p.carousel.slides.length; i++) { const cv = document.createElement('canvas'); await renderCarouselSlide(app, p, i, cv, lang); urls.push(await up(cv, String(i + 1).padStart(2, '0'))); } }
  else { const cv = document.createElement('canvas'); await renderPost(app, p, cv, lang); urls.push(await up(cv, 'post')); }
  const text = captionText(p, lang);
  const res = await edge({ action: 'schedule', blogId: blogIdFor(lang), text, mediaUrls: urls, networks, dateTime, timezone: db.settings.timezone || 'America/Sao_Paulo', draft, firstComment, altText: p.content_json.headline, linkedinDocumentTitle: isCar && networks.includes('linkedin') ? p.content_json.headline : '', instagramType: 'POST' });
  const rec = { id: uid('pub'), post_id: p.id, edition_id: p.edition_id, provider: 'metricool', lang, networks, date_time: dateTime, timezone: db.settings.timezone || 'America/Sao_Paulo', draft, media_urls: urls, remote: res.result, status: draft ? 'draft' : 'scheduled', created_at: now() };
  db.publications = db.publications || []; db.publications.push(rec); p.publication_id = rec.id; p.status = 'exported'; ed.exports = ed.exports || {}; ed.exports.posts = now();
  audit('publish.schedule', 'post', p.id, { networks, dateTime, draft, slides: urls.length }); app.save(); return rec;
}
export function publicationsOf(postId) { return (db.publications || []).filter(x => x.post_id === postId).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
export async function cancel(app, pub) { const id = pub.remote?.id || pub.remote?.data?.id; if (id) await edge({ action: 'delete', blogId: blogIdFor(pub.lang || 'pt'), postId: id }); pub.status = 'cancelled'; audit('publish.cancel', 'publication', pub.id, {}); app.save(); }

// Calendário: quarta, sexta e segunda (após a newsletter de terça). O editor escolhe qual post vai em cada dia; meme só se incluído.
// PT na marca VendaMais às 09:00 (padrão); ES na marca LATAM uma hora depois.
export const SLOTS = [{ id: 'wed', label: 'Quarta', dow: 3 }, { id: 'fri', label: 'Sexta', dow: 5 }, { id: 'mon', label: 'Segunda', dow: 8 }, { id: 'sat', label: 'Sábado (meme)', dow: 5.5 }];
export function slotDate(ed, slot) { const base = new Date((ed.edition_date || new Date().toISOString().slice(0, 10)) + 'T12:00:00'); const monday = new Date(base); monday.setDate(base.getDate() - ((base.getDay() + 6) % 7)); const d = new Date(monday); d.setDate(monday.getDate() + Math.floor(slot.dow) - 1 + (slot.dow % 1 ? 1 : 0)); return d.toISOString().slice(0, 10); }
export function defaultAssignment(ed, posts) { const order = ['consulting', 'training', 'business']; const slots = ['wed', 'fri', 'mon']; const out = {}; order.forEach((a, i) => { const p = posts.find(x => x.angle === a); if (p) out[slots[i]] = p.id; }); const m = posts.find(x => x.angle === 'meme'); if (m && (ed.meme_included ?? false)) out.sat = m.id; return ed.schedule_assignment ? { ...out, ...ed.schedule_assignment } : out; }
export function weekPlan(ed, posts, assignment = defaultAssignment(ed, posts), times = ed.schedule_times || {}) {
  const rows = [];
  for (const slot of SLOTS) { const pid = assignment[slot.id]; if (!pid) continue; const p = posts.find(x => x.id === pid); if (!p) continue; const date = (times[slot.id + '_date']) || slotDate(ed, slot);
    for (const lang of ['pt', 'es']) { const ready = (p.status === 'approved' || p.status === 'exported') && (lang === 'pt' || !!p.content_es); const already = (db.publications || []).some(x => x.post_id === p.id && (x.lang || 'pt') === lang && x.status !== 'cancelled'); rows.push({ slot: slot.id, slotLabel: slot.label, postId: p.id, angle: p.angle, lang, date, time: times[slot.id + '_' + lang] || (lang === 'pt' ? (slot.id === 'sat' ? '11:00' : '09:00') : (slot.id === 'sat' ? '12:00' : '10:00')), networks: ['linkedin', 'instagram'], ready, already, blocker: !ready ? (p.status !== 'approved' && p.status !== 'exported' ? 'post não aprovado' : 'sem versão ES') : already ? 'já agendado' : '' }); } }
  return rows;
}
export async function scheduleWeek(app, rows, { draft = false, onRow } = {}) {
  const out = []; for (const r of rows) { if (!r.include || !r.ready || r.already) continue; const p = db.posts.find(x => x.id === r.postId); try { const rec = await schedule(app, p, { networks: r.networks, dateTime: `${r.date}T${r.time}:00`, draft, lang: r.lang }); out.push({ ...r, ok: true, id: rec.id }); } catch (e) { out.push({ ...r, ok: false, error: e.message }); } onRow?.(r, out[out.length - 1]); }
  audit('publish.week', 'edition', app.edition()?.id, { ok: out.filter(x => x.ok).length, failed: out.filter(x => !x.ok).length }); return out;
}
