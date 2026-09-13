// Núcleo compartilhado das rotas de IA. Mesma lógica das Supabase Edge Functions (supabase/functions/*), em Node.
// Chaves só em process.env (Vercel → Project Settings → Environment Variables). Nunca chegam ao navegador.
export const runtime = 'nodejs';

export function ok(body, status = 200) { return Response.json(body, { status }); }
export function err(message, status = 500) { return Response.json({ error: message }, { status }); }

export async function textGenerate(body) {
  const { provider = process.env.TEXT_PROVIDER || 'openai', model, system = '', prompt, max_tokens = 8000 } = body;
  if (!prompt) return err('prompt obrigatório', 400);
  let text = '';
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY; if (!key) return err('OPENAI_API_KEY não configurada', 501);
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || process.env.TEXT_MODEL || 'gpt-5', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_completion_tokens: max_tokens, response_format: { type: 'json_object' } }) });
    const d = await r.json(); if (!r.ok) return err(d.error?.message || 'openai error', 502); text = d.choices?.[0]?.message?.content || '';
  } else if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) return err('ANTHROPIC_API_KEY não configurada', 501);
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || 'claude-sonnet-4-5', max_tokens, system, messages: [{ role: 'user', content: prompt }] }) });
    const d = await r.json(); if (!r.ok) return err(d.error?.message || 'anthropic error', 502); text = (d.content || []).map(c => c.text || '').join('');
  } else if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY; if (!key) return err('GEMINI_API_KEY não configurada', 501);
    const m = model || 'gemini-2.5-pro';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: max_tokens, responseMimeType: 'application/json' } }) });
    const d = await r.json(); if (!r.ok) return err(d.error?.message || 'gemini error', 502); text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  } else return err(`provider desconhecido: ${provider}`, 400);
  return ok({ text, provider, model });
}

export async function imageGenerate(body) {
  const { provider = process.env.IMAGE_PROVIDER_DEFAULT || 'gemini', model, mode = 'standard', prompt, references = [] } = body;
  if (!prompt) return err('prompt obrigatório', 400);
  const started = Date.now();
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY; if (!key) return err('GEMINI_API_KEY não configurada', 501);
    const m = model || (mode === 'premium' ? process.env.IMAGE_MODEL_PREMIUM || 'gemini-3-pro-image' : process.env.IMAGE_MODEL_STANDARD || 'gemini-3.1-flash-image');
    const parts = [{ text: prompt }];
    for (const ref of references.slice(0, 3)) { const b = await toBase64(ref); if (b) parts.push({ inlineData: { mimeType: b.mime, data: b.data } }); }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } } }) });
    const d = await r.json(); if (!r.ok) return err(d.error?.message || 'gemini error', 502);
    const img = (d.candidates?.[0]?.content?.parts || []).find(p => p.inlineData); if (!img) return err('gemini não retornou imagem', 502);
    return ok({ dataUrl: `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`, model: m, cost_meta: { ms: Date.now() - started, usage: d.usageMetadata || null } });
  }
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY; if (!key) return err('OPENAI_API_KEY não configurada', 501);
    const m = model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5'; const quality = mode === 'premium' ? 'high' : mode === 'economy' ? 'low' : 'medium';
    const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m, prompt, size: '1024x1536', quality, n: 1 }) });
    const d = await r.json(); if (!r.ok) return err(d.error?.message || 'openai error', 502);
    const b64 = d.data?.[0]?.b64_json; if (!b64) return err('openai não retornou imagem', 502);
    return ok({ dataUrl: `data:image/png;base64,${b64}`, model: m, cost_meta: { ms: Date.now() - started, usage: d.usage || null, quality } });
  }
  return err(`provider desconhecido: ${provider}`, 400);
}

export async function sourceFetch(body) {
  const { url } = body; if (!/^https?:\/\//.test(url || '')) return err('url inválida', 400);
  const r = await fetch(url, { headers: { 'User-Agent': 'VendaMaisContentEngine/1.0' } }); const html = await r.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return ok({ text: text.slice(0, 60000), title: (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || url });
}

export async function trendsFetch(body) {
  const { queries = ['vendas B2B', 'gestão comercial', 'liderança de vendas', 'IA em vendas'], lang = 'pt-BR' } = body; const items = [];
  for (const q of queries.slice(0, 8)) {
    const xml = await (await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=${lang}&gl=BR&ceid=BR:${lang.split('-')[0]}`)).text();
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) { const b = m[1]; const g = (t) => (b.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`)) || [])[1] || ''; items.push({ title: g('title').replace(/\s-\s[^-]+$/, ''), source: g('source'), link: g('link'), published: g('pubDate'), query: q }); if (items.filter(i => i.query === q).length >= 8) break; }
  }
  return ok({ items, fetched_at: new Date().toISOString() });
}

