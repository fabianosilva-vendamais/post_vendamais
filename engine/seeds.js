// Edições preparadas pelo editor fora do sistema (backup-newsletter-NN.json) entram sozinhas na abertura do app.
// O arquivo fica no repositório em seeds/; cada um é aplicado uma única vez (marcado em db.migrations.seeds).
import { db, save, audit, now } from './store.js?vm202611011639';
export const SEEDS = ['seeds/backup-newsletter-27.json'];
export async function applySeeds(app) {
  db.migrations = db.migrations || {}; db.migrations.seeds = db.migrations.seeds || {}; let applied = 0;
  for (const path of SEEDS) {
    if (db.migrations.seeds[path]) continue;
    try {
      const r = await fetch(new URL(path, document.baseURI).href, { cache: 'no-store' }); if (!r.ok) continue;
      const snap = await r.json();
      for (const e of snap.editions || []) if (!db.editions.some(x => x.id === e.id)) db.editions.unshift(e);
      for (const k of ['sources', 'analyses', 'newsletter_versions', 'posts']) for (const row of snap[k] || []) if (!(db[k] || []).some(x => x.id === row.id)) (db[k] = db[k] || []).push(row);
      if (snap.settings?.last_edition_number) db.settings.last_edition_number = Math.max(db.settings.last_edition_number || 0, snap.settings.last_edition_number);
      db.migrations.seeds[path] = now(); applied++; audit('seed.apply', 'edition', (snap.editions || [])[0]?.id || path, { path });
    } catch (e) { console.warn('seed', path, e); }
  }
  if (applied) { save(); try { if (app?.M?.supabase?.signedIn()) await app.M.supabase.pushAll(); } catch (e) { console.warn('seed sync', e); } }
  return applied;
}
