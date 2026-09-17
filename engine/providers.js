// Adapters de IA. Chaves nunca ficam no navegador: OpenAI/Gemini/Anthropic passam pelas Edge Functions do Supabase.
// "claude_builtin" usa o assistente embutido da plataforma (sem chave), útil para operar antes do Supabase existir.
import { db, audit, uid, now } from './store.js';
export class ConfigError extends Error { constructor(m, hint) { super(m); this.name = 'ConfigError'; this.hint = hint; } }

export function supabaseConfigured() { return !!(db.settings.supabase_url && db.settings.supabase_anon_key); }
export function textProviderStatus() {
  // Em produção (Supabase configurado) o Claude integrado não existe: força OpenAI automaticamente.
  if (db.settings.text_provider === 'claude_builtin' && supabaseConfigured() && !(typeof window !== 'undefined' && window.claude?.complete)) { db.settings.text_provider = 'openai'; try { localStorage.setItem('vm_content_engine_db_v1', JSON.stringify(db)); } catch (e) {} }
  const p = db.settings.text_provider;
  if (p === 'claude_builtin') return { ok: typeof window !== 'undefined' && !!window.claude?.complete, label: 'Claude (integrado à plataforma)', hint: 'Disponível apenas dentro desta plataforma, sem chave.' };
  return { ok: functionsConfigured(), label: { openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Anthropic' }[p] || p, hint: functionsConfigured() ? 'Chave configurada nos secrets da Edge Function text-generate.' : 'Requer Supabase configurado (URL + anon key) e Edge Function text-generate com a chave do provedor.' };
}
export function imageProviderStatus(provider = db.settings.image_provider_default) {
  return { ok: functionsConfigured(), label: { gemini: 'Gemini (Nano Banana)', openai: 'OpenAI GPT Image' }[provider] || provider, hint: functionsConfigured() ? 'Chave configurada nos secrets da Edge Function image-generate.' : 'Requer Supabase configurado e Edge Function image-generate com GEMINI_API_KEY / OPENAI_API_KEY.' };
}

// Base das funções de IA: Next.js API Routes (mesma origem, /api/*) quando publicado na Vercel; Supabase Edge Functions caso contrário.
export function functionsBase() { const s = db.settings; if (s.functions_base) return s.functions_base.replace(/\/$/, ''); if (typeof window !== 'undefined' && window.__VM_API_BASE__) return window.__VM_API_BASE__; return `${(s.supabase_url || '').replace(/\/$/, '')}/functions/v1`; }
export function functionsConfigured() { return !!(db.settings.functions_base || (typeof window !== 'undefined' && window.__VM_API_BASE__) || supabaseConfigured()); }
async function edge(fn, body) {
  if (!functionsConfigured()) throw new ConfigError('Supabase não configurado', 'Informe URL e anon key em Configurações e publique as Edge Functions.');
  const url = `${functionsBase()}/${fn}`;
  const token = db.session?.access_token || db.settings.supabase_anon_key;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: db.settings.supabase_anon_key, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`${fn}: ${r.status} ${t.slice(0, 300)}`); }
  return r.json();
}
export function parseJSON(text) {
  if (typeof text !== 'string') return text;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a > 0 || b < t.length - 1) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch (e) { try { return JSON.parse(repairJSON(t)); } catch (e2) { const err = new Error(`A IA devolveu JSON inválido (${e.message}). Tente novamente.`); err.raw = t; throw err; } }
}
// Repara erros comuns: aspas internas não escapadas, quebras de linha cruas dentro de strings, vírgulas finais.
export function repairJSON(t) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { const rest = t.slice(i + 1).match(/^\s*([,}\]:]|$)/); if (rest) { inStr = false; out += ch; } else out += '\\"'; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch; continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}
// Geração de texto estruturada. Retorna objeto JSON.
export async function textJSON({ system, prompt, maxTokens = 8000, purpose = 'text' }) {
  const p = db.settings.text_provider; const started = Date.now();
  let raw, model;
  if (p === 'claude_builtin') {
    if (!window.claude?.complete) throw new ConfigError('Claude integrado indisponível', 'Fora da plataforma, escolha OpenAI/Gemini via Supabase.');
    model = db.settings.builtin_model || 'claude-sonnet-4-5';
    raw = await window.claude.complete({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] });
  } else {
    model = db.settings.text_model;
    const res = await edge('text-generate', { provider: p, model, system, prompt, max_tokens: maxTokens, json: true });
    raw = res.text;
  }
  const out = parseJSON(raw);
  audit('ai.text', purpose, null, { provider: p, model, ms: Date.now() - started, chars_in: (system || '').length + prompt.length, chars_out: (raw || '').length });
  return out;
}
// Imagem-base: somente fotografia/ilustração, sem texto ou logo. Retorna {dataUrl, provider, model}
export async function imageGenerate({ prompt, provider = db.settings.image_provider_default, mode = db.settings.image_mode, references = [] }) {
  const model = db.settings.image_models?.[provider]?.[mode];
  const hard = `${prompt}\nNÃO inserir texto, letras, logotipos, marcas, ícones, gráficos falsos, molduras ou watermark visual. Proporção vertical 4:5 (1080x1350).`;
  const res = await edge('image-generate', { provider, model, mode, prompt: hard, references, size: '1080x1350' });
  return { dataUrl: res.dataUrl, provider, model: res.model || model, cost_meta: res.cost_meta || null, prompt: hard };
}
export async function fetchUrlText(url) { const r = await edge('source-fetch', { url }); return r.text; }
// Manchetes recentes para a sugestão de tema. Com Supabase usa trends-fetch (Google News RSS); sem, tenta um proxy RSS público; se falhar, retorna [] e a IA sugere só com o conhecimento VendaMais.
export async function fetchTrends(queries) {
  if (functionsConfigured()) { try { const r = await edge('trends-fetch', { queries }); return { items: r.items || [], via: 'trends-fetch' }; } catch (e) { console.warn('trends-fetch', e); } }
  const items = [];
  for (const q of queries.slice(0, 5)) {
    try {
      const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
      const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`); if (!r.ok) continue; const xml = await r.text();
      let n = 0; for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) { const b = m[1]; const g = (t) => (b.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\>)?<\\/${t}>`)) || [])[1] || ''; items.push({ title: g('title').replace(/\s-\s[^-]+$/, ''), source: g('source'), link: g('link'), published: g('pubDate'), query: q }); if (++n >= 6) break; }
    } catch (e) { console.warn('trends proxy', q, e); }
  }
  return { items, via: items.length ? 'proxy' : 'none' };
}
export const IMAGE_PROVIDERS = [{ id: 'gemini', label: 'Gemini (Nano Banana)' }, { id: 'openai', label: 'OpenAI GPT Image' }];
export const TEXT_PROVIDERS = [{ id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Anthropic' }, { id: 'gemini', label: 'Gemini' }, { id: 'claude_builtin', label: 'Claude integrado (sem chave)' }];
export const IMAGE_MODES = [{ id: 'economy', label: 'Econômico' }, { id: 'standard', label: 'Padrão' }, { id: 'premium', label: 'Premium' }];
