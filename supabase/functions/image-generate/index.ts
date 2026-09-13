// Edge Function: image-generate — Image Provider Adapter. Só imagem-base (sem texto/logo). Chaves só aqui.
// POST { provider: 'gemini'|'openai', model, mode, prompt, references: [dataUrl|url], size: '1080x1350' }
// Retorna { dataUrl, model, cost_meta }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const { provider = Deno.env.get('IMAGE_PROVIDER_DEFAULT') || 'gemini', model, mode = 'standard', prompt, references = [] } = await req.json();
    if (!prompt) return json({ error: 'prompt obrigatório' }, 400);
    const started = Date.now();
    if (provider === 'gemini') {
      const key = Deno.env.get('GEMINI_API_KEY'); if (!key) return json({ error: 'GEMINI_API_KEY não configurada' }, 501);
      const m = model || (mode === 'premium' ? Deno.env.get('IMAGE_MODEL_PREMIUM') || 'gemini-3-pro-image' : Deno.env.get('IMAGE_MODEL_STANDARD') || 'gemini-3.1-flash-image');
      const parts: any[] = [{ text: prompt }];
      for (const ref of references.slice(0, 3)) { const b64 = await toBase64(ref); if (b64) parts.push({ inlineData: { mimeType: b64.mime, data: b64.data } }); }
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } } }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'gemini error' }, 502);
      const img = d.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!img) return json({ error: 'gemini não retornou imagem' }, 502);
      return json({ dataUrl: `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`, model: m, cost_meta: { ms: Date.now() - started, usage: d.usageMetadata || null } });
    }
    if (provider === 'openai') {
      const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return json({ error: 'OPENAI_API_KEY não configurada' }, 501);
      const m = model || Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2.5';
      const quality = mode === 'premium' ? 'high' : mode === 'economy' ? 'low' : 'medium';
      const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m, prompt, size: '1024x1536', quality, n: 1 }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'openai error' }, 502);
      const b64 = d.data?.[0]?.b64_json; if (!b64) return json({ error: 'openai não retornou imagem' }, 502);
      return json({ dataUrl: `data:image/png;base64,${b64}`, model: m, cost_meta: { ms: Date.now() - started, usage: d.usage || null, quality } });
    }
    return json({ error: `provider desconhecido: ${provider}` }, 400);
  } catch (e) { return json({ error: String(e?.message || e) }, 500); }
});
async function toBase64(ref: string) { if (ref.startsWith('data:')) { const [h, data] = ref.split(','); return { mime: h.slice(5, h.indexOf(';')), data }; } try { const r = await fetch(ref); const buf = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const b of buf) s += String.fromCharCode(b); return { mime: r.headers.get('content-type') || 'image/jpeg', data: btoa(s) }; } catch { return null; } }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
