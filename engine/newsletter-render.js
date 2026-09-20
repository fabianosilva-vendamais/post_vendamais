// Render determinístico da newsletter: JSON -> HTML de e-mail (tabelas, 600px, inline, sem JS) + plain text.
// Baseado no piloto Radar VendaMais v2. Fonte Poppins com fallback Arial (Outlook).
const C = { navy: '#16263A', orange: '#E2742B', white: '#FFFFFF', sand: '#FAF7F2', line: '#E6E2DA', ink: '#1E1E1E', gray: '#5E6770', grayl: '#9FB3C2', bg: '#EEF1F4' };
const F = "Poppins, Arial, Helvetica, sans-serif";
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl = (s = '', pstyle = '') => esc(s).trim().replace(/\n{2,}/g, `</p><p style="${pstyle}">`).replace(/\n/g, '<br>');
const pad = (n) => String(n).padStart(2, '0');

const legacyPod = (pd) => { if (!pd) return pd; if (pd.url && !pd.spotify_url && !pd.youtube_url) return { ...pd, [/youtu/.test(pd.url) ? 'youtube_url' : 'spotify_url']: pd.url }; return pd; };
export function ctaHref(n, opts = {}) {
  const u = String(n.cta?.url || '').trim(); if (!u) return '#';
  const mail = u.replace(/^mailto:/i, '').split('?')[0];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return u;
  if (/\?subject=/i.test(u)) return u; // já veio com assunto
  const name = opts.name || 'Radar VendaMais'; const num = opts.editionNumber ? ` · Edição ${String(opts.editionNumber).padStart(2, '0')}` : '';
  const subject = `${name}${num} · ${n.cta?.label || 'Contato'}`;
  const body = `Olá,\n\nLi a edição "${n.headline || ''}" do ${name} e gostaria de: ${n.cta?.label || ''}.\n\nEmpresa: \nCargo: \nMelhor horário para contato: \n`;
  return `mailto:${mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function renderEmail(n, opts = {}) {
  n = { ...n, podcast: legacyPod(n.podcast) };
  const { logoUrl = '', logoNegUrl = '', editionNumber = 1, editionDate = '', tagline = 'Vendas para quem influencia vendas', name = 'Radar VendaMais', previewOnly = false } = opts;
  const label = (t, color = C.gray) => `<p style="margin:0 0 8px 0;font-family:${F};font-size:11px;line-height:16px;letter-spacing:1px;font-weight:700;color:${color};text-transform:uppercase;">${esc(t)}</p>`;
  const h2 = (t, color = C.navy) => `<h2 style="margin:0 0 14px 0;font-family:${F};font-size:26px;line-height:32px;font-weight:600;color:${color};">${esc(t)}</h2>`;
  const p = (t, color = C.ink, size = 15) => { const st = `margin:0 0 14px 0;font-family:${F};font-size:${size}px;line-height:${Math.round(size * 1.65)}px;color:${color};`; return `<p style="${st}">${nl(t, st)}</p>`; };
  const small = (t, color = C.gray) => esc(t).trim().replace(/\n{2,}/g, '\n').split('\n').map(l => l.trim()).filter(Boolean).map(l => `<span style="display:block;margin:0 0 8px 0;">${l}</span>`).join('');
  const stripNum = (s = '') => String(s).replace(/^\s*\d+\s*[.)-]\s*/, '');
  const section = (inner, extra = '') => `<tr><td style="padding:32px 36px 0 36px;${extra}">${inner}</td></tr>`;
  const card = (inner, bg = C.sand, border = C.line) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${bg};border:1px solid ${border};border-radius:10px;"><tr><td style="padding:24px;">${inner}</td></tr></table>`;
  const logoImg = (url, alt) => url ? `<img src="${esc(url)}" alt="${esc(alt)}" width="160" style="display:block;width:160px;max-width:160px;height:auto;border:0;">` : `<span style="font-family:${F};font-size:12px;color:${C.grayl};">[logo oficial não configurado]</span>`;
  const bar = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:56px;height:5px;background:${C.orange};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;

  const sections = (n.sections || []).map(s => section(label(s.label) + h2(s.title) + p(s.body))).join('');
  const steps = (n.practical_block?.steps || []).map((s, i, a) => `<tr><td style="padding:12px 0;border-bottom:${i < a.length - 1 ? `1px solid ${C.line}` : '0'};"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="width:40px;font-family:${F};font-size:18px;font-weight:600;color:${C.orange};">${pad(i + 1)}</td><td style="font-family:${F};font-size:15px;line-height:22px;color:${C.ink};"><strong>${esc(stripNum(s.title))}</strong><br><span style="font-size:13px;line-height:20px;color:${C.gray};display:block;margin-top:4px;">${small(s.text)}</span></td></tr></table></td></tr>`).join('');
  const practical = n.practical_block ? section(label(n.practical_block.label) + h2(n.practical_block.title) + (n.practical_block.intro ? p(n.practical_block.intro) : '') + card(label('Os passos') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps}</table>`)) : '';
  const interp = n.interpretation?.items?.length ? section(label(n.interpretation.label) + h2(n.interpretation.title) + n.interpretation.items.map(it => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${F};"><strong style="font-size:15px;color:${C.navy};">${esc(stripNum(it.title))}</strong><br><span style="font-size:13px;line-height:20px;color:${C.gray};display:block;margin-top:4px;">${small(it.text)}</span></td></tr></table>`).join('')) : '';
  const action = n.action?.steps?.length ? section(label(n.action.label) + h2(n.action.title) + n.action.steps.map((s, i) => `<p style="margin:0 0 12px 0;font-family:${F};font-size:15px;line-height:22px;color:${C.ink};"><strong>${i + 1}. ${esc(stripNum(s.title))}</strong><br><span style="font-size:13px;line-height:20px;color:${C.gray};display:block;margin-top:4px;">${small(s.text)}</span></p>`).join('')) : '';
  const err = n.common_error ? section(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.navy};border-radius:10px;"><tr><td style="padding:26px;">${bar}<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>${label(n.common_error.label, C.grayl)}${h2(n.common_error.title, C.white)}${p(n.common_error.body, C.grayl, 14)}</td></tr></table>`) : '';
  const mq = n.meeting_questions?.questions?.length ? section(label(n.meeting_questions.label) + h2(n.meeting_questions.title) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${n.meeting_questions.questions.map((q, i) => `<tr><td valign="top" style="width:36px;padding:5px 0;font-family:${F};font-size:15px;font-weight:600;color:${C.orange};">${pad(i + 1)}</td><td style="padding:5px 0;font-family:${F};font-size:14px;line-height:21px;color:${C.ink};">${esc(q)}</td></tr>`).join('')}</table>`) : '';
  const qow = n.question_of_week?.text ? section(card(label(n.question_of_week.label) + `<p style="margin:0;font-family:${F};font-size:19px;line-height:27px;font-weight:600;color:${C.navy};">${esc(n.question_of_week.text)}</p>`)) : '';
  const closing = n.closing ? section(p(n.closing)) : '';
  const ctaUrl = ctaHref(n, opts); const isMail = ctaUrl.startsWith('mailto:');
  const cta = n.cta?.label ? section(`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.orange};border-radius:4px;"><a href="${esc(ctaUrl)}" style="display:inline-block;padding:14px 26px;font-family:${F};font-size:15px;font-weight:600;color:${C.white};text-decoration:none;">${esc(n.cta.label)}</a></td></tr></table>${isMail ? `<p style="margin:12px 0 0 0;font-family:${F};font-size:13px;line-height:20px;color:${C.gray};">Ou simplesmente responda este e-mail.</p>` : ''}`) : '';
  const yt = (u = '') => (String(u).match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1] || '';
  const ytCover = (id) => id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
  const isImg = (u = '') => /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(u) || /supabase\.co\/storage|img\.youtube\.com|i\.ytimg\.com|i\.scdn\.co/i.test(u);
  const cu = n.podcast?.cover_url || '';
  const podcastCover = yt(cu) ? ytCover(yt(cu)) : isImg(cu) ? cu : ytCover(yt(n.podcast?.youtube_url));
  const linkBtn = (href, text, filled) => `<td style="padding:0 10px 10px 0;"><a href="${esc(href)}" style="display:inline-block;padding:11px 18px;border-radius:4px;font-family:${F};font-size:14px;font-weight:600;text-decoration:none;${filled ? `background:${C.orange};color:${C.white};` : `border:1px solid ${C.grayl};color:${C.white};`}">${esc(text)}</a></td>`;
  const podcast = n.podcast?.enabled && n.podcast.title ? section(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.navy};border-radius:10px;"><tr><td style="padding:26px;">${label('Podcast VendaMais', C.grayl)}${podcastCover ? `<a href="${esc(n.podcast.youtube_url || n.podcast.spotify_url || '#')}"><img src="${esc(podcastCover)}" alt="${esc(n.podcast.title)}" width="528" style="display:block;width:100%;max-width:528px;height:auto;border:0;border-radius:6px;margin:0 0 18px 0;"></a>` : ''}${h2(n.podcast.title, C.white)}${n.podcast.description ? p(n.podcast.description, C.grayl, 14) : ''}<table role="presentation" cellpadding="0" cellspacing="0"><tr>${n.podcast.spotify_url ? linkBtn(n.podcast.spotify_url, 'Ouvir no Spotify', true) : ''}${n.podcast.youtube_url ? linkBtn(n.podcast.youtube_url, 'Ver no YouTube', !n.podcast.spotify_url) : ''}</tr></table></td></tr></table>`) : '';
  const ev = n.events || {}; const hasEvent = ev.enabled && (ev.title || ev.text);
  const agenda = hasEvent ? section(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${C.sand};border:1px solid ${C.line};border-radius:10px;"><tr><td style="padding:24px;">${label(ev.label || 'Convite VendaMais')}${ev.image_url ? `<a href="${esc(ev.url || '#')}"><img src="${esc(ev.image_url)}" alt="${esc(ev.title || '')}" width="528" style="display:block;width:100%;max-width:528px;height:auto;border:0;border-radius:6px;margin:0 0 16px 0;"></a>` : ''}${ev.title ? h2(ev.title) : ''}${ev.text ? p(ev.text) : ''}${ev.url ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.navy};border-radius:4px;"><a href="${esc(ev.url)}" style="display:inline-block;padding:12px 22px;font-family:${F};font-size:14px;font-weight:600;color:${C.white};text-decoration:none;">${esc(ev.cta || 'Quero participar')}</a></td></tr></table>` : ''}</td></tr></table>`) : '';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(n.subject || name)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style type="text/css">@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'); body{margin:0;padding:0;} table{border-collapse:collapse;} img{border:0;line-height:100%;outline:none;text-decoration:none;} @media only screen and (max-width:620px){ .vm-w{width:100% !important;max-width:100% !important;} .vm-p{padding-left:20px !important;padding-right:20px !important;} .vm-h1{font-size:30px !important;line-height:36px !important;} }</style></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;font-size:1px;color:${C.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(n.preheader || '')}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:${previewOnly ? 0 : 24}px 0;">