export async function publishSchedule(body) {
  const token = process.env.METRICOOL_USER_TOKEN, userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId) return err('METRICOOL_USER_TOKEN / METRICOOL_USER_ID não configurados', 501);
  const BASE = 'https://app.metricool.com/api'; const H = { 'X-Mc-Auth': token, 'Content-Type': 'application/json' };
  const q = (extra = {}) => new URLSearchParams({ userId, ...(body.blogId ? { blogId: String(body.blogId) } : {}), ...extra }).toString();
  const call = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: H }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } if (!r.ok) throw new Error(`Metricool ${r.status}: ${typeof d === 'string' ? d.slice(0, 300) : JSON.stringify(d).slice(0, 300)}`); return d; };
  try {
    if (body.action === 'brands') return ok({ brands: await call(`/admin/simpleProfiles?${q()}`) });
    if (body.action === 'best_time') return ok({ data: await call(`/v2/scheduler/besttimes/${body.network}?${q({ start: body.start, end: body.end, timezone: body.timezone || 'America/Sao_Paulo' })}`) });
    if (body.action === 'list') return ok({ posts: await call(`/v2/scheduler/posts?${q({ start: body.start, end: body.end, timezone: body.timezone || 'America/Sao_Paulo' })}`) });
    if (body.action === 'delete') return ok({ ok: await call(`/v2/scheduler/posts/${body.postId}?${q()}`, { method: 'DELETE' }) });
    if (body.action === 'schedule') {
      const media = []; for (const url of (body.mediaUrls || []).slice(0, 10)) { const n = await call(`/actions/normalize/image/url?${q({ url })}`); media.push(typeof n === 'string' ? n : (n.url || n.data?.url || url)); }
      const networks = body.networks?.length ? body.networks : ['linkedin'];
      const payload = { autoPublish: !body.draft, draft: !!body.draft, text: body.text || '', media, mediaAltText: media.map(() => body.altText || ''), descendants: [], hasNotReadNotes: false, shortener: false, smartLinkData: { ids: [] }, firstCommentText: body.firstComment || '', providers: networks.map(n => ({ network: n })), publicationDate: { dateTime: body.dateTime, timezone: body.timezone || 'America/Sao_Paulo' } };
      if (networks.includes('linkedin')) payload.linkedinData = { type: 'post', previewIncluded: true, publishImagesAsPDF: !!body.linkedinDocumentTitle, documentTitle: body.linkedinDocumentTitle || '' };
      if (networks.includes('instagram')) payload.instagramData = { type: body.instagramType || 'POST', collaborators: [], showReelOnFeed: true };
      const res = await call(`/v2/scheduler/posts?${q()}`, { method: 'POST', body: JSON.stringify(payload) });
      return ok({ result: res, payload_preview: { networks, media_count: media.length, dateTime: payload.publicationDate } });
    }
    return err(`action desconhecida: ${body.action}`, 400);
  } catch (e) { return err(String(e?.message || e), 500); }
}

async function toBase64(ref) { if (ref.startsWith('data:')) { const [h, data] = ref.split(','); return { mime: h.slice(5, h.indexOf(';')), data }; } try { const r = await fetch(ref); return { mime: r.headers.get('content-type') || 'image/jpeg', data: Buffer.from(await r.arrayBuffer()).toString('base64') }; } catch { return null; } }

// Autenticação: exige JWT do Supabase (usuário logado) quando SUPABASE_URL estiver definido; caso contrário permite anon key.
export async function requireAuth(req) {
  const auth = req.headers.get('authorization') || ''; if (!auth.startsWith('Bearer ')) return err('unauthorized', 401);
  const token = auth.slice(7); const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) return null; if (token === anon) return process.env.ALLOW_ANON === 'true' ? null : err('login necessário', 401);
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } }); if (!r.ok) return err('sessão inválida', 401); return null;
}
export async function handle(req, fn) { try { const denied = await requireAuth(req); if (denied) return denied; return await fn(await req.json()); } catch (e) { return err(String(e?.message || e), 500); } }
