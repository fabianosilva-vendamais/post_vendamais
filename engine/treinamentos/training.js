import { db } from '../store.js?vm202611011656';
import { refreshIfNeeded, sendEmailAccess, signInWithEmailAccess, uploadPublic } from '../supabase.js?vm202611011656';

const routes = {
  br_ig: { name: 'Instagram · Brasil', network: 'instagram', lang: 'pt', brand: '6944421', height: 1350 },
  br_li: { name: 'LinkedIn · Brasil', network: 'linkedin', lang: 'pt', brand: '6944421', height: 1080 },
  latam_ig: { name: 'Instagram · LATAM', network: 'instagram', lang: 'es', brand: '7718406', height: 1350 },
  latam_li: { name: 'LinkedIn · LATAM', network: 'linkedin', lang: 'es', brand: '7718406', height: 1080 },
};
const zone = 'America/Sao_Paulo';
const state = { rows: [], publications: [], assets: [], photos: new Map(), active: null, route: 'br_ig', busy: false, dirty: false };
const $ = id => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const base = () => db.settings.supabase_url.replace(/\/$/, '');
const headers = () => ({
  apikey: db.settings.supabase_anon_key,
  Authorization: 'Bearer ' + db.session.access_token,
  'Content-Type': 'application/json',
});
const formatDate = value => new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short' }).format(new Date(value));
const isFrozen = item => state.publications.some(p => p.post_id === item.id);
const routeKeys = item => Object.keys(routes).filter(k => !k.startsWith('latam') || item.market === 'latam');
const selected = () => state.active?.draft.selected ?? [];
const logoKey = () => state.active?.draft.useLogo ? state.active.draft.logoKey : null;

function notify(text = '', error = false) {
  $('notice').textContent = text;
  $('notice').classList.toggle('error', error);
}

async function request(path, { method = 'GET', body, prefer } = {}) {
  if (!(await refreshIfNeeded())) throw new Error('Sua sessão expirou. Entre novamente no Estúdio.');
  const h = headers();
  if (prefer) h.Prefer = prefer;
  const response = await fetch(base() + '/rest/v1/' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Falha ao acessar a fila de treinamentos.');
  return data;
}

async function run(callback) {
  if (state.busy) return;
  state.busy = true;
  notify();
  const buttons = [...document.querySelectorAll('button:not(:disabled)')];
  buttons.forEach(button => { button.disabled = true; });
  try { await callback(); }
  catch (error) { notify(error.message, true); }
  finally {
    state.busy = false;
    buttons.forEach(button => { if (button.isConnected) button.disabled = false; });
  }
}

function labelFor(item) {
  if (item.status === 'discarded') return 'Descartado';
  const jobs = state.publications.filter(p => p.post_id === item.id);
  if (jobs.some(p => p.status !== 'scheduled')) return 'Conferir Metricool';
  if (jobs.length && jobs.length === routeKeys(item).length) return 'Agendado';
  if (jobs.length) return 'Parcialmente agendado';
  return item.status === 'needs_photo' ? 'Precisa de foto' : 'Em revisão';
}

function button(text, callback, className) {
  const node = el('button', text, className);
  node.type = 'button';
  node.addEventListener('click', callback);
  return node;
}

function queue() {
  const filter = $('filter').value;
  const items = state.rows.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'discarded') return item.status === 'discarded';
    if (filter === 'scheduled') return labelFor(item) === 'Agendado';
    return item.status !== 'discarded' && labelFor(item) !== 'Agendado';
  });
  $('queue').replaceChildren(...items.map(item => {
    const node = button(null, () => run(() => openItem(item)), 'queue-item');
    node.setAttribute('aria-current', String(state.active?.id === item.id));
    node.append(el('strong', item.client), el('small', [item.city, formatDate(item.submitted_at)].filter(Boolean).join(' · ')), el('small', labelFor(item)));
    return node;
  }));
  if (!items.length) $('queue').append(el('p', 'Nenhum treinamento nesta fila.', 'empty'));
}

