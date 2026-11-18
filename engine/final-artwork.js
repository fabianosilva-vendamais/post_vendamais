// Finished artwork is stored separately from base photos and never composited.
// Metadata uses the existing posts.meta JSON column; no schema changes required.
import { db, blobs, uid, now, audit } from './store.js?vm202611011656';
import { loadImage } from './social-render.js?vm202611011656';

export const isFinalArtwork = p => p?.meta?.artwork_mode === 'final';
export function artworkFor(p, lang = 'pt') {
  if (!['pt', 'es'].includes(lang)) throw new Error('Idioma de arte inválido.');
  return p?.meta?.final_artworks?.[lang] || null;
}
export function artworkEditable(p) {
  return !!p && !['approved', 'exported'].includes(p.status) && !(db.publications || []).some(x => x.post_id === p.id && x.status !== 'cancelled');
}
function ensureEditable(p) {
  if (!artworkEditable(p)) throw new Error('Esta peça já foi aprovada ou agendada. A arte foi preservada. Use um post em rascunho.');
}
export function artworkIssues(p, langs = ['pt', 'es']) {
  if (!isFinalArtwork(p)) return [];
  return langs.filter(lang => !artworkFor(p, lang)?.image_id).map(lang => ({ code: 'final_artwork_missing', where: 'render', text: `Envie a arte pronta em ${lang === 'es' ? 'espanhol' : 'português'} no Image Lab.` }));
}
function invalidateVisualQA(p) {
  p.score = null;
  if (p.qa_json) p.qa_json = { ...p.qa_json, visual: null, ready: false, blockers: (p.qa_json.blockers || []).filter(i => i.where !== 'render') };
}
export async function uploadArtwork(app, p, { lang, dataUrl, name = '' }) {
  ensureEditable(p); artworkFor(p, lang);
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Envie uma imagem PNG ou JPG.');
  if (match[2].length * 3 / 4 > 8 * 1024 * 1024) throw new Error('A arte deve ter até 8 MB.');
  const image = await loadImage(dataUrl);
  const width = image?.naturalWidth || image?.width || 0, height = image?.naturalHeight || image?.height || 0;
  if (width < 320 || height < 320 || width * height > 25000000) throw new Error('Imagem inválida: use ao menos 320 px em cada lado e no máximo 25 megapixels. Recomendado: 1080 × 1350.');
  if (width / height < 0.8 || width / height > 1.91) throw new Error('Use uma arte entre 4:5 e 1,91:1 para Instagram e LinkedIn. Recomendado: 1080 × 1350. Nenhum recorte foi aplicado.');
  ensureEditable(p);
  const id = uid('img'); await blobs.put(id, dataUrl);
  try { ensureEditable(p); } catch (error) { await blobs.del(id); throw error; }
  const at = now(), meta = p.meta ||= {};
  if (!isFinalArtwork(p)) meta.artwork_previous_format = p.format || 'single';
  meta.artwork_mode = 'final';
  meta.final_artworks = { ...meta.final_artworks, [lang]: { image_id: id, name, width, height, mime: `image/${match[1]}`, uploaded_at: at } };
  db.generated_images.push({ id, post_id: p.id, edition_id: p.edition_id, source: 'upload', provider: 'upload', model: null, prompt: `Arte final ${lang.toUpperCase()}: ${name}`, cost_meta: { usage: 'final_artwork', lang }, created_at: at });
  p.format = 'single'; p.updated_at = at; invalidateVisualQA(p);
  audit('artwork.upload', 'post', p.id, { lang, image_id: id, width, height }); app.save();
  return artworkFor(p, lang);
}
export function useStudioArtwork(app, p) {
  ensureEditable(p);
  p.format = p.meta?.artwork_previous_format || 'single';
  p.meta = { ...p.meta, artwork_mode: 'studio' }; p.updated_at = now(); invalidateVisualQA(p);
  audit('artwork.studio', 'post', p.id, {}); app.save();
}
export async function artworkData(p, lang = 'pt') {
  const art = artworkFor(p, lang);
  if (!art?.image_id) throw new Error(`Envie a arte pronta em ${lang === 'es' ? 'espanhol' : 'português'} no Image Lab.`);
  const dataUrl = await blobs.get(art.image_id);
  if (!dataUrl) throw new Error('Arquivo da arte indisponível. Sincronize com o Supabase antes de continuar.');
  return { ...art, dataUrl, extension: art.mime === 'image/jpeg' ? 'jpg' : 'png' };
}
export async function renderArtwork(p, canvas, lang = 'pt') {
  // Clear immediately so an unavailable ES file cannot leave the PT artwork visible.
  const revision = canvas._vmArtworkRevision = (canvas._vmArtworkRevision || 0) + 1;
  canvas.width = 1080; canvas.height = 1350;
  const art = await artworkData(p, lang), image = await loadImage(art.dataUrl);
  if (canvas._vmArtworkRevision !== revision) return { spec: {}, meta: { cancelled: true } };
  if (!image) throw new Error('Não foi possível abrir o arquivo da arte.');
  canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return { spec: { image, finalArtwork: true }, meta: { width: canvas.width, height: canvas.height, finalArtwork: true, textOverflow: false } };
}
