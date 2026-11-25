const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
};
const env = name => Deno.env.get(name);
const timezone = 'America/Sao_Paulo';
const channels = ['instagram', 'linkedin'];
const angles = ['consulting','training','business'];
const keys = angles.flatMap(angle => ['pt','es'].map(lang => angle + '_' + lang));
const wordpressUrl = 'https://vendamais.com.br/wp-json/vm-radar/v1/publication';

const response = (value, status = 200) => Response.json(value, { status, headers: cors });
const query = args => new URLSearchParams(args).toString();
const eq = value => 'eq.' + value;
class StudioError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
async function request(url, { method = 'GET', body, headers = {}, timeout = 12000 } = {}) {
  const result = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(timeout),
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!result.ok) throw new StudioError('O serviço respondeu com erro.', result.status);
  return result.json();
}
const project = () => env('SUPABASE_URL');
const service = () => env('SUPABASE_SERVICE_ROLE_KEY');
function rest(table, filters = {}, options = {}) {
  return request(project() + '/rest/v1/' + table + '?' + query(filters), {
    ...options, headers: { apikey: service(), Authorization: 'Bearer ' + service(), ...options.headers }
  });
}
async function identity(req) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new StudioError('Entre no Estúdio para continuar.', 401);
  const auth = await request(project() + '/auth/v1/user', { headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: authorization } })
    .catch(() => { throw new StudioError('Entre novamente no Estúdio.', 401); });
  const [member] = await rest('users', { id: eq(auth.id), select: 'workspace_id,role' });
  if (member?.workspace_id !== 'ws_vendamais' || member.role !== 'admin') {
    throw new StudioError('Somente administradores podem confirmar a programação.', 403);
  }
  return { id: auth.id, authorization, workspace: member.workspace_id };
}
async function lookup(id, member) {
  const [editions, posts, records, newsletters, settings] = await Promise.all([
    rest('editions', { id: eq(id), workspace_id: eq(member.workspace), select: 'id,brief,exports' }),
    rest('posts', { edition_id: eq(id), select: 'id,angle,status,content_json,content_es,meta' }),
    rest('publications', { edition_id: eq(id), status: 'neq.cancelled', select: 'post_id,lang,networks,date_time,status,remote,draft' }),
    rest('newsletter_versions', { edition_id: eq(id), is_approved: 'eq.true', select: 'id,html', order: 'n.desc', limit: 1 }),
    rest('settings', { workspace_id: eq(member.workspace), select: 'settings_json' })
  ]);
  if (!editions[0]) throw new StudioError('Abra uma edição válida.', 404);
  return { id, edition: editions[0], posts, records, newsletter: newsletters[0], settings: settings[0]?.settings_json || {} };
}
function brand(state, lang) {
  const id = String(state.settings[lang === 'pt' ? 'metricool_blog_id' : 'metricool_blog_id_es'] || '');
  if (!/^\d+$/.test(id)) throw new StudioError('A marca desta edição precisa ser configurada no Metricool.');
  return id;
}
function metricool(path, blogId, extra = {}, options = {}) {
  const userId = env('METRICOOL_USER_ID');
  const token = env('METRICOOL_USER_TOKEN');
  if (!userId || !token) throw new StudioError('O Metricool precisa ser conectado ao Estúdio.', 503);
  return request('https://app.metricool.com/api/' + path + '?' + query({ userId, blogId, ...extra }),
    { ...options, headers: { 'X-Mc-Auth': token } });
}
function localTime(value) {
  const text = String(value || '');
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(text)) return text.slice(0, 16);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}
const sameDate = (remote, date) => localTime(remote?.publicationDate?.dateTime || remote?.dateTime) === localTime(date);
const hasChannels = remote => channels.every(channel => remote?.providers?.some(provider => (provider?.network || provider) === channel));
const idOf = remote => remote?.id || remote?.data?.id || remote?.postId;
const caption = (post, lang) => {
  const c = (lang === 'es' ? post.content_es : post.content_json)?.caption || {};
  return [c.hook,c.body,c.practical_takeaway,c.cta,(c.hashtags || []).map(tag => '#' + String(tag).replace(/^#/,'')).join(' ')].filter(Boolean).join('\n\n').trim();
};
const comparable = text => String(text || '').replace(/\s+/g, ' ').trim();
const signedStorage = (path, sign) => request(project() + '/storage/v1/object/sign/' + path.split('/').map(encodeURIComponent).join('/'), {
  method: 'POST', headers: { apikey: service(), Authorization: 'Bearer ' + service() },
  body: { expiresIn: sign }
}).then(result => {
  if (!result?.signedURL?.startsWith('/object/sign/')) throw new StudioError('A arte aprovada não está disponível.');
  return project() + '/storage/v1' + result.signedURL;
});

async function image(state, post, lang) {
  const imageId = post.meta?.final_artworks?.[lang]?.image_id;
  if (!imageId) throw new StudioError('A arte aprovada não está disponível.');
  const [record] = await rest('generated_images', { id: eq(imageId), post_id: eq(post.id), select: 'file_url' });
  const path = record?.file_url?.match(/^storage:\/\/(images\/[\w.-]+\/[\w.-]+)$/)?.[1];
  if (path) return signedStorage(path, 60 * 60 * 24 * 90);
  const publicUrl = record?.file_url?.match(/^https:\/\/(?:www\.)?vendamais\.com\.br\/wp-content\/uploads\//i);
  if (publicUrl) return record.file_url;
  throw new StudioError('A arte aprovada não está disponível.');
}
async function remotePosts(blogId, date) {
  const day = date.slice(0, 10);
  const data = await metricool('v2/scheduler/posts', blogId, {
    start: day + 'T00:00:00', end: day + 'T23:59:59', timezone
  });
  const rows = Array.isArray(data) ? data : data?.data || data?.posts;
  if (!Array.isArray(rows)) throw new StudioError('O calendário do Metricool não pôde ser conferido.');
  return rows;
}
function metricoolStatus(remote) {
  if (!remote || !hasChannels(remote) || remote.draft || remote.autoPublish !== true) return 'pending';
  const states = (remote.providers || []).filter(p => channels.includes(p.network)).map(p => String(p.status || p.publicationStatus || '').toLowerCase());
  if (states.some(s => ['failed','error','rejected'].includes(s))) return 'error';
  if (states.length === 2 && states.every(s => ['published','sent','completed'].includes(s))) return 'published';
  const time = localTime(remote.publicationDate?.dateTime);
  return time && new Date(time + ':00-03:00').getTime() > Date.now() ? 'scheduled' : 'pending';
}
async function wordpress(member, body) {
  return request(wordpressUrl, { method: 'POST', body, headers: { 'X-VM-Studio-Authorization': member.authorization, 'X-VM-Studio-Apikey': env('SUPABASE_ANON_KEY') }, timeout: 20000 });
}
async function intentById(id) {
  const [intent] = await rest('radar_publication_intents', { edition_id: eq(id) });
  return intent;
}
async function setCheckpoint(intent, key, checkpoint, required) {
  const prior = intent.checkpoints || {};
  if (required !== undefined && (prior[key]?.state || '') !== required) return false;
  const next = { ...prior, [key]: checkpoint };
  const changed = await rest('radar_publication_intents', { edition_id: eq(intent.edition_id), checkpoints: eq(JSON.stringify(prior)) }, {
    method: 'PATCH', body: { checkpoints: next }, headers: { Prefer: 'return=representation' }
  });
  if (!changed?.length) return false;
  intent.checkpoints = next;
  return true;
}
async function confirmSocial(state, intent, key, create) {
  const [angle,lang] = key.split('_');
  const post = state.posts.find(item => item.angle === angle);
  if (!post) return null;
  const saved = state.records.filter(record => record.post_id === post.id && (record.lang || 'pt') === lang && !record.draft);
  const checkpoint = intent?.checkpoints?.[key];
  const date = saved[0]?.date_time || intent?.plan?.[key];
  if (!date) return null;
  const blog = brand(state, lang);
  const scheduled = await remotePosts(blog, date);
  const confirmed = scheduled.find(item => saved.some(row => String(idOf(row.remote)) === String(idOf(item))));
  if (confirmed) return metricoolStatus(confirmed);
  // Legacy split records can cover both networks through two separate posts.
  if (saved.length) {
    const matches = scheduled.filter(item => saved.some(row => String(idOf(row.remote)) === String(idOf(item))));
    const found = new Set(matches.flatMap(item => item.providers || []).map(item => item.network || item));
    return channels.every(channel => found.has(channel)) ? 'scheduled' : 'pending';
  }
  const text = caption(post, lang);
  const samePost = scheduled.find(item => !item.draft && sameDate(item, date) && hasChannels(item) && item.media?.length === 1 &&
    comparable(item.text) === comparable(text));
  if (samePost && checkpoint?.state === 'sending') {
    await register(state, post, lang, samePost, date, samePost.media);
    await setCheckpoint(intent, key, { state: 'confirmed' });
    return metricoolStatus(samePost);
  }
  if (!create || checkpoint) return checkpoint ? 'pending' : null;
  const conflict = scheduled.some(item => !item.draft &&
    (sameDate(item, date) || comparable(item.text) === comparable(text)));
  if (conflict) throw new StudioError('O Metricool tem um horário ocupado ou um post igual. Confira o calendário.');
  const url = await image(state, post, lang);
  const normalized = await metricool('actions/normalize/image/url', blog, { url });
  const mediaUrl = typeof normalized === 'string' ? normalized : normalized?.url || normalized?.data?.url;
  if (!mediaUrl) throw new StudioError('O Metricool não confirmou o arquivo da arte.');
  if (!await setCheckpoint(intent, key, { state: 'sending' }, '')) return 'pending';
  const datetime = date.slice(0,16) + ':00';
  const remote = await metricool('v2/scheduler/posts', blog, {}, { method: 'POST', body: {
    autoPublish: true, draft: false, text, media: [mediaUrl], mediaAltText: [''], descendants: [],
    hasNotReadNotes: false, shortener: false, smartLinkData: { ids: [] }, firstCommentText: '',
    providers: channels.map(network => ({ network })), publicationDate: { dateTime: datetime, timezone },
    linkedinData: { type: 'post', previewIncluded: true, publishImagesAsPDF: false, documentTitle: '' },
    instagramData: { type: 'POST', collaborators: [], showReelOnFeed: true }
  } });
  const checked = (await remotePosts(blog, date)).find(item => idOf(remote) && String(idOf(item)) === String(idOf(remote)));
  if (!checked || !hasChannels(checked) || !sameDate(checked,date) || checked.draft ||
      comparable(checked.text) !== comparable(text) || checked.media?.length !== 1) return 'pending';
  await register(state, post, lang, checked, date, [mediaUrl]);
  await setCheckpoint(intent, key, { state: 'confirmed' });
  return metricoolStatus(checked);
}
async function register(state, post, lang, item, date, media) {
  await rest('publications', { on_conflict: 'id' }, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: { id: 'pub_radar_' + idOf(item), post_id: post.id, edition_id: state.id, provider: 'metricool', lang, networks: channels,
      date_time: date.slice(0,16) + ':00', timezone, draft: false, status: 'scheduled', media_urls: media, remote: { id: idOf(item) } } });
}
async function summarize(state, intent, member, create) {
  const result = { posts: {}, locaweb: 'pending', ...(intent ? { plan: intent.plan } : {}) };
  const issues = [];
  const saved = state.edition.exports?.wordpress_post_id;
  if (saved || intent) {
    try {
      const wp = await wordpress(member, { action: create && !saved ? 'schedule' : 'check', edition: state.id, post_id: saved || null });
      result.wordpress = wp.wordpress;
      result.locaweb = wp.locaweb;
      if (create && !saved && wp.wordpress?.id && ['future','publish'].includes(wp.wordpress.status)) {
        await rest('editions', { id: eq(state.id) }, { method:'PATCH', headers: { Prefer:'return=representation' },
          body: { exports: { ...state.edition.exports, wordpress_post_id: wp.wordpress.id, wordpress_scheduled_at: wp.wordpress.date,
            email_delivery: 'Locaweb via WordPress' } } });
      }
      if (wp.locaweb === 'error') issues.push('O disparo da Locaweb exige atenção.');
    } catch {
      if (create) issues.push('O WordPress não confirmou o agendamento. Confira a situação antes de continuar.');
      else if (saved) {
        try {
          const wp = await request('https://vendamais.com.br/wp-json/wp/v2/posts/' + Number(saved) + '?_fields=id,date,status');
          if (wp?.status === 'publish') result.wordpress = wp;
        } catch { /* A scheduled post is private until it goes live. */ }
      }
    }
  }
  const readyToCreate = create && ['future','publish'].includes(result.wordpress?.status);
  for (const key of keys) {
    try { result.posts[key] = await confirmSocial(state, intent, key, readyToCreate); }
    catch (error) {
      result.posts[key] = 'pending';
      if (create) issues.push(error instanceof StudioError && error.message.startsWith('O Metricool tem') ?
        error.message : 'Um ou mais agendamentos do Metricool precisam ser conferidos.');
    }
  }
  if (create && Object.values(result.posts).some(status => status === 'pending')) issues.push('Confira as linhas com confirmação pendente.');
  result.issue = [...new Set(issues)].join(' ');
  return result;
}
async function approve(state, plan, member, existing) {
  if (state.edition.brief?.radar_workflow !== true || !state.newsletter?.html ||
    !angles.every(angle => state.posts.some(p => p.angle === angle && ['approved','exported'].includes(p.status)))) {
    throw new StudioError('Aprove a newsletter e os três posts antes de programar.');
  }
  if (!plan || JSON.stringify(Object.keys(plan).sort()) !== JSON.stringify(['newsletter',...keys].sort())) {
    throw new StudioError('Confira os sete horários da programação.');
  }
  const clean = Object.fromEntries(['newsletter', ...keys].map(key => [key, String(plan[key])]));
  if (existing) {
    if (Object.keys(clean).some(key => existing.plan[key] !== clean[key])) {
      throw new StudioError('A programação já foi aprovada. Confira os registros antes de alterar horários.',409);
    }
    return existing;
  }
  for (const date of Object.values(clean)) {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(date) ||
      localTime(date + ':00-03:00') !== date || new Date(date + ':00-03:00').getTime() < Date.now() + 300000) {
      throw new StudioError('Escolha horários futuros com pelo menos cinco minutos de antecedência.');
    }
  }
  if (keys.some(key => clean[key] < clean.newsletter) ||
      ['pt','es'].some(lang => new Set(angles.map(angle => clean[angle + '_' + lang])).size !== 3)) {
    throw new StudioError('Escolha horários distintos por marca, a partir da publicação da newsletter.');
  }
  if (state.records.some(record => !record.draft)) throw new StudioError('Já há posts registrados para esta edição. Confira a programação existente.');
  const health = await wordpress(member, { action:'health', edition:state.id }).catch(() => null);
  if (!health?.ready) throw new StudioError('O WordPress e a Locaweb precisam ser conectados antes de agendar.', 503);
  // Preflight every provider before saving the approval or triggering any scheduling.
  for (const key of keys) {
    const [angle, lang] = key.split('_');
    const blog = brand(state, lang);
    const post = state.posts.find(item => item.angle === angle);
    const rows = await remotePosts(blog,clean[key]);
    if (rows.some(item => !item.draft && (sameDate(item,clean[key]) || comparable(item.text) === comparable(caption(post,lang))))) {
      throw new StudioError('O Metricool tem um horário ocupado ou um post igual. Confira o calendário.');
    }
  }
  await rest('radar_publication_intents', { on_conflict: 'edition_id' }, { method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: { edition_id: state.id, workspace_id: member.workspace, newsletter_version_id: state.newsletter.id,
      plan: clean, approved_by: member.id } });
  const saved = await intentById(state.id);
  if (!saved || Object.keys(clean).some(key => clean[key] !== saved.plan[key])) {
    throw new StudioError('A programação mudou. Confira a versão registrada.', 409);
  }
  return saved;
}
export async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null,{ headers:cors });
  if (req.method !== 'POST') return response({ error:'Use uma operação do Estúdio.' },405);
  try {
    const member = await identity(req);
    const { action, id, plan } = await req.json();
    if (!['check','approve'].includes(action) || !/^[\w-]{1,90}$/.test(String(id))) throw new StudioError('Abra uma edição válida.');
    const [state, intent] = await Promise.all([lookup(id,member), intentById(id)]);
    return response(await summarize(state, action === 'approve' ? await approve(state,plan,member,intent) : intent, member, action === 'approve'));
  } catch (error) {
    return response({ error: error instanceof StudioError ? error.message : 'Não foi possível conferir a programação.' },
      error instanceof StudioError ? error.status : 502);
  }
}
if (typeof Deno !== 'undefined') Deno.serve(handle);
