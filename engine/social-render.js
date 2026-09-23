// Render determinístico dos posts sociais 1080x1350 (canvas 2D). Templates fixos T01–T05.
// A IA nunca desenha logo, texto ou grafismo: tudo aqui vem do Brand Center e do brand_rules.
const W = 1080, H = 1350, M = 80;
const C = { navy: '#16263A', orange: '#E2742B', white: '#FFFFFF', sand: '#FAF7F2', line: '#E6E2DA', ink: '#1E1E1E', gray: '#5E6770', grayl: '#9FB3C2', navyl: '#24364D' };
const FONT = 'Poppins';
const imgCache = new Map();
export function loadImage(src) { if (!src) return Promise.resolve(null); if (imgCache.has(src)) return imgCache.get(src); const p = new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); imgCache.set(src, p); return p; }
export async function ensureFonts() { try { await Promise.all(['400', '500', '600', '700'].map(w => document.fonts.load(`${w} 40px ${FONT}`))); } catch (e) { /* fallback Arial */ } }

function wrap(ctx, text, maxW) { const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }
// Ajusta a fonte para caber em maxLines; retorna {size, lines, lineH}
function fit(ctx, text, maxW, { max = 72, min = 44, weight = 600, maxLines = 5, lh = 1.1 }) { for (let size = max; size >= min; size -= 2) { ctx.font = `${weight} ${size}px ${FONT}, Arial, sans-serif`; const lines = wrap(ctx, text, maxW); if (lines.length <= maxLines) return { size, lines, lineH: Math.round(size * lh) }; } ctx.font = `${weight} ${min}px ${FONT}, Arial, sans-serif`; return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines), lineH: Math.round(min * lh) }; }
function drawLines(ctx, lines, x, y, lineH, color) { ctx.fillStyle = color; lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH)); return y + lines.length * lineH; }
function label(ctx, text, x, y, color) { if (!text || !String(text).trim()) return; ctx.font = `600 22px ${FONT}, Arial, sans-serif`; ctx.letterSpacing = '2px'; ctx.fillStyle = color; ctx.fillText(String(text || '').toUpperCase(), x, y); ctx.letterSpacing = '0px'; }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// cover-fit com crop manual: crop = {scale>=1, x:0..1, y:0..1}
function drawCover(ctx, img, x, y, w, h, crop = {}) { if (!img) { ctx.fillStyle = '#B9BFC8'; ctx.fillRect(x, y, w, h); return; } const s = Math.max(w / img.width, h / img.height) * (crop.scale || 1); const dw = img.width * s, dh = img.height * s; const dx = x - (dw - w) * (crop.x ?? 0.5), dy = y - (dh - h) * (crop.y ?? 0.5); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(img, dx, dy, dw, dh); ctx.restore(); }
function drawLogo(ctx, img, x, y, w = 200) { if (!img) { ctx.strokeStyle = C.orange; ctx.setLineDash([6, 6]); ctx.strokeRect(x, y, w, w * 0.24); ctx.setLineDash([]); ctx.font = `500 14px ${FONT}, Arial`; ctx.fillStyle = C.orange; ctx.fillText('logo oficial não configurado', x + 8, y + w * 0.24 + 20); return w * 0.24; } const h = w * (img.height / img.width); ctx.drawImage(img, x, y, w, h); return h; }
// Símbolo V recortado do arquivo oficial do logo (nunca redesenhado)
function drawV(ctx, logoImg, x, y, size, alpha = 1) { if (!logoImg) return; const sx = logoImg.width * 0.02, sy = logoImg.height * 0.05, sw = logoImg.width * 0.225, sh = logoImg.height * 0.9; const ratio = sh / sw; ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(logoImg, sx, sy, sw, sh, x, y, size, size * ratio); ctx.restore(); }
function hexPath(ctx, cx, cy, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }

// spec = { templateId, headline, support, kicker, proofNumber, proofLabel, image(HTMLImage|null), crop, logoPrimary, logoNegative, portrait, partner:{name,role,territory} }
export function render(canvas, spec) {
  const ctx = canvas.getContext('2d'); canvas.width = W; canvas.height = H; ctx.textBaseline = 'alphabetic';
  const t = spec.templateId || 'T01'; const inner = W - 2 * M;
  const meta = { headlineFontPx: 0 };
  if (t === 'T01') {
    drawCover(ctx, spec.image, 0, 0, W, H, spec.crop); ctx.fillStyle = 'rgba(22,38,58,0.60)'; ctx.fillRect(0, 0, W, H);
    // véu extra na base para leitura
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, 'rgba(22,38,58,0)'); g.addColorStop(1, 'rgba(22,38,58,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);
    drawLogo(ctx, spec.logoNegative, M, M, 220);
    const sup = fit(ctx, spec.support, inner - 32, { max: 32, min: 28, weight: 400, maxLines: 3, lh: 1.4 });
    const hl = fit(ctx, spec.headline, inner - 32, { max: 72, min: 44, weight: 600, maxLines: 5, lh: 1.1 });
    const supH = spec.support ? sup.lines.length * sup.lineH + 24 : 0; const hlH = hl.lines.length * hl.lineH;
    let y = H - M - supH - hlH + hl.size * 0.85;
    label(ctx, spec.kicker, M, y - hl.size - 24, C.white);
    ctx.fillStyle = C.orange; ctx.fillRect(M, y - hl.size * 0.85, 5, hlH); // barra laranja vertical (único recurso laranja)
    ctx.font = `600 ${hl.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, hl.lines, M + 32, y, hl.lineH, C.white);
    if (spec.support) { ctx.font = `400 ${sup.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, sup.lines, M + 32, y + hlH + 8, sup.lineH, 'rgba(255,255,255,0.88)'); }
    meta.headlineFontPx = hl.size;
  } else if (t === 'T02') {
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H);
    const lh = drawLogo(ctx, spec.logoPrimary, M, M, 200);
    drawCover(ctx, spec.image, M, M + lh + 40, inner, 520, spec.crop);
    let y = M + lh + 40 + 520 + 72;
    label(ctx, spec.kicker, M, y, C.gray); y += 40;
    if (spec.proofNumber) { ctx.font = `700 120px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.orange; const pn = fit(ctx, spec.proofNumber, inner, { max: 120, min: 64, weight: 700, maxLines: 1, lh: 1 }); ctx.font = `700 ${pn.size}px ${FONT}, Arial, sans-serif`; ctx.fillText(pn.lines[0] || '', M, y + pn.size * 0.8); y += pn.size + 24; }
    const hl = fit(ctx, spec.headline, inner, { max: spec.proofNumber ? 52 : 64, min: 40, weight: 600, maxLines: spec.proofNumber ? 3 : 5, lh: 1.12 });
    ctx.font = `600 ${hl.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, hl.lines, M, y + hl.size * 0.85, hl.lineH, C.navy);
    if (spec.support) { const sup = fit(ctx, spec.support, inner, { max: 32, min: 28, weight: 400, maxLines: 3, lh: 1.4 }); ctx.font = `400 ${sup.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, sup.lines, M, y + 16, sup.lineH, C.gray); }
    meta.headlineFontPx = hl.size;
  } else if (t === 'T03') {
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H);
    drawV(ctx, spec.logoNegative, W - 520, H - 560, 560, 0.08); // textura V a 8%
    drawLogo(ctx, spec.logoNegative, M, M, 220);
    drawCover(ctx, spec.image, 520, M, W - M - 520, 560, spec.crop);
    // barra laranja horizontal curta abre a seção (kicker)
    ctx.fillStyle = C.orange; ctx.fillRect(M, 720, 56, 6); label(ctx, spec.kicker, M, 770, C.grayl);
    const hl = fit(ctx, spec.headline, inner, { max: 66, min: 44, weight: 600, maxLines: 4, lh: 1.12 });
    ctx.font = `600 ${hl.size}px ${FONT}, Arial, sans-serif`; let y = drawLines(ctx, hl.lines, M, 770 + hl.size + 16, hl.lineH, C.white);
    if (spec.support) { const sup = fit(ctx, spec.support, inner, { max: 32, min: 28, weight: 400, maxLines: 3, lh: 1.4 }); ctx.font = `400 ${sup.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, sup.lines, M, y + 12, sup.lineH, C.grayl); }
    meta.headlineFontPx = hl.size;
  } else if (t === 'T04') {
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H);
    rrect(ctx, M, M, inner, H - 2 * M, 12); ctx.fillStyle = C.sand; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    const px = M + 64, pw = inner - 128; const lh = drawLogo(ctx, spec.logoPrimary, px, M + 64, 200);
    let y = M + 64 + lh + 96; label(ctx, spec.kicker, px, y, C.gray); y += 48;
    if (spec.proofNumber) { const pn = fit(ctx, spec.proofNumber, pw, { max: 150, min: 72, weight: 700, maxLines: 1, lh: 1 }); ctx.font = `700 ${pn.size}px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.orange; ctx.fillText(pn.lines[0] || '', px, y + pn.size * 0.8); y += pn.size + 20; if (spec.proofLabel) { ctx.font = `500 24px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.gray; ctx.fillText(spec.proofLabel, px, y + 20); y += 56; } }
    const hl = fit(ctx, spec.headline, pw, { max: spec.proofNumber ? 52 : 64, min: 40, weight: 600, maxLines: 4, lh: 1.12 });
    ctx.font = `600 ${hl.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, hl.lines, px, y + hl.size * 0.9, hl.lineH, C.navy);
    if (spec.support) { const sup = fit(ctx, spec.support, pw, { max: 32, min: 28, weight: 400, maxLines: 4, lh: 1.45 }); ctx.font = `400 ${sup.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, sup.lines, px, y + 20, sup.lineH, C.ink); }
    if (spec.image) drawCover(ctx, spec.image, W - M - 64 - 300, H - M - 64 - 200, 300, 200, spec.crop);
    drawV(ctx, spec.logoPrimary, px, H - M - 64 - 44, 44, 1);
    meta.headlineFontPx = hl.size;
  } else if (t === 'T06') {
    // Manchete editorial: número gigante em laranja, headline em display grande, faixa de foto diagonal, V como textura
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, H - 420); ctx.lineTo(W, H - 620); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
    if (spec.image) { drawCover(ctx, spec.image, 0, H - 620, W, 620, spec.crop); ctx.fillStyle = 'rgba(22,38,58,0.72)'; ctx.fillRect(0, H - 620, W, 620); } else { ctx.fillStyle = C.navy; ctx.fillRect(0, H - 620, W, 620); }
    ctx.restore();
    drawV(ctx, spec.logoPrimary, W - 330, 40, 300, 0.05);
    drawLogo(ctx, spec.logoPrimary, M, M, 200);
    label(ctx, spec.kicker, M, M + 120, C.orange);
    const limitY = H - 660; // a headline termina antes da faixa diagonal
    let y = M + 170;
    if (spec.proofNumber) { const pn = fit(ctx, spec.proofNumber, inner, { max: 260, min: 120, weight: 700, maxLines: 1, lh: 0.95 }); ctx.font = `700 ${pn.size}px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.orange; ctx.fillText(pn.lines[0] || '', M - 8, y + pn.size * 0.78); y += pn.size * 0.9; if (spec.proofLabel) { const pl = fit(ctx, spec.proofLabel, inner, { max: 36, min: 30, weight: 500, maxLines: 2, lh: 1.3 }); ctx.font = `500 ${pl.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, pl.lines, M, y + 8, pl.lineH, C.gray) + 24; } }
    let hl = fit(ctx, spec.headline, inner, { max: spec.proofNumber ? 64 : 84, min: 44, weight: 700, maxLines: spec.proofNumber ? 3 : 5, lh: 1.02 });
    while (y + hl.size * 0.9 + hl.lines.length * hl.lineH > limitY && hl.size > 40) hl = fit(ctx, spec.headline, inner, { max: hl.size - 4, min: 40, weight: 700, maxLines: 4, lh: 1.02 });
    ctx.font = `700 ${hl.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, hl.lines, M, y + hl.size * 0.9, hl.lineH, C.navy);
    if (spec.support) { const sup = fit(ctx, spec.support, inner - 200, { max: 32, min: 28, weight: 400, maxLines: 3, lh: 1.4 }); ctx.font = `400 ${sup.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, sup.lines, M, H - 300, sup.lineH, C.white); }
    ctx.fillStyle = C.orange; ctx.fillRect(M, H - 360, 56, 6);
    meta.headlineFontPx = hl.size;
  } else if (t === 'T05') {
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H);
    drawLogo(ctx, spec.logoPrimary, M, M, 200);
    const r = 210, cx = W / 2, cy = M + 140 + r; ctx.save(); hexPath(ctx, cx, cy, r); ctx.clip(); if (spec.portrait) drawCover(ctx, spec.portrait, cx - r, cy - r, 2 * r, 2 * r, spec.crop); else { ctx.fillStyle = C.line; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r); } ctx.restore();
    let y = cy + r + 72; label(ctx, spec.kicker, M, y, C.gray); y += 24;
    const hl = fit(ctx, spec.headline, inner, { max: 56, min: 40, weight: 600, maxLines: 4, lh: 1.12 });
    ctx.font = `600 ${hl.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, hl.lines, M, y + hl.size, hl.lineH, C.navy);
    if (spec.support) { const sup = fit(ctx, spec.support, inner, { max: 32, min: 28, weight: 400, maxLines: 3, lh: 1.4 }); ctx.font = `400 ${sup.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, sup.lines, M, y + 16, sup.lineH, C.gray); }
    // assinatura reduzida: linha, nome, cargo (cargo é o recurso laranja)
    const p = spec.partner || {}; const fy = H - M - 84; ctx.fillStyle = C.line; ctx.fillRect(M, fy, inner, 1);
    ctx.font = `600 30px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.navy; ctx.fillText(p.name || '', M, fy + 48); ctx.font = `500 22px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.orange; ctx.fillText(p.role || '', M, fy + 82);
    meta.headlineFontPx = hl.size;
  }
  return meta;
}
export function canvasToBlob(canvas) { return new Promise(res => canvas.toBlob(res, 'image/png')); }