<table role="presentation" class="vm-w" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${C.white};">
<tr><td class="vm-p" style="background:${C.navy};padding:36px 36px 40px 36px;">
${logoImg(logoNegUrl, 'VendaMais')}
<div style="height:28px;line-height:28px;font-size:0;">&nbsp;</div>${bar}<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
${label(`${name} • Edição ${pad(editionNumber)}${editionDate ? ' • ' + editionDate : ''}`, C.white)}
<h1 class="vm-h1" style="margin:14px 0 14px 0;font-family:${F};font-size:36px;line-height:42px;font-weight:600;color:${C.white};">${esc(n.headline || '')}</h1>
<p style="margin:0 0 14px 0;font-family:${F};font-size:16px;line-height:24px;font-weight:600;color:${C.white};">${esc(tagline)}</p>
${p(n.intro || '', C.grayl, 15)}
</td></tr>
${sections}${practical}${interp}${action}${err}${mq}${qow}${closing}${cta}${podcast}${agenda}
<tr><td class="vm-p" style="padding:32px 36px 40px 36px;border-top:1px solid ${C.line};">
${logoImg(logoUrl, 'VendaMais')}
<p style="margin:16px 0 0 0;font-family:${F};font-size:12px;line-height:18px;color:${C.gray};">${esc(name)} • Newsletter semanal<br>${esc(tagline)}<br><a href="{{unsubscribe_url}}" style="color:${C.gray};">Cancelar inscrição</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return html;
}

