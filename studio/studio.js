import * as api from './backend.js';
import { renderEmail, renderPlainText } from '../engine/newsletter-render.js';
import { ANGLES, LANGS, approvedPost, captionFor, dateLabel, dayInBrazil, isManaged, nextWednesday,
  parseNewsletter, plainCaption, publicationId, scheduleRows, selectedNewsletter } from './domain.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const live = document.querySelector('#live');
const signOut = document.querySelector('#sign-out');
const state = { editions: [], id: '', detail: null, step: 'newsletter', angle: 'consulting',
  lang: 'pt', device: 'desktop', pending: '', jobs: '', plan: {}, remote: null };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const badge = (text, style = '') => `<span class="badge ${style}">${esc(text)}</span>`;
const button = (name, label, style = '', disabled = false) =>
  `<button type="button" class="button ${style}" data-action="${name}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const message = (text, error = false) => `<p class="message${error ? ' error' : ''}">${esc(text)}</p>`;
const field = (name, label, value = '', type = 'text', extra = '') =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" required ${extra}></label>`;

function announce(text, error = false) {
  clearTimeout(announce.timer);
  live.textContent = text;
  live.hidden = !text;
  live.classList.toggle('error', error);
  if (text) announce.timer = setTimeout(() => { live.hidden = true; }, error ? 9000 : 5500);
}
function login(email = '', access = false) {
  const picker = access ? field('proof', 'Código ou link do e-mail', '', 'text', 'autocomplete="one-time-code"') :
    field('password', 'Senha', '', 'password', 'autocomplete="current-password"');
  app.innerHTML = `<section class="auth panel"><form id="login"><h1>Entre no Estúdio</h1>
    ${field('email', 'E-mail', email, 'email', 'autocomplete="username"')}${picker}
    ${access ? '<p class="muted">Use o código ou copie o link original enviado pelo Estúdio.</p>' : ''}
    <p class="error-line" role="alert" hidden></p><div class="actions"><button class="button primary">Entrar</button>
    <button type="button" class="button" data-action="${access ? 'login-password' : 'login-email'}">${access ? 'Usar senha' : 'Receber acesso por e-mail'}</button></div></form></section>`;
  signOut.hidden = true;
}
async function loadList(preferred) {
  state.editions = await api.listEditions();
  const known = new Set(state.editions.map(e => e.id));
  const id = [preferred, new URLSearchParams(location.search).get('edicao'), localStorage.getItem('vm_radar_edition'), state.editions[0]?.id]
    .find(value => known.has(value));
  if (id) await openEdition(id);
  else render();
}
async function openEdition(id, preserveStep = false) {
  const moved = state.id !== id;
  const detail = await api.editionDetails(id);
  state.id = id;
  state.detail = detail;
  if (moved) {
    state.angle = 'consulting';
    state.lang = 'pt';
    state.plan = {};
    state.remote = null;
  }
  if (!preserveStep) {
    const approvedCount = detail.posts.filter(post => post.angle !== 'meme' && approvedPost(post)).length;
    state.step = approvedCount === 3 ? 'publication' :
      selectedNewsletter(detail.newsletters)?.is_approved && detail.posts.length ? 'posts' : 'newsletter';
  }
  localStorage.setItem('vm_radar_edition', id);
  render();
}
function render() {
  signOut.hidden = false;
  if (!state.detail) {
    app.innerHTML = `<div class="heading"><h1>Radar VendaMais</h1>${button('new', 'Nova newsletter', 'primary')}</div>
      <div class="panel panel-body"><h2>Crie a primeira newsletter</h2><p class="muted">Cole o texto final para conferir a prévia e aprovar.</p></div>`;
    return;
  }
  const { edition, newsletters, posts, publications } = state.detail;
  const newsletter = selectedNewsletter(newsletters);
  const approved = posts.filter(p => p.angle !== 'meme' && approvedPost(p)).length;
  const known = publications.filter(p => !p.draft && ['scheduled','published'].includes(p.status) && publicationId(p)).length;
  const options = state.editions.map(e => `<option value="${esc(e.id)}" ${e.id === edition.id ? 'selected' : ''}>${esc(e.number ? 'News ' + e.number + ' · ' : '')}${esc(e.title.replace(/^Newsletter \d+ · /i, ''))}</option>`).join('');
  const step = (id, title, sub) => `<button type="button" class="step" data-step="${id}" ${state.step === id ? 'aria-current="step"' : ''}><strong>${title}</strong><span>${sub}</span></button>`;
  const nlStatus = newsletter?.is_approved ? 'Aprovada' : newsletter?.meta?.radar_note ? 'Ajustes solicitados' : newsletter ? 'Aguardando aprovação' : 'Rascunho';
  app.innerHTML = `<div class="heading"><h1>Radar VendaMais</h1><div class="actions">${button('new', 'Nova newsletter')}</div></div>
    <div class="edition"><p>News ${esc(edition.brief?.number || '')} ${edition.edition_date ? '· ' + dateLabel(edition.edition_date) : ''}</p><h2>${esc(newsletter?.content_json?.headline || edition.title)}</h2></div>
    <div class="actions"><label class="field">Trocar edição<select id="edition-selector" ${state.pending ? 'disabled' : ''}>${options}</select></label></div>
    <nav class="steps" aria-label="Etapas da edição">
      ${step('newsletter', 'Newsletter', nlStatus)}
      ${step('posts', 'Posts', approved + ' de 3 aprovados')}
      ${step('publication', 'Publicação', known ? known + ' posts registrados' : approved === 3 && newsletter?.is_approved ? 'Aguardando aprovação' : 'Aguardando conteúdo')}
    </nav>${state.jobs ? message(state.jobs) : ''}${state.pending ? message(state.pending) : ''}
    ${state.step === 'newsletter' ? newsletterPanel(newsletter) : state.step === 'posts' ? postsPanel(newsletter) : publicationPanel(newsletter, approved)}`;
  if (state.step === 'newsletter' && newsletter) {
    const frame = app.querySelector('iframe');
    if (frame) frame.srcdoc = previewHtml(newsletter);
  }
  if (state.step === 'posts') {
    const post = currentPost();
    if (post) loadArt(post, state.lang);
  }
}

