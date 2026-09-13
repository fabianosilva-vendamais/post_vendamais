// Persistência: localStorage para registros (espelho do schema Supabase) + IndexedDB para binários.
// Quando Supabase estiver configurado, supabase.js sincroniza as mesmas tabelas.
import { BRAND_RULES_V1, DEFAULT_ASSETS } from './brand-rules.js';
const KEY = 'vm_content_engine_db_v1';
export const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const now = () => new Date().toISOString();

function empty() {
  return {
    workspace: { id: 'ws_vendamais', name: 'VendaMais', brand_rules_version: 1, created_at: now() },
    user: null,
    brand_assets: DEFAULT_ASSETS.map(a => ({ ...a })),
    brand_rules: [{ id: 'br_v1', version: 1, rules_json: BRAND_RULES_V1, approved_by: 'implantação', approved_at: now(), active: true }],
    editions: [], sources: [], analyses: [], newsletter_versions: [], posts: [], generated_images: [], renders: [], publications: [], prompt_templates: [], audit_log: [],
    settings: {
      text_provider: 'openai', text_model: 'gpt-5', builtin_model: 'claude-sonnet-4-5',
      image_provider_default: 'gemini', image_mode: 'standard',
      image_models: { gemini: { economy: 'gemini-3.1-flash-image', standard: 'gemini-3.1-flash-image', premium: 'gemini-3-pro-image' }, openai: { economy: 'gpt-image-2.5', standard: 'gpt-image-2.5', premium: 'gpt-image-2.5' } },
      qa_threshold: 85, supabase_url: '', supabase_anon_key: '', metricool_blog_id: '', metricool_brand_name: '', timezone: 'America/Sao_Paulo', default_length: 'standard', default_tone: 'analítico', default_cta_type: 'conversa'
    }
  };
}
export let db = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); const e = empty(); return { ...e, ...d, settings: { ...e.settings, ...(d.settings || {}) } }; } } catch (e) { console.warn('store load', e); }
  return empty();
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error('store save', e); } }
export function reset() { db = empty(); save(); }
export function audit(action, entity, entity_id, metadata = {}) {
  db.audit_log.unshift({ id: uid('log'), user_id: db.user?.id || 'local', user_name: db.user?.name || 'Usuário local', action, entity, entity_id, metadata, created_at: now() });
  if (db.audit_log.length > 2000) db.audit_log.length = 2000;
}
export function activeRules() { return (db.brand_rules.find(r => r.active) || db.brand_rules[0]).rules_json; }
export function assetByType(type) { return db.brand_assets.find(a => a.type === type && a.active); }

// IndexedDB para imagens-base, renders e uploads
const IDB = 'vm_content_engine_blobs';
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export const blobs = {
  async put(id, data) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(data, id); t.oncomplete = () => res(id); t.onerror = () => rej(t.error); }); },
  async get(id) { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction('blobs').objectStore('blobs').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
  async del(id) { const d = await idb(); return new Promise((res) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').delete(id); t.oncomplete = () => res(); }); }
};
export function sha256(text) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')); }
export const STATUS = ['draft', 'newsletter_generated', 'newsletter_approved', 'posts_generated', 'approved', 'exported'];
export const STATUS_LABEL = { draft: 'Draft', newsletter_generated: 'Newsletter gerada', newsletter_approved: 'Newsletter aprovada', posts_generated: 'Posts gerados', approved: 'Aprovado', exported: 'Exportado' };
