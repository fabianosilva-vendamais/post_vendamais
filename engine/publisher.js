// Publisher Adapter: agenda publicação dos posts aprovados via Metricool (Edge Function publish-schedule).
// Regra: só post aprovado entra na fila. Sem publicação sem aprovação humana.
import { db, uid, now, audit, blobs } from './store.js';
import { supabaseConfigured, ConfigError, functionsBase, functionsConfigured } from './providers.js';
import { renderPost, renderCarouselSlide, captionText } from './posts-flow.js';
import { canvasToBlob } from './social-render.js';
import * as SB from './supabase.js';

export const NETWORKS = [{ id: 'linkedin', label: 'LinkedIn' }, { id: 'instagram', label: 'Instagram' }];
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
export async function schedule(app, p, { networks, dateTime, draft = false, firstComment = '' }) {
  if (p.status !== 'approved' && p.status !== 'exported') throw new Error('Só posts aprovados podem ser agendados.');
  if (!SB.signedIn()) throw new Error('Faça login no Supabase para publicar (as artes precisam de URL pública).');
  if (!networks?.length) throw new Error('Escolha ao menos uma rede.');
  if (!dateTime || new Date(dateTime) < new Date()) throw new Error('Escolha data e hora futuras.');
  const ed = app.edition(); const base = `ed${String(ed.brief.number).padStart(2, '0')}/${p.angle}/${Date.now()}`;
  const urls = [];
  const up = async (canvas, name) => { const blob = await canvasToBlob(canvas); const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); return SB.uploadPublic('renders', `${base}/${name}.png`, dataUrl); };
  const isCar = p.format === 'carousel' && p.carousel?.slides?.length;
  if (isCar) { for (let i = 0; i < p.carousel.slides.length; i++) { const cv = document.createElement('canvas'); await renderCarouselSlide(app, p, i, cv); urls.push(await up(cv, String(i + 1).padStart(2, '0'))); } }
  else { const cv = document.createElement('canvas'); await renderPost(app, p, cv); urls.push(await up(cv, 'post')); }
  const text = captionText(p);
  const res = await edge({ action: 'schedule', blogId: db.settings.metricool_blog_id, text, mediaUrls: urls, networks, dateTime, timezone: db.settings.timezone || 'America/Sao_Paulo', draft, firstComment, altText: p.content_json.headline, linkedinDocumentTitle: isCar && networks.includes('linkedin') ? p.content_json.headline : '', instagramType: 'POST' });
  const rec = { id: uid('pub'), post_id: p.id, edition_id: p.edition_id, provider: 'metricool', networks, date_time: dateTime, timezone: db.settings.timezone || 'America/Sao_Paulo', draft, media_urls: urls, remote: res.result, status: draft ? 'draft' : 'scheduled', created_at: now() };
  db.publications = db.publications || []; db.publications.push(rec); p.publication_id = rec.id; p.status = 'exported'; ed.exports = ed.exports || {}; ed.exports.posts = now();
  audit('publish.schedule', 'post', p.id, { networks, dateTime, draft, slides: urls.length }); app.save(); return rec;
}
export function publicationsOf(postId) { return (db.publications || []).filter(x => x.post_id === postId).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
export async function cancel(app, pub) { const id = pub.remote?.id || pub.remote?.data?.id; if (id) await edge({ action: 'delete', blogId: db.settings.metricool_blog_id, postId: id }); pub.status = 'cancelled'; audit('publish.cancel', 'publication', pub.id, {}); app.save(); }
