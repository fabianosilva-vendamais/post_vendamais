import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const store = await import('../engine/store.js?vm202611011656');
const SB = await import('../engine/supabase.js?vm202611011656');
const publisher = await import('../engine/publisher.js?vm202611011656');
const flow = await import('../engine/posts-flow.js?vm202611011656');
const db = store.db, originalFetch = globalThis.fetch;
function fixture() {
  db.session = { access_token: 'isolated', expires_at: Date.now() + 3600000 };
  Object.assign(db.settings, { supabase_url: 'https://isolated.invalid', supabase_anon_key: 'local-key', functions_base: 'https://isolated.invalid/functions/v1', metricool_blog_id: '', metricool_brand_name: '', metricool_blog_id_es: '', metricool_brand_name_es: '', timezone: 'America/Sao_Paulo', text_model: 'keep-local' });
  for (const key of ['editions','posts','sources','analyses','newsletter_versions','generated_images','renders','publications']) db[key] = [];
}
const saved = { metricool_blog_id: '6944421', metricool_brand_name: 'VendaMais Brasil', metricool_blog_id_es: '7718406', metricool_brand_name_es: 'VendaMais LATAM', timezone: 'America/Sao_Paulo' };
function mockPull(settings) {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'GET'); assert.match(url, /^https:\/\/isolated\.invalid\/rest\/v1\//);
    return Response.json(url.includes('/settings?') ? settings : []);
  };
}
test('cloud refresh restores both verified brands without replacing credentials or local model settings', async () => {
  fixture(); mockPull([{ settings_json: { ...saved, supabase_url: 'https://do-not-apply.invalid', supabase_anon_key: 'do-not-apply', functions_base: 'do-not-apply', text_model: 'do-not-apply' } }]);
  try { await SB.pullAll(); for (const [key, value] of Object.entries(saved)) assert.equal(db.settings[key], value); assert.equal(db.settings.supabase_anon_key, 'local-key'); assert.equal(db.settings.supabase_url, 'https://isolated.invalid'); assert.equal(db.settings.text_model, 'keep-local'); assert.equal(publisher.status().ok, true); } finally { globalThis.fetch = originalFetch; }
});
test('missing or empty cloud values preserve an existing local brand selection', async () => {
  for (const rows of [[], [{ settings_json: { metricool_blog_id: '', metricool_blog_id_es: null } }]]) {
    fixture(); Object.assign(db.settings, saved); mockPull(rows);
    try { await SB.pullAll(); assert.equal(db.settings.metricool_blog_id, saved.metricool_blog_id); assert.equal(db.settings.metricool_blog_id_es, saved.metricool_blog_id_es); } finally { globalThis.fetch = originalFetch; }
  }
});
test('the weekly panel becomes schedulable after restoring brands and preserves approved content', async () => {
  fixture(); mockPull([{ settings_json: saved }]);
  const ed = { id: 'brands-ed', brief: { number: 29 }, edition_date: '2026-11-18', schedule_times: { wed_pt: '06:00', wed_es: '06:00', fri_pt: '06:00', fri_es: '06:00', mon_pt: '06:00', mon_es: '06:00' } }; db.editions.push(ed);
  db.posts = ['consulting', 'training', 'business'].map(angle => ({ id: 'brands-' + angle, edition_id: ed.id, angle, status: 'approved', content_json: { caption: { body: 'Approved PT' } }, content_es: { caption: { body: 'Approved ES' } }, meta: { artwork_mode: 'final', final_artworks: { pt: { image_id: angle + '-pt' }, es: { image_id: angle + '-es' } } } }));
  const before = JSON.stringify(db.posts);
  try {
    await SB.pullAll();
    for (const filename of ['index.html', 'Content Engine.dc.html']) {
      const html = readFileSync(new URL('../' + filename, import.meta.url), 'utf8'), code = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
      const Component = new Function('DCLogic', 'React', code + ';return Component;')(class {}, { createRef: () => ({ current: null }) }), app = new Component();
      app.M = { store, publisher, posts: flow, supabase: SB }; app.state = { ...app.state, editionId: ed.id, weekOpen: true }; app.state.weekRows = app.buildWeekRows(ed);
      const out = app.weekVals(); assert.equal(out.weekDisabled, false); assert.equal(out.weekCount, 6); assert.equal(out.weekRows.length, 6); assert.ok(out.weekRows.every(r => !r.disabled && r.include && r.time === '06:00')); assert.doesNotMatch(out.weekHint, /9h|10h/);
    }
    assert.equal(JSON.stringify(db.posts), before); assert.equal(db.publications.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
