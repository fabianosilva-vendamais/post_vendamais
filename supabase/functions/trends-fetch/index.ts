// Edge Function: trends-fetch — lê manchetes recentes (Google News RSS, sem chave) para a sugestão de tema.
// POST { queries: [string], lang: 'pt-BR' } -> { items: [{title, source, link, published, query}] }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { queries = ['vendas B2B', 'gestão comercial', 'liderança de vendas', 'IA em vendas'], lang = 'pt-BR' } = await req.json();
    const items: any[] = [];
    for (const q of queries.slice(0, 8)) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=${lang}&gl=BR&ceid=BR:${lang.split('-')[0]}`;
      const xml = await (await fetch(url)).text();
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const b = m[1]; const g = (t: string) => (b.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`)) || [])[1] || '';
        items.push({ title: g('title').replace(/\s-\s[^-]+$/, ''), source: g('source'), link: g('link'), published: g('pubDate'), query: q });
        if (items.filter(i => i.query === q).length >= 8) break;
      }
    }
    return json({ items, fetched_at: new Date().toISOString() });
  } catch (e) { return json({ error: String(e?.message || e) }, 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
