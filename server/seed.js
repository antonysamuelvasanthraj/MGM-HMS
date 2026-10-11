/**
 * First-run configuration for a local hospital installation.
 * Creates only the administrator login and editable operational masters.
 * No sample staff, patients, suppliers, medicines, stock or transactions.
 */
import { insert, one, tx, get } from './db.js';
import { hashPassword } from './auth.js';
import { ensureChart } from './accounting.js';


export function isSeeded() {
  return one('SELECT count(*) FROM users') > 0;
}

export function ensureHospitalDepartments() {
  for (const [code,name] of [['CARD','Cardiology'],['NEUR','Neurology'],['NSUR','Neurosurgery'],['URO','Urology'],['NEPH','Nephrology'],['GAST','Gastroenterology'],['DERM','Dermatology'],['ENT','ENT'],['OPH','Ophthalmology'],['PUL','Pulmonology'],['ENDO','Endocrinology'],['ONC','Oncology'],['PSY','Psychiatry'],['DENT','Dental'],['ANES','Anaesthesiology'],['PT','Physiotherapy'],['RHEUM','Rheumatology'],['PLAS','Plastic Surgery'],['ICU','Intensive Care'],['OT','Operation Theatre']]) if (!get('SELECT id FROM departments WHERE code=?', code)) insert('departments', {code,name,kind:'clinical'});
  for (const [code,name] of [['HR','Human Resources'],['HK','Housekeeping & Cleaning'],['INS','Insurance & Payer Desk'],['QUAL','Quality']]) if (!get('SELECT id FROM departments WHERE code=?',code)) insert('departments',{code,name,kind:'support'});
  if (!get("SELECT id FROM departments WHERE code='RECP'")) insert('departments', {code:'RECP',name:'Reception & Front Office',kind:'support'});
}

/** New tariff names are added once; hospital prices are never overwritten. */
export function ensureOPDServices() {
  const dept = get("SELECT id FROM departments WHERE code='SURG'")?.id || null;
  for (const [code, name] of [['PRC-POP', 'POP cast application'], ['PRC-BND', 'Bandage / dressing'], ['PRC-SUT', 'Wound suturing'], ['PRC-SRM', 'Suture removal']]) {
    if (!get('SELECT id FROM services WHERE code=?', code)) insert('services', {code, name, category: 'procedure', department_id: dept, price: 0, gst_pct: 0, billing_unit: 'once'});
  }
}

export function seed() {
  if (isSeeded()) return false;
  tx(() => {
    ensureChart();
    sequences();
    settings();
    const dept = departments();
    administrator(dept);
    counters();
    const svc = services(dept);
    labParams(svc);
    wardsBeds();
  });
  return true;
}

/* ------------------------------------------------------------------------- */

function sequences() {
  const seqs = [
    ['uhid', 'SHMS-{P}-', 1, 4, 'year'], ['encounter', 'ENC-{P}-', 1, 5, 'day'], ['bill', 'BL-{P}-', 1, 5, 'day'],
    ['receipt', 'RC-{P}-', 1, 5, 'day'], ['refund', 'RF-{P}-', 1, 4, 'day'], ['order', 'ORD-{P}-', 1, 5, 'day'],
    ['ip', 'IP-{P}-', 1, 4, 'year'], ['appt', 'AP-{P}-', 1, 5, 'day'], ['grn', 'GRN-{P}-', 1, 4, 'year'],
    ['claim', 'CLM-{P}-', 1, 4, 'year'], ['emergency', 'ER-{P}-', 1, 4, 'day'], ['ot', 'OT-{P}-', 1, 4, 'day'],
    ['cert', 'CERT-{P}-', 1, 4, 'year'], ['voucher', 'VCH-{P}-', 1, 5, 'year'], ['incident', 'QI-{P}-', 1, 4, 'year'],
  ];
  for (const [name, prefix, next_val, width, period] of seqs) insert('sequences', { name, prefix, next_val, width, period });
}