function newsletterOutput(newsletter) {
  const { edition, logos } = state.detail;
  const logoBy = (type, fallback) => {
    const value = logos.find(logo => logo.type === type)?.file_url;
    if (typeof value === 'string' && /^https:\/\//i.test(value)) return value;
    return new URL(fallback, location.origin).href;
  };
  const opts = { editionNumber: edition.brief.number, editionDate: dateLabel(edition.edition_date),
    logoUrl: logoBy('logo_primary', '/assets/brand/logo-principal.png'),
    logoNegUrl: logoBy('logo_negative', '/assets/brand/logo-negativo.png') };
  const content = newsletter.content_json;
  return { html: renderEmail(content, opts), plain: renderPlainText(content, opts) };
}
function previewHtml(newsletter) {
  const html = newsletter.is_approved && newsletter.html ? newsletter.html : newsletterOutput(newsletter).html;
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'"><style>body{margin:0} img{max-width:100%;height:auto} table{max-width:100%} *{overflow-wrap:anywhere}</style>${html}`;
}
function newsletterPanel(newsletter) {
  if (!newsletter) return `<section class="panel panel-body">${message('Esta edição ainda não tem uma newsletter.')}</section>`;
  const editable = isManaged(state.detail.edition) && !newsletter.is_approved;
  const editing = newsletter.meta?.radar_state === 'changes';
  const subject = newsletter.content_json.subject || newsletter.content_json.headline;
  const toggles = [['desktop','Computador'],['mobile','Celular']].map(([id,label]) =>
    `<button type="button" data-device="${id}" aria-pressed="${state.device === id}">${label}</button>`).join('');
  return `<section class="panel" aria-label="Revisão da newsletter">
    <header class="panel-head"><h2>Prévia da newsletter</h2>${badge(newsletter.is_approved ? 'Aprovada' : editing ? 'Ajustes solicitados' : 'Aguardando aprovação', newsletter.is_approved ? 'good' : 'wait')}</header>
    ${editing ? '<div class="panel-body">' + message(newsletter.meta.radar_note) + '</div>' : ''}
    <div class="preview-controls"><p><strong>Assunto</strong> ${esc(subject)}</p><div class="switch" aria-label="Tamanho da prévia">${toggles}</div></div>
    <div class="preview ${state.device}"><iframe title="Prévia da newsletter" sandbox referrerpolicy="no-referrer"></iframe></div>
    <footer class="foot"><div class="actions">${editable ?
      button(editing ? 'edit-newsletter' : 'approve-newsletter', editing ? 'Salvar versão revisada' : 'Aprovar newsletter', 'primary', !!state.pending) +
      (!editing ? button('request-newsletter', 'Solicitar ajustes', '', !!state.pending) : '') :
      newsletter.is_approved ? button('view-posts', 'Ver posts', 'primary') : ''}</div>
    <p>${newsletter.is_approved ? 'Versão aprovada protegida.' : editable ? 'A publicação será aprovada na última etapa.' : 'Edição do histórico.'}</p></footer></section>`;
}
function currentPost() { return state.detail.posts.find(p => p.angle === state.angle); }
function postStatus(post) {
  if (approvedPost(post)) return 'Aprovado';
  if (post?.meta?.radar_note) return 'Ajustes solicitados';
  if (post?.meta?.radar_pt_approved) return 'Revisar espanhol';
  if (post?.meta?.final_artworks?.pt) return 'Revisar português';
  return 'Em preparação';
}
function postsPanel(newsletter) {
  if (!newsletter?.is_approved) return `<section class="panel panel-body"><h2>Posts da edição</h2><p class="muted">Aprove a newsletter para preparar os três posts.</p></section>`;
  const post = currentPost();
  const choices = ANGLES.map(angle => {
    const item = state.detail.posts.find(p => p.angle === angle.id);
    return `<button class="post-choice" type="button" data-angle="${angle.id}" aria-pressed="${state.angle === angle.id}">
      <strong>${angle.label}</strong><span>${postStatus(item)}</span></button>`;
  }).join('');
  let review = `<div class="post-review"><h3>Aguardando a preparação</h3><p class="muted">As peças partem da newsletter aprovada.</p>
    <div class="actions">${isManaged(state.detail.edition) ? button('prepare-posts', 'Preparar posts', 'primary', !!(state.pending || state.jobs)) : ''}</div></div>`;
  if (post) {
    const { lang } = state;
    const locked = approvedPost(post) || !isManaged(state.detail.edition);
    const canSpanish = !!post.meta?.radar_pt_approved || locked;
    const canReview = api.artworkReady(post, lang) && !!captionFor(post, lang) && !post.meta?.radar_changes;
    const disabled = !!state.pending;
    const copy = captionFor(post, lang);
    const switcher = Object.entries(LANGS).map(([id, label]) => `<button type="button" data-lang="${id}" aria-pressed="${lang === id}" ${id === 'es' && !canSpanish ? 'disabled' : ''}>${label}</button>`).join('');
    const approval = lang === 'pt' && post.meta?.radar_pt_approved ?
      badge('Português aprovado', 'good') :
      button(lang === 'pt' ? 'approve-pt' : 'approve-post', lang === 'pt' ? 'Aprovar português' : 'Aprovar post', 'primary', disabled || !canReview);
    review = `<div class="post-review"><div class="switch" aria-label="Idioma">${switcher}</div>
      ${post.meta?.radar_note ? message(post.meta.radar_note) : ''}
      <div class="post-content"><div class="art" id="art"><span>${post.meta?.final_artworks?.[lang] ? 'Carregando a arte…' : 'Arte em preparação'}</span></div>
      <div class="caption"><h3>Legenda ${lang === 'pt' ? 'em português' : 'em espanhol'}</h3><p>${esc(copy || 'A legenda ainda está em preparação.')}</p>
      <div class="actions">${locked ? '' : button('edit-caption', 'Editar legenda', '', disabled) + button('replace-art', post.meta?.final_artworks?.[lang] ? 'Substituir imagem' : 'Enviar imagem', '', disabled)}</div></div></div>
      <div class="actions">${locked ? badge(postStatus(post), approvedPost(post) ? 'good' : '') : approval +
        button('request-post', 'Solicitar ajustes', '', disabled) +
        (!canReview && !state.jobs && (lang === 'es' || post.content_json?.radar_scene) ?
          button('complete-art', lang === 'es' ? 'Preparar espanhol' : 'Preparar imagem', '', disabled) : '')}</div></div>`;
  }
  return `<section class="panel"><header class="panel-head"><h2>Posts da edição</h2>${badge(state.detail.posts.filter(p => p.angle !== 'meme' && approvedPost(p)).length + ' de 3 aprovados')}</header>
    <div class="posts-layout"><div class="post-list" aria-label="Escolher post">${choices}</div>${review}</div></section>`;
}
async function loadArt(post, lang) {
  const target = app.querySelector('#art');
  if (!target || !post.meta?.final_artworks?.[lang]?.image_id) return;
  try {
    const url = await api.imageUrl(post, lang);
    if (!url) throw new Error('Arte indisponível');
    if (!target.isConnected) return;
    const image = new Image();
    image.alt = 'Arte de ' + ANGLES.find(a => a.id === post.angle).label + ' em ' + LANGS[lang];
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { target.textContent = 'Não foi possível carregar a arte.'; });
    image.src = url;
    target.replaceChildren(image);
  } catch { if (target.isConnected) target.textContent = 'Não foi possível carregar a arte.'; }
}

