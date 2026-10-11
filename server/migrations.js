/**
 * Additive migrations. Existing hospital records are never reset on startup.
 *
 * `preMigrate` runs before schema.sql, for the rare change the schema's
 * CREATE IF NOT EXISTS cannot express. `migrate` runs after it and only adds.
 */
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const tableExists = (db, table) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);

export function preMigrate(db) {
  // The first transfer design held one batch per row. The multi-line design
  // keeps a header plus lines, so the old table is kept aside, not dropped.
  if (tableExists(db, 'stock_transfers') && columns(db, 'stock_transfers').includes('batch_id')
      && !tableExists(db, 'stock_transfers_legacy')) {
    db.exec('ALTER TABLE stock_transfers RENAME TO stock_transfers_legacy');
  }
}

export function migrate(db) {
  const add = (table, name, definition) => {
    if (!columns(db, table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };

  /* payments & bills ------------------------------------------------ */
  add('bill_items','patient_pay_amount','REAL CHECK(patient_pay_amount IS NULL OR patient_pay_amount >= 0)');
  add('payments', 'transaction_id', 'TEXT');
  add('payments', 'collection_group', 'TEXT');
  add('payments', 'cancelled_by', 'INTEGER REFERENCES users(id)');
  add('payments', 'cancelled_at', 'TEXT');
  add('bills', 'authorization_status', "TEXT NOT NULL DEFAULT 'pending'");
  add('bills', 'package_id', 'INTEGER REFERENCES packages(id)');
  add('bills', 'authorized_by', 'INTEGER REFERENCES users(id)');
  add('bills', 'authorized_at', 'TEXT');
  add('bills', 'authorization_reason', 'TEXT');
  add('bills', 'free_treatment_value', 'REAL NOT NULL DEFAULT 0');
  add('bills', 'covered_amount', 'REAL NOT NULL DEFAULT 0');   // taken over by a payer
  add('bills', 'waived_amount', 'REAL NOT NULL DEFAULT 0');    // approved free treatment
  add('bills', 'cancelled_by', 'INTEGER REFERENCES users(id)');
  add('bills', 'source', 'TEXT');                               // OT | ER | indent | ... where it came from
  add('bills', 'source_id', 'INTEGER');
  add('bills', 'doctor_id', 'INTEGER REFERENCES users(id)');
  add('insurance_claims', 'copay_amount', 'REAL NOT NULL DEFAULT 0');
  add('bill_items', 'revenue_head', 'TEXT');                    // OP | IP | ER | LAB | IMAGING | ...
  add('bill_items', 'tax_inclusive', 'INTEGER NOT NULL DEFAULT 0'); // pharmacy MRP already includes GST
  add('bill_items', 'unit_cost', 'REAL NOT NULL DEFAULT 0');    // pharmacy cost for COGS
  add('bill_items', 'returned_qty', 'REAL NOT NULL DEFAULT 0');
  add('bill_items', 'created_by', 'INTEGER REFERENCES users(id)');
  add('bill_items', 'created_at', 'TEXT');
  add('refunds', 'journal_voucher_id', 'INTEGER');

  /* patients -------------------------------------------------------- */
  add('patients', 'category_since', 'TEXT');

  /* pharmacy master and stock --------------------------------------- */
  add('medicine_batches', 'location', "TEXT NOT NULL DEFAULT 'Central'");
  add('medicine_batches', 'mfg_date', 'TEXT');
  add('medicine_batches', 'selling_price', 'REAL NOT NULL DEFAULT 0');
  add('medicine_batches', 'rack', 'TEXT');
  add('medicine_batches', 'purchase_id', 'INTEGER REFERENCES purchases(id)');
  add('medicines', 'brand', 'TEXT');
  add('medicines', 'purchase_unit', "TEXT DEFAULT 'box'");
  add('medicines', 'dispensing_unit', "TEXT DEFAULT 'tablet'");
  add('medicines', 'package_type', "TEXT DEFAULT 'strip'");
  add('medicines', 'pack_size', 'REAL NOT NULL DEFAULT 1');       // packs per purchase unit
  add('medicines', 'units_per_pack', 'REAL NOT NULL DEFAULT 1');  // dispensing units per pack
  add('medicines', 'default_cgst_pct', 'REAL NOT NULL DEFAULT 6');
  add('medicines', 'default_sgst_pct', 'REAL NOT NULL DEFAULT 6');
  add('medicines', 'kind', "TEXT NOT NULL DEFAULT 'medicine'");  // medicine | consumable
  add('medicines', 'composition', 'TEXT');                         // JSON [{generic, strength}] — combination drugs
  add('suppliers', 'state', 'TEXT');
  add('suppliers', 'pan', 'TEXT');
  add('purchases', 'gst_mode', "TEXT NOT NULL DEFAULT 'intra'");  // intra (CGST+SGST) | inter (IGST)
  add('purchases', 'cgst', 'REAL NOT NULL DEFAULT 0');
  add('purchases', 'sgst', 'REAL NOT NULL DEFAULT 0');
  add('purchases', 'igst', 'REAL NOT NULL DEFAULT 0');
  add('purchases', 'round_off', 'REAL NOT NULL DEFAULT 0');
  add('purchases', 'due_date', 'TEXT');
  for (const name of ['cgst_pct', 'sgst_pct', 'igst_pct', 'cgst_amount', 'sgst_amount', 'igst_amount',
    'discount_pct', 'net_value', 'taxable_value']) add('purchase_items', name, 'REAL NOT NULL DEFAULT 0');
  for (const name of ['brand', 'generic', 'manufacturer', 'hsn', 'manufacturing_date', 'purchase_unit',
    'dispensing_unit', 'package_type', 'rack']) add('purchase_items', name, 'TEXT');
  for (const name of ['pack_size', 'units_per_pack']) add('purchase_items', name, 'REAL NOT NULL DEFAULT 1');
  add('purchase_items', 'selling_price', 'REAL NOT NULL DEFAULT 0');
  add('purchase_items', 'units_received', 'REAL NOT NULL DEFAULT 0');
  add('purchase_items', 'unit_cost', 'REAL NOT NULL DEFAULT 0');
  add('purchase_items', 'batch_id', 'INTEGER REFERENCES medicine_batches(id)');
  add('stock_moves', 'location', 'TEXT');

  /* expenses -------------------------------------------------------- */
  add('expenses', 'account_id', 'INTEGER REFERENCES accounts(id)');
  add('expenses', 'department', 'TEXT');
  add('expenses', 'reference', 'TEXT');

  /* audit ----------------------------------------------------------- */
  add('audit_log', 'before_json', 'TEXT');
  add('audit_log', 'after_json', 'TEXT');
  add('audit_log', 'reason', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_masters (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, UNIQUE(kind, name));
    CREATE TABLE IF NOT EXISTS collection_requests (
      request_key TEXT PRIMARY KEY, bill_id INTEGER NOT NULL REFERENCES bills(id), response TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS idx_batch_loc ON medicine_batches(location, medicine_id);
    CREATE INDEX IF NOT EXISTS idx_bill_items_head ON bill_items(revenue_head);
  `);

  /* inpatient daily charges ------------------------------------------ */
  add('services', 'billing_unit', "TEXT NOT NULL DEFAULT 'once'");   // once | day
  add('services', 'ipd_default', 'INTEGER NOT NULL DEFAULT 0');       // pre-ticked at admission
  add('bill_items', 'admission_charge_id', 'INTEGER');
  add('bill_items', 'charge_cycle', 'INTEGER');                       // day number of a daily charge
  add('bill_items', 'waiver_of', 'INTEGER');                          // negative line cancelling another
  add('admissions', 'emergency_id', 'INTEGER');
  if (tableExists(db, 'admission_charges')) add('admission_charges', 'bed_id', 'INTEGER REFERENCES beds(id)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS admission_charges (
      id INTEGER PRIMARY KEY,
      admission_id INTEGER NOT NULL REFERENCES admissions(id),
      service_id INTEGER REFERENCES services(id),
      kind TEXT NOT NULL DEFAULT 'service',          -- bed | service
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'ipd',
      unit TEXT NOT NULL DEFAULT 'day',              -- day | once
      rate REAL NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',         -- active | ended | stopped
      stop_reason TEXT,
      added_by INTEGER REFERENCES users(id),
      stopped_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS idx_adm_charges ON admission_charges(admission_id);
    CREATE INDEX IF NOT EXISTS idx_bi_charge ON bill_items(admission_charge_id);
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY,
      entity TEXT NOT NULL, entity_id INTEGER NOT NULL,
      file_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL,
      note TEXT, uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), deleted_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_attach ON attachments(entity, entity_id);
  `);
  add('admission_charges', 'bed_id', 'INTEGER REFERENCES beds(id)');
  db.exec("UPDATE admission_charges SET bed_id=(SELECT a.bed_id FROM admissions a WHERE a.id=admission_charges.admission_id) WHERE kind='bed' AND bed_id IS NULL AND id=(SELECT max(id) FROM admission_charges x WHERE x.admission_id=admission_charges.admission_id AND x.kind='bed')");
  db.exec("UPDATE services SET billing_unit='day' WHERE category='bed' AND billing_unit='once'");
  // Standard per-day inpatient charges, offered as tick-boxes at admission. Rates are editable in Tariff.
  const hasServices = db.prepare('SELECT count(*) n FROM services').get().n > 0;
  if (hasServices) {
    const ins = db.prepare(`INSERT INTO services (code, name, category, price, gst_pct, billing_unit, ipd_default, active)
                            SELECT ?, ?, ?, ?, 0, 'day', ?, 1 WHERE NOT EXISTS (SELECT 1 FROM services WHERE code=?)`);
    for (const [code, name, category, price, def] of [
      ['IPC-VIS', 'Consultant visit / day', 'consultation', 500, 1],
      ['IPC-NUR', 'Nursing care / day', 'ipd', 400, 1],
      ['IPC-RMO', 'Duty doctor (RMO) / day', 'ipd', 300, 0],
      ['IPC-MON', 'Cardiac monitor / day', 'ipd', 800, 0],
      ['IPC-O2', 'Oxygen / day', 'ipd', 1200, 0],
      ['IPC-DIET', 'Diet / day', 'ipd', 300, 0],
      ['IPC-VENT', 'Ventilator / day', 'ipd', 4500, 0],
    ]) ins.run(code, name, category, price, def, code);
  }

  // Emergency department charges, offered as one-tap lines on the ER bill. Rates are editable in Tariff.
  if (hasServices) {
    const erIns = db.prepare(`INSERT INTO services (code, name, category, price, gst_pct, billing_unit, ipd_default, active)
                              SELECT ?, ?, 'emergency', ?, 0, 'once', 0, 1 WHERE NOT EXISTS (SELECT 1 FROM services WHERE code=?)`);
    for (const [code, name, price] of [
      ['ER-BASIC', 'Emergency registration & basic charges', 300], ['ER-TRAUMA', 'Trauma care', 1500],
      ['ER-DRESS-S', 'Dressing — small', 150], ['ER-DRESS-L', 'Dressing — large', 350], ['ER-BANDAGE', 'Bandaging', 200],
      ['ER-SUTURE', 'Suturing', 500], ['ER-POP', 'POP slab / splint', 600], ['ER-INJ', 'Injection administration', 50],
      ['ER-IV', 'IV cannulation & fluids', 250], ['ER-NEB', 'Nebulisation', 150], ['ER-O2', 'Oxygen (per hour)', 100],
      ['ER-ECG', 'ECG', 250], ['ER-CATH', 'Catheterisation', 300], ['ER-OBS', 'Observation (per hour)', 200],
      ['ER-RESUS', 'Resuscitation / CPR', 2500], ['ER-MLC', 'Medico-legal (MLC) charges', 500],
    ]) erIns.run(code, name, price, code);
  }

  // insurance_claims holds every payer case, not only insurance: record which kind of payer it is
  add('insurance_claims', 'payer_type', "TEXT NOT NULL DEFAULT 'insurance'");
  add('insurance_claims', 'bill_id', 'INTEGER REFERENCES bills(id)');       // case of a bill that has no visit
  add('bills', 'claim_id', 'INTEGER REFERENCES insurance_claims(id)');       // the payer case this bill sits on
  add('bills', 'claim_status', 'TEXT');                                      // that case's stage, shown on every desk

  /* payer master: TPAs, insurers, corporates, trusts, schemes ---------- */
  db.exec(`CREATE TABLE IF NOT EXISTS payers (
      id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL,
      payer_type TEXT NOT NULL DEFAULT 'insurance',        -- insurance | tpa | aarogyasri | corporate | credit | trust
      contact_person TEXT, phone TEXT, email TEXT, address TEXT, gstin TEXT,
      credit_days INTEGER NOT NULL DEFAULT 30, discount_pct REAL NOT NULL DEFAULT 0,
      empanelled_from TEXT, empanelled_to TEXT, notes TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT)`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_payers_name ON payers(lower(name))');
  add('packages', 'payer_id', 'INTEGER REFERENCES payers(id)');               // NULL = hospital package for everyone
  add('packages', 'payer_code', 'TEXT');                                      // the payer's own package / procedure code
  add('packages', 'los_days', 'INTEGER');                                     // expected stay covered
  add('packages', 'hospital_package_id', 'INTEGER REFERENCES packages(id)');
  add('packages', 'inclusions', 'TEXT');
  add('packages', 'exclusions', 'TEXT');
  add('service_rates', 'payer_id', 'INTEGER REFERENCES payers(id)');         // agreed rate for one payer
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_service_rates_payer ON service_rates(payer_id, service_id) WHERE payer_id IS NOT NULL');
  add('patients', 'payer_id', 'INTEGER REFERENCES payers(id)');
  add('insurance_claims', 'payer_id', 'INTEGER REFERENCES payers(id)');
  add('insurance_claims', 'package_id', 'INTEGER REFERENCES packages(id)');
  db.exec("INSERT INTO settings (key, value) SELECT 'payer_auto_approve', 'corporate,trust' WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='payer_auto_approve')");
  // credit means the patient pays later — not a payer: no case, no auto-approval rule
  db.exec("UPDATE settings SET value=trim(replace(replace(replace(value,'credit,',''),',credit',''),'credit','')) WHERE key='payer_auto_approve' AND value LIKE '%credit%'");
  db.exec("UPDATE bills SET claim_id=NULL, claim_status=NULL WHERE payer_type='credit' AND claim_id IS NOT NULL");
  db.exec("UPDATE insurance_claims SET stage_note='Closed: credit is the patient paying later, not a payer', status='rejected' WHERE payer_type='credit' AND status<>'rejected' AND settled=0 AND NOT EXISTS (SELECT 1 FROM bill_settlements s WHERE s.claim_id=insurance_claims.id AND s.status<>'cancelled')");
  add('bill_items', 'patient_pays', 'INTEGER NOT NULL DEFAULT 0');           // package exclusion / not payable by the payer
  add('attendance', 'note', 'TEXT');                                         // e.g. "Camp at Medchal PHC", "Sick leave"
  add('attendance', 'marked_by', 'INTEGER REFERENCES users(id)');            // set when HR / admin marks the day by hand
  add('attendance', 'marked_at', 'TEXT');
  add('patient_messages', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  add('patient_messages', 'error', 'TEXT');
  add('patient_messages', 'sent_via', 'TEXT');                               // gateway | whatsapp | phone
  add('patient_messages', 'sent_by', 'INTEGER REFERENCES users(id)');
  // existing free-text payer names become payer master rows, and records point at them
  {
    const typeOf = (t) => (t === 'scheme' ? 'aarogyasri' : ['insurance', 'aarogyasri', 'corporate', 'credit', 'trust'].includes(t) ? t : 'insurance');
    const ensure = db.prepare(`INSERT INTO payers (name, payer_type) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM payers WHERE lower(name)=lower(?))`);
    for (const r of db.prepare(`SELECT DISTINCT trim(payer_name) name, payer_type FROM patients WHERE payer_type NOT IN ('self','') AND trim(coalesce(payer_name,''))<>''`).all()) ensure.run(r.name, typeOf(r.payer_type), r.name);
    for (const r of db.prepare(`SELECT DISTINCT trim(tpa) name, payer_type FROM insurance_claims WHERE trim(coalesce(tpa,''))<>''
        AND lower(trim(tpa)) NOT IN ('insurance','aarogyasri','corporate','credit','trust')`).all()) ensure.run(r.name, typeOf(r.payer_type), r.name);
    db.exec(`UPDATE patients SET payer_id=(SELECT id FROM payers WHERE lower(name)=lower(trim(patients.payer_name))) WHERE payer_id IS NULL AND payer_name IS NOT NULL`);
    db.exec(`UPDATE insurance_claims SET payer_id=(SELECT id FROM payers WHERE lower(name)=lower(trim(insurance_claims.tpa))) WHERE payer_id IS NULL`);
  }
  db.exec("UPDATE insurance_claims SET payer_type='aarogyasri' WHERE payer_type='insurance' AND lower(tpa) LIKE '%aarogya%'");

  /* roles, approvals, handovers, emergency stock moves ---------------- */
  add('stock_transfers', 'emergency', 'INTEGER NOT NULL DEFAULT 0');       // issued before in-charge approval
  add('prescriptions', 'status_note', 'TEXT');                              // why a prescription is on hold / cancelled
  add('prescriptions', 'status_by', 'INTEGER REFERENCES users(id)');
  add('prescriptions', 'status_at', 'TEXT');
  add('purchases', 'verified_by', 'INTEGER REFERENCES users(id)');
  add('purchases', 'verified_at', 'TEXT');
  // GRN footer as on the supplier's bill: freight in, credit note adjusted, and the bill's own total to tally
  add('purchases', 'delivery_charge', 'REAL NOT NULL DEFAULT 0');
  add('purchases', 'credit_note', 'REAL NOT NULL DEFAULT 0');
  add('purchases', 'invoice_amount', 'REAL');
  // lab master: sex- and age-specific reference ranges, explicit critical limits, sample container, result type
  for (const [col, def] of [['ref_low_m','REAL'],['ref_high_m','REAL'],['ref_low_f','REAL'],['ref_high_f','REAL'],['ref_low_child','REAL'],['ref_high_child','REAL'],
    ['child_max_age','REAL'],['crit_low','REAL'],['crit_high','REAL'],['result_type',"TEXT NOT NULL DEFAULT 'numeric'"],['options','TEXT']]) add('lab_params', col, def);
  add('services', 'container', 'TEXT');
  add('services', 'report_format', 'TEXT');
  // bed master: where the bed is and who it is for
  for (const [col, def] of [['building','TEXT'],['room','TEXT'],['gender','TEXT']]) add('beds', col, def);
  // maintenance & assets (equipment register and repair tickets)
  db.exec(`CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY, asset_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, asset_type TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id), location TEXT, make_model TEXT, serial_no TEXT,
    purchase_date TEXT, purchase_cost REAL, warranty_until TEXT, amc_until TEXT, vendor TEXT, vendor_contact TEXT,
    last_service TEXT, next_service TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), created_by INTEGER REFERENCES users(id), updated_at TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id INTEGER PRIMARY KEY, ticket_no TEXT UNIQUE NOT NULL, asset_id INTEGER REFERENCES assets(id),
    department_id INTEGER REFERENCES departments(id), location TEXT, title TEXT NOT NULL, description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', raised_by INTEGER REFERENCES users(id),
    raised_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), assigned_to INTEGER REFERENCES users(id),
    resolution TEXT, vendor_reference TEXT, cost REAL, resolved_at TEXT, closed_at TEXT, updated_at TEXT)`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_mt_status ON maintenance_tickets(status)');
  // inpatient charges that belong to a kind of ward (monitor and ventilator in ICU…): on a transfer they stop / start
  if (!columns(db, 'services').includes('ward_kinds')) {
    add('services', 'ward_kinds', 'TEXT');
    db.exec("UPDATE services SET ward_kinds='icu' WHERE code IN ('IPC-MON','IPC-VENT')");
    db.exec("UPDATE services SET ipd_default=1 WHERE code='IPC-MON'");   // every ICU bed is monitored
  }
  add('day_closings', 'declared', 'TEXT');                                  // JSON {cash, upi, card, bank} counted / settled
  add('day_closings', 'summary', 'TEXT');                                   // JSON snapshot of the day at closing
  add('day_closings', 'approval_status', "TEXT NOT NULL DEFAULT 'not_needed'"); // not_needed | pending | approved
  add('day_closings', 'approved_by', 'INTEGER REFERENCES users(id)');
  add('day_closings', 'approved_at', 'TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS purchase_requests (
      id INTEGER PRIMARY KEY, pr_no TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'requested', -- requested | ordered | received | cancelled
      supplier_id INTEGER REFERENCES suppliers(id), notes TEXT, lines TEXT NOT NULL,              -- JSON [{medicine_id, name, qty, unit, rate}]
      requested_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      closed_by INTEGER REFERENCES users(id), closed_at TEXT)`);
  add('stock_transfers', 'ratified_by', 'INTEGER REFERENCES users(id)');   // in-charge approval after the fact
  add('stock_transfers', 'ratified_at', 'TEXT');
  add('bills', 'approval_request', 'TEXT');                                 // e.g. 'free' — waiting for an approver
  add('bills', 'approval_requested_by', 'INTEGER REFERENCES users(id)');
  add('bills', 'approval_requested_at', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT PRIMARY KEY, label TEXT, perms TEXT NOT NULL, custom INTEGER NOT NULL DEFAULT 0,
      updated_by INTEGER REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS cash_handovers (
      id INTEGER PRIMARY KEY,
      handover_no TEXT UNIQUE NOT NULL,
      desk TEXT NOT NULL,                      -- reception | pharmacy
      user_id INTEGER NOT NULL REFERENCES users(id),
      handover_date TEXT NOT NULL,
      expected TEXT NOT NULL,                  -- JSON {mode: amount} from the receipts
      declared TEXT NOT NULL,                  -- JSON {mode: amount} counted / confirmed
      variance REAL NOT NULL DEFAULT 0,
      receipts INTEGER NOT NULL DEFAULT 0,
      handed_to INTEGER REFERENCES users(id),
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'submitted', -- submitted | accepted | disputed
      verified_by INTEGER REFERENCES users(id), verified_at TEXT, verify_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  `);
  // Ward types a hospital needs: add special rooms and an OT / recovery area if the setup lacks them.
  if (db.prepare('SELECT count(*) n FROM wards').get().n > 0) {
    const addWard = (code, name, floor, kind, cls, tariff, count) => {
      if (db.prepare('SELECT 1 FROM wards WHERE kind=?').get(kind)) return;
      const wid = db.prepare('INSERT INTO wards (code, name, floor, kind) VALUES (?,?,?,?)').run(code, name, floor, kind).lastInsertRowid;
      for (let i = 1; i <= count; i++) db.prepare('INSERT INTO beds (ward_id, bed_no, class, tariff, status) VALUES (?,?,?,?,?)')
        .run(wid, `${code}-${String(i).padStart(2, '0')}`, cls, tariff, 'vacant');
    };
    addWard('SPL', 'Special Rooms', '2nd Floor', 'special', 'deluxe', 6000, 2);
    addWard('OTR', 'OT / Recovery', '1st Floor', 'ot', 'recovery', 2000, 2);
  }

  // Admissions made before daily charges existed get their bed charge from the admission time.
  db.exec(`INSERT INTO admission_charges (admission_id, service_id, kind, description, category, unit, rate, started_at, status, bed_id)
    SELECT a.id, (SELECT id FROM services WHERE code = CASE WHEN b.class LIKE '%icu%' THEN 'BED-ICU' WHEN b.class LIKE '%private%' THEN 'BED-PVT' ELSE 'BED-GEN' END),
           'bed', 'Bed ' || b.bed_no, 'bed', 'day', b.tariff, a.admitted_at, 'active', b.id
      FROM admissions a JOIN beds b ON b.id=a.bed_id
     WHERE a.status NOT IN ('discharged','requested')
       AND NOT EXISTS (SELECT 1 FROM admission_charges c WHERE c.admission_id=a.id)`);

  // Older records used 'scheme' for government schemes; the brief names Aarogyasri.
  db.exec("UPDATE patients SET payer_type='aarogyasri' WHERE payer_type='scheme'");
  db.exec("UPDATE bills SET payer_type='aarogyasri' WHERE payer_type='scheme'");
  db.exec("UPDATE payments SET mode='debit_card' WHERE mode='card'");

  /* team chat conversations, structured discharge summary --------------- */
  add('staff_chat', 'thread_id', 'INTEGER REFERENCES chat_threads(id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_staff_chat_thread ON staff_chat(thread_id, id)');
  add('admissions', 'summary_json', 'TEXT');             // the structured discharge summary sections
  add('admissions', 'summary_status', 'TEXT');           // draft | final
  add('admissions', 'summary_by', 'INTEGER REFERENCES users(id)');
  add('admissions', 'summary_at', 'TEXT');

  /* real-world fields found missing in the integration review ---------- */
  add('patients', 'temporary', 'INTEGER NOT NULL DEFAULT 0');   // an unidentified ER arrival, completed or merged once known
  add('patients', 'merged_into', 'INTEGER REFERENCES patients(id)');
  add('beds', 'status_at', 'TEXT');                               // when the bed entered its current state (cleaning since …)
  db.exec(`CREATE TRIGGER IF NOT EXISTS beds_status_at AFTER UPDATE OF status ON beds WHEN OLD.status IS NOT NEW.status
    BEGIN UPDATE beds SET status_at=datetime('now','localtime') WHERE id=NEW.id; END`);
  add('admissions', 'admission_type', "TEXT");                    // emergency | planned | daycare | transfer_in
  add('admissions', 'attendant_name', 'TEXT');
  add('admissions', 'attendant_relation', 'TEXT');
  add('admissions', 'attendant_mobile', 'TEXT');
  add('admissions', 'mlc', 'INTEGER NOT NULL DEFAULT 0');
  add('admissions', 'mlc_no', 'TEXT');
  add('emergency_cases', 'brought_by', 'TEXT');
  add('emergency_cases', 'brought_by_mobile', 'TEXT');
  add('emergency_cases', 'police_station', 'TEXT');
  add('ot_bookings', 'charges', 'TEXT');                          // [{service_id?, description, rate}] billed when the case completes
  add('ot_bookings', 'bill_id', 'INTEGER REFERENCES bills(id)');
  add('ot_bookings', 'billed_at', 'TEXT');
  add('ot_bookings', 'visiting_surgeon_id', 'INTEGER REFERENCES visiting_doctors(id)');
  add('ot_bookings', 'visiting_anaesthetist_id', 'INTEGER REFERENCES visiting_doctors(id)');
  add('bill_items', 'visiting_doctor_id', 'INTEGER REFERENCES visiting_doctors(id)');   // whose work this line is (share on collection)
  add('bill_items', 'visiting_role', 'TEXT');
  add('med_admin', 'prescription_item_id', 'INTEGER REFERENCES prescription_items(id)');
  add('packages', 'cover_categories', 'TEXT');                    // JSON list of covered charge categories; NULL = all-inclusive
  add('packages', 'pharmacy_limit', 'REAL');
  add('cash_handovers', 'retained_cash', 'REAL NOT NULL DEFAULT 0');
  add('services', 'consumables_included', 'INTEGER NOT NULL DEFAULT 0');  // the procedure's price already includes its consumables
  add('bill_items', 'consumption_id', 'INTEGER REFERENCES procedure_consumptions(id)');                      // medicines / consumables covered up to this value
  // attendance reports for roles an administrator has customised (additive: nothing is taken away)
  for (const row of db.prepare("SELECT role, perms FROM role_permissions WHERE role IN ('hr','medical_superintendent','reception_admin','pharmacy_admin','lab_admin','imaging_admin','nursing_incharge','cleaning_incharge')").all()) {
    const perms = JSON.parse(row.perms || '[]');
    if (!perms.includes('reports.attendance') && !perms.includes('*')) db.prepare('UPDATE role_permissions SET perms=? WHERE role=?').run(JSON.stringify([...perms, 'reports.attendance']), row.role);
  }
}