export function renderPlainText(n, opts = {}) {
  n = { ...n, podcast: legacyPod(n.podcast) };
  const { editionNumber = 1, name = 'Radar VendaMais', tagline = 'Vendas para quem influencia vendas' } = opts;
  const L = [];
  L.push(`${name.toUpperCase()} • EDIÇÃO ${pad(editionNumber)}`, '', (n.headline || '').toUpperCase(), tagline, '', n.intro || '', '');
  for (const s of n.sections || []) L.push(s.label, s.title, '', s.body, '');
  if (n.practical_block) { L.push(n.practical_block.label, n.practical_block.title, ''); if (n.practical_block.intro) L.push(n.practical_block.intro, ''); (n.practical_block.steps || []).forEach((s, i) => L.push(`${pad(i + 1)}. ${s.title}`, `    ${s.text}`)); L.push(''); }
  if (n.interpretation?.items?.length) { L.push(n.interpretation.label, n.interpretation.title, ''); n.interpretation.items.forEach(it => L.push(`- ${it.title}: ${it.text}`)); L.push(''); }
  if (n.action?.steps?.length) { L.push(n.action.label, n.action.title, ''); n.action.steps.forEach((s, i) => L.push(`${i + 1}. ${s.title}`, `   ${s.text}`)); L.push(''); }
  if (n.common_error) L.push(n.common_error.label, n.common_error.title, n.common_error.body, '');
  if (n.meeting_questions?.questions?.length) { L.push(n.meeting_questions.label, n.meeting_questions.title, ''); n.meeting_questions.questions.forEach((q, i) => L.push(`${pad(i + 1)}. ${q}`)); L.push(''); }
  if (n.question_of_week?.text) L.push(n.question_of_week.label, n.question_of_week.text, '');
  if (n.closing) L.push(n.closing, '');
  if (n.cta?.label) { const u = ctaHref(n, opts); L.push(`${n.cta.label}: ${u.startsWith('mailto:') ? u.slice(7).split('?')[0] + ' (ou responda este e-mail)' : u}`, ''); }
  if (n.podcast?.enabled && n.podcast.title) L.push('PODCAST VENDAMAIS', n.podcast.title, n.podcast.description || '', n.podcast.spotify_url ? `Ouvir no Spotify: ${n.podcast.spotify_url}` : '', n.podcast.youtube_url ? `Ver no YouTube: ${n.podcast.youtube_url}` : '', '');
  if (n.events?.enabled && (n.events.title || n.events.text)) L.push((n.events.label || 'CONVITE VENDAMAIS').toUpperCase(), n.events.title || '', n.events.text || '', n.events.url ? `${n.events.cta || 'Quero participar'}: ${n.events.url}` : '', '');
  L.push(`${name} • Newsletter semanal`, tagline);
  return L.join('\n').replace(/\n{3,}/g, '\n\n');
}
