/** Test fixtures only. Never imported by the application or its installer. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Validate the target before loading db.js: opening it already applies migrations.
const target = process.env.SURELY_DATA;
const tempRoot = fs.realpathSync(os.tmpdir());
if (process.env.NODE_ENV !== 'test' || !target || !fs.existsSync(target)) {
  throw new Error('Fixture requires NODE_ENV=test and an existing isolated test directory');
}
const dataDir = fs.realpathSync(target);
if (path.dirname(dataDir) !== tempRoot || !path.basename(dataDir).startsWith('surelyhms-test-')) {
  throw new Error('Refusing to seed fixtures outside a surelyhms-test-* temporary directory');
}
const { db, all, insert, one, tx, localStamp } = await import('../../server/db.js');
const { seed } = await import('../../server/seed.js');
const { hashPassword } = await import('../../server/auth.js');
const { postVoucher } = await import('../../server/accounting.js');
const D = (offsetDays = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return localStamp(d).slice(0, 10);
};

try {
  assert.equal(seed(), true, 'test database starts empty');
  assert.deepEqual(all('SELECT username, role FROM users'), [{ username: 'admin', role: 'admin' }]);
  for (const table of ['patients', 'suppliers', 'medicines', 'medicine_batches', 'stock_moves',
    'doctor_schedules', 'templates', 'encounters', 'bills', 'payments', 'journal_vouchers']) {
    assert.equal(one('SELECT count(*) FROM ' + table), 0, 'first-run database has no sample ' + table);
  }
  assert.equal(seed(), false, 'bootstrap is idempotent');
  tx(() => {
    const dept = Object.fromEntries(all('SELECT code, id FROM departments').map(r => [r.code, r.id]));
    const users = staff(dept);
    schedules(users);
    medicines(suppliers());
    patients(users);
    templates(users);
  });
  console.log('Admin-only bootstrap verified; isolated workflow fixtures ready.');
} finally { db.close(); }

/** One login per role. Every password is `surely` until changed in Admin → Users. */
function staff(dept) {
  const pw = hashPassword('surely');
  const rows = [
    ['DOC001', 'doctor', 'Dr. Anand Krishnan', 'doctor', 'Consultant — General Medicine', 'MBBS, MD', dept.GEN, 500, 'TSMC/28931'],
    ['REC001', 'reception', 'Deepa Varghese', 'reception', 'Front Office', '', dept.ADMIN, 0, null],
    ['NUR001', 'nurse', 'Sr. Lakshmi Nair', 'nurse', 'Staff Nurse', 'BSc Nursing', dept.NURS, 0, null],
    ['LAB001', 'lab', 'Suresh Babu', 'lab', 'Lab Technologist', 'DMLT', dept.LAB, 0, null],
    ['PHA001', 'pharmacy', 'Ashok Patel', 'pharmacy', 'Pharmacist', 'B.Pharm', dept.PHAR, 0, null],
  ];
  const map = { admin: one("SELECT id FROM users WHERE username='admin'") };
  for (const [staff_code, username, name, role, designation, qualification, department_id, op_fee, reg_no] of rows) {
    map[username] = insert('users', {
      staff_code, username, password_hash: pw, name, role, designation, qualification, department_id, op_fee,
      followup_fee: op_fee ? Math.round(op_fee * 0.4) : 0, followup_days: 7, reg_no,
    });
  }
  return map;
}

function schedules(u) {
  for (let wd = 1; wd <= 6; wd++) {
    insert('doctor_schedules', { doctor_id: u.doctor, weekday: wd, start_time: '09:30', end_time: '13:30', room: 'OPD-101', slot_minutes: 15, max_tokens: 40 });
  }
}

function suppliers() {
  return {
    main: insert('suppliers', { code: 'SUP001', name: 'Medlife Distributors Pvt Ltd', contact: '', gstin: '', credit_days: 30, state: 'Telangana' }),
  };
}

/**
 * A handful of medicines with opening stock. Opening stock is valued at cost
 * and posted once against Opening Balance Equity — it is not a purchase, so it
 * creates no supplier payable.
 */
