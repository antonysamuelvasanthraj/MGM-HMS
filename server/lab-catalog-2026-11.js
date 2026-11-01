/**
 * Loads the laboratory master list (lab-catalog-data.js) once per database (setting lab_catalog_2026_11):
 * every test and panel as an orderable lab service with its parameters, the 10 report categories in
 * print order, and lab packages as self-pay packages.
 *
 * Safe on a database already in use: a test that has orders keeps its parameters (missing ones are
 * only appended), nothing is deleted, edited interpretation text is kept, and an existing price is
 * never changed. Packages that already exist are left alone.
 */
import { SECTION_ORDER, SECTION_RENAMES, TESTS, PANELS, PACKAGES } from './lab-catalog-data.js';

export { SECTION_ORDER };

export function preloadLabCatalog2026(db) {
  // a lab package covers only the tests listed in it (no cover categories = all-inclusive, which would waive everything on the visit)
  db.prepare("UPDATE packages SET cover_categories='[]' WHERE category='Lab package' AND cover_categories IS NULL").run();
  if (db.prepare("SELECT value FROM settings WHERE key='lab_catalog_2026_11'").get()) return;
  const lab = db.prepare("SELECT id FROM departments WHERE code='LAB'").get();
  if (!lab) return;
  db.exec('BEGIN');
  try {
    for (const [from, to] of Object.entries(SECTION_RENAMES)) db.prepare("UPDATE services SET lab_section=? WHERE category='lab' AND lab_section=?").run(to, from);
    const svcByCode = db.prepare('SELECT * FROM services WHERE code=?');
    const used = db.prepare('SELECT 1 FROM orders WHERE service_id=? LIMIT 1');
    const addSvc = db.prepare(`INSERT INTO services (code,name,category,department_id,price,gst_pct,tat_minutes,sample_type,active,billing_unit,lab_section,description,report_comment,report_comment_title)
      VALUES (?,?,'lab',?,?,0,?,?,1,'once',?,?,?,'Interpretation')`);
    const touchSvc = db.prepare(`UPDATE services SET name=?, lab_section=?, sample_type=coalesce(nullif(sample_type,''),?), description=coalesce(nullif(description,''),?),
      report_comment=coalesce(report_comment,?), report_comment_title=coalesce(report_comment_title,'Interpretation') WHERE id=?`);
    const addParam = db.prepare(`INSERT INTO lab_params (service_id,name,unit,ref_low,ref_high,ref_text,seq,ref_low_m,ref_high_m,ref_low_f,ref_high_f,crit_low,crit_high,result_type,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
    const params = db.prepare('SELECT * FROM lab_params WHERE service_id=? ORDER BY seq, id');
    const dropParams = db.prepare('DELETE FROM lab_params WHERE service_id=?');

    const refText = ([, unit, low, high, text, , sex]) => text
      ?? (sex ? `M: ${sex.m.filter((v) => v != null).join(' - ')} · F: ${sex.f.filter((v) => v != null).join(' - ')} ${unit}`.trim()
        : low != null && high != null ? `${low} - ${high} ${unit}`.trim() : high != null ? `< ${high} ${unit}`.trim() : low != null ? `> ${low} ${unit}`.trim() : null);
    const insertParams = (sid, list, from = 0) => list.forEach((pr, i) => {
      const [name, unit, low, high, , type, sex, crit] = pr;
      addParam.run(sid, name, unit || null, low, high, refText(pr), from + i + 1,
        sex?.m?.[0] ?? null, sex?.m?.[1] ?? null, sex?.f?.[0] ?? null, sex?.f?.[1] ?? null, crit?.[0] ?? null, crit?.[1] ?? null,
        type === 't' ? 'text' : 'numeric');
    });
    const upsert = (code, name, section, sample, price, list, note, tat) => {
      const existing = svcByCode.get(code);
      if (!existing) {
        // prices are the hospital's to set (Fees & Tariffs); a new test starts unpriced
        const sid = Number(addSvc.run(code, name, lab.id, 0, tat, sample, section, note.split('. ')[0] + '.', note).lastInsertRowid);
        insertParams(sid, list);
        return;
      }
      touchSvc.run(name, section, sample, note.split('. ')[0] + '.', note, existing.id);
      if (!used.get(existing.id)) { dropParams.run(existing.id); insertParams(existing.id, list); return; }
      // results already reported against this test: keep its parameters, add only what is missing
      const have = params.all(existing.id);
      const names = new Set(have.map((x) => x.name.toLowerCase()));
      insertParams(existing.id, list.filter((x) => !names.has(x[0].toLowerCase())), have.length);
    };
    for (const [, code, name, section, sample, price, list, note] of TESTS) upsert(code, name, section, sample, price, list, note, list.some((x) => x[5] === 't') ? 1440 : 240);
    for (const [code, name, section, sample, price, list, note] of PANELS) upsert(code, name, section, sample, price, list, note, 240);

    const pkgByCode = db.prepare('SELECT id FROM packages WHERE code=?');
    const addPkg = db.prepare("INSERT INTO packages (code,name,category,price,mrp,validity_days,active,description,cover_categories) VALUES (?,?,'Lab package',?,?,7,1,?,'[]')");
    const addItem = db.prepare('INSERT INTO package_items (package_id,service_id,qty) VALUES (?,?,1)');
    for (const [code, name, items] of PACKAGES) {
      if (pkgByCode.get(code)) continue;
      const svcs = items.map((c) => svcByCode.get(c)).filter(Boolean);
      // unpriced until the hospital sets it; an unpriced package cannot be applied to a bill
      const pid = Number(addPkg.run(code, name, 0, null, `Includes: ${svcs.map((x) => x.name).join(', ')}`).lastInsertRowid);
      for (const s of svcs) addItem.run(pid, s.id);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('lab_catalog_2026_11','1')").run();
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); console.error('Lab catalogue load failed:', e.message); }
}
