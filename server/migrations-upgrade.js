/**
 * Additive migrations for the hybrid LIS / RIS and hospital-mode upgrade (Oct 2026).
 * Called at the end of migrate(). Only adds tables, columns, triggers and settings;
 * every backfill runs once (guarded by a settings flag) and never deletes a record.
 */
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const flag = (db, key) => !!db.prepare('SELECT 1 FROM settings WHERE key=?').get(key);
const setFlag = (db, key) => db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(key, '1');
const defaultSetting = (db, key, value) => db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(key, value);

export function migrateUpgrade(db) {
  const add = (table, name, definition) => {
    if (!columns(db, table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };

  /* ---------------------------------------------- Phase 1: hospital operating mode */
  db.exec(`CREATE TABLE IF NOT EXISTS operating_mode_changes (
    id INTEGER PRIMARY KEY,
    from_mode TEXT, to_mode TEXT NOT NULL CHECK (to_mode IN ('paper','paperless','hybrid')),
    reason TEXT NOT NULL,
    changed_by INTEGER REFERENCES users(id),
    changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));`);
  if (!flag(db, 'hospital_mode')) {
    // first run: the mode the existing department switches already add up to
    const w = Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key LIKE 'workflow_%'").all().map((r) => [r.key, r.value]));
    const mode = w.workflow_doctor === 'manual' && w.workflow_pharmacy === 'manual' && w.workflow_lab === 'reception' ? 'paper'
      : (w.workflow_doctor || 'portal') === 'portal' && (w.workflow_pharmacy || 'eprescription') === 'eprescription' && (w.workflow_lab || 'doctor') === 'doctor' ? 'paperless' : 'hybrid';
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('hospital_mode', mode);
  }
  defaultSetting(db, 'dept_entry_enabled', '1');        // lab / radiology may record a paper request themselves
  defaultSetting(db, 'duplicate_order_guard', '1');     // warn before a second open order for the same test
  /* Phase 2: investigation release rule for OP — 'payment' (paid, approved due / credit or payer approval) or 'immediate' */
  defaultSetting(db, 'release_op_rule', 'payment');
  /* Schedule H / H1 / X need a prescription at the pharmacy counter */
  defaultSetting(db, 'schedule_h_requires_rx', '1');
  // single-batch stock corrections can be switched off by the administrator; Excel / bulk stock counts are never blocked
  defaultSetting(db, 'manual_stock_adjust', '1');
  // sample container labels: always available by button in every mode; automatic print at collection is optional
  defaultSetting(db, 'lab_label_auto', '0');
  // pharmacy due bills: off = the pharmacy desk records a due itself; on = only an approver may
  defaultSetting(db, 'pharmacy_due_approval', '0');
  // a small pharmacy with one in-charge may approve its own transfer request (audited); off = a second person approves
  defaultSetting(db, 'transfer_self_approve', '1');
  /* discharge needs the doctor's clearance and a discharge summary (paper allowed in Paper / Hybrid mode) */
  defaultSetting(db, 'discharge_requires_clearance', '1');
  // Lab report QR: a printed report always carries a QR; the link works on the hospital network, or on the cloud when one is connected
  defaultSetting(db, 'report_qr_download', '1');          // patients may open / download a released report through the QR
  defaultSetting(db, 'report_qr_retention_days', '90');   // the link stays valid this long after the report is released
  // strict vitals: no patient reaches the doctor without recorded vitals (any mode); direct-to-doctor is then unavailable
  defaultSetting(db, 'vitals_strict', '1');
  defaultSetting(db, 'sync_queue_enabled', '0');       // cloud sync queue: off until enabled in Settings
  defaultSetting(db, 'cloud_enabled', '0');               // optional cloud connection (reports only, never the whole HMS)
  defaultSetting(db, 'cloud_base_url', '');
  db.exec(`CREATE TABLE IF NOT EXISTS report_shares (
    id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, order_ids TEXT NOT NULL, patient_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')), created_by INTEGER, revoked INTEGER NOT NULL DEFAULT 0,
    opens INTEGER NOT NULL DEFAULT 0, last_opened TEXT, cloud_status TEXT)`);
  defaultSetting(db, 'require_digital_reference', '1');   // every UPI / card / bank / cheque payment needs its reference (handbook §6)

  /* ---------------------------------------------- Phase 1: order source, destination, statuses */
  add('orders', 'order_source', "TEXT NOT NULL DEFAULT 'doctor_portal'");   // doctor_portal | paper_prescription | department_entry | ward
  add('orders', 'order_dest', "TEXT NOT NULL DEFAULT 'internal'");          // internal | outsourced
  add('orders', 'auth_status', "TEXT NOT NULL DEFAULT 'not_required'");     // not_required | pending | approved | rejected | emergency_override
  add('orders', 'result_stage', "TEXT NOT NULL DEFAULT 'pending'");         // pending | draft | under_verification | released | amended
  add('orders', 'duplicate_of', 'INTEGER REFERENCES orders(id)');           // second order kept on purpose, linked to the first
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_enc_svc ON orders(encounter_id, service_id, status)');

  if (!flag(db, 'orders_axes_backfill_2026_10')) {
    db.exec(`
      UPDATE orders SET order_source = CASE
          WHEN (SELECT role FROM users u WHERE u.id=orders.ordered_by) IN ('lab','lab_admin','radiology','imaging_admin') THEN 'department_entry'
          WHEN (SELECT role FROM users u WHERE u.id=orders.ordered_by) IN ('reception','reception_admin','cashier') OR (referred_by IS NOT NULL AND
                (SELECT role FROM users u WHERE u.id=orders.ordered_by) <> 'doctor') THEN 'paper_prescription'
          WHEN (SELECT role FROM users u WHERE u.id=orders.ordered_by) IN ('nurse','nursing_incharge','er_incharge','ot_incharge') THEN 'ward'
          ELSE 'doctor_portal' END;
      UPDATE orders SET order_dest = CASE WHEN provider_id IS NOT NULL THEN 'outsourced' ELSE 'internal' END;
      UPDATE orders SET result_stage = CASE status WHEN 'verified' THEN 'released' WHEN 'reported' THEN
          CASE WHEN category='imaging' THEN 'draft' ELSE 'under_verification' END ELSE 'pending' END;
      UPDATE orders SET result_stage='amended' WHERE EXISTS (SELECT 1 FROM reports r WHERE r.order_id=orders.id AND r.status='amended');
      UPDATE orders SET auth_status = CASE
          WHEN (SELECT kind FROM encounters e WHERE e.id=orders.encounter_id)='EMG' OR (SELECT priority FROM encounters e WHERE e.id=orders.encounter_id)='emergency' THEN 'emergency_override'
          WHEN (SELECT payer_type FROM patients p WHERE p.id=orders.patient_id) IN ('insurance','aarogyasri','corporate','trust') THEN
            CASE WHEN EXISTS (SELECT 1 FROM bill_items i JOIN bills b ON b.id=i.bill_id WHERE i.order_id=orders.id
                   AND (b.authorization_status='approved' OR b.claim_status IN ('preauth_approved','claim_submitted','settled'))) THEN 'approved' ELSE 'pending' END
          ELSE 'not_required' END;`);
    setFlag(db, 'orders_axes_backfill_2026_10');
  }
  // keep the axes current whatever code path changes an order: work status → report stage,
  // a signed amendment → 'amended', a payer approval on the bill → authorisation approved
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS orders_result_stage AFTER UPDATE OF status ON orders
    WHEN NEW.status IS NOT OLD.status AND OLD.result_stage <> 'amended' BEGIN
      UPDATE orders SET result_stage = CASE NEW.status WHEN 'verified' THEN 'released'
        WHEN 'reported' THEN CASE WHEN NEW.category='imaging' THEN 'draft' ELSE 'under_verification' END
        WHEN 'cancelled' THEN OLD.result_stage ELSE 'pending' END WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS orders_dest_on_insert AFTER INSERT ON orders WHEN NEW.provider_id IS NOT NULL BEGIN
      UPDATE orders SET order_dest='outsourced' WHERE id=NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS orders_dest_on_provider AFTER UPDATE OF provider_id ON orders BEGIN
      UPDATE orders SET order_dest = CASE WHEN NEW.provider_id IS NULL THEN 'internal' ELSE 'outsourced' END WHERE id=NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS reports_amended AFTER UPDATE OF status ON reports WHEN NEW.status='amended' BEGIN
      UPDATE orders SET result_stage='amended' WHERE id=NEW.order_id;
    END;
    CREATE TRIGGER IF NOT EXISTS bills_auth_to_orders AFTER UPDATE OF authorization_status, claim_status ON bills BEGIN
      UPDATE orders SET auth_status = CASE
          WHEN NEW.authorization_status='approved' OR NEW.claim_status IN ('preauth_approved','claim_submitted','settled') THEN 'approved'
          WHEN NEW.claim_status LIKE '%rejected%' THEN 'rejected' ELSE auth_status END
        WHERE auth_status IN ('pending','approved','rejected') AND id IN (SELECT order_id FROM bill_items WHERE bill_id=NEW.id AND order_id IS NOT NULL);
    END;`);

  /* ---------------------------------------------- Phase 3: outsourced lab & imaging */
  add('diagnostic_providers', 'code', 'TEXT');
  add('diagnostic_providers', 'email', 'TEXT');
  add('diagnostic_providers', 'gstin', 'TEXT');
  add('diagnostic_providers', 'default_tat_hours', 'INTEGER');
  add('diagnostic_providers', 'credit_days', 'INTEGER');
  db.exec(`
    -- outsourced test master: what a centre charges us for a test, its code there, TAT and transport
    CREATE TABLE IF NOT EXISTS outsource_rates (
      id INTEGER PRIMARY KEY,
      provider_id INTEGER NOT NULL REFERENCES diagnostic_providers(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      provider_test_code TEXT, cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
      tat_hours INTEGER, transport TEXT, collection_notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (provider_id, service_id));
    -- a dispatch: one courier run (lab samples) or one referral batch (imaging) to one centre
    CREATE TABLE IF NOT EXISTS outsource_dispatches (
      id INTEGER PRIMARY KEY, dispatch_no TEXT UNIQUE NOT NULL,
      provider_id INTEGER NOT NULL REFERENCES diagnostic_providers(id),
      kind TEXT NOT NULL CHECK (kind IN ('lab','imaging')),
      courier_name TEXT, courier_phone TEXT, temperature TEXT, sample_condition TEXT, notes TEXT,
      status TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched','acknowledged','closed','cancelled')),
      dispatched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), dispatched_by INTEGER REFERENCES users(id),
      acknowledged_at TEXT, acknowledged_name TEXT, acknowledged_by INTEGER REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS outsource_items (
      id INTEGER PRIMARY KEY,
      dispatch_id INTEGER NOT NULL REFERENCES outsource_dispatches(id),
      order_id INTEGER NOT NULL REFERENCES orders(id),
      sample_id TEXT, specimen TEXT, qty TEXT, condition TEXT,
      external_ref TEXT, expected_at TEXT, appointment_at TEXT, study_no TEXT, image_link TEXT,
      expected_cost REAL,
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','report_received','accepted','rejected','recalled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_outsource_items_live ON outsource_items(order_id) WHERE status NOT IN ('rejected','recalled');
    -- every report a centre sends back, by version; the original file and its signatory are kept as sent
    CREATE TABLE IF NOT EXISTS external_reports (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      provider_id INTEGER REFERENCES diagnostic_providers(id),
      version INTEGER NOT NULL,
      external_report_no TEXT, reporting_lab TEXT NOT NULL,
      signatory_name TEXT NOT NULL, signatory_reg_no TEXT, reported_at TEXT,
      image_link TEXT, attachment_ids TEXT NOT NULL,
      is_correction INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','accepted','rejected','superseded')),
      received_by INTEGER REFERENCES users(id), received_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      checks TEXT, accepted_by INTEGER REFERENCES users(id), accepted_at TEXT,
      rejected_reason TEXT, notes TEXT,
      UNIQUE (order_id, version));
    -- the centre's bill to the hospital: lines are orders, so an order is paid for once
    CREATE TABLE IF NOT EXISTS outsource_invoices (
      id INTEGER PRIMARY KEY, ref_no TEXT UNIQUE NOT NULL,
      provider_id INTEGER NOT NULL REFERENCES diagnostic_providers(id),
      invoice_no TEXT NOT NULL, invoice_date TEXT NOT NULL,
      total REAL NOT NULL CHECK (total >= 0), paid REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','part_paid','paid','cancelled')),
      notes TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (provider_id, invoice_no));
    CREATE TABLE IF NOT EXISTS outsource_invoice_items (
      id INTEGER PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES outsource_invoices(id),
      order_id INTEGER NOT NULL REFERENCES orders(id),
      cost REAL NOT NULL CHECK (cost >= 0));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_outsource_invoice_order ON outsource_invoice_items(order_id);
    CREATE TABLE IF NOT EXISTS outsource_payments (
      id INTEGER PRIMARY KEY, payment_no TEXT UNIQUE NOT NULL,
      provider_id INTEGER NOT NULL REFERENCES diagnostic_providers(id),
      invoice_id INTEGER REFERENCES outsource_invoices(id),
      amount REAL NOT NULL CHECK (amount > 0), mode TEXT NOT NULL, reference TEXT, paid_on TEXT NOT NULL, notes TEXT,
      created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));`);

  /* ---------------------------------------------- Phase 4: accession, critical calls, lab consumables */
  add('orders', 'accession_no', 'TEXT');
  add('orders', 'recollect_count', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_accession ON orders(accession_no);
    CREATE INDEX IF NOT EXISTS idx_orders_sample ON orders(sample_id);
    -- who in the clinical team was told of a critical result, how, and that they read it back
    CREATE TABLE IF NOT EXISTS critical_calls (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      result_summary TEXT NOT NULL,
      informed_user_id INTEGER REFERENCES users(id), informed_name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('phone','in_person','intercom','video')),
      read_back INTEGER NOT NULL CHECK (read_back = 1),
      called_by INTEGER NOT NULL REFERENCES users(id), called_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      minutes_from_result INTEGER,
      acknowledged_by INTEGER REFERENCES users(id), acknowledged_at TEXT, action_taken TEXT, notes TEXT);
    CREATE INDEX IF NOT EXISTS idx_critical_calls_order ON critical_calls(order_id);
    -- what one test uses from the LAB store, and when (collection: tubes, needles; processing: reagents)
    CREATE TABLE IF NOT EXISTS lab_test_consumables (
      id INTEGER PRIMARY KEY,
      service_id INTEGER NOT NULL REFERENCES services(id),
      medicine_id INTEGER NOT NULL REFERENCES medicines(id),
      qty REAL NOT NULL CHECK (qty > 0),
      stage TEXT NOT NULL CHECK (stage IN ('collection','processing')),
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE (service_id, medicine_id, stage));
    CREATE TABLE IF NOT EXISTS lab_consumption (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id), service_id INTEGER REFERENCES services(id),
      medicine_id INTEGER NOT NULL REFERENCES medicines(id), batch_id INTEGER REFERENCES medicine_batches(id),
      qty REAL NOT NULL, stage TEXT NOT NULL, recollection INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('used','short')),
      created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS idx_lab_consumption_order ON lab_consumption(order_id);`);
  // standard lab items are added from Lab Store ("Add standard lab items"), never on a first run

  /* ---------------------------------------------- Phase 5: insurance policy terms on a case */
  add('insurance_claims', 'deductible_amount', 'REAL NOT NULL DEFAULT 0');
  add('insurance_claims', 'copay_pct', 'REAL NOT NULL DEFAULT 0');
  add('insurance_claims', 'room_rent_limit', 'REAL NOT NULL DEFAULT 0');           // ₹ per day; 0 = no limit
  add('insurance_claims', 'proportional_deduction', 'INTEGER NOT NULL DEFAULT 1');
  add('insurance_claims', 'sub_limits', "TEXT NOT NULL DEFAULT '{}'");            // {"pharmacy": 16000, "lab": 5000}
  add('insurance_claims', 'policy_notes', 'TEXT');

  /* ---------------------------------------------- Phase 5: paper clinical documents */
  db.exec(`CREATE TABLE IF NOT EXISTS clinical_documents (
    id INTEGER PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    encounter_id INTEGER REFERENCES encounters(id), admission_id INTEGER REFERENCES admissions(id),
    form TEXT NOT NULL, area TEXT NOT NULL, title TEXT NOT NULL,
    documented_on TEXT, documented_by_name TEXT,
    method TEXT NOT NULL CHECK (method IN ('paper','digital')),
    attachment_ids TEXT NOT NULL DEFAULT '[]',
    notes TEXT, recorded_by INTEGER REFERENCES users(id), recorded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS idx_clinical_documents_patient ON clinical_documents(patient_id, admission_id);`);

  /* ---------------------------------------------- MRI is not offered (history kept) */
  if (!flag(db, 'mri_retired_2026_10')) {
    const mri = db.prepare("SELECT id, code, name FROM services WHERE active=1 AND category='imaging' AND (upper(name) LIKE '%MRI%' OR upper(code) LIKE '%MRI%')").all();
    for (const m of mri) {
      db.prepare('UPDATE services SET active=0 WHERE id=?').run(m.id);
      db.prepare(`INSERT INTO audit_log (user_name, action, entity, entity_id, detail, before_json, after_json, reason)
        VALUES ('system', 'service.deactivate', 'services', ?, ?, ?, ?, ?)`).run(m.id, JSON.stringify({ code: m.code, name: m.name }),
        JSON.stringify({ active: 1 }), JSON.stringify({ active: 0 }), 'MRI is not an active radiology modality (Oct 2026 upgrade); history kept');
    }
    setFlag(db, 'mri_retired_2026_10');
  }

  /* ---------------------------------------------- sub-headings inside a test (e.g. Differential Leucocyte Count) */
  if (!flag(db, 'lab_subheadings_2026_11')) {
    const addHeading = (serviceId, before, title) => {
      const rows = db.prepare('SELECT id, name, result_type FROM lab_params WHERE service_id=? ORDER BY seq, id').all(serviceId);
      const at = rows.findIndex((r) => r.name.trim().toLowerCase() === before);
      if (at < 0 || rows.some((r) => r.result_type === 'heading' && r.name.toLowerCase() === title.toLowerCase())) return;
      const ins = db.prepare("INSERT INTO lab_params (service_id, name, seq, result_type, active) VALUES (?,?,0,'heading',1)").run(serviceId, title);
      const order = rows.map((r) => r.id); order.splice(at, 0, Number(ins.lastInsertRowid));
      order.forEach((id, i) => db.prepare('UPDATE lab_params SET seq=? WHERE id=?').run(i + 1, id));
    };
    for (const s of db.prepare("SELECT id FROM services WHERE category='lab'").all()) {
      addHeading(s.id, 'neutrophils', 'Differential Leucocyte Count');
      addHeading(s.id, 'absolute neutrophil count', 'Absolute Counts');
    }
    setFlag(db, 'lab_subheadings_2026_11');
  }

  /* ---------------------------------------------- demo imaging and ambulance services (demo prices; the hospital sets its own) */
  if (!flag(db, 'demo_imaging_ambulance_2026_11') && (process.env.HMS_ENV==='demo'||process.env.NODE_ENV==='test')) {
    const dept = db.prepare("SELECT department_id d FROM services WHERE category='imaging' AND department_id IS NOT NULL LIMIT 1").get()?.d ?? null;
    const ins = db.prepare("INSERT INTO services (code, name, category, department_id, price, gst_pct, billing_unit, active) SELECT ?,?,?,?,?,0,'once',1 WHERE NOT EXISTS (SELECT 1 FROM services WHERE code=?)");
    for (const [code, name, cat, price] of [['IMG-CTB', 'CT Brain (plain)', 'imaging', 2500], ['IMG-CTA', 'CT Abdomen', 'imaging', 4500], ['IMG-2DE', '2D Echo', 'imaging', 1500],
      ['IMG-XKN', 'X-Ray Knee AP / Lateral', 'imaging', 400], ['AMB-LOCAL', 'Ambulance — local', 'other', 1000], ['AMB-TPT', 'Ambulance — MGM to Tirupati', 'other', 4500]])
      ins.run(code, name, cat, cat === 'imaging' ? dept : null, price, code);
    setFlag(db, 'demo_imaging_ambulance_2026_11');
  }

  /* ---------------------------------------------- payer-change approval is optional (TPA desk is not always available) */
  if (!flag(db, 'payer_approval_optional_2026_11')) {
    db.prepare("INSERT INTO settings (key,value) VALUES ('payer_change_requires_approval','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
    setFlag(db, 'payer_approval_optional_2026_11');
  }

  /* ---------------------------------------------- demo tariffs: zero-priced lab tests and procedures get a demo amount (doctor fees stay unset) */
  if (!flag(db, 'demo_tariffs_2026_11')) {
    db.prepare("UPDATE services SET price=150, updated_at=datetime('now','localtime') WHERE active=1 AND category='lab' AND (price IS NULL OR price=0)").run();
    db.prepare("UPDATE services SET price=150, updated_at=datetime('now','localtime') WHERE active=1 AND category='procedure' AND (price IS NULL OR price=0)").run();
    setFlag(db, 'demo_tariffs_2026_11');
  }
}