function medicines(sup) {
  // [code, name, generic, form, strength, brand, manufacturer, gst, purchaseUnit, dispUnit, packageType, packSize, unitsPerPack, ratePerUnit, mrpPerUnit, reorder, centralQty, opQty]
  const rows = [
    ['MED001', 'Paracetamol 650 mg', 'Paracetamol', 'tablet', '650 mg', 'Dolo 650', 'Micro Labs', 12, 'box', 'tablet', 'strip', 10, 15, 1.2, 2.1, 100, 900, 150],
    ['MED002', 'Amoxicillin 500 mg', 'Amoxicillin', 'capsule', '500 mg', 'Mox 500', 'Sun Pharma', 12, 'box', 'capsule', 'strip', 10, 10, 4.5, 7.8, 60, 400, 60],
    ['MED003', 'Pantoprazole 40 mg', 'Pantoprazole', 'tablet', '40 mg', 'Pan 40', 'Alkem', 12, 'box', 'tablet', 'strip', 10, 15, 3.2, 9.5, 60, 450, 90],
    ['MED004', 'Cetirizine 10 mg', 'Cetirizine', 'tablet', '10 mg', 'Okacet', 'Cipla', 12, 'box', 'tablet', 'strip', 10, 10, 0.9, 1.8, 60, 300, 50],
    ['MED005', 'ORS Sachet', 'Oral rehydration salts', 'powder', '21.8 g', 'Electral', 'FDC', 12, 'box', 'sachet', 'sachet', 1, 25, 14, 22, 30, 100, 25],
    ['MED006', 'Ondansetron 2 mg/ml Inj', 'Ondansetron', 'injection', '2 ml', 'Emeset', 'Cipla', 12, 'box', 'ampoule', 'ampoule', 1, 10, 6.5, 14, 20, 60, 0],
    ['CON001', 'IV Cannula 20G', 'IV cannula', 'consumable', '20G', 'Venflon', 'BD', 12, 'box', 'piece', 'piece', 1, 50, 28, 65, 20, 100, 0],
  ];
  const expiry = D(540);
  let value = 0;
  for (const [code, name, generic, form, strength, brand, manufacturer, gst, pu, du, pt, ps, upp, rate, mrp, reorder, central, op] of rows) {
    const mid = insert('medicines', {
      code, name, generic, form, strength, brand, manufacturer, schedule: form === 'consumable' ? 'OTC' : 'H', hsn: form === 'consumable' ? '9018' : '3004',
      gst_pct: gst, default_cgst_pct: gst / 2, default_sgst_pct: gst / 2, reorder_level: reorder,
      purchase_unit: pu, dispensing_unit: du, package_type: pt, pack_size: ps, units_per_pack: upp,
      kind: form === 'consumable' ? 'consumable' : 'medicine', rack: 'A1',
    });
    for (const [location, qty] of [['Central', central], ['OP', op]]) {
      if (!qty) continue;
      const bid = insert('medicine_batches', {
        medicine_id: mid, batch_no: `OPN-${code}`, expiry, mrp, selling_price: mrp, purchase_rate: rate, qty, location,
        supplier_id: sup.main, rack: 'A1',
      });
      insert('stock_moves', { medicine_id: mid, batch_id: bid, location, move_type: 'opening', qty, balance_after: qty,
        ref_type: 'opening', reason: 'Opening stock' });
      value += qty * rate;
    }
  }
  postVoucher({ type: 'JV', source: 'opening', narration: 'Opening pharmacy stock at cost',
    lines: [{ account: 'inventory_pharmacy', debit: Math.round(value * 100) / 100, segment: 'PHARMACY' },
            { account: 'opening_equity', credit: Math.round(value * 100) / 100 }] });
}

function patients(u) {
  const rows = [
    ['SHMS-2627-0001', 'Mr.', 'Ramesh Kumar', 'Male', 42, '9876500001', 'Hyderabad', 'self', null, null],
    ['SHMS-2627-0002', 'Mrs.', 'Lakshmi Devi', 'Female', 36, '9876500002', 'Hyderabad', 'aarogyasri', 'Aarogyasri Health Care Trust', 'ARG-TS-104233'],
    ['SHMS-2627-0003', 'Mr.', 'Joseph Thomas', 'Male', 58, '9876500003', 'Secunderabad', 'insurance', 'Star Health Insurance', 'SHI/2026/88121'],
  ];
  for (const [uhid, title, name, gender, age, mobile, city, payer_type, payer_name, policy_no] of rows) {
    insert('patients', { uhid, title, name, gender, age_years: age, mobile, city, state: 'Telangana', payer_type, payer_name,
      policy_no, category_since: D(0), created_by: u.reception });
  }
}

function templates(u) {
  const tpl = [
    [u.doctor, 'consultation', 'Fever — First Visit', 'C/O fever x __ days.\nO/E: Temp __ °F, PR __ /min, BP __ mmHg.\nProvisional: Acute febrile illness.\nAdvice: CBC, Urine routine.'],
    [u.doctor, 'prescription', 'URI Standard', 'Tab Paracetamol 650 mg — 1-1-1 x 3 days\nTab Cetirizine 10 mg — 0-0-1 x 5 days\nSteam inhalation BD'],
    [u.admin, 'certificate', 'Fitness Certificate', 'This is to certify that Mr./Ms. ______ , aged __ years, was examined by me on ______ and is found medically fit to resume duties with effect from ______ .'],
  ];
  tpl.forEach(([owner_id, kind, name, body]) => insert('templates', { owner_id, kind, name, body, scope: 'hospital', uses: 0 }));
}