function publicationPanel(newsletter, approved) {
  const { edition, posts, publications } = state.detail;
  const editable = isManaged(edition) && newsletter?.is_approved && approved === 3 && api.db.user?.role === 'admin';
  const wpRecord = state.remote?.wordpress;
  const wpDate = wpRecord?.date || edition.exports?.wordpress_scheduled_at;
  const wpId = wpRecord?.id || edition.exports?.wordpress_post_id;
  const newsletterTime = state.plan.newsletter || state.remote?.plan?.newsletter || nextWednesday(edition.edition_date || dayInBrazil()) + 'T06:00';
  const rows = scheduleRows(edition, posts, publications);
  const brand = lang => lang === 'pt' ? 'VendaMais Brasil' : 'VendaMais LATAM';
  const slot = (key, time, fixed) => fixed || !editable || state.remote?.plan ? dateLabel(state.remote?.plan?.[key] || time) :
    `<input aria-label="Horário de ${esc(key)}" type="datetime-local" data-date="${esc(key)}" value="${esc((state.plan[key] || time).slice(0, 16))}">`;
  const remoteStatus = (record, remote) => {
    if (remote === 'published') return badge('Publicado', 'good');
    if (remote === 'scheduled') return badge('Agendado', 'good');
    if (remote === 'error') return badge('Erro que exige atenção', 'error');
    if (remote === 'pending') return badge('Confirmação pendente', 'wait');
    if (record?.status === 'published' && publicationId(record)) return badge('Publicado', 'good');
    if (record?.status === 'scheduled' && !record.draft && publicationId(record)) return badge('Agendado', 'good');
    return record ? badge('Confirmação pendente', 'wait') : badge(editable ? 'Aguardando aprovação' : 'Pendente');
  };
  const email = state.remote?.locaweb;
  const mailState = email === 'sent' ? badge('Enviado', 'good') : email === 'created' ? badge('Mensagem criada', 'good') :
    wpId ? badge('Aguardando confirmação', 'wait') : badge('Vinculado à publicação');
  const issue = state.remote?.issue;
  return `<section class="panel"><header class="panel-head"><h2>Programação</h2><span class="muted">Horário de Brasília</span></header>
    ${issue ? '<div class="panel-body">' + message(issue, true) + '</div>' : ''}
    <div class="schedule-wrap"><table class="schedule">
    <thead><tr><th scope="col">Conteúdo</th><th scope="col">Canal</th><th scope="col">Data e horário</th><th scope="col">Situação</th></tr></thead>
    <tbody><tr><td><strong>Newsletter</strong></td><td>Site VendaMais · WordPress</td><td>${slot('newsletter', wpDate || newsletterTime, wpId)}</td>
      <td>${wpRecord?.status === 'publish' ? badge('Publicado', 'good') : wpRecord?.status === 'future' ? badge('Agendado', 'good') : wpId ? badge('Agendamento registrado', 'good') : badge(editable ? 'Aguardando aprovação' : 'Pendente')}</td></tr>
    <tr><td><strong>Envio por e-mail</strong></td><td>Newsletter VendaMais · Locaweb</td><td>Na publicação no site</td><td>${mailState}</td></tr>
    ${rows.map(row => `<tr><td><strong>${row.angle}</strong><small>${LANGS[row.lang]}</small></td>
      <td>${brand(row.lang)}<small>Instagram e LinkedIn</small></td><td>${slot(row.key, row.time, row.record)}</td>
      <td>${remoteStatus(row.record, state.remote?.posts?.[row.key])}</td></tr>`).join('')}</tbody></table></div>
    <footer class="foot"><div class="actions">
      ${editable && (!wpId || rows.some(row => !row.record)) ? button('approve-schedule',state.remote?.plan ? 'Retomar programação' : 'Aprovar programação','accent',!!state.pending) : ''}
      ${(wpId || publications.length || editable) ? button('check-schedule','Conferir situação','',!!state.pending) : ''}
    </div><p>${editable ? 'Ao aprovar, o Estúdio agenda os horários desta tela.' : approved < 3 ? 'A programação abre após aprovar a newsletter e os três posts.' : ''}</p></footer></section>`;
}

