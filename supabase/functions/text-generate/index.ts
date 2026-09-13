// Edge Function: text-generate — orquestra a IA de texto. Chaves só aqui (Deno.env), nunca no navegador.
// POST { provider: 'openai'|'anthropic'|'gemini', model, system, prompt, max_tokens, json }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const { provider = Deno.env.get('TEXT_PROVIDER') || 'openai', model, system = '', prompt, max_tokens = 8000 } = await req.json();
    if (!prompt) return json({ error: 'prompt obrigatório' }, 400);
    let text = '';
    if (provider === 'openai') {
      const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return json({ error: 'OPENAI_API_KEY não configurada' }, 501);
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || Deno.env.get('TEXT_MODEL') || 'gpt-5', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_completion_tokens: max_tokens, response_format: { type: 'json_object' } }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'openai error' }, 502); text = d.choices?.[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
      const key = Deno.env.get('ANTHROPIC_API_KEY'); if (!key) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 501);
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || 'claude-sonnet-4-5', max_tokens, system, messages: [{ role: 'user', content: prompt }] }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'anthropic error' }, 502); text = d.content?.map((c: any) => c.text || '').join('') || '';
    } else if (provider === 'gemini') {
      const key = Deno.env.get('GEMINI_API_KEY'); if (!key) return json({ error: 'GEMINI_API_KEY não configurada' }, 501);
      const m = model || 'gemini-2.5-pro';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: max_tokens, responseMimeType: 'application/json' } }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'gemini error' }, 502); text = d.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    } else return json({ error: `provider desconhecido: ${provider}` }, 400);
    return json({ text, provider, model });
  } catch (e) { return json({ error: String(e?.message || e) }, 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
