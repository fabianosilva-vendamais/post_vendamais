import { markdownLinks, parseMarkdownNewsletter } from '../engine/markdown-newsletter.js';

export const TIMEZONE = 'America/Sao_Paulo';
export const ANGLES = [
  { id: 'consulting', label: 'Consultoria', day: 0, lens: 'diagnóstico, processo e conversão' },
  { id: 'training', label: 'Treinamento', day: 2, lens: 'habilidades do vendedor e negociação' },
  { id: 'business', label: 'Negócio', day: 5, lens: 'decisão executiva, liderança e previsibilidade' }
];
export const LANGS = { pt: 'Português', es: 'Español' };
export const approvedPost = post => ['approved', 'exported'].includes(post?.status);
export const selectedNewsletter = rows => rows.find(row => row.is_approved) || rows[0];
export const storagePath = row => row?.file_url?.match(/^storage:\/\/(images|renders)\/([\w./-]+)$/)?.slice(1);
export const publicationId = row => row?.remote?.id || row?.remote?.data?.id || null;
export const isManaged = edition => edition?.brief?.radar_workflow === true;

export function plainCaption(value) {
  let result = String(value || '').replace(/\r\n?/g, '\n');
  for (const link of markdownLinks(result).reverse()) {
    if (!link.safe) throw new Error('Corrija o link da legenda antes de salvar.');
    result = result.slice(0, link.start) + link.label + ' ' + link.url + result.slice(link.end);
  }
  return result.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/\*\*|__/g, '')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\W|$)/g, '$1$2')
    .replace(/^\s*\*\s+/gm, '• ').trim();
}
export function captionFor(post, lang) {
  const content = lang === 'es' ? post.content_es : post.content_json;
  const caption = content?.caption || {};
  const parts = [caption.hook, caption.body, caption.practical_takeaway, caption.cta,
    (caption.hashtags || []).map(tag => '#' + String(tag).replace(/^#/, '')).join(' ')];
  return parts.filter(Boolean).join('\n\n').trim();
}

export function parseNewsletter(source) {
  const text = source.trim();
  if (text.length < 60) throw new Error('Cole o texto completo da newsletter.');
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex(line => line.trim());
  if (!lines[first].startsWith('# ') && !/^radar vendamais$/i.test(lines[first].trim())) lines[first] = '# ' + lines[first].trim();
  const parsed = parseMarkdownNewsletter(lines.join('\n'));
  if (!parsed.headline || !parsed.blocks.length) throw new Error('Inclua o título na primeira linha e o corpo da newsletter abaixo.');
  if (markdownLinks(text).some(link => !link.safe)) throw new Error('Confira os links da newsletter.');
  const contact = [...markdownLinks(text)].reverse().find(link =>
    /^https:\/\/(www\.)?vendamais\.com\.br\/contato(?:\/|$)/i.test(link.url));
  if (!contact) throw new Error('Inclua no texto um link para o contato da VendaMais.');
  return { headline: parsed.headline, support_line: parsed.support_line,
    subject: parsed.headline, preheader: parsed.support_line, free_blocks: parsed.blocks,
    cta: { label: contact.label, url: contact.url } };
}

const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayInBrazil(now = new Date()) {
  const map = Object.fromEntries(localDate.formatToParts(now).map(x => [x.type, x.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
export function addDays(date, days) {
  const moment = new Date(date + 'T12:00:00Z');
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}
export function nextWednesday(date = dayInBrazil(), now = new Date()) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  let day = addDays(date, (3 - weekday + 7) % 7);
  while (new Date(day + 'T06:00:00-03:00') <= now) day = addDays(day, 7);
  return day;
}
export function scheduleRows(edition, posts, publications, now = new Date()) {
  const date = nextWednesday(edition.edition_date || dayInBrazil(now), now);
  return ANGLES.flatMap(angle => Object.keys(LANGS).map(lang => {
    const post = posts.find(p => p.angle === angle.id);
    const records = publications.filter(p => p.post_id === post?.id && (p.lang || 'pt') === lang && p.status !== 'cancelled');
    const record = records.find(p => !p.draft) || records[0];
    const time = record?.date_time || `${addDays(date, angle.day)}T${lang === 'pt' ? '09:00' : '10:00'}:00`;
    return { key: angle.id + '_' + lang, angle: angle.label, lang, post, record, time };
  }));
}
export function dateLabel(value) {
  if (!value) return '—';
  const local = value.length === 10 ? value + 'T12:00:00-03:00' :
    /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + '-03:00';
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, dateStyle: 'short',
    ...(value.length > 10 ? { timeStyle: 'short' } : {}) }).format(date);
}