// ---- Carrossel: um slide por chamada. slide = {role, kicker, title, body, proof_number, proof_label, index, total}
// Capa usa o template do post (T01/T03 com imagem, T02/T04 sem); miolo é tipográfico em navy/areia alternados; fechamento em navy com logo e CTA.
export function renderSlide(canvas, spec) {
  const ctx = canvas.getContext('2d'); canvas.width = W; canvas.height = H; ctx.textBaseline = 'alphabetic';
  const s = spec.slide; const inner = W - 2 * M; const page = `${String(s.index + 1).padStart(2, '0')} / ${String(s.total).padStart(2, '0')}`;
  const pager = (color) => { ctx.font = `500 26px ${FONT}, Arial, sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.fillText(page, W - M, H - M + 8); ctx.textAlign = 'left'; };
  const arrow = (color) => { ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W - M - 40, H - M - 60); ctx.lineTo(W - M, H - M - 60); ctx.moveTo(W - M - 16, H - M - 76); ctx.lineTo(W - M, H - M - 60); ctx.lineTo(W - M - 16, H - M - 44); ctx.stroke(); };
  let meta = { headlineFontPx: 44 };
  if (s.role === 'cover') {
    meta = render(canvas, { ...spec, templateId: spec.templateId, headline: s.title, support: s.body || spec.support, kicker: s.kicker ?? spec.kicker, proofNumber: s.proof_number || '', proofLabel: s.proof_label || '' });
    const dark = spec.templateId === 'T01' || spec.templateId === 'T03'; pager(dark ? 'rgba(255,255,255,0.7)' : C.gray); arrow(dark ? C.white : C.navy); return meta;
  }
  if (s.role === 'closing') {
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H); drawV(ctx, spec.logoNegative, W - 520, H - 560, 560, 0.08);
    drawLogo(ctx, spec.logoNegative, M, M, 220);
    ctx.fillStyle = C.orange; ctx.fillRect(M, 520, 56, 6); label(ctx, s.kicker ?? 'PRÓXIMO PASSO', M, 570, C.grayl);
    const hl = fit(ctx, s.title, inner, { max: 64, min: 44, weight: 600, maxLines: 4, lh: 1.12 }); ctx.font = `600 ${hl.size}px ${FONT}, Arial, sans-serif`; let y = drawLines(ctx, hl.lines, M, 570 + hl.size + 16, hl.lineH, C.white);
    if (s.body) { const b = fit(ctx, s.body, inner, { max: 34, min: 30, weight: 400, maxLines: 5, lh: 1.42 }); ctx.font = `400 ${b.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, b.lines, M, y + 20, b.lineH, C.grayl); }
    if (spec.cta) { const ct = fit(ctx, spec.cta, inner - 64, { max: 32, min: 28, weight: 600, maxLines: 3, lh: 1.3 }); ctx.font = `600 ${ct.size}px ${FONT}, Arial, sans-serif`; const tw = Math.max(...ct.lines.map(l => ctx.measureText(l).width)); const bw = Math.min(inner, tw + 64), bh = ct.lines.length * ct.lineH + 40; const by = Math.min(H - M - 80 - bh, y + 48); rrect(ctx, M, by, bw, bh, 4); ctx.fillStyle = C.white; ctx.fill(); drawLines(ctx, ct.lines, M + 32, by + 20 + ct.size * 0.85, ct.lineH, C.navy); }
    ctx.font = `500 26px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.grayl; ctx.fillText(spec.tagline || '', M, H - M + 8); pager('rgba(255,255,255,0.7)'); meta.headlineFontPx = hl.size; return meta;
  }
  // point / proof / action: alterna areia e branco; barra laranja vertical como fio condutor
  const sand = s.index % 2 === 1; ctx.fillStyle = sand ? C.sand : C.white; ctx.fillRect(0, 0, W, H);
  drawV(ctx, spec.logoPrimary, M, M, 44, 1); // só o símbolo, discreto
  ctx.fillStyle = C.orange; ctx.fillRect(M, 300, 5, s.role === 'proof' ? 420 : 300);
  const x = M + 40, w = inner - 40; label(ctx, s.kicker || '', x, 300 + 22, C.gray); let y = 300 + 22;
  if (s.role === 'proof' && s.proof_number) { const pn = fit(ctx, s.proof_number, w, { max: 190, min: 96, weight: 700, maxLines: 1, lh: 1 }); ctx.font = `700 ${pn.size}px ${FONT}, Arial, sans-serif`; ctx.fillStyle = C.orange; ctx.fillText(pn.lines[0] || '', x, y + pn.size * 0.9 + 24); y += pn.size + 40; if (s.proof_label) { const pl = fit(ctx, s.proof_label, w, { max: 36, min: 30, weight: 500, maxLines: 2, lh: 1.35 }); ctx.font = `500 ${pl.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, pl.lines, x, y + 20, pl.lineH, C.gray); y += 24; } }
  const hl = fit(ctx, s.title, w, { max: s.role === 'proof' ? 52 : 64, min: 40, weight: 600, maxLines: 4, lh: 1.12 }); ctx.font = `600 ${hl.size}px ${FONT}, Arial, sans-serif`; y = drawLines(ctx, hl.lines, x, y + hl.size + 16, hl.lineH, C.navy);
  if (s.body) { const b = fit(ctx, s.body, w, { max: 38, min: 32, weight: 400, maxLines: 8, lh: 1.42 }); ctx.font = `400 ${b.size}px ${FONT}, Arial, sans-serif`; drawLines(ctx, b.lines, x, y + 28, b.lineH, C.ink); }
  pager(C.gray); arrow(C.navy); meta.headlineFontPx = hl.size; return meta;
}
export const SIZE = { W, H };