function settings() {
  const s = {
    hospital_name: 'MGM Multi-Speciality Hospital',
    hospital_short: 'MGM HMS',
    campus: 'Srikalahasthi · Multi-speciality',
    address: '',
    phone: '',
    gstin: '',
    currency: '₹',
    timezone: 'Asia/Kolkata',
    lan_ip: '',
    cloud_endpoint: '',
    op_auto_bill: '1',
    free_visit_requires_approval: '1',
    gate_doctor_on_payment: '1',
    gate_doctor_on_vitals: '1',
    token_reset: 'daily',
    financial_year: '2026-27',
  };
  for (const [key, value] of Object.entries(s)) insert('settings', { key, value });
}

function departments() {
  const list = [
    ['GEN', 'General Medicine', 'clinical'], ['PED', 'Paediatrics', 'clinical'], ['OBG', 'Obstetrics & Gynaecology', 'clinical'],
    ['SURG', 'General Surgery', 'clinical'], ['ORTHO', 'Orthopaedics', 'clinical'], ['EMER', 'Emergency & Casualty', 'clinical'],
    ['LAB', 'Laboratory', 'diagnostic'], ['RAD', 'Radiology & Imaging', 'diagnostic'],
    ['PHAR', 'Pharmacy', 'support'], ['NURS', 'Nursing', 'support'], ['ADMIN', 'Administration', 'support'], ['ACC', 'Accounts', 'support'],
  ];
  const map = {};
  for (const [code, name, kind] of list) map[code] = insert('departments', { code, name, kind });
  return map;
}

/** The initial password is changed through Admin → Users after installation. */
function administrator(dept) {
  insert('users', {
    staff_code: 'ADM001', username: 'admin', password_hash: hashPassword('surely'),
    name: 'Hospital Administrator', role: 'admin', designation: 'Owner / Administrator',
    department_id: dept.ADMIN,
  });
}

function counters() {
  [['OPC1', 'Reception Counter'], ['PHAR', 'Pharmacy Counter']].forEach(([code, name]) => insert('counters', { code, name }));
}

function services(dept) {
  const rows = [
    ['CON-GEN', 'General Medicine Consultation', 'consultation', dept.GEN, 500],
    ['CON-EMR', 'Emergency Consultation', 'consultation', dept.EMER, 400],
    ['LAB-CBC', 'Complete Blood Count (CBC)', 'lab', dept.LAB, 350, 45, 'EDTA Whole Blood'],
    ['LAB-RBS', 'Random Blood Sugar', 'lab', dept.LAB, 120, 20, 'Fluoride Plasma'],
    ['LAB-FBS', 'Fasting Blood Sugar', 'lab', dept.LAB, 120, 20, 'Fluoride Plasma'],
    ['LAB-LFT', 'Liver Function Test', 'lab', dept.LAB, 850, 120, 'Serum'],
    ['LAB-RFT', 'Renal Function Test', 'lab', dept.LAB, 800, 120, 'Serum'],
    ['LAB-LIP', 'Lipid Profile', 'lab', dept.LAB, 750, 120, 'Serum'],
    ['LAB-URI', 'Urine Routine & Microscopy', 'lab', dept.LAB, 200, 45, 'Urine'],
    ['IMG-XCH', 'X-Ray Chest PA', 'imaging', dept.RAD, 400, 30],
    ['IMG-USA', 'USG Abdomen & Pelvis', 'imaging', dept.RAD, 1200, 45],
    ['IMG-ECG', 'ECG 12 Lead', 'imaging', dept.RAD, 250, 15],
    ['PRC-DRS', 'Dressing (Minor)', 'procedure', dept.SURG, 300],
    ['PRC-NEB', 'Nebulisation', 'procedure', dept.GEN, 200],
    ['PRC-INJ', 'Injection Administration', 'procedure', dept.NURS, 100],
    ['BED-GEN', 'General Ward Bed / Day', 'bed', dept.NURS, 1500],
    ['BED-PVT', 'Private Room / Day', 'bed', dept.NURS, 4500],
    ['BED-ICU', 'ICU Bed / Day', 'bed', dept.NURS, 9500],
    ['OTH-REG', 'Registration / UHID Card', 'other', dept.ADMIN, 50],
    // per-day inpatient charges (ticked at admission, accrued every 24 hours)
    ['IPC-VIS', 'Consultant visit / day', 'consultation', dept.GEN, 500],
    ['IPC-NUR', 'Nursing care / day', 'ipd', dept.NURS, 400],
    ['IPC-RMO', 'Duty doctor (RMO) / day', 'ipd', dept.GEN, 300],
    ['IPC-MON', 'Cardiac monitor / day', 'ipd', dept.NURS, 800],
    ['IPC-O2', 'Oxygen / day', 'ipd', dept.NURS, 1200],
    ['IPC-DIET', 'Diet / day', 'ipd', dept.NURS, 300],
    ['IPC-VENT', 'Ventilator / day', 'ipd', dept.NURS, 4500],
  ];
  const map = {};
  for (const [code, name, category, department_id, price, tat_minutes, sample_type] of rows) {
    const perDay = category === 'bed' || code.startsWith('IPC-');
    map[code] = insert('services', { code, name, category, department_id, price, gst_pct: 0, tat_minutes, sample_type,
      billing_unit: perDay ? 'day' : 'once', ipd_default: ['IPC-VIS', 'IPC-NUR'].includes(code) ? 1 : 0 });
  }
  return map;
}

