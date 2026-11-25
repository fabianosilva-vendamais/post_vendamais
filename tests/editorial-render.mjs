import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { render, renderSlide } from '../engine/social-render.js';
const require = createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/editorial-test.cjs`);
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const dir = process.env.EDITORIAL_TEST_OUTPUT || '/workspace/scratch/a800e365f35b/editorial-test-results';
const fonts = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'];
for (const file of fonts) if (existsSync(file)) GlobalFonts.registerFromPath(file, 'Poppins');
const logoPrimary = await loadImage(new URL('../assets/brand/logo-principal.png', import.meta.url).pathname);
const logoNegative = await loadImage(new URL('../assets/brand/logo-negativo.png', import.meta.url).pathname);
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { fonts: { load: async () => [] }, createElement: () => createCanvas(1080, 1350) };
const { clearVisualCopy } = await import('../engine/posts-flow.js');
const { db } = await import('../engine/store.js?vm202611011656');
const cfg = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
db.settings.supabase_url = cfg.match(/window.__VM_SUPABASE_URL__\s*=\s*"([^"]+)"/)[1];
db.settings.supabase_anon_key = cfg.match(/window.__VM_SUPABASE_ANON__\s*=\s*"([^"]+)"/)[1];
db.settings.functions_base = db.settings.supabase_url + '/functions/v1';
const corrections = [];
const results = JSON.parse(readFileSync(`${dir}/results.json`, 'utf8')).filter(x => x.passed);
assert.equal(results.length, 6, 'All six live generation cases must pass before rendering.');
mkdirSync(`${dir}/renders`, { recursive: true });
const contact = createCanvas(3 * 360, 2 * 500); const contactCtx = contact.getContext('2d'); contactCtx.fillStyle = '#fff'; contactCtx.fillRect(0, 0, contact.width, contact.height);
let renders = 0;
for (const [i, item] of results.entries()) {
  const value = item.content;
  const spec = { editorialVersion: '2026-11-17.1', templateId: 'T04', headline: value.headline, support: value.support_line, kicker: item.language.includes('LATAM') ? 'GESTIÓN COMERCIAL' : 'GESTÃO COMERCIAL', logoPrimary, logoNegative, image: null };
  const canvas = createCanvas(1080, 1350);
  for (const templateId of ['T01', 'T03', 'T04', 'T06']) {
    let meta = render(canvas, { ...spec, templateId });
    if (meta.textOverflow && process.argv.includes('--auto-repair')) {
      const { slides: sourceSlides, ...postCopy } = value;
      const fixed = await clearVisualCopy({ ...postCopy, template_id: templateId, editorial_version: '2026-11-17.1' });
      corrections.push({ id: item.id, templateId, before: { headline: spec.headline, support: spec.support }, after: { headline: fixed.headline, support: fixed.support_line } });
      spec.headline = fixed.headline; spec.support = fixed.support_line;
      meta = render(canvas, { ...spec, templateId });
    }
    assert.ok(meta.headlineFontPx >= 40, `${item.id}/${templateId}: readable headline`);
    assert.equal(meta.textOverflow, false, `${item.id}/${templateId}: no clipped copy`); renders++;
  }
  if (value.slides) for (const [index, slide] of value.slides.entries()) {
    const meta = renderSlide(canvas, { ...spec, slide: { ...slide, kicker: spec.kicker, index, total: value.slides.length }, cta: '', tagline: 'VendaMais' });
    assert.equal(meta.textOverflow, false, `${item.id}/slide-${index + 1}: no clipped copy`);
    writeFileSync(`${dir}/renders/${item.id}-${index + 1}.png`, canvas.toBuffer('image/png')); renders++;
  }
  render(canvas, spec);
  writeFileSync(`${dir}/renders/${item.id}.png`, canvas.toBuffer('image/png'));
  const x = (i % 3) * 360, y = Math.floor(i / 3) * 500;
  contactCtx.drawImage(canvas, x, y, 360, 450); contactCtx.font = '16px sans-serif'; contactCtx.fillStyle = '#16263A'; contactCtx.fillText(item.id, x + 20, y + 478);
}
writeFileSync(`${dir}/visual-corrections.json`, JSON.stringify(corrections, null, 2));
writeFileSync(`${dir}/renders/mobile-contact-sheet.png`, contact.toBuffer('image/png'));
// Regression: the renderer reports text that previously would disappear silently.
const meta = render(createCanvas(1080, 1350), { templateId: 'T04', headline: 'Título excessivo '.repeat(100), support: '', logoPrimary, logoNegative });
assert.equal(meta.textOverflow, true);
console.log(JSON.stringify({ passed: true, rendered_cases: renders, automatic_visual_corrections: corrections.length, oversized_text_detected: true, mobile_preview_width: 360 }));
