// Edge Function: source-fetch — lê uma URL e devolve texto limpo para a análise de fontes.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { url } = await req.json(); if (!/^https?:\/\//.test(url || '')) return json({ error: 'url inválida' }, 400);
    const r = await fetch(url, { headers: { 'User-Agent': 'VendaMaisContentEngine/1.0' } }); const html = await r.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    return json({ text: text.slice(0, 60000), title: (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || url });
  } catch (e) { return json({ error: String(e?.message || e) }, 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