function labParams(svc) {
  const P = (code, rows) => rows.forEach(([name, unit, lo, hi, ref], i) =>
    insert('lab_params', { service_id: svc[code], name, unit, ref_low: lo, ref_high: hi, ref_text: ref, seq: i }));
  P('LAB-CBC', [
    ['Haemoglobin', 'g/dL', 13, 17, '13.0 - 17.0'], ['Total WBC Count', '/cumm', 4000, 11000, '4,000 - 11,000'],
    ['Platelet Count', '/cumm', 150000, 450000, '1.5 - 4.5 lakh'], ['Neutrophils', '%', 40, 75, '40 - 75'],
    ['Lymphocytes', '%', 20, 45, '20 - 45'],
  ]);
  P('LAB-RBS', [['Random Blood Sugar', 'mg/dL', 70, 140, '70 - 140']]);
  P('LAB-FBS', [['Fasting Blood Sugar', 'mg/dL', 70, 100, '70 - 100']]);
  P('LAB-LFT', [
    ['Total Bilirubin', 'mg/dL', 0.2, 1.2, '0.2 - 1.2'], ['SGOT (AST)', 'U/L', 5, 40, '5 - 40'],
    ['SGPT (ALT)', 'U/L', 5, 41, '5 - 41'], ['Alkaline Phosphatase', 'U/L', 40, 129, '40 - 129'],
  ]);
  P('LAB-RFT', [
    ['Blood Urea', 'mg/dL', 17, 43, '17 - 43'], ['Serum Creatinine', 'mg/dL', 0.7, 1.3, '0.7 - 1.3'],
    ['Sodium', 'mmol/L', 136, 145, '136 - 145'], ['Potassium', 'mmol/L', 3.5, 5.1, '3.5 - 5.1'],
  ]);
  P('LAB-LIP', [
    ['Total Cholesterol', 'mg/dL', 0, 200, '< 200'], ['Triglycerides', 'mg/dL', 0, 150, '< 150'],
    ['HDL Cholesterol', 'mg/dL', 40, 60, '40 - 60'], ['LDL Cholesterol', 'mg/dL', 0, 100, '< 100'],
  ]);
  P('LAB-URI', [
    ['Albumin', '', null, null, 'Nil'], ['Sugar', '', null, null, 'Nil'], ['Pus Cells', '/hpf', 0, 5, '0 - 5'],
  ]);
}

function wardsBeds() {
  const wards = [
    ['GW-A', 'General Ward', 'Ground Floor', 'general', 'general', 1500, 6],
    ['PVT-1', 'Private Rooms', '1st Floor', 'private', 'private', 4500, 2],
    ['ICU-1', 'ICU', '1st Floor', 'icu', 'icu', 9500, 2],
    ['SPL', 'Special Rooms', '2nd Floor', 'special', 'deluxe', 6000, 2],
    ['OTR', 'OT / Recovery', '1st Floor', 'ot', 'recovery', 2000, 2],
  ];
  for (const [code, name, floor, kind, cls, tariff, count] of wards) {
    const wid = insert('wards', { code, name, floor, kind });
    for (let i = 1; i <= count; i++) insert('beds', { ward_id: wid, bed_no: `${code}-${String(i).padStart(2, '0')}`, class: cls, tariff, status: 'vacant' });
  }
}
