// Modo "Texto pronto" com Markdown: preserva exatamente a estrutura do autor (sem IA).
// # título · **linha de apoio** · ## RÓTULO · ### título do bloco · parágrafos, listas, tabelas, **negrito**, *itálico*, [Botão].
const JUNK = [/^\**\s*(radar\s+vendamais|vendamais\s+radar)\b.*$/i, /^\**\s*newsletter\s*\d+\s*\**$/i, /^\*?\s*vendas para quem influencia vendas\s*\*?$/i, /^\**\s*(cancelar inscri[çc][aã]o|unsubscribe)\b.*$/i];
export const isMarkdown = (t = '') => /^#{1,3}\s+\S/m.test(t);
const clean = (s) => s.replace(/^\*\*(.+)\*\*$/, '$1').trim();

export function parseMarkdownNewsletter(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const isBrand = (s) => /^(radar\s+vendamais|vendamais\s+radar)$/i.test(s.replace(/^#\s+/, '').replace(/\*/g, '').trim());
  let i = lines.findIndex(l => /^#\s+\S/.test(l) && !isBrand(l)); if (i < 0) i = 0;
  const headline = i >= 0 && /^#\s+/.test(lines[i] || '') ? lines[i].replace(/^#\s+/, '').trim() : '';
  let j = headline ? i + 1 : 0; let support = '';
  while (j < lines.length && !lines[j].trim()) j++;
  if (j < lines.length && /^\*\*.+\*\*$/.test(lines[j].trim())) { support = clean(lines[j].trim()); j++; }
  const blocks = []; let cur = null; let afterRule = true;
  const open = (label, title) => { cur = { label: label || '', title: title || '', md: '' }; blocks.push(cur); };
  for (; j < lines.length; j++) {
    const l = lines[j]; const t = l.trim();
    if (JUNK.some(rx => rx.test(t))) continue;
    if (/^-{3,}$|^\*{3,}$/.test(t)) { afterRule = true; continue; }
    const h2 = t.match(/^##\s+(.+)$/); const h3 = t.match(/^###\s+(.+)$/);
    if (h2 && !h3) { open(h2[1].trim(), ''); afterRule = false; continue; }
    if (h3) { const y = h3[1].trim(); if (cur && !cur.title && !cur.md.trim()) cur.title = y; else if (afterRule || !cur) open('', y); else cur.md += `### ${y}\n`; afterRule = false; continue; }
    if (!cur) { if (!t) continue; open('', ''); }
    if (t) afterRule = false;
    cur.md += l + '\n';
  }
  blocks.forEach(b => { b.md = b.md.replace(/\n{3,}/g, '\n\n').trim(); });
  return { headline, support_line: support, blocks: blocks.filter(b => b.label || b.title || b.md) };
}

// Markdown do bloco -> HTML de e-mail (inline). esc() já converte **negrito** e *itálico*.
export function mdToEmail(md, { esc, F, C, button, podcastButtons, isPodcast }) {
  const out = []; const L = String(md || '').split('\n'); let para = [];
  const P = (inner, extra = '') => `<p style="margin:0 0 14px 0;font-family:${F};font-size:15px;line-height:25px;color:${C.ink};${extra}">${inner}</p>`;
  const flush = () => { if (!para.length) return; const raw = para.join(' ').trim(); para = [];
    if (/^\*\*[^*].*\*\*$/.test(raw) && !raw.slice(2, -2).includes('**')) out.push(P(esc(raw.slice(2, -2)), `font-size:17px;line-height:26px;font-weight:600;color:${C.navy};`));
    else out.push(P(esc(raw))); };
  for (let k = 0; k < L.length; k++) {
    const t = L[k].trim();
    if (!t) { flush(); continue; }
    const btns = [...t.matchAll(/\[([^\]]+)\](?!\()/g)].map(m => m[1]);
    if (btns.length && t.replace(/\*|\[[^\]]+\]/g, '').trim() === '') { flush(); out.push(isPodcast && podcastButtons ? podcastButtons() : btns.map(b => button(b)).join('')); continue; }
    const h3 = t.match(/^###\s+(.+)$/);
    if (h3) { flush(); out.push(`<h3 style="margin:22px 0 10px 0;font-family:${F};font-size:18px;line-height:25px;font-weight:600;color:${C.navy};">${esc(h3[1])}</h3>`); continue; }
    if (/^\|.*\|$/.test(t)) { flush(); const rows = []; while (k < L.length && /^\|.*\|$/.test(L[k].trim())) { const cells = L[k].trim().slice(1, -1).split('|').map(c => c.trim()); if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells); k++; } k--;
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 16px 0;">${rows.map((r, ri) => `<tr>${r.map((c, ci) => `<td style="padding:10px 12px;border-bottom:1px solid ${C.line};font-family:${F};font-size:14px;line-height:21px;vertical-align:top;${ri === 0 ? `font-weight:700;color:${C.navy};background:${C.sand};` : ci === 0 ? `font-weight:600;color:${C.navy};` : `color:${C.ink};`}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`); continue; }
    if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) { flush(); const ordered = /^\d+[.)]\s+/.test(t); const items = []; while (k < L.length && (ordered ? /^\d+[.)]\s+/ : /^[-*•]\s+/).test(L[k].trim())) { items.push(L[k].trim().replace(ordered ? /^\d+[.)]\s+/ : /^[-*•]\s+/, '')); k++; } k--;
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;">${items.map((it, n) => `<tr><td valign="top" style="width:30px;padding:4px 0;font-family:${F};font-size:15px;line-height:23px;font-weight:600;color:${C.orange};">${ordered ? String(n + 1).padStart(2, '0') : '•'}</td><td style="padding:4px 0;font-family:${F};font-size:15px;line-height:23px;color:${C.ink};">${esc(it)}</td></tr>`).join('')}</table>`); continue; }
    para.push(t);
  }
  flush(); return out.join('');
}
export function mdToPlain(md) { return String(md || '').split('\n').map(l => l.replace(/^###\s+/, '').replace(/^\|(.*)\|$/, (m, a) => /^[\s|:-]+$/.test(a) ? '' : a.split('|').map(c => c.trim()).join(' · ')).replace(/\*\*|\*/g, '').replace(/\[([^\]]+)\]/g, '$1')).join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