function modal(title, fields, submit, accept) {
  dialog.innerHTML = `<form id="form-dialog"><h2>${title}</h2>${fields}<p class="error-line" role="alert" hidden></p>
    <div class="actions"><button class="button" type="button" data-close>Cancelar</button><button class="button primary" type="submit">${submit}</button></div></form>`;
  const form = dialog.querySelector('form');
  form.querySelector('[data-close]').onclick = () => dialog.close();
  form.onsubmit = async event => {
    event.preventDefault();
    const submitter = form.querySelector('[type=submit]');
    if (submitter.disabled) return;
    submitter.disabled = true;
    try {
      await accept(new FormData(form));
      if (dialog.open) dialog.close();
    } catch (error) {
      const line = form.querySelector('[role=alert]');
      line.textContent = error.message;
      line.hidden = false;
    } finally { submitter.disabled = false; }
  };
  dialog.showModal();
}
function newsletterDialog(existing) {
  const current = existing ? selectedNewsletter(state.detail.newsletters) : null;
  const nextNumber = Math.max(0, ...state.editions.map(e => Number(e.number) || 0)) + 1;
  modal(existing ? 'Versão revisada' : 'Nova newsletter',
    field('number', 'Número da edição', existing ? state.detail.edition.brief.number : nextNumber, 'number', existing ? 'readonly min="1"' : 'min="1"') +
    field('date', 'Data da edição', existing ? state.detail.edition.edition_date : nextWednesday(), 'date') +
    `<label class="field">Texto completo<textarea name="source" rows="12" placeholder="Título e texto da newsletter" required>${esc(current?.meta?.radar_source)}</textarea></label>`,
    'Salvar e conferir prévia', async form => {
      const source = String(form.get('source')).trim();
      const payload = { number: String(form.get('number')), date: String(form.get('date')), source, content: parseNewsletter(source),
        ...(current ? { expected_version: current.id } : {}) };
      const id = await api.change('import', null, payload);
      await loadList(id);
      announce('Newsletter salva e pronta para revisão.');
    });
}
function postInput(post, extra = {}) { return { post_id: post.id, expected_at: post.updated_at, ...extra }; }
async function run(label, handler) {
  if (state.pending) return;
  const active = state.id;
  state.pending = label;
  render();
  try { await handler(); } catch (error) { announce(error.message, true); }
  finally {
    state.pending = '';
    if (state.id === active) {
      try { await openEdition(active, true); }
      catch (error) { announce(error.message, true); render(); }
    } else render();
  }
}
async function backgroundPosts() {
  if (state.jobs) return;
  const { edition, newsletters, posts } = state.detail;
  const newsletter = selectedNewsletter(newsletters);
  state.jobs = 'Preparando as três peças em português…';
  render();
  try {
    await api.preparePosts(edition, newsletter, posts);
    const refreshed = await api.editionDetails(edition.id);
    if (state.id === edition.id) { state.detail = refreshed; render(); }
    const incomplete = refreshed.posts.filter(post => !approvedPost(post) && post.content_json?.radar_scene && !post.meta?.final_artworks?.pt);
    for (const post of incomplete) {
      await api.completeArtwork(edition, post, 'pt', announce);
      if (state.id === edition.id) await openEdition(edition.id, true);
    }
    announce('Peças em português prontas para sua revisão.');
  } catch (error) { announce(error.message, true); }
  finally { state.jobs = ''; render(); }
}

