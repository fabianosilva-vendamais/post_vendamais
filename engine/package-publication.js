import { listBrands } from './publisher.js?vm-package-v1';
import { refreshIfNeeded, uploadPublic } from './supabase.js?vm-email-access-v1';

const picker = document.querySelector('#package');
const stageButton = document.querySelector('#stage');
const download = document.querySelector('#download');
const status = document.querySelector('#status');
const posts = document.querySelector('#posts');
const brands = new Set(['VendaMais Brasil', 'VendaMais LATAM']);
const networks = new Set(['linkedin', 'instagram']);
const storage = new Map();
let loaded;
let downloadUrl;

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
    if (row.document && (row.network !== 'linkedin' || row.assets.length !== 1)) throw new Error('Documento permitido apenas para LinkedIn.');
    const key = nameOf(row);
    if (seen.has(key)) throw new Error('O pacote contém duas publicações para a mesma marca, rede e horário.');
    seen.add(key);
    for (const asset of row.assets) {
      const file = byName.get(asset.name);
      const extension = row.document ? /\.pdf$/i : /\.png$/i;
      if (!file || !/^[\w.-]+$/.test(asset.name) || !extension.test(asset.name) || file.size < 8 || file.size > 10000000 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
        throw new Error('Falta uma arte válida no pacote.');
      }
      if (!verified.has(asset.name)) {
        const buffer = await file.arrayBuffer();
        const magic = new Uint8Array(buffer, 0, 8);
        const expected = row.document ? '37,80,68,70,45' : '137,80,78,71,13,10,26,10';
        if (!Array.from(magic).join(',').startsWith(expected)) throw new Error('Formato da arte inválido.');
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

async function stage() {
  picker.disabled = stageButton.disabled = true;
  try {
    if (!await refreshIfNeeded()) throw new Error('Entre no VM Estúdio para enviar o pacote.');
    const profiles = new Map((await listBrands()).map(p => [p.label, p.blogId]));
    const rows = [];
    for (const row of loaded.posts) {
      setStatus(`Preparando ${nameOf(row)}…`);
      if (!profiles.get(row.brand)) throw new Error(`Marca não conectada: ${row.brand}.`);
      const media = [];
      for (const asset of row.assets) media.push(await upload(asset));
      const { out, assets, ...publication } = row;
      rows.push({ ...publication, blogId: profiles.get(row.brand), assets, media });
      out.textContent = `${media.length} anexo(s) preparado(s)`;
    }
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([JSON.stringify({ edition: loaded.edition, timezone: loaded.timezone, posts: rows })], {type:'application/json'}));
    download.href = downloadUrl;
    download.download = `Radar${loaded.edition}-anexos.json`;
    download.hidden = false;
    setStatus(`${rows.length} publicações com anexos preparados.`);
  } catch (error) {
    setStatus(error.message || 'Falha ao preparar os anexos.');
  } finally {
    picker.disabled = stageButton.disabled = false;
  }
}

picker.addEventListener('change', async () => {
  loaded = null;
  stageButton.disabled = true;
  download.hidden = true;
  posts.replaceChildren();
  try {
    loaded = await readPackage(Array.from(picker.files));
    render(loaded);
    stageButton.disabled = false;
    setStatus(`Radar ${loaded.edition} · ${loaded.posts.length} publicações · artes conferidas.`);
  } catch (error) {
    setStatus(error.message || 'Falha ao ler o pacote.');
  }
});
stageButton.addEventListener('click', stage);
