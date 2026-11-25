// Executes the actual Component.renderVals path with an existing newsletter.
// Syntax-only checks cannot detect temporal-dead-zone errors inside builders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.document = { baseURI: 'https://post-vendamais.vercel.app/' };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const names = ['store', 'providers', 'newsletter-flow', 'qa', 'posts-flow', 'publisher'];
const modules = await Promise.all(names.map(n => import(`../engine/${n}.js?vm202611011656`)));
const [store, providers, newsletter, qa, posts, publisher] = modules;
const db = store.db;
class Logic { setState() {} forceUpdate() {} }
for (const filename of ['index.html', 'Content Engine.dc.html']) {
  test(`${filename}: existing newsletter renders on every Studio route without initialization errors`, () => {
    const html = readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
    const script = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
    const Component = new Function('DCLogic', 'React', script + '; return Component;')(Logic, { createRef: () => ({ current: null }) });
    const app = new Component();
    app.M = { store, providers, newsletter, qa, posts, publisher };
    // The unrelated panels are not under test; newsletterVals and renderVals are real.
    app.knowledgeVals = app.editorialVals = app.pipelineVals = () => ({});
    db.editions = [{ id: 'render-news', title: 'Radar teste', status: 'newsletter_approved', brief: { mode: 'ready', number: 29 }, edition_date: '2026-11-18' }];
    db.newsletter_versions = [{ id: 'render-version', edition_id: 'render-news', n: 1, is_approved: true, created_at: '2026-11-17T00:00:00Z', meta: { locks: {}, edited: {} }, content_json: { subject: 'Um assunto claro', headline: 'Revise as propostas abertas', free_blocks: [{ title: 'Defina o próximo passo', md: 'Converse com os clientes sobre as negociações em andamento.' }], cta: { label: 'Converse com a VendaMais', url: 'https://vendamais.com.br/contato/' } } }];
    db.posts = []; db.publications = []; db.sources = []; db.analyses = [];
    app.state = { ...app.state, ready: true, editionId: 'render-news', busy: false };
    for (const route of ['dashboard', 'newsletter', 'posts', 'imagelab']) {
      app.state.route = route;
      const values = app.renderVals();
      assert.equal(values.hasNewsletter, true); assert.ok(values.blockRows.length >= 5);
      assert.equal(values.blockRows.find(b => b.path === 'subject').regenDisabled, false);
      assert.equal(typeof values.outHtml, 'string');
    }
    app.state.busy = true; assert.equal(app.renderVals().blockRows[0].regenDisabled, true);
    app.state.busy = false; db.newsletter_versions[0].meta.locks.subject = true;
    assert.equal(app.renderVals().blockRows[0].regenDisabled, true);
  });
}
