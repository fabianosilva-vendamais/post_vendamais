import { openAIJSONOptions } from './json-completion.js';
// Edge Function: text-generate — orquestra a IA de texto. Chaves só aqui (Deno.env), nunca no navegador.
// POST { provider: 'openai'|'anthropic'|'gemini', model, system, prompt, max_tokens, json }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { generateEditorial } from './editorial-server.js';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const body = await req.json();
    const result = await generateEditorial(body, async (input) => {
      const response = await rawTextGenerate(input);
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Falha na geração.'), { status: response.status });
      return data;
    }, { enabled: Deno.env.get('EDITORIAL_CLARITY_ENABLED') !== 'false' });
    return json(result);

  } catch (e) { return json({ error: String(e?.message || e) }, e?.status || 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }

async function rawTextGenerate(body) {
    const { provider = Deno.env.get('TEXT_PROVIDER') || 'openai', model, system = '', prompt, max_tokens = 8000 } = body;
    if (!prompt) return json({ error: 'prompt obrigatório' }, 400);
    let text = '', finish_reason;
    if (provider === 'openai') {
      const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return json({ error: 'OPENAI_API_KEY não configurada' }, 501);
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || Deno.env.get('TEXT_MODEL') || 'gpt-5', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], ...openAIJSONOptions(model || Deno.env.get('TEXT_MODEL') || 'gpt-5', max_tokens), response_format: { type: 'json_object' } }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'openai error' }, 502); text = d.choices?.[0]?.message?.content || ''; finish_reason = d.choices?.[0]?.finish_reason;
    } else if (provider === 'anthropic') {
      const key = Deno.env.get('ANTHROPIC_API_KEY'); if (!key) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 501);
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || 'claude-sonnet-4-5', max_tokens, system, messages: [{ role: 'user', content: prompt }] }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'anthropic error' }, 502); text = d.content?.map((c: any) => c.text || '').join('') || ''; finish_reason = d.stop_reason;
    } else if (provider === 'gemini') {
      const key = Deno.env.get('GEMINI_API_KEY'); if (!key) return json({ error: 'GEMINI_API_KEY não configurada' }, 501);
      const m = model || 'gemini-2.5-pro';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: max_tokens, responseMimeType: 'application/json' } }) });
      const d = await r.json(); if (!r.ok) return json({ error: d.error?.message || 'gemini error' }, 502); text = d.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''; finish_reason = d.candidates?.[0]?.finishReason;
    } else return json({ error: `provider desconhecido: ${provider}` }, 400);
    return json({ text, provider, model, finish_reason });
}
