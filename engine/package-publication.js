import { listBrands, edge } from './publisher.js?vm-package-v1';
import { refreshIfNeeded, uploadPublic } from './supabase.js?vm-email-access-v1';

const picker = document.querySelector('#package');
const draftButton = document.querySelector('#draft');
const scheduleButton = document.querySelector('#schedule');
const status = document.querySelector('#status');
const posts = document.querySelector('#posts');
const brands = new Set(['VendaMais Brasil', 'VendaMais LATAM']);
const networks = new Set(['linkedin', 'instagram']);
const storage = new Map();
let loaded;
let draftVerified = false;

const setStatus = text => { status.textContent = text; };
const nameOf = row => `${row.brand} · ${row.network} · ${row.dateTime.slice(0, 10)} às ${row.dateTime.slice(11, 16)}`;

export async function readPackage(files) {
  const byName = new Map(files.map(file => [file.name, file]));
  const manifests = files.filter(file => file.name.endsWith('.json'));
  if (manifests.length !== 1 || byName.size !== files.length) throw new Error('Selecione um manifesto e as artes, sem arquivos duplicados.');
  if (manifests[0].size > 300000) throw new Error('Manifesto excede o limite.');
  const manifest = JSON.parse(await manifests[0].text());
  if (!Number.isInteger(manifest.edition) || manifest.edition < 1 || manifest.timezone !== 'America/Sao_Paulo' ||
      !Array.isArray(manifest.posts) || !manifest.posts.length || manifest.posts.length > 30) {
    throw new Error('Manifesto de publicação inválido.');
  }
  const seen = new Set();
  const verified = new Map();
  for (const row of manifest.posts) {
    if (!brands.has(row.brand) || !networks.has(row.network) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(row.dateTime) ||
        !(Date.parse(row.dateTime + '-03:00') > Date.now()) || typeof row.title !== 'string' ||
        typeof row.text !== 'string' || !row.text.trim() || !Array.isArray(row.assets) || !row.assets.length || row.assets.length > 10) {
      throw new Error('Há uma publicação com campos inválidos ou data vencida.');
    }
    const key = nameOf(row);
    if (seen.has(key)) throw new Error('O pacote contém duas publicações para a mesma marca, rede e horário.');
    seen.add(key);
    for (const asset of row.assets) {
      const file = byName.get(asset.name);
      if (!file || !/^[\w.-]+\.png$/i.test(asset.name) || file.size > 10000000 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
        throw new Error('Falta uma arte PNG válida no pacote.');
      }
      if (!verified.has(asset.name)) {
        const buffer = await file.arrayBuffer();
        const magic = new Uint8Array(buffer, 0, 8);
        if (Array.from(magic).join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Formato da arte inválido.');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
        verified.set(asset.name, Array.from(digest, b => b.toString(16).padStart(2, '0')).join(''));
      }
      if (verified.get(asset.name) !== asset.sha256) throw new Error('Uma arte difere do arquivo aprovado.');
    }
  }
  return { ...manifest, byName };
}

function render(plan) {
  posts.replaceChildren(...plan.posts.map(row => {
    const article = document.createElement('article');
    const title = document.createElement('strong');
    title.textContent = row.title;
    const label = document.createElement('div');
    label.textContent = `${nameOf(row)} · ${row.assets.length} arte(s)`;
    const out = document.createElement('output');
    row.out = out;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Legenda';
    const caption = document.createElement('pre');
    caption.textContent = row.text;
    details.append(summary, caption);
    article.append(title, label, out, details);
    return article;
  }));
}

async function upload(asset) {
  if (!storage.has(asset.sha256)) {
    const file = loaded.byName.get(asset.name);
    const url = URL.createObjectURL(file);
    try {
      storage.set(asset.sha256, await uploadPublic('renders', `ed${loaded.edition}/pacote/${asset.sha256}-${asset.name}`, url));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return storage.get(asset.sha256);
}

function resultRecord(value) {
  const row = value?.data ?? value;
  return Array.isArray(row) ? row[0] : row;
}

function assertReceipt(result, row, draft) {
  if (!result?.id || result.draft !== draft || result.autoPublish !== !draft ||
      !Array.isArray(result.media) || result.media.length !== row.assets.length ||
      result.providers?.length !== 1 || result.providers[0]?.network !== row.network ||
      (row.network === 'linkedin' && row.assets.length > 1 && result.linkedinData?.publishImagesAsPDF !== true) ||
      result.publicationDate?.dateTime?.slice(0, 19) !== row.dateTime) {
    throw new Error('O Metricool respondeu sem confirmar todos os dados. Confira a agenda antes de repetir.');
  }
}

async function send(row, draft, profile) {
  const mediaUrls = [];
  for (const asset of row.assets) mediaUrls.push(await upload(asset));
  const response = await edge({
    action: 'schedule', blogId: profile.blogId, text: row.text, mediaUrls, networks: [row.network],
    dateTime: row.dateTime, timezone: loaded.timezone, draft, altText: row.title, instagramType: 'POST',
    linkedinDocumentTitle: row.network === 'linkedin' && mediaUrls.length > 1 ? row.title : '',
  });
  const result = resultRecord(response.result);
  if (result?.id) row.out.textContent = `Recebido · ID ${result.id}`;
  assertReceipt(result, row, draft);
  row.out.textContent = `${draft ? 'Rascunho verificado' : 'Agendado e verificado'} · ID ${result.id} · ${result.media.length} arquivo(s)`;
  row.receipt = result;
  row.draft = draft;
}

async function lookup(plan, profile) {
  const days = plan.posts.map(row => row.dateTime.slice(0, 10)).sort();
  const value = (await edge({
    action: 'list', blogId: profile.blogId, start: `${days[0]}T00:00:00-03:00`,
    end: `${days.at(-1)}T23:59:59-03:00`, timezone: plan.timezone,
  })).posts;
  const list = Array.isArray(value) ? value : value?.data;
  if (!Array.isArray(list)) throw new Error('Não foi possível verificar o calendário do Metricool.');
  return list;
}

function findMatch(calendar, row) {
  return calendar.find(item => item.publicationDate?.dateTime?.slice(0, 19) === row.dateTime &&
    item.providers?.some(provider => provider.network === row.network) && item.text?.trim() === row.text);
}

async function run(test) {
  picker.disabled = draftButton.disabled = scheduleButton.disabled = true;
  try {
    if (!await refreshIfNeeded()) throw new Error('Entre no VM Estúdio para enviar o pacote.');
    const profiles = await listBrands();
    const byBrand = new Map(profiles.map(p => [p.label, p]));
    const calendars = new Map();
    for (const brand of new Set(loaded.posts.map(row => row.brand))) {
      if (!byBrand.get(brand)?.blogId) throw new Error(`Marca não conectada: ${brand}.`);
      calendars.set(brand, await lookup(loaded, byBrand.get(brand)));
    }
    const rows = test ? [loaded.posts[0]] : loaded.posts.slice(1);
    for (const row of rows) {
      setStatus(`Conferindo ${nameOf(row)}…`);
      const found = findMatch(calendars.get(row.brand), row);
      if (found) {
        assertReceipt(found, row, test);
        row.out.textContent = `${test ? 'Rascunho verificado' : 'Já agendado e verificado'} · ID ${found.id}`;
      } else {
        await send(row, test, byBrand.get(row.brand));
      }
    }
    if (test) draftVerified = true;
    setStatus(test ? 'Rascunho confirmado no Metricool.' : 'Publicações restantes confirmadas no Metricool.');
  } catch (error) {
    setStatus(error.message || 'Falha ao preparar as publicações.');
  } finally {
    picker.disabled = false;
    draftButton.disabled = draftVerified;
    scheduleButton.disabled = !draftVerified;
  }
}

picker.addEventListener('change', async () => {
  loaded = null;
  draftVerified = false;
  draftButton.disabled = scheduleButton.disabled = true;
  posts.replaceChildren();
  try {
    loaded = await readPackage(Array.from(picker.files));
    render(loaded);
    draftButton.disabled = false;
    setStatus(`Radar ${loaded.edition} · ${loaded.posts.length} publicações · artes conferidas.`);
  } catch (error) {
    setStatus(error.message || 'Falha ao ler o pacote.');
  }
});
draftButton.addEventListener('click', () => run(true));
scheduleButton.addEventListener('click', () => run(false));