async function onAction(action) {
  if (action === 'new' || action === 'edit-newsletter') return newsletterDialog(action === 'edit-newsletter');
  const { edition, newsletters, posts, publications } = state.detail;
  const newsletter = selectedNewsletter(newsletters);
  const post = currentPost();
  if (action === 'view-posts') { state.step = 'posts'; render(); return; }
  if (action === 'approve-newsletter') {
    await run('Salvando a aprovação da newsletter…', async () => {
      await api.change('approve_newsletter', edition.id, { version_id: newsletter.id, ...newsletterOutput(newsletter) });
      state.step = 'posts';
      await openEdition(edition.id, true);
      announce('Newsletter aprovada.');
      void backgroundPosts();
    });
  }
  if (action === 'prepare-posts') await backgroundPosts();
  if (action === 'request-newsletter' || action === 'request-post') {
    modal('Solicitar ajustes', '<label class="field">O que precisa mudar?<textarea name="note" maxlength="2000" required></textarea></label>',
      'Registrar pedido', async form => {
        const subject = action === 'request-newsletter' ? { version_id: newsletter.id } : postInput(post);
        await api.change(action.replace('-', '_'), edition.id, { ...subject, note: form.get('note') });
        await openEdition(edition.id, true);
        announce('Pedido de ajuste registrado.');
      });
  }
  if (action === 'edit-caption') {
    const lang = state.lang;
    modal(`Legenda em ${lang === 'pt' ? 'português' : 'espanhol'}`,
      `<label class="field">Legenda para Instagram e LinkedIn<textarea name="caption" rows="10" maxlength="2500" required>${esc(captionFor(post, lang))}</textarea></label>`,
      'Salvar legenda', async form => {
        await api.change('edit_caption', edition.id, postInput(post, { lang, text: plainCaption(form.get('caption')) }));
        await openEdition(edition.id, true); announce('Legenda salva.');
      });
  }
  if (action === 'replace-art') {
    const lang = state.lang;
    modal('Arte em ' + (lang === 'pt' ? 'português' : 'espanhol'),
      '<label class="field">Arquivo PNG ou JPG<input name="file" type="file" accept="image/png,image/jpeg" required></label><p class="muted">1080 × 1350 pixels, até 8 MB. Use a arte final com o logo oficial da VendaMais.</p>',
      'Salvar imagem', async form => {
        await api.saveArt(edition, post, lang, form.get('file'));
        await openEdition(edition.id, true); announce('Imagem salva.');
      });
  }
  if (action === 'approve-pt') {
    await run('Salvando a aprovação em português…', async () => {
      await api.change('approve_pt', edition.id, postInput(post));
      state.lang = 'es';
      await openEdition(edition.id, true);
      const updated = state.detail.posts.find(item => item.id === post.id);
      if (updated?.id === post.id && !updated.content_es?.caption) {
        state.pending = 'Preparando a versão em espanhol…';
        render();
        await api.completeArtwork(edition, updated, 'es', announce);
      }
    });
  }
  if (action === 'approve-post') {
    await run('Salvando a aprovação do post…', async () => {
      await api.change('approve_post', edition.id, postInput(post));
      const remaining = ANGLES.find(a => a.id !== post.angle && !approvedPost(posts.find(item => item.angle === a.id)));
      if (remaining) { state.angle = remaining.id; state.lang = 'pt'; }
      else state.step = 'publication';
      announce('Post aprovado.');
    });
  }
  if (action === 'complete-art') {
    const lang = state.lang;
    await run(lang === 'pt' ? 'Preparando a imagem…' : 'Preparando a versão em espanhol…',
      () => api.completeArtwork(edition, post, lang, announce));
  }
  if (action === 'check-schedule') {
    await run('Conferindo WordPress, Locaweb e Metricool…', async () => {
      state.remote = await api.publication('check', edition.id);
      announce('Consulta concluída.');
    });
  }
  if (action === 'approve-schedule') {
    const plan = state.remote?.plan || { newsletter: state.plan.newsletter || nextWednesday(edition.edition_date || dayInBrazil()) + 'T06:00' };
    if (!state.remote?.plan) for (const row of scheduleRows(edition, posts, publications)) plan[row.key] = state.plan[row.key] || row.time.slice(0, 16);
    await run('Executando a programação aprovada…', async () => {
      state.remote = await api.publication('approve', edition.id, plan);
      announce(state.remote.issue || 'Programação conferida.', !!state.remote.issue);
    });
  }
}

