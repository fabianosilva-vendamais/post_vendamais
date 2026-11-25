import { db } from '../engine/store.js?vm202611011656';
import * as auth from '../engine/supabase.js?vm-email-access-v1';
import { ANGLES, LANGS, isManaged, plainCaption, storagePath } from './domain.js';

export { auth, db };
db.settings.supabase_url = window.__VM_SUPABASE_URL__ || '';
db.settings.supabase_anon_key = window.__VM_SUPABASE_ANON__ || '';
db.settings.functions_base = window.__VM_API_BASE__ || '';
const base = db.settings.supabase_url;
const sensitiveMessage = (value, fallback) => typeof value === 'string' &&
  /^(Sua conta|Abra |A |O |Esta |Já |Informe |Inclua |Confira |Corrija |Descreva |Salve |Envie |Escolha |Aprove |Uma |Um |O WordPress|O Metricool|Entre |Somente )/.test(value)
  ? value.slice(0, 230) : fallback;

export async function call(path, { method = 'GET', data, file, integration = false } = {}) {
  if (!await auth.refreshIfNeeded()) throw new Error('Entre novamente para continuar.');
  const headers = { apikey: db.settings.supabase_anon_key, Authorization: 'Bearer ' + db.session.access_token };
  if (file) headers['Content-Type'] = file.type;
  if (data) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, { method, headers, body: file || (data && JSON.stringify(data)),
    cache: 'no-store', signal: AbortSignal.timeout(integration ? 220000 : 30000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(sensitiveMessage(result?.message || result?.error,
    integration ? 'A integração não respondeu. Confira a situação antes de tentar novamente.' : 'Não foi possível confirmar a operação no Estúdio.'));
  return result;
}
const records = (table, filters) => call('/rest/v1/' + table + '?' + new URLSearchParams(filters));
export const listEditions = () => records('editions', { select: 'id,title,edition_date,status,brief->number,brief->radar_workflow', order: 'edition_date.desc.nullslast,updated_at.desc' });
export const change = (action, edition, input) => call('/rest/v1/rpc/radar_change', { method: 'POST', data: { action, edition_id: edition, input } });
const edge = (name, data) => call('/functions/v1/' + name, { method: 'POST', data, integration: true });
export const publication = (action, id, plan) => edge('radar-publication', { action, id, plan });

export async function editionDetails(id) {
  const filters = { edition_id: 'eq.' + id };
  const [editions, newsletters, posts, publications, logos] = await Promise.all([
    records('editions', { id: filters.edition_id, select: 'id,title,edition_date,brief,exports,status' }),
    records('newsletter_versions', { ...filters, select: 'id,n,is_approved,content_json,meta,html,plain,qa_json', order: 'n.desc' }),
    records('posts', { ...filters, select: 'id,angle,status,updated_at,content_json,content_es,meta,qa_json' }),
    records('publications', { ...filters, select: 'id,post_id,lang,networks,date_time,timezone,status,remote,media_urls,draft', order: 'created_at.desc' }),
    records('brand_assets', { active: 'eq.true', type: 'in.(logo_primary,logo_negative)', select: 'type,file_url' })
  ]);
  if (!editions[0]) throw new Error('Edição indisponível para esta conta.');
  return { edition: editions[0], newsletters, posts, publications, logos };
}

export async function imageUrl(post, lang) {
  const id = post.meta?.final_artworks?.[lang]?.image_id;
  if (!id) return '';
  const [row] = await records('generated_images', { post_id: 'eq.' + post.id, id: 'eq.' + id, select: 'file_url' });
  const storage = storagePath(row);
  if (storage) return signImage(...storage);
  return /^https:\/\//.test(row?.file_url) ? row.file_url : '';
}
async function signImage(bucket, path) {
  const result = await call(`/storage/v1/object/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', data: { expiresIn: 3600 }
  });
  if (!result?.signedURL?.startsWith('/object/sign/')) throw new Error('Arte indisponível.');
  return base + '/storage/v1' + result.signedURL;
}
export async function saveArt(edition, post, lang, file, basePath) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error('Envie PNG ou JPG de até 8 MB.');
  }
  const image = await createImageBitmap(file).catch(() => null);
  if (!image) throw new Error('Não foi possível abrir esta imagem.');
  const { width, height } = image;
  image.close();
  if (width !== 1080 || height !== 1350) throw new Error('Use uma imagem de 1080 × 1350 pixels.');
  const id = 'img_' + crypto.randomUUID();
  const path = post.id + '/' + id + (file.type === 'image/png' ? '.png' : '.jpg');
  await call('/storage/v1/object/images/' + path, { method: 'POST', file });
  await change('set_art', edition.id, { post_id: post.id, expected_at: post.updated_at, lang,
    art: { image_id: id, name: file.name, width, height, mime: file.type, ...(basePath ? { base_path: basePath } : {}) } });
}

export async function preparePosts(edition, newsletter, posts) {
  if (!isManaged(edition) || !newsletter.is_approved) return;
  const missing = ANGLES.filter(angle => !posts.some(post => post.angle === angle.id));
  if (!missing.length) return;
  const result = await edge('text-generate', {
    provider: 'openai', model: 'gpt-5', json: true, max_tokens: 4800, purpose: 'radar.draft_posts',
    system: 'Editor executivo do Radar VendaMais. Responda em JSON. Use somente os fatos da newsletter. Grade editorial clara, direta e comercial. Sem Markdown.',
    prompt: `Escreva posts brasileiros para ${missing.map(x => x.id + ' (' + x.lens + ')').join(', ')}.
Cada peça tem cena concreta, decisão comercial e convite a conversar com a VendaMais em https://vendamais.com.br/contato/.
Um único copy serve LinkedIn e Instagram. Evite repetir imagens, teses, exemplos e títulos da newsletter ou dos outros posts. Para cada peça proponha uma foto editorial de metáfora distinta, sem texto nem marca, com espaço escuro no topo e à esquerda para sobrepor a manchete.
Formato: {"posts":[{"angle":"consulting|training|business","headline":"até 44 caracteres","caption":"texto com parágrafos até 1900 caracteres","scene":"descrição objetiva da imagem"}]}.
Peças já existentes: ${posts.map(p => p.content_json?.headline).join(' | ')}.
Newsletter aprovada: ${JSON.stringify(newsletter.content_json).slice(0,18000)}`
  });
  const parsed = JSON.parse(String(result.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const drafts = missing.map(angle => {
    const draft = parsed.posts?.find(p => p.angle === angle.id);
    if (!draft?.headline || !draft.caption || !draft.scene) throw new Error('A preparação retornou uma peça incompleta.');
    return { angle: angle.id, origin: 'ai', content: {
      headline: plainCaption(draft.headline), radar_scene: String(draft.scene).slice(0, 800),
      caption: { body: plainCaption(draft.caption), hashtags: [] }
    } };
  });
  await change('prepare_posts', edition.id, { posts: drafts });
}
async function createBase(post) {
  const result = await edge('image-generate', {
    provider: 'openai', mode: 'premium', prompt: post.content_json.radar_scene +
      '\nVertical editorial photograph, commercial campaign, deliberate negative space in upper half, no text, logos or lettering.',
    size: '1080x1350'
  });
  const blob = await fetch(result.dataUrl).then(r => r.blob());
  const path = post.id + '/base_' + crypto.randomUUID() + (blob.type === 'image/jpeg' ? '.jpg' : '.png');
  await call('/storage/v1/object/images/' + path, { method: 'POST', file: blob });
  return { path, blob };
}
async function brandedImage(background, headline, name) {
  const [image, logo] = await Promise.all([
    createImageBitmap(background), fetch('/assets/brand/logo-negativo.png').then(r => r.blob()).then(createImageBitmap)
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(1080 / image.width, 1350 / image.height);
  ctx.drawImage(image, (1080 - image.width * scale) / 2, (1350 - image.height * scale) / 2, image.width * scale, image.height * scale);
  const gradient = ctx.createLinearGradient(0, 0, 0, 950);
  gradient.addColorStop(0, 'rgba(15,30,46,.91)');
  gradient.addColorStop(1, 'rgba(15,30,46,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 950);
  ctx.fillStyle = '#e2742b';
  ctx.fillRect(78, 116, 82, 6);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 80px Arial';
  const lines = [];
  for (const word of headline.trim().split(/\s+/)) {
    const next = lines.length ? lines.at(-1) + ' ' + word : word;
    if (!lines.length || ctx.measureText(next).width > 890) lines.push(word);
    else lines[lines.length - 1] = next;
  }
  if (lines.length > 4) throw new Error('A manchete ficou longa para a arte. Envie uma versão com manchete curta.');
  lines.forEach((line, i) => ctx.fillText(line, 78, 220 + i * 91, 915));
  ctx.fillStyle = 'rgba(15,30,46,.90)';
  ctx.fillRect(0, 1200, 1080, 150);
  ctx.drawImage(logo, 76, 1245, 225, 225 * logo.height / logo.width);
  image.close();
  logo.close();
  const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .93));
  return new File([result], name + '.jpg', { type: 'image/jpeg' });
}
export async function completeArtwork(edition, post, lang, message) {
  if (lang === 'pt') {
    const base = await createBase(post);
    const file = await brandedImage(base.blob, post.content_json.headline, post.angle + '_PT');
    await saveArt(edition, post, lang, file, base.path);
    return;
  }
  const result = await edge('text-generate', {
    provider: 'openai', model: 'gpt-5', json: true, max_tokens: 1600, purpose: 'radar.spanish',
    system: 'Adapte para espanhol latino-americano, preservando a mensagem, fatos, CTA e links. Sem Markdown. Retorne JSON.',
    prompt: `Retorne {"headline":"manchete curta","caption":"legenda completa"}. Português aprovado: ${JSON.stringify(post.content_json)}`
  });
  const translated = JSON.parse(result.text);
  await change('edit_caption', edition.id, { post_id: post.id, expected_at: post.updated_at, lang, text: plainCaption(translated.caption) });
  const [updated] = await records('posts', { id: 'eq.' + post.id, select: 'id,angle,updated_at,meta' });
  const path = post.meta?.final_artworks?.pt?.base_path;
  if (!path) {
    message('Legenda em espanhol salva. Envie a arte em espanhol com a composição em português.');
    return;
  }
  const url = await signImage('images', path);
  const background = await fetch(url).then(response => response.blob());
  await saveArt(edition, updated, lang, await brandedImage(background, plainCaption(translated.headline), post.angle + '_ES'), path);
}

export const artworkReady = (post, lang) => {
  const art = post.meta?.final_artworks?.[lang];
  return !!(LANGS[lang] && art?.image_id && art.width === 1080 && art.height === 1350);
};
