// Supabase: Auth (e-mail/senha), PostgREST (espelho das tabelas locais) e Storage. Sem SDK: fetch puro.
import { db, save, audit, blobs, now } from './store.js';
const WS = 'ws_vendamais';
const base = () => db.settings.supabase_url.replace(/\/$/, '');
const H = (extra = {}) => ({ apikey: db.settings.supabase_anon_key, Authorization: `Bearer ${db.session?.access_token || db.settings.supabase_anon_key}`, 'Content-Type': 'application/json', ...extra });
export const configured = () => !!(db.settings.supabase_url && db.settings.supabase_anon_key);
export const signedIn = () => !!db.session?.access_token;

export async function signIn(email, password) {
  const r = await fetch(`${base()}/auth/v1/token?grant_type=password`, { method: 'POST', headers: H(), body: JSON.stringify({ email, password }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error_description || d.msg || d.error || 'Falha no login');
  db.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 }; db.user = { id: d.user.id, email: d.user.email, name: d.user.user_metadata?.name || d.user.email };
  await loadRole(); audit('auth.signin', 'user', db.user.id, {}); save(); return db.user;
}
export async function signUp(email, password, name) {
  const r = await fetch(`${base()}/auth/v1/signup`, { method: 'POST', headers: H(), body: JSON.stringify({ email, password, data: { name } }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error_description || d.msg || 'Falha no cadastro');
  if (d.access_token) { db.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 }; db.user = { id: d.user.id, email, name }; await loadRole(); save(); return { user: db.user, confirmed: true }; }
  return { user: null, confirmed: false };
}
export async function refreshIfNeeded() {
  if (!db.session) return false; if (Date.now() < (db.session.expires_at || 0) - 60000) return true;
  const r = await fetch(`${base()}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: H(), body: JSON.stringify({ refresh_token: db.session.refresh_token }) });
  const d = await r.json(); if (!r.ok) { db.session = null; save(); return false; }
  db.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 }; save(); return true;
}
export function signOut() { audit('auth.signout', 'user', db.user?.id, {}); db.session = null; db.user = null; save(); }
async function loadRole() { try { const rows = await rest('users', 'GET', null, `?id=eq.${db.user.id}&select=role,name`); if (rows[0]) { db.user.role = rows[0].role; db.user.name = rows[0].name || db.user.name; } } catch (e) { /* trigger pode não ter rodado ainda */ } }

export async function rest(table, method = 'GET', body = null, query = '') {
  const r = await fetch(`${base()}/rest/v1/${table}${query}`, { method, headers: H(method === 'POST' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${table} ${method}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return method === 'GET' ? r.json() : true;
}
export async function upload(bucket, path, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const r = await fetch(`${base()}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { apikey: db.settings.supabase_anon_key, Authorization: `Bearer ${db.session.access_token}`, 'x-upsert': 'true', 'Content-Type': blob.type }, body: blob });
  if (!r.ok) throw new Error(`upload ${bucket}/${path}: ${r.status}`);
  return bucket === 'brand' ? `${base()}/storage/v1/object/public/${bucket}/${path}` : `storage://${bucket}/${path}`;
}
// Upload + URL pública de longa duração (1 ano) para redes/Metricool buscarem a arte.
export async function uploadPublic(bucket, path, dataUrl) {
  await upload(bucket, path, dataUrl);
  const r = await fetch(`${base()}/storage/v1/object/sign/${bucket}/${path}`, { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 365 }) });
  const d = await r.json(); if (!d.signedURL) throw new Error('Não foi possível gerar URL pública da arte.'); return `${base()}/storage/v1${d.signedURL}`;
}
async function signedUrl(storagePath) { const [, bucket, ...rest_] = storagePath.replace('storage://', '/').split('/'); const path = rest_.join('/'); const r = await fetch(`${base()}/storage/v1/object/sign/${bucket}/${path}`, { method: 'POST', headers: H(), body: JSON.stringify({ expiresIn: 3600 }) }); const d = await r.json(); return d.signedURL ? `${base()}/storage/v1${d.signedURL}` : null; }