async function load() {
  if (!(await refreshIfNeeded())) {
    $('login').hidden = false;
    $('workspace').hidden = true;
    return;
  }
  $('login').hidden = true;
  $('workspace').hidden = false;
  $('reload').hidden = false;
  [state.rows, state.publications] = await Promise.all([
    request('training_posts?select=id,source_row,submitted_at,client,city,topic,market,status,draft,revision&order=submitted_at.desc'),
    request('training_publications?select=post_id,destination,scheduled_for,status,remote_id'),
  ]);
  const wanted = state.active?.id ?? new URLSearchParams(location.search).get('id');
  const item = state.rows.find(r => r.id === wanted) ?? state.rows.find(r => r.status !== 'discarded');
  if (item) await openItem(item, true);
  else {
    queue();
    $('detail').replaceChildren(el('p', 'Os próximos treinamentos aparecem aqui assim que forem processados.', 'empty'));
  }
}

async function openItem(item, force = false) {
  if (!force && state.dirty && !confirm('Descartar alterações ainda não salvas?')) return;
  state.active = structuredClone(item);
  state.dirty = false;
  state.route = 'br_ig';
  state.assets = await request('training_assets?post_id=eq.' + item.id + '&select=asset_key,kind,mime_type,note,rank&order=rank');
  for (const url of state.photos.values()) URL.revokeObjectURL(url);
  state.photos.clear();
  queue();
  drawDetail();
}

async function mediaUrl(asset) {
  if (!state.photos.has(asset.asset_key)) {
    const rows = await request('training_assets?post_id=eq.' + state.active.id + '&asset_key=eq.' + encodeURIComponent(asset.asset_key) + '&select=bytes');
    const hex = rows[0]?.bytes;
    if (typeof hex !== 'string' || !/^\\x[0-9a-f]+$/i.test(hex)) throw new Error('Arquivo indisponível.');
    const bytes = new Uint8Array((hex.length - 2) / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2 + 2, i * 2 + 4), 16);
    state.photos.set(asset.asset_key, URL.createObjectURL(new Blob([bytes], { type: asset.mime_type })));
  }
  return state.photos.get(asset.asset_key);
}

async function imgFor(key) {
  const asset = state.assets.find(a => a.asset_key === key);
  if (!asset) throw new Error('A foto selecionada não está disponível.');
  const image = new Image();
  image.src = await mediaUrl(asset);
  await image.decode();
  return image;
}

function fit(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function cover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const cropWidth = width / scale, cropHeight = height / scale;
  ctx.drawImage(image, (image.naturalWidth - cropWidth) / 2, (image.naturalHeight - cropHeight) / 2, cropWidth, cropHeight, x, y, width, height);
}