app.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'edition-selector') {
    const previous = state.id;
    target.disabled = true;
    openEdition(target.value).catch(error => { announce(error.message, true); target.value = previous; })
      .finally(() => { target.disabled = false; });
  }
  if (target.dataset.date) state.plan[target.dataset.date] = target.value;
});
app.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  const { step, angle, lang, device, action } = target.dataset;
  if (step) { state.step = step; render(); app.querySelector(`[data-step="${step}"]`)?.focus(); }
  if (angle) { state.angle = angle; state.lang = 'pt'; render(); app.querySelector(`[data-angle="${angle}"]`)?.focus(); }
  if (lang) { state.lang = lang; render(); app.querySelector(`[data-lang="${lang}"]`)?.focus(); }
  if (device) { state.device = device; render(); app.querySelector(`[data-device="${device}"]`)?.focus(); }
  if (!action) return;
  if (action.startsWith('login-')) {
    const email = app.querySelector('[name=email]').value.trim();
    if (action === 'login-password') { login(email); return; }
    target.disabled = true;
    try { await api.auth.sendEmailAccess(email); login(email, true); announce('Confira seu e-mail para entrar.'); }
    catch (error) { announce(error.message, true); }
    finally { target.disabled = false; }
    return;
  }
  try { await onAction(action); } catch (error) { announce(error.message, true); }
});
app.addEventListener('submit', async event => {
  if (event.target.id !== 'login') return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const submit = form.querySelector('button[type=submit],button:not([type])');
  submit.disabled = true;
  try {
    if (data.has('proof')) await api.auth.signInWithEmailAccess(data.get('email'), data.get('proof'));
    else await api.auth.signIn(data.get('email'), data.get('password'));
    await loadList();
  } catch (error) {
    const line = form.querySelector('[role=alert]');
    line.hidden = false;
    line.textContent = error.message;
  } finally { submit.disabled = false; }
});
signOut.onclick = () => { api.auth.signOut(); state.detail = null; state.id = ''; login(); };

try {
  if (api.auth.configured() && await api.auth.refreshIfNeeded()) await loadList();
  else login();
} catch (error) {
  app.innerHTML = '<div class="panel panel-body">' + message(error.message, true) + '<a class="button" href="">Tentar novamente</a></div>';
} finally { app.setAttribute('aria-busy', 'false'); }