const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] === undefined ? null : o[k]])); // todas as linhas com as mesmas chaves (PGRST102)
// Envia o estado local para o Supabase (upsert por id). Binários locais sobem para o Storage.
export async function pushAll() {
  if (!signedIn()) throw new Error('Faça login para sincronizar.'); await refreshIfNeeded();
  // Binários nunca vão para o Postgres: blob:/data: sobem para o Storage e a tabela guarda só a URL.
  for (const a of db.brand_assets) {
    if (a.file_url?.startsWith('blob:')) { const data = await blobs.get(a.id); if (data) { const ext = (data.match(/^data:image\/(\w+)/) || [])[1] || 'png'; a.file_url = await upload('brand', `${a.type}/${a.id}.${ext}`, data); } }
    else if (a.file_url?.startsWith('data:')) { const data = a.file_url; await blobs.put(a.id, data); const ext = (data.match(/^data:image\/(\w+)/) || [])[1] || 'png'; a.file_url = await upload('brand', `${a.type}/${a.id}.${ext}`, data); }
  }
  for (const i of db.generated_images) if (!i.file_url || i.file_url.startsWith('data:')) { const data = i.file_url?.startsWith('data:') ? i.file_url : await blobs.get(i.id); if (data) { await blobs.put(i.id, data); i.file_url = await upload('images', `${i.post_id}/${i.id}.png`, data); } }
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'string' && v.startsWith('data:') && v.length > 2000) ? '' : v));
  const clean = (rows) => rows.map(strip);
  await rest('brand_assets', 'POST', clean(db.brand_assets.map(a => ({ ...pick(a, ['id', 'type', 'label', 'partner_id', 'file_url', 'version', 'active', 'metadata']), workspace_id: WS }))));
  await rest('brand_rules', 'POST', db.brand_rules.map(r => ({ ...pick(r, ['id', 'version', 'rules_json', 'approved_by', 'approved_at', 'active']), workspace_id: WS })));
  if (db.editions.length) await rest('editions', 'POST', db.editions.map(e => ({ ...pick(e, ['id', 'title', 'theme', 'audience', 'objective', 'status', 'edition_date', 'brief', 'exports', 'created_at', 'updated_at']), workspace_id: WS })));
  if (db.sources.length) await rest('sources', 'POST', db.sources.map(s => pick(s, ['id', 'edition_id', 'type', 'name', 'url', 'file_name', 'primary', 'extracted_text', 'hash', 'created_at'])));
  if (db.analyses.length) await rest('analyses', 'POST', db.analyses.map(a => pick(a, ['id', 'edition_id', 'summary', 'facts', 'risks', 'angles', 'provider', 'created_at'])));
  if (db.newsletter_versions.length) await rest('newsletter_versions', 'POST', db.newsletter_versions.map(v => pick(v, ['id', 'edition_id', 'n', 'content_json', 'meta', 'html', 'plain', 'score', 'qa_json', 'is_approved', 'origin', 'note', 'provider', 'approved_at', 'created_at'])));
  if (db.posts.length) await rest('posts', 'POST', clean(db.posts.map(p => ({ ...pick(p, ['id', 'edition_id', 'angle', 'content_json', 'template_id', 'image_id', 'crop', 'partner_id', 'status', 'score', 'qa_json', 'origin', 'meta', 'approved_at', 'created_at', 'updated_at']), versions: (p.versions || []).slice(-5) }))));
  if (db.generated_images.length) await rest('generated_images', 'POST', clean(db.generated_images.map(i => pick(i, ['id', 'post_id', 'edition_id', 'source', 'provider', 'model', 'mode', 'prompt', 'file_url', 'cost_meta', 'ms', 'created_at']))));
  if ((db.publications || []).length) await rest('publications', 'POST', db.publications.map(x => pick(x, ['id', 'post_id', 'edition_id', 'provider', 'networks', 'date_time', 'timezone', 'draft', 'media_urls', 'remote', 'status', 'created_at'])));
  if (db.renders.length) await rest('renders', 'POST', db.renders.map(r => pick(r, ['id', 'post_id', 'template_id', 'image_id', 'image_url', 'render_url', 'dimensions', 'created_at'])));
  await rest('prompt_templates', 'POST', db.prompt_templates.map(p => ({ ...pick(p, ['id', 'name', 'version', 'prompt_text', 'active', 'custom']), workspace_id: WS })));
  if (db.audit_log.length) await rest('audit_log', 'POST', db.audit_log.slice(0, 500).map(l => ({ ...pick(l, ['id', 'user_id', 'user_name', 'action', 'entity', 'entity_id', 'metadata', 'created_at']), workspace_id: WS })));
  if (db.user?.role === 'admin') await rest('settings', 'POST', [{ workspace_id: WS, settings_json: { ...db.settings, supabase_anon_key: undefined, supabase_url: undefined, knowledge: db.knowledge || null, editorial_guide: db.editorial_guide || null }, updated_at: now() }]);
  db.last_sync = now(); save(); return db.last_sync;
}
// Traz do Supabase e mescla por id (registro remoto mais novo vence).
export async function pullAll() {
  if (!signedIn()) throw new Error('Faça login para sincronizar.'); await refreshIfNeeded();
  const merge = async (table, key, query = '') => { const rows = await rest(table, 'GET', null, `?select=*${query}`); const local = db[key]; for (const r of rows) { const i = local.findIndex(x => x.id === r.id); if (i < 0) local.push(r); else if ((r.updated_at || r.created_at || '') > (local[i].updated_at || local[i].created_at || '')) local[i] = { ...local[i], ...r }; } };
  await merge('brand_assets', 'brand_assets'); await merge('brand_rules', 'brand_rules'); await merge('editions', 'editions'); await merge('sources', 'sources'); await merge('analyses', 'analyses');
  await merge('newsletter_versions', 'newsletter_versions'); await merge('posts', 'posts'); await merge('generated_images', 'generated_images'); await merge('renders', 'renders'); db.publications = db.publications || []; await merge('publications', 'publications'); await merge('prompt_templates', 'prompt_templates');
  for (const i of db.generated_images) if (i.file_url?.startsWith('storage://') && !(await blobs.get(i.id))) { const u = await signedUrl(i.file_url); if (u) { try { const b = await (await fetch(u)).blob(); const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); await blobs.put(i.id, dataUrl); } catch (e) { console.warn('pull image', i.id, e); } } }
  db.last_sync = now(); save(); return db.last_sync;
}