async function artwork(key) {
  const item = state.active, route = routes[key];
  const content = item.draft.variants?.[key] ?? {};
  const photos = await Promise.all(selected().map(imgFor));
  if (!photos.length) return [];
  const brand = new Image();
  brand.src = '/assets/brand/logo-negativo.png';
  await brand.decode();
  const clientLogo = logoKey() ? await imgFor(logoKey()) : null;
  const groups = item.draft.format === 'carousel' ? photos.map(p => [p]) : [photos.slice(0, item.draft.format === 'collage' ? 2 : 1)];
  return groups.map((frames, index) => {
    const canvas = el('canvas');
    canvas.width = 1080;
    canvas.height = route.height;
    canvas.setAttribute('aria-label', route.name + ', página ' + (index + 1));
    const ctx = canvas.getContext('2d');
    const height = canvas.height;
    ctx.fillStyle = '#18283c'; ctx.fillRect(0, 0, 1080, height);
    ctx.fillStyle = '#de793d'; ctx.fillRect(62, 48, 47, 5);
    ctx.fillStyle = '#fff'; ctx.font = '700 55px system-ui, sans-serif';
    const line = content.headline || item.client;
    const words = line.trim().split(/\s+/);
    const lines = [];
    for (const word of words) {
      const next = (lines.at(-1) ? lines.at(-1) + ' ' : '') + word;
      if (ctx.measureText(next).width > 960 && lines.length < 2 && lines.at(-1)) lines.push(word);
      else if (lines.length) lines[lines.length - 1] = next;
      else lines.push(word);
    }
    lines.forEach((part, n) => ctx.fillText(part, 62, 112 + 58 * n, 956));
    const photoY = lines.length > 1 ? 193 : 143, photoH = height - 136 - photoY;
    ctx.fillStyle = '#21364c'; ctx.fillRect(62, photoY, 956, photoH);
    if (frames.length === 1) {
      const photo = frames[0];
      const ratio = photo.naturalWidth / photo.naturalHeight / (956 / photoH);
      if (ratio > .88 && ratio < 1.12) cover(ctx, photo, 62, photoY, 956, photoH);
      else fit(ctx, photo, 62, photoY, 956, photoH);
    } else {
      frames.forEach((photo, n) => fit(ctx, photo, 62 + n * 480, photoY + 4, 476, photoH - 8));
    }
    fit(ctx, brand, 62, height - 103, 171, 56);
    if (clientLogo) {
      ctx.fillStyle = '#fff'; ctx.fillRect(255, height - 110, 154, 70);
      fit(ctx, clientLogo, 266, height - 103, 132, 56);
    }
    ctx.fillStyle = '#fff'; ctx.font = '500 24px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(item.client, 1018, height - 63, 580);
    return canvas;
  });
}

let previewVersion = 0;
async function refreshPreview() {
  const preview = $('preview');
  if (!preview) return;
  const version = ++previewVersion;
  if (!selected().length) { preview.replaceChildren(el('p', 'Selecione uma foto para ver a prévia.', 'muted')); return; }
  preview.replaceChildren(el('p', 'Montando a prévia…', 'muted'));
  try {
    const art = await artwork(state.route);
    if (version === previewVersion && preview.isConnected) preview.replaceChildren(...art);
  } catch (error) {
    if (version === previewVersion && preview.isConnected) preview.replaceChildren(el('p', error.message, 'muted'));
  }
}

function changeField(field, input) {
  const variants = state.active.draft.variants ??= {};
  const variant = variants[state.route] ??= {};
  variant[field] = input.value;
  state.dirty = true;
}

function selectField(title, options, value, onChange, disabled) {
  const label = el('label', title + ' ');
  const input = el('select');
  Object.entries(options).forEach(([key, text]) => {
    const option = el('option', text); option.value = key; input.append(option);
  });
  input.value = value;
  input.disabled = disabled;
  input.addEventListener('change', () => onChange(input.value));
  label.append(input);
  return label;
}

