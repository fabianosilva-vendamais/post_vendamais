const KEY = 'vm_content_engine_db_v1'; let d = JSON.parse(localStorage.getItem(KEY) || '{}');
if (!(d.newsletter_versions || []).some(v => v.edition_id === 'ed_piloto')) { try { const snap = await (await fetch('simulacao-ed01.json')).json(); d = { ...d, editions: [...(d.editions || []).filter(e => e.id !== 'ed_piloto'), ...snap.editions], sources: [...(d.sources || []), ...snap.sources], analyses: [...(d.analyses || []), ...snap.analyses], newsletter_versions: [...(d.newsletter_versions || []), ...snap.newsletter_versions], posts: [...(d.posts || []), ...snap.posts] }; localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { console.warn('snapshot', e); } }
const ED = 'ed_piloto';
const v = (d.newsletter_versions || []).filter(v => v.edition_id === ED).pop();
const posts = (d.posts || []).filter(p => p.edition_id === ED);
const F = 'Poppins, Arial, sans-serif';
const el = (tag, style, html) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (html != null) e.innerHTML = html; return e; };
if (!v) { document.body.innerHTML = '<p style="font-family:sans-serif;padding:40px">Abra o Content Engine primeiro: a simulação fica salva neste navegador.</p>'; }
else {
  const [{ renderEmail }, { activeRules, db }, pf] = await Promise.all([import('./engine/newsletter-render.js'), import('./engine/store.js'), import('./engine/posts-flow.js')]);
  const R = activeRules(); const abs = (p) => new URL(p, document.baseURI).href;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'; document.head.appendChild(link);
  document.body.style.cssText = 'margin:0;background:#FAF7F2;font-family:' + F + ';color:#1E1E1E';
  const page = el('div', 'max-width:1240px;margin:0 auto;padding:40px 24px 80px');
  page.appendChild(el('div', 'font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5E6770;font-weight:600', 'Simulação · VendaMais Content Engine'));
  page.appendChild(el('h1', 'margin:6px 0 4px;font-size:28px;font-weight:600;color:#16263A', 'Radar VendaMais · Edição 01'));
  page.appendChild(el('p', 'margin:0 0 28px;font-size:14px;color:#5E6770;max-width:760px;line-height:1.6', `Gerado a partir de 2 fontes (rascunho editorial + dados de campo) e do conhecimento VendaMais. Newsletter com nota ${v.score ?? '–'} na Revisão VendaMais. As áreas cinzas nas artes são onde entra a imagem-base (gerada por IA ou do acervo); logo, texto e grafismos já são renderizados pelo sistema.`));
  const grid = el('div', 'display:flex;flex-direction:column;gap:32px');
  const left = el('div', 'background:#EEF1F4;border:1px solid #E6E2DA;border-radius:12px;padding:16px;max-width:640px');
  left.appendChild(el('div', 'font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5E6770;font-weight:600;margin-bottom:10px', 'Newsletter · HTML de e-mail 600 px'));
  const html = renderEmail(v.content_json, { logoUrl: abs('assets/brand/logo-principal.png'), logoNegUrl: abs('assets/brand/logo-negativo.png'), editionNumber: 1, editionDate: '14/09/2026', name: R.newsletter.name, tagline: R.newsletter.tagline, previewOnly: true });
  const body = html.slice(html.indexOf('<body')); const inner = body.slice(body.indexOf('>') + 1, body.lastIndexOf('</body>'));
  const st = document.createElement('style'); st.textContent = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || ''; document.head.appendChild(st);
  left.appendChild(el('div', 'border-radius:8px;overflow:hidden', inner));
  const right = el('div', 'display:flex;flex-direction:column;gap:16px');
  const row = el('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px');
  right.appendChild(el('div', 'font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5E6770;font-weight:600', 'Três posts derivados · 1080 × 1350'));
  const labels = { training: 'Treinamento', consulting: 'Consultoria', business: 'Negócio' };
  const app = { edition: () => db.editions.find(e => e.id === ED), assetUrl: (a) => a.file_url, evidence: () => [] };
  for (const p of posts) {
    const card = el('div', 'background:#fff;border:1px solid #E6E2DA;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:14px;min-width:0');
    const cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;aspect-ratio:4/5;border-radius:6px;box-shadow:0 2px 10px rgba(22,38,58,.15);display:block';
    await pf.renderPost(app, p, cv); card.appendChild(cv);
    const c = p.content_json; const cap = pf.captionText(p);
    const txt = el('div', 'min-width:0');
    txt.appendChild(el('div', 'display:flex;gap:8px;align-items:center;margin-bottom:6px', `<span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#E2742B">${labels[p.angle]}</span><span style="font-size:11px;color:#5E6770">${p.template_id} · ${R.templates.find(t => t.id === p.template_id)?.name || ''}</span>`));
    txt.appendChild(el('div', 'font-size:15px;font-weight:600;color:#16263A;line-height:1.35;margin-bottom:8px', c.headline));
    txt.appendChild(el('div', 'font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5E6770;font-weight:600;margin:8px 0 4px', 'Legenda'));
    txt.appendChild(el('pre', 'white-space:pre-wrap;font-family:' + F + ';font-size:12px;line-height:1.55;color:#1E1E1E;margin:0;max-height:220px;overflow:auto;padding-right:6px', cap.replace(/</g, '&lt;')));
    txt.appendChild(el('div', 'font-size:11px;color:#5E6770;margin-top:8px', `${cap.length} caracteres · ${(c.source_claims || []).length} afirmações rastreadas a fontes · prompt de imagem: "${(c.image_prompt || '').slice(0, 110)}…"`));
    card.appendChild(txt); row.appendChild(card);
  }
  right.appendChild(row); grid.appendChild(right); grid.appendChild(left); page.appendChild(grid); document.body.appendChild(page);
}
