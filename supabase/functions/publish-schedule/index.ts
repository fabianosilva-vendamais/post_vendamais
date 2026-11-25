// Edge Function: publish-schedule — Publisher Adapter (Metricool). Token só aqui (METRICOOL_USER_TOKEN).
// POST { action: 'brands' } -> lista de marcas (blogId)
// POST { action: 'best_time', blogId, network, start, end, timezone }
// POST { action: 'list', blogId, start, end, timezone }
// POST { action: 'schedule', blogId, text, mediaUrls: [url], networks: ['linkedin','instagram'], dateTime: 'YYYY-MM-DDTHH:mm:ss', timezone, draft, firstComment, linkedinDocumentTitle, instagramType }
// POST { action: 'delete', blogId, postId }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const BASE = 'https://app.metricool.com/api';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || ''; if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const token = Deno.env.get('METRICOOL_USER_TOKEN'), userId = Deno.env.get('METRICOOL_USER_ID');
    if (!token || !userId) return json({ error: 'METRICOOL_USER_TOKEN / METRICOOL_USER_ID não configurados' }, 501);
    const body = await req.json(); const H = { 'X-Mc-Auth': token, 'Content-Type': 'application/json' };
    const q = (extra: Record<string, string> = {}) => new URLSearchParams({ userId, ...(body.blogId ? { blogId: String(body.blogId) } : {}), ...extra }).toString();
    const call = async (path: string, init: RequestInit = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: H }); const t = await r.text(); let d: any; try { d = JSON.parse(t); } catch { d = t; } if (!r.ok) throw new Error(`Metricool ${r.status}: ${typeof d === 'string' ? d.slice(0, 300) : JSON.stringify(d).slice(0, 300)}`); return d; };

    if (body.action === 'brands') return json({ brands: await call(`/admin/simpleProfiles?${q()}`) });
    if (body.action === 'best_time') return json({ data: await call(`/v2/scheduler/besttimes/${body.network}?${q({ start: body.start, end: body.end, timezone: body.timezone || 'America/Sao_Paulo' })}`) });
    if (body.action === 'list') return json({ posts: await call(`/v2/scheduler/posts?${q({ start: body.start, end: body.end, timezone: body.timezone || 'America/Sao_Paulo' })}`) });
    if (body.action === 'delete') return json({ ok: await call(`/v2/scheduler/posts/${body.postId}?${q()}`, { method: 'DELETE' }) });
    if (body.action === 'schedule') {
      const media: string[] = [];
      for (const url of (body.mediaUrls || []).slice(0, 10)) { const n = await call(`/actions/normalize/image/url?${q({ url })}`); media.push(typeof n === 'string' ? n : (n.url || n.data?.url || url)); }
      const networks: string[] = body.networks?.length ? body.networks : ['linkedin'];
      const payload: any = {
        autoPublish: body.draft ? false : true, draft: !!body.draft, text: body.text || '', media, mediaAltText: media.map(() => body.altText || ''), descendants: [], hasNotReadNotes: false, shortener: false, smartLinkData: { ids: [] },
        firstCommentText: body.firstComment || '', providers: networks.map(n => ({ network: n })),
        publicationDate: { dateTime: body.dateTime, timezone: body.timezone || 'America/Sao_Paulo' } };
      if (networks.includes('linkedin')) payload.linkedinData = { type: 'post', previewIncluded: true, publishImagesAsPDF: !!body.linkedinDocumentTitle, documentTitle: body.linkedinDocumentTitle || '' };
      if (networks.includes('instagram')) payload.instagramData = { type: body.instagramType || 'POST', collaborators: [], showReelOnFeed: true };
      const res = await call(`/v2/scheduler/posts?${q()}`, { method: 'POST', body: JSON.stringify(payload) });
      return json({ result: res, payload_preview: { networks, media_count: media.length, dateTime: payload.publicationDate } });
    }
    return json({ error: `action desconhecida: ${body.action}` }, 400);
  } catch (e) { return json({ error: String(e?.message || e) }, 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