function drawDetail() {
  const item = state.active, root = $('detail');
  const locked = isFrozen(item) || item.status === 'discarded';
  const keys = routeKeys(item);
  if (!keys.includes(state.route)) state.route = keys[0];
  root.replaceChildren();
  const head = el('div', null, 'detail-head');
  const titles = el('div');
  titles.append(el('h2', item.client), el('p', [item.city, item.topic].filter(Boolean).join(' · ')));
  head.append(titles, el('span', labelFor(item), 'status'));
  const settings = el('div', null, 'settings');
  settings.append(
    selectField('Destino', { br: 'Brasil', latam: 'Brasil + LATAM', review: 'A confirmar' }, item.market, value => {
      item.market = value; state.dirty = true; drawDetail();
    }, locked),
    selectField('Formato', { single: 'Foto única', collage: 'Composição de duas fotos', carousel: 'Carrossel curto' }, item.draft.format ?? 'single', value => {
      item.draft.format = value; state.dirty = true; refreshPreview();
    }, locked),
  );
  const tabs = el('div', null, 'tabs');
  tabs.setAttribute('role', 'tablist');
  keys.forEach(key => {
    const node = button(routes[key].name, () => { state.route = key; drawDetail(); });
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', String(state.route === key));
    tabs.append(node);
  });
  const editor = el('div', null, 'editor'), art = el('section'), copy = el('section', null, 'caption');
  const preview = el('div', null, 'preview-list'); preview.id = 'preview';
  art.append(el('h3', 'Prévia · 1080 × ' + routes[state.route].height), preview);
  const activeCopy = item.draft.variants?.[state.route] ?? {};
  [['headline', 'Título na arte', 'input', 94], ['caption', 'Legenda', 'textarea', routes[state.route].network === 'instagram' ? 2200 : 3000]].forEach(([field, title, tag, max]) => {
    const node = el(tag); node.id = 'field-' + field; node.maxLength = max;
    node.value = activeCopy[field] ?? ''; node.disabled = locked;
    const label = el('label', title); label.htmlFor = node.id;
    node.addEventListener('input', () => changeField(field, node));
    if (field === 'headline') node.addEventListener('change', refreshPreview);
    copy.append(label, node);
  });
  editor.append(art, copy);
  root.append(head, settings, tabs, editor, mediaSection(locked), publishingSection());
  refreshPreview();
}

function mediaSection(locked) {
  const item = state.active, section = el('section', null, 'media-section');
  section.append(el('h3', 'Fotos do treinamento'));
  const gallery = el('div', null, 'assets');
  state.assets.filter(a => a.kind === 'photo').forEach((asset, index) => {
    const card = el('label', null, 'asset'), img = el('img');
    img.alt = 'Foto ' + (index + 1); img.loading = 'lazy';
    const check = el('input'); check.type = 'checkbox'; check.checked = selected().includes(asset.asset_key); check.disabled = locked;
    check.addEventListener('change', () => {
      const keys = selected().filter(k => k !== asset.asset_key);
      if (check.checked && keys.length >= 4) { check.checked = false; notify('Selecione até quatro fotos.', true); return; }
      item.draft.selected = check.checked ? [...keys, asset.asset_key] : keys;
      state.dirty = true; refreshPreview();
    });
    card.append(img, check, document.createTextNode(' Foto ' + (index + 1)), el('small', asset.note));
    gallery.append(card);
    mediaUrl(asset).then(url => { if (img.isConnected) img.src = url; }).catch(() => { img.alt = 'Imagem indisponível'; });
  });
  section.append(gallery);
  if (!gallery.children.length) section.append(el('p', 'A resposta veio sem uma foto selecionável.', 'muted'));
  if (!locked) {
    const file = el('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp';
    const label = el('label', 'Adicionar foto ', 'file'); label.append(file); section.append(label);
    file.addEventListener('change', () => run(() => addPhoto(file.files[0])));
  }
  if (item.draft.logoKey && state.assets.some(a => a.asset_key === item.draft.logoKey && a.kind === 'logo')) {
    const label = el('label', null, 'logo-check'), use = el('input'); use.type = 'checkbox'; use.checked = !!item.draft.useLogo; use.disabled = locked;
    use.addEventListener('change', () => { item.draft.useLogo = use.checked; state.dirty = true; refreshPreview(); });
    label.append(use, document.createTextNode(' Incluir logomarca oficial do cliente')); section.append(label);
  }
  const source = el('p', null, 'source muted');
  const sheet = el('a', 'Ver resposta original'); sheet.href = 'https://docs.google.com/spreadsheets/d/1qL0lXddbdTx9CeKYxAuNgHvMPVDNlLqHBbBO6pMnhqs/edit#gid=777889679&range=A' + item.source_row;
  sheet.target = '_blank'; sheet.rel = 'noopener noreferrer';
  source.append(sheet);
  try {
    const url = new URL(item.draft.officialSite);
    if (url.protocol === 'https:') {
      const site = el('a', 'Site do cliente'); site.href = url.href; site.target = '_blank'; site.rel = 'noopener noreferrer';
      source.append(document.createTextNode(' · '), site);
    }
  } catch { /* A confirmação do site é opcional. */ }
  section.append(source);
  return section;
}

async function addPhoto(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12000000) throw new Error('Escolha uma foto JPG, PNG ou WebP de até 12 MB.');
  const image = await createImageBitmap(file);
  const canvas = el('canvas');
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
  if (!blob) throw new Error('Não foi possível ler a foto.');
  const asset = { post_id: state.active.id, asset_key: 'upload-' + crypto.randomUUID(), kind: 'photo', mime_type: 'image/jpeg', note: 'Adicionada na revisão', rank: state.assets.length };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  await request('training_assets', { method: 'POST', body: { ...asset, bytes: '\\x' + hex } });
  state.assets.push(asset);
  if (selected().length < 4) state.active.draft.selected = [...selected(), asset.asset_key];
  state.dirty = true; drawDetail();
}

async function saveDraft(status = selected().length ? 'review' : 'needs_photo') {
  const item = state.active;
  if (!state.dirty && item.status === status) return;
  const updated = await request('training_posts?id=eq.' + item.id + '&revision=eq.' + item.revision, {
    method: 'PATCH', prefer: 'return=representation',
    body: { draft: item.draft, market: item.market, status, revision: item.revision + 1 },
  });
  if (!updated.length) throw new Error('A postagem foi alterada em outra sessão. Atualize a fila.');
  Object.assign(item, updated[0]); state.dirty = false;
  state.rows = state.rows.map(row => row.id === item.id ? structuredClone(item) : row);
  queue();
}

function publishingSection() {
  const item = state.active, section = el('section', null, 'publishing');
  if (item.status === 'discarded') return section;
  const existing = new Map(state.publications.filter(p => p.post_id === item.id).map(p => [p.destination, p]));
  section.append(el('h3', 'Agendamento no Metricool'));
  const channels = el('div', null, 'channels'), checks = [];
  for (const key of routeKeys(item)) {
    const name = routes[key].name, prior = existing.get(key);
    if (prior) {
      const label = prior.status === 'scheduled' ? 'Agendado para ' + formatDate(prior.scheduled_for) : 'Aguardando conferência no Metricool';
      channels.append(el('p', name + ' · ' + label, 'compact'));
    } else {
      const check = el('input'); check.type = 'checkbox'; check.value = key; check.checked = true; checks.push(check);
      const label = el('label'); label.append(check, document.createTextNode(name)); channels.append(label);
    }
  }
  section.append(channels);
  const when = el('input'); when.type = 'datetime-local'; when.id = 'publish-date';
  const label = el('label', 'Data e horário de Brasília '); label.htmlFor = when.id; label.append(when);
  if (checks.length) section.append(label);
  const actions = el('div', null, 'actions');
  if (!isFrozen(item)) {
    actions.append(button('Salvar rascunho', () => run(async () => { await saveDraft(); drawDetail(); notify('Rascunho salvo.'); })));
    actions.append(button('Descartar postagem', () => {
      if (confirm('Descartar esta postagem da fila de revisão?')) run(async () => { await saveDraft('discarded'); drawDetail(); notify('Postagem descartada.'); });
    }, 'danger'));
  }
  if (checks.length) actions.append(button('Aprovar e agendar', () => run(() => publish(checks.filter(c => c.checked).map(c => c.value), when.value)), 'primary'));
  if (existing.size) {
    const planner = el('a', 'Abrir Metricool', 'compact'); planner.href = 'https://app.metricool.com/'; planner.target = '_blank'; planner.rel = 'noopener noreferrer'; actions.append(planner);
  }
  section.append(actions);
  return section;
}

async function metricool(body) {
  if (!(await refreshIfNeeded())) throw new Error('Sessão expirada.');
  const response = await fetch(base() + '/functions/v1/publish-schedule', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || 'O Metricool não confirmou o agendamento.');
  return data;
}

async function publish(keys, localDate) {
  const item = state.active;
  if (item.market === 'review') throw new Error('Confirme se o destino é Brasil ou Brasil + LATAM.');
  if (!keys.length || !selected().length) throw new Error('Selecione pelo menos uma foto e um canal.');
  if (['carousel', 'collage'].includes(item.draft.format) && selected().length < 2) throw new Error('Selecione duas fotos ou altere o formato para foto única.');
  const date = new Date(localDate + ':00-03:00');
  if (!localDate || !Number.isFinite(+date) || +date <= Date.now() || +date > Date.now() + 180 * 86400000) throw new Error('Escolha uma data futura dentro dos próximos 180 dias.');
  if (keys.some(key => !item.draft.variants?.[key]?.caption?.trim())) throw new Error('Preencha a legenda de todos os canais selecionados.');
  await metricool({ action: 'brands' });
  await saveDraft('review');
  for (const key of keys) {
    const route = routes[key], variant = item.draft.variants[key];
    let claimed = false;
    try {
      const art = await artwork(key);
      const attempt = crypto.randomUUID();
      const mediaUrls = await Promise.all(art.map((canvas, index) => uploadPublic('renders', 'training/' + item.id + '/' + key + '/' + attempt + '-' + index + '.jpg', canvas.toDataURL('image/jpeg', .9))));
      claimed = await request('rpc/claim_training_publication', {
        method: 'POST', body: { training_id: item.id, expected_revision: item.revision, target: key, publish_at: date.toISOString() },
      });
      if (!claimed) continue;
      const channel = await metricool({
        action: 'schedule', blogId: route.brand, text: variant.caption, mediaUrls, networks: [route.network],
        dateTime: localDate + ':00', timezone: zone, draft: false,
        linkedinDocumentTitle: route.network === 'linkedin' && art.length > 1 ? (variant.headline || item.client).slice(0, 58) : '',
        altText: variant.alt || ('Equipe em treinamento da VendaMais com ' + item.client),
      });
      const remoteId = channel.result?.id ?? channel.result?.data?.id;
      if (!remoteId) throw new Error('O Metricool respondeu sem o identificador da postagem.');
      await request('training_publications?post_id=eq.' + item.id + '&destination=eq.' + key, { method: 'PATCH', body: { status: 'scheduled', remote_id: String(remoteId) } });
    } catch (error) {
      if (claimed) {
        await request('training_publications?post_id=eq.' + item.id + '&destination=eq.' + key, { method: 'PATCH', body: { status: 'verify' } }).catch(() => {});
        await load();
        notify(route.name + ' precisa ser conferido no Metricool. Os canais seguintes podem ser agendados na fila.', true);
        return;
      }
      await load();
      throw error;
    }
  }
  await load();
  const results = state.publications.filter(p => p.post_id === item.id && keys.includes(p.destination));
  notify(results.length === keys.length && results.every(p => p.status === 'scheduled') ? 'Agendamento confirmado no Metricool.' : 'Confira a confirmação de cada canal na fila.');
}

$('send-code').addEventListener('click', () => run(async () => { await sendEmailAccess($('email').value); notify('Confira o código no seu e-mail.'); }));
$('verify-code').addEventListener('click', () => run(async () => { await signInWithEmailAccess($('email').value, $('code').value); await load(); }));
$('reload').addEventListener('click', () => {
  if (!state.dirty || confirm('Descartar alterações ainda não salvas?')) run(load);
});
$('filter').addEventListener('change', queue);
if (window.__VM_SUPABASE_URL__) db.settings.supabase_url = window.__VM_SUPABASE_URL__;
if (window.__VM_SUPABASE_ANON__) db.settings.supabase_anon_key = window.__VM_SUPABASE_ANON__;
if (!db.settings.supabase_url || !db.settings.supabase_anon_key) notify('O ambiente do Estúdio não está configurado.', true);
else run(load);
