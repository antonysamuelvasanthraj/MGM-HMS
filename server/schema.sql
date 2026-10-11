-- SurelyHMS schema
-- Design principle from the operating brief: visit stage, payment state, service
-- work state and sync state are SEPARATE fields. "Consultation completed" never
-- implies "reports ready" or "bills paid".

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

---------------------------------------------------------------- org & people

CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id           INTEGER PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'clinical', -- clinical | diagnostic | support
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  staff_code    TEXT UNIQUE NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,            -- see server/auth.js ROLES
  designation   TEXT,
  qualification TEXT,
  department_id INTEGER REFERENCES departments(id),
  reg_no        TEXT,                     -- medical council registration
  op_fee        REAL NOT NULL DEFAULT 0,  -- doctor consultation tariff
  followup_fee  REAL NOT NULL DEFAULT 0,
  followup_days INTEGER NOT NULL DEFAULT 7,
  mobile        TEXT,
  email         TEXT,
  avatar        TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS counters (              -- physical cash desks
  id           INTEGER PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS counter_sessions (      -- shift reconciliation
  id           INTEGER PRIMARY KEY,
  counter_id   INTEGER NOT NULL REFERENCES counters(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  opened_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  closed_at    TEXT,
  opening_cash REAL NOT NULL DEFAULT 0,
  declared_cash REAL,
  counted_cash REAL,
  variance     REAL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open | closed | disputed
  remarks      TEXT
);

---------------------------------------------------------------- patients

CREATE TABLE IF NOT EXISTS patients (
  id           INTEGER PRIMARY KEY,
  uhid         TEXT UNIQUE NOT NULL,
  title        TEXT,
  name         TEXT NOT NULL,
  gender       TEXT NOT NULL,
  dob          TEXT,
  age_years    INTEGER,
  age_months   INTEGER DEFAULT 0,
  mobile       TEXT,
  alt_mobile   TEXT,
  email        TEXT,
  blood_group  TEXT,
  marital      TEXT,
  occupation   TEXT,
  address      TEXT,
  city         TEXT,
  district     TEXT,
  state        TEXT,
  pincode      TEXT,
  aadhaar_last4 TEXT,
  abha         TEXT,
  kin_name     TEXT,
  kin_relation TEXT,
  kin_mobile   TEXT,
  payer_type   TEXT NOT NULL DEFAULT 'self',   -- self | insurance | corporate | scheme
  payer_name   TEXT,
  policy_no    TEXT,
  vip          INTEGER NOT NULL DEFAULT 0,
  photo        TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  created_by   INTEGER REFERENCES users(id),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients(mobile);
CREATE INDEX IF NOT EXISTS idx_patients_name   ON patients(name);

CREATE TABLE IF NOT EXISTS allergies (
  id           INTEGER PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  substance    TEXT NOT NULL,
  reaction     TEXT,
  severity     TEXT NOT NULL DEFAULT 'moderate', -- mild | moderate | severe
  recorded_by  INTEGER REFERENCES users(id),
  recorded_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS problems (
  id           INTEGER PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  code         TEXT,
  label        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',  -- active | resolved | chronic
  onset        TEXT,
  recorded_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

---------------------------------------------------------------- encounters

-- One row per visit. Separate, independent status axes.
CREATE TABLE IF NOT EXISTS encounters (
  id             INTEGER PRIMARY KEY,
  encounter_no   TEXT UNIQUE NOT NULL,
  patient_id     INTEGER NOT NULL REFERENCES patients(id),
  kind           TEXT NOT NULL DEFAULT 'OP',      -- OP | IP | EMG | DAYCARE
  visit_type     TEXT NOT NULL DEFAULT 'new',     -- new | followup | review
  department_id  INTEGER REFERENCES departments(id),
  doctor_id      INTEGER REFERENCES users(id),
  referred_by    TEXT,
  -- stage: the clinical journey
  stage          TEXT NOT NULL DEFAULT 'registered',
                 -- registered | vitals_pending | vitals_done | ready | in_consult
                 -- | consulted | services_pending | closed | cancelled
  -- payment: independent of stage
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | free | partial | waived
  free_reason    TEXT,
  free_approved_by INTEGER REFERENCES users(id),
  token_no       INTEGER,
  token_prefix   TEXT DEFAULT 'A',
  priority       TEXT NOT NULL DEFAULT 'normal',  -- normal | urgent | emergency
  counter_id     INTEGER REFERENCES counters(id),
  opened_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  called_at      TEXT,
  consult_start  TEXT,
  consult_end    TEXT,
  closed_at      TEXT,
  visit_date     TEXT NOT NULL DEFAULT (date('now','localtime')),
  parent_encounter_id INTEGER REFERENCES encounters(id),
  created_by     INTEGER REFERENCES users(id),
  remarks        TEXT
);
CREATE INDEX IF NOT EXISTS idx_enc_date   ON encounters(visit_date);
CREATE INDEX IF NOT EXISTS idx_enc_doctor ON encounters(doctor_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_enc_pat    ON encounters(patient_id);

CREATE TABLE IF NOT EXISTS vitals (
  id           INTEGER PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id   INTEGER NOT NULL REFERENCES patients(id),
  bp_sys       REAL, bp_dia REAL, pulse REAL, temp_f REAL, spo2 REAL,
  resp_rate    REAL, weight_kg REAL, height_cm REAL, bmi REAL,
  grbs         REAL, pain_score INTEGER,
  notes        TEXT,
  recorded_by  INTEGER REFERENCES users(id),
  recorded_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_vitals_enc ON vitals(encounter_id);

CREATE TABLE IF NOT EXISTS consultations (
  id             INTEGER PRIMARY KEY,
  encounter_id   INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id     INTEGER NOT NULL REFERENCES patients(id),
  doctor_id      INTEGER NOT NULL REFERENCES users(id),
  chief_complaint TEXT,
  hopi           TEXT,
  past_history   TEXT,
  examination    TEXT,
  diagnosis      TEXT,
  icd_codes      TEXT,
  plan           TEXT,
  advice         TEXT,
  follow_up_date TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft | signed | amended
  signed_at      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT
);

CREATE TABLE IF NOT EXISTS consultation_amendments (
  id              INTEGER PRIMARY KEY,
  consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  field           TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  reason          TEXT NOT NULL,
  amended_by      INTEGER NOT NULL REFERENCES users(id),
  amended_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS templates (
  id          INTEGER PRIMARY KEY,
  owner_id    INTEGER REFERENCES users(id),
  scope       TEXT NOT NULL DEFAULT 'private',  -- private | department | hospital
  kind        TEXT NOT NULL,                    -- consultation | prescription | usg | certificate
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  uses        INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

---------------------------------------------------------------- services & orders

CREATE TABLE IF NOT EXISTS services (            -- tariff / service fee master
  id            INTEGER PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,   -- consultation | lab | imaging | procedure | bed | package | other
  department_id INTEGER REFERENCES departments(id),
  price         REAL NOT NULL DEFAULT 0,
  gst_pct       REAL NOT NULL DEFAULT 0,
  tat_minutes   INTEGER,
  sample_type   TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS service_rates (       -- payer-specific tariffs
  id          INTEGER PRIMARY KEY,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  payer       TEXT NOT NULL,      -- self | insurance | corporate | scheme name
  price       REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id          INTEGER PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT,
  price       REAL NOT NULL,
  mrp         REAL,
  validity_days INTEGER DEFAULT 30,
  active      INTEGER NOT NULL DEFAULT 1,
  description TEXT
);
CREATE TABLE IF NOT EXISTS package_items (
  id          INTEGER PRIMARY KEY,
  package_id  INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id),
  qty         INTEGER NOT NULL DEFAULT 1
);

-- Clinical orders / requisitions. Work state is independent of bill state.
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY,
  order_no      TEXT UNIQUE NOT NULL,
  encounter_id  INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  service_id    INTEGER REFERENCES services(id),
  category      TEXT NOT NULL,   -- lab | imaging | procedure | pharmacy | admission | referral
  label         TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'routine',  -- routine | urgent | stat
  clinical_note TEXT,
  -- work state
  status        TEXT NOT NULL DEFAULT 'ordered',
                -- ordered | awaiting_payment | scheduled | collected | in_progress
                -- | reported | verified | dispensed | cancelled
  -- billing link
  bill_item_id  INTEGER,
  billed        INTEGER NOT NULL DEFAULT 0,
  ordered_by    INTEGER REFERENCES users(id),
  ordered_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  scheduled_at  TEXT,
  collected_at  TEXT,
  completed_at  TEXT,
  verified_by   INTEGER REFERENCES users(id),
  verified_at   TEXT,
  sample_id     TEXT,
  modality      TEXT,
  room          TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_enc ON orders(encounter_id);
CREATE INDEX IF NOT EXISTS idx_orders_cat ON orders(category, status);

CREATE TABLE IF NOT EXISTS lab_params (
  id          INTEGER PRIMARY KEY,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit        TEXT,
  ref_low     REAL, ref_high REAL, ref_text TEXT,
  seq         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lab_results (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  param_id    INTEGER REFERENCES lab_params(id),
  name        TEXT NOT NULL,
  value       TEXT,
  unit        TEXT,
  ref_range   TEXT,
  flag        TEXT,        -- '' | low | high | critical
  entered_by  INTEGER REFERENCES users(id),
  entered_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS reports (             -- imaging / USG narrative reports
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'imaging',
  technique   TEXT,
  findings    TEXT,
  impression  TEXT,
  advice      TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',   -- draft | provisional | final | amended
  author_id   INTEGER REFERENCES users(id),
  signed_by   INTEGER REFERENCES users(id),
  signed_at   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id           INTEGER PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id   INTEGER NOT NULL REFERENCES patients(id),
  doctor_id    INTEGER REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'active',  -- active | dispensed | partial | cancelled
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS prescription_items (
  id              INTEGER PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id     INTEGER REFERENCES medicines(id),
  drug            TEXT NOT NULL,
  dose            TEXT,
  route           TEXT,
  frequency       TEXT,
  duration_days   INTEGER,
  qty             REAL,
  instructions    TEXT,
  dispensed_qty   REAL NOT NULL DEFAULT 0
);

---------------------------------------------------------------- billing & money

CREATE TABLE IF NOT EXISTS bills (
  id            INTEGER PRIMARY KEY,
  bill_no       TEXT UNIQUE NOT NULL,
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  encounter_id  INTEGER REFERENCES encounters(id),
  bill_type     TEXT NOT NULL DEFAULT 'OP',   -- OP | IP | PHARM | LAB | IMAGING | PKG
  status        TEXT NOT NULL DEFAULT 'unpaid', -- draft|unpaid|partial|paid|cancelled|refunded
  payer_type    TEXT NOT NULL DEFAULT 'self',
  gross         REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  discount_reason TEXT,
  tax           REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  paid          REAL NOT NULL DEFAULT 0,
  balance       REAL NOT NULL DEFAULT 0,
  counter_id    INTEGER REFERENCES counters(id),
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  bill_date     TEXT NOT NULL DEFAULT (date('now','localtime')),
  cancelled_at  TEXT,
  cancel_reason TEXT,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_pat  ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_enc  ON bills(encounter_id);

CREATE TABLE IF NOT EXISTS bill_items (
  id          INTEGER PRIMARY KEY,
  bill_id     INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  service_id  INTEGER REFERENCES services(id),
  order_id    INTEGER REFERENCES orders(id),
  batch_id    INTEGER REFERENCES medicine_batches(id),
  description TEXT NOT NULL,
  category    TEXT,
  qty         REAL NOT NULL DEFAULT 1,
  rate        REAL NOT NULL DEFAULT 0,
  discount    REAL NOT NULL DEFAULT 0,
  gst_pct     REAL NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY,
  receipt_no   TEXT UNIQUE NOT NULL,
  bill_id      INTEGER REFERENCES bills(id),
  patient_id   INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  amount       REAL NOT NULL,
  mode         TEXT NOT NULL,              -- cash | upi | card | netbanking | cheque | insurance
  reference    TEXT,
  counter_id   INTEGER REFERENCES counters(id),
  session_id   INTEGER REFERENCES counter_sessions(id),
  received_by  INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  pay_date     TEXT NOT NULL DEFAULT (date('now','localtime')),
  cancelled    INTEGER NOT NULL DEFAULT 0,
  remarks      TEXT
);
CREATE INDEX IF NOT EXISTS idx_pay_date ON payments(pay_date);

CREATE TABLE IF NOT EXISTS refunds (
  id          INTEGER PRIMARY KEY,
  refund_no   TEXT UNIQUE NOT NULL,
  payment_id  INTEGER REFERENCES payments(id),
  bill_id     INTEGER REFERENCES bills(id),
  patient_id  INTEGER NOT NULL REFERENCES patients(id),
  amount      REAL NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'cash',
  reason      TEXT NOT NULL,
  approved_by INTEGER REFERENCES users(id),
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY,
  voucher_no  TEXT UNIQUE NOT NULL,
  head        TEXT NOT NULL,
  vendor      TEXT,
  amount      REAL NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'cash',
  spent_on    TEXT NOT NULL DEFAULT (date('now','localtime')),
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | paid | rejected
  approved_by INTEGER REFERENCES users(id),
  created_by  INTEGER REFERENCES users(id),
  attachment  TEXT,
  remarks     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id          INTEGER PRIMARY KEY,
  entry_date  TEXT NOT NULL DEFAULT (date('now','localtime')),
  voucher_no  TEXT,
  account     TEXT NOT NULL,
  cost_centre TEXT,
  narration   TEXT,
  debit       REAL NOT NULL DEFAULT 0,
  credit      REAL NOT NULL DEFAULT 0,
  source      TEXT,        -- payment | refund | expense | manual
  source_id   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS insurance_claims (
  id            INTEGER PRIMARY KEY,
  claim_no      TEXT UNIQUE NOT NULL,
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  encounter_id  INTEGER REFERENCES encounters(id),
  admission_id  INTEGER REFERENCES admissions(id),
  tpa           TEXT NOT NULL,
  policy_no     TEXT,
  claim_type    TEXT NOT NULL DEFAULT 'cashless',
  estimate      REAL NOT NULL DEFAULT 0,
  approved      REAL NOT NULL DEFAULT 0,
  settled       REAL NOT NULL DEFAULT 0,
  disallowed    REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'preauth_pending',
                -- preauth_pending|preauth_approved|query|admitted|claim_submitted|settled|rejected
  stage_note    TEXT,
  documents     TEXT,       -- JSON array
  submitted_at  TEXT,
  settled_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT
);

---------------------------------------------------------------- inpatient

CREATE TABLE IF NOT EXISTS wards (
  id          INTEGER PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  floor       TEXT,
  kind        TEXT NOT NULL DEFAULT 'general' -- general|icu|maternity|private|nicu|ot
);

CREATE TABLE IF NOT EXISTS beds (
  id          INTEGER PRIMARY KEY,
  ward_id     INTEGER NOT NULL REFERENCES wards(id),
  bed_no      TEXT NOT NULL,
  class       TEXT NOT NULL DEFAULT 'general', -- general|semi-private|private|deluxe|icu
  tariff      REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'vacant',  -- vacant|occupied|reserved|cleaning|blocked
  UNIQUE(ward_id, bed_no)
);

CREATE TABLE IF NOT EXISTS admissions (
  id            INTEGER PRIMARY KEY,
  ip_no         TEXT UNIQUE NOT NULL,
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  encounter_id  INTEGER REFERENCES encounters(id),
  bed_id        INTEGER REFERENCES beds(id),
  consultant_id INTEGER REFERENCES users(id),
  admitted_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  discharged_at TEXT,
  status        TEXT NOT NULL DEFAULT 'admitted',
                -- requested|admitted|discharge_initiated|clinically_cleared|financially_cleared|discharged
  diagnosis     TEXT,
  financial_category TEXT NOT NULL DEFAULT 'self',
  deposit       REAL NOT NULL DEFAULT 0,
  running_total REAL NOT NULL DEFAULT 0,
  discharge_summary TEXT,
  discharge_type TEXT,
  created_by    INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS nursing_notes (
  id           INTEGER PRIMARY KEY,
  admission_id INTEGER REFERENCES admissions(id) ON DELETE CASCADE,
  encounter_id INTEGER REFERENCES encounters(id),
  patient_id   INTEGER NOT NULL REFERENCES patients(id),
  kind         TEXT NOT NULL DEFAULT 'note',  -- note|medication|intake|output|observation
  body         TEXT,
  value        TEXT,
  shift        TEXT,
  recorded_by  INTEGER REFERENCES users(id),
  recorded_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS med_admin (           -- eMAR
  id           INTEGER PRIMARY KEY,
  admission_id INTEGER NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  drug         TEXT NOT NULL,
  dose         TEXT,
  route        TEXT,
  due_at       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'due',  -- due|given|held|refused|missed
  given_at     TEXT,
  given_by     INTEGER REFERENCES users(id),
  remarks      TEXT
);

CREATE TABLE IF NOT EXISTS ot_bookings (
  id            INTEGER PRIMARY KEY,
  booking_no    TEXT UNIQUE NOT NULL,
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  admission_id  INTEGER REFERENCES admissions(id),
  theatre       TEXT NOT NULL,
  procedure     TEXT NOT NULL,
  surgeon_id    INTEGER REFERENCES users(id),
  anaesthetist_id INTEGER REFERENCES users(id),
  anaesthesia   TEXT,
  scheduled_at  TEXT NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 60,
  status        TEXT NOT NULL DEFAULT 'booked',
                -- booked|pre_op|in_theatre|recovery|completed|cancelled
  consent       INTEGER NOT NULL DEFAULT 0,
  checklist     TEXT,
  notes         TEXT,
  started_at    TEXT,
  ended_at      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS maternity_cases (
  id            INTEGER PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  admission_id  INTEGER REFERENCES admissions(id),
  gravida       INTEGER, para INTEGER, abortions INTEGER, living INTEGER,
  lmp           TEXT, edd TEXT,
  gestation_wks REAL,
  risk          TEXT NOT NULL DEFAULT 'low',   -- low|moderate|high
  stage         TEXT NOT NULL DEFAULT 'antenatal',
                -- antenatal|latent|active_labour|second_stage|delivered|postnatal
  delivery_type TEXT,
  delivered_at  TEXT,
  baby_weight   REAL,
  baby_sex      TEXT,
  apgar1        INTEGER, apgar5 INTEGER,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS partograph_entries (
  id            INTEGER PRIMARY KEY,
  case_id       INTEGER NOT NULL REFERENCES maternity_cases(id) ON DELETE CASCADE,
  recorded_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cervix_cm     REAL, descent INTEGER, contractions_10min INTEGER,
  contraction_strength TEXT,
  fhr           INTEGER, liquor TEXT, moulding TEXT,
  bp_sys REAL, bp_dia REAL, pulse REAL, temp_f REAL,
  oxytocin      TEXT, drugs TEXT, urine TEXT,
  recorded_by   INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS emergency_cases (
  id            INTEGER PRIMARY KEY,
  case_no       TEXT UNIQUE NOT NULL,
  patient_id    INTEGER REFERENCES patients(id),
  encounter_id  INTEGER REFERENCES encounters(id),
  unknown_name  TEXT,
  arrival_mode  TEXT,
  arrived_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  triage        TEXT NOT NULL DEFAULT '3',   -- 1 red | 2 orange | 3 yellow | 4 green | 5 blue
  complaint     TEXT,
  bay           TEXT,
  status        TEXT NOT NULL DEFAULT 'triage',
                -- triage|in_treatment|awaiting_admission|observation|discharged|admitted|referred|lama|death
  mlc           INTEGER NOT NULL DEFAULT 0,
  mlc_no        TEXT,
  attending_id  INTEGER REFERENCES users(id),
  disposition   TEXT,
  closed_at     TEXT
);

---------------------------------------------------------------- pharmacy & stores

CREATE TABLE IF NOT EXISTS medicines (
  id            INTEGER PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  generic       TEXT,
  form          TEXT,        -- tablet|capsule|syrup|injection|ointment
  strength      TEXT,
  manufacturer  TEXT,
  schedule      TEXT,        -- H | H1 | X | OTC
  hsn           TEXT,
  gst_pct       REAL NOT NULL DEFAULT 12,
  rack          TEXT,
  reorder_level REAL NOT NULL DEFAULT 20,
  narcotic      INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_med_name ON medicines(name);

CREATE TABLE IF NOT EXISTS medicine_batches (
  id            INTEGER PRIMARY KEY,
  medicine_id   INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_no      TEXT NOT NULL,
  expiry        TEXT NOT NULL,
  mrp           REAL NOT NULL DEFAULT 0,
  purchase_rate REAL NOT NULL DEFAULT 0,
  qty           REAL NOT NULL DEFAULT 0,
  supplier_id   INTEGER REFERENCES suppliers(id),
  received_at   TEXT NOT NULL DEFAULT (date('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_batch_med ON medicine_batches(medicine_id);
CREATE INDEX IF NOT EXISTS idx_batch_exp ON medicine_batches(expiry);

CREATE TABLE IF NOT EXISTS stock_moves (
  id           INTEGER PRIMARY KEY,
  medicine_id  INTEGER NOT NULL REFERENCES medicines(id),
  batch_id     INTEGER REFERENCES medicine_batches(id),
  move_type    TEXT NOT NULL,  -- purchase|sale|return|adjust|expiry|transfer
  qty          REAL NOT NULL,  -- signed
  balance_after REAL,
  ref_type     TEXT, ref_id INTEGER,
  reason       TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id          INTEGER PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  contact     TEXT, mobile TEXT, email TEXT,
  gstin       TEXT, dl_no TEXT,
  address     TEXT,
  credit_days INTEGER NOT NULL DEFAULT 30,
  outstanding REAL NOT NULL DEFAULT 0,
  rating      REAL NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS purchases (           -- GRN
  id           INTEGER PRIMARY KEY,
  grn_no       TEXT UNIQUE NOT NULL,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  invoice_no   TEXT,
  invoice_date TEXT,
  received_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  gross        REAL NOT NULL DEFAULT 0,
  discount     REAL NOT NULL DEFAULT 0,
  tax          REAL NOT NULL DEFAULT 0,
  total        REAL NOT NULL DEFAULT 0,
  paid         REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'draft',  -- draft|received|verified|paid|returned
  received_by  INTEGER REFERENCES users(id),
  remarks      TEXT
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id          INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  batch_no    TEXT NOT NULL,
  expiry      TEXT NOT NULL,
  qty         REAL NOT NULL,
  free_qty    REAL NOT NULL DEFAULT 0,
  rate        REAL NOT NULL,
  mrp         REAL NOT NULL,
  gst_pct     REAL NOT NULL DEFAULT 12,
  amount      REAL NOT NULL DEFAULT 0
);

---------------------------------------------------------------- scheduling & admin

CREATE TABLE IF NOT EXISTS appointments (
  id           INTEGER PRIMARY KEY,
  appt_no      TEXT UNIQUE NOT NULL,
  patient_id   INTEGER REFERENCES patients(id),
  patient_name TEXT,
  mobile       TEXT,
  doctor_id    INTEGER NOT NULL REFERENCES users(id),
  department_id INTEGER REFERENCES departments(id),
  slot_start   TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 15,
  channel      TEXT NOT NULL DEFAULT 'walkin', -- walkin|phone|online|referral
  visit_type   TEXT NOT NULL DEFAULT 'new',
  status       TEXT NOT NULL DEFAULT 'booked', -- booked|confirmed|arrived|converted|no_show|cancelled
  encounter_id INTEGER REFERENCES encounters(id),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_appt_slot ON appointments(slot_start);

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id          INTEGER PRIMARY KEY,
  doctor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL,   -- 0 Sun .. 6 Sat
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  room        TEXT,
  slot_minutes INTEGER NOT NULL DEFAULT 15,
  max_tokens  INTEGER NOT NULL DEFAULT 40
);

CREATE TABLE IF NOT EXISTS roster (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  duty_date   TEXT NOT NULL,
  shift       TEXT NOT NULL,       -- morning|evening|night|off|leave
  unit        TEXT,
  UNIQUE(user_id, duty_date)
);

CREATE TABLE IF NOT EXISTS attendance (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  duty_date   TEXT NOT NULL,
  in_at       TEXT, out_at TEXT,
  status      TEXT NOT NULL DEFAULT 'present', -- present|absent|leave|half|late
  hours       REAL,
  UNIQUE(user_id, duty_date)
);

CREATE TABLE IF NOT EXISTS certificates (
  id           INTEGER PRIMARY KEY,
  cert_no      TEXT UNIQUE NOT NULL,
  patient_id   INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  kind         TEXT NOT NULL,   -- fitness|sickness|birth|death|medical|insurance
  from_date    TEXT, to_date TEXT,
  body         TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',  -- draft|issued|cancelled
  issued_by    INTEGER REFERENCES users(id),
  issued_at    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY,
  at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  user_id     INTEGER REFERENCES users(id),
  user_name   TEXT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   INTEGER,
  detail      TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS quality_incidents (
  id          INTEGER PRIMARY KEY,
  ref_no      TEXT UNIQUE NOT NULL,
  kind        TEXT NOT NULL,      -- incident|near_miss|complaint|audit_finding
  severity    TEXT NOT NULL DEFAULT 'minor',
  area        TEXT,
  title       TEXT NOT NULL,
  detail      TEXT,
  status      TEXT NOT NULL DEFAULT 'open',  -- open|investigating|capa|closed
  nabh_clause TEXT,
  owner_id    INTEGER REFERENCES users(id),
  reported_by INTEGER REFERENCES users(id),
  reported_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  due_date    TEXT,
  closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY,
  entity      TEXT NOT NULL,
  entity_id   INTEGER,
  op          TEXT NOT NULL,
  payload     TEXT,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued|sending|synced|failed
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  queued_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS staff_chat (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), edited_at TEXT,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS staff_chat_revisions (
 id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES staff_chat(id), body TEXT NOT NULL,
 version INTEGER NOT NULL, edited_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TRIGGER IF NOT EXISTS staff_chat_no_delete BEFORE DELETE ON staff_chat BEGIN SELECT RAISE(ABORT,'Chat records cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS staff_chat_revisions_no_delete BEFORE DELETE ON staff_chat_revisions BEGIN SELECT RAISE(ABORT,'Chat history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS staff_chat_revisions_no_update BEFORE UPDATE ON staff_chat_revisions BEGIN SELECT RAISE(ABORT,'Chat history cannot be changed'); END;
-- The standard consumables of a procedure (pre-fills what staff record as used).
CREATE TABLE IF NOT EXISTS procedure_kits (
 id INTEGER PRIMARY KEY, service_id INTEGER NOT NULL REFERENCES services(id), medicine_id INTEGER NOT NULL REFERENCES medicines(id), qty REAL NOT NULL DEFAULT 1
);
-- Consumables actually used in a procedure: stock issued from the store, charged on the procedure's bill.
CREATE TABLE IF NOT EXISTS procedure_consumptions (
 id INTEGER PRIMARY KEY, consumption_no TEXT UNIQUE NOT NULL, patient_id INTEGER NOT NULL REFERENCES patients(id),
 encounter_id INTEGER REFERENCES encounters(id), bill_id INTEGER REFERENCES bills(id), location TEXT NOT NULL,
 source_type TEXT NOT NULL, source_id INTEGER, bill_item_id INTEGER REFERENCES bill_items(id), ot_booking_id INTEGER REFERENCES ot_bookings(id),
 included INTEGER NOT NULL DEFAULT 0, total_cost REAL NOT NULL DEFAULT 0, total_charged REAL NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'recorded', notes TEXT, recorded_by INTEGER REFERENCES users(id), recorded_at TEXT,
 reversed_by INTEGER REFERENCES users(id), reversed_at TEXT, reverse_reason TEXT
);
-- Counselling: consent → recording (data/counselling, never public) → local transcript → doctor-reviewed summary. See routes/counselling.js.
CREATE TABLE IF NOT EXISTS counselling_sessions (
 id INTEGER PRIMARY KEY, session_no TEXT UNIQUE NOT NULL, patient_id INTEGER NOT NULL REFERENCES patients(id),
 encounter_id INTEGER REFERENCES encounters(id), admission_id INTEGER REFERENCES admissions(id),
 counsellor_id INTEGER REFERENCES users(id), doctor_id INTEGER REFERENCES users(id), topic TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'auto',
 translate INTEGER NOT NULL DEFAULT 0, attendees TEXT,
 consent_given INTEGER NOT NULL DEFAULT 0, consent_by TEXT, consent_relation TEXT, consent_at TEXT, consent_text TEXT,
 status TEXT NOT NULL DEFAULT 'consented',  -- consented | consent_refused | recorded | transcribing | transcribed | summary_draft | reviewed
 auto_transcribe INTEGER NOT NULL DEFAULT 1,
 recording_path TEXT, recording_mime TEXT, recording_size INTEGER, recording_sha256 TEXT, duration_sec INTEGER, recorded_at TEXT, recorded_by INTEGER REFERENCES users(id),
 transcript TEXT, transcript_json TEXT, detected_language TEXT, transcribe_error TEXT, transcribe_started_at TEXT, transcribed_at TEXT,
 summary_json TEXT, summary_by INTEGER REFERENCES users(id), summary_at TEXT,
 reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT, review_note TEXT, amended INTEGER NOT NULL DEFAULT 0, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_counselling_patient ON counselling_sessions(patient_id, id);
-- Patient portal sign-in (separate from staff). PINs and one-time codes are stored only as hashes. See routes/portal.js.
CREATE TABLE IF NOT EXISTS patient_portal (
 id INTEGER PRIMARY KEY, patient_id INTEGER UNIQUE NOT NULL REFERENCES patients(id), pin_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 issued_by INTEGER REFERENCES users(id), issued_at TEXT, failed_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS patient_sessions (
 token TEXT PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), created_at TEXT, expires_at TEXT NOT NULL, ip TEXT, method TEXT
);
CREATE TABLE IF NOT EXISTS portal_otps (
 id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, used_at TEXT, created_at TEXT
);
-- A changed purchase cost / MRP / selling price on a GRN, until the store in-charge acknowledges it. See routes/price-alerts.js.
CREATE TABLE IF NOT EXISTS price_alerts (
 id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id), grn_no TEXT, medicine_id INTEGER REFERENCES medicines(id), medicine TEXT,
 price_type TEXT NOT NULL, previous_grn TEXT, previous_supplier TEXT, previous_cost REAL, new_cost REAL, direction TEXT, percent REAL,
 severity TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open',   -- open | escalated | acknowledged
 escalation_level INTEGER NOT NULL DEFAULT 0, escalated_at TEXT, escalation_note TEXT,
 acknowledged_by INTEGER REFERENCES users(id), acknowledged_at TEXT, action TEXT, ack_note TEXT, created_at TEXT
);
-- General / maintenance stores (non-medicine materials). See routes/stores.js. Quantities in the item's unit.
CREATE TABLE IF NOT EXISTS store_items (
 id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', unit TEXT NOT NULL DEFAULT 'nos',
 reorder_level REAL NOT NULL DEFAULT 0, spec TEXT, location_bin TEXT, avg_cost REAL NOT NULL DEFAULT 0, last_rate REAL,
 active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT
);
CREATE TABLE IF NOT EXISTS store_stock (
 item_id INTEGER NOT NULL REFERENCES store_items(id), store TEXT NOT NULL, qty REAL NOT NULL DEFAULT 0, PRIMARY KEY (item_id, store)
);
CREATE TABLE IF NOT EXISTS store_receipts (
 id INTEGER PRIMARY KEY, receipt_no TEXT UNIQUE NOT NULL, supplier_id INTEGER NOT NULL REFERENCES suppliers(id), store TEXT NOT NULL,
 invoice_no TEXT, invoice_date TEXT, value REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, notes TEXT,
 received_by INTEGER REFERENCES users(id), received_at TEXT
);
CREATE TABLE IF NOT EXISTS store_requests (
 id INTEGER PRIMARY KEY, request_no TEXT UNIQUE NOT NULL, department_id INTEGER NOT NULL REFERENCES departments(id), store TEXT NOT NULL DEFAULT 'MAIN',
 requested_by INTEGER REFERENCES users(id), requested_at TEXT, status TEXT NOT NULL DEFAULT 'pending',  -- pending|partly_issued|issued|rejected|cancelled
 priority TEXT NOT NULL DEFAULT 'normal', purpose TEXT, decided_by INTEGER REFERENCES users(id), decided_at TEXT, decision_note TEXT,
 received_by INTEGER REFERENCES users(id), received_at TEXT, received_note TEXT
);
CREATE TABLE IF NOT EXISTS store_request_lines (
 id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES store_requests(id), item_id INTEGER NOT NULL REFERENCES store_items(id),
 qty REAL NOT NULL, issued_qty REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS store_moves (
 id INTEGER PRIMARY KEY, move_no TEXT UNIQUE NOT NULL, item_id INTEGER NOT NULL REFERENCES store_items(id), store TEXT NOT NULL,
 qty REAL NOT NULL, rate REAL NOT NULL DEFAULT 0, value REAL NOT NULL DEFAULT 0,
 move_type TEXT NOT NULL,  -- receipt|issue|return|transfer_out|transfer_in|adjust
 department_id INTEGER REFERENCES departments(id), request_id INTEGER REFERENCES store_requests(id), receipt_id INTEGER REFERENCES store_receipts(id),
 supplier_id INTEGER REFERENCES suppliers(id), reference TEXT, reason TEXT, issued_to TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_store_moves_item ON store_moves(item_id, id);
-- Visiting (outside) doctors: paid a share of what their attributed work collects. See routes/visiting.js.
CREATE TABLE IF NOT EXISTS visiting_doctors (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, speciality TEXT, qualification TEXT, reg_no TEXT, mobile TEXT, email TEXT, pan TEXT, bank_details TEXT,
 share_type TEXT NOT NULL DEFAULT 'percent', share_value REAL NOT NULL DEFAULT 0, tds_pct REAL NOT NULL DEFAULT 10,
 active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT
);
CREATE TABLE IF NOT EXISTS visiting_doctor_rates (
 id INTEGER PRIMARY KEY, doctor_id INTEGER NOT NULL REFERENCES visiting_doctors(id), service_id INTEGER NOT NULL REFERENCES services(id),
 share_type TEXT NOT NULL DEFAULT 'percent', share_value REAL NOT NULL DEFAULT 0
);
-- A statement accrues the share earned on collections not yet in the books (negative = clawed back after refunds).
CREATE TABLE IF NOT EXISTS visiting_statements (
 id INTEGER PRIMARY KEY, statement_no TEXT UNIQUE NOT NULL, doctor_id INTEGER NOT NULL REFERENCES visiting_doctors(id), as_of TEXT NOT NULL,
 earned_total REAL NOT NULL DEFAULT 0, accrual REAL NOT NULL DEFAULT 0, cases INTEGER NOT NULL DEFAULT 0, notes TEXT,
 created_by INTEGER REFERENCES users(id), created_at TEXT
);
CREATE TABLE IF NOT EXISTS visiting_payouts (
 id INTEGER PRIMARY KEY, payout_no TEXT UNIQUE NOT NULL, doctor_id INTEGER NOT NULL REFERENCES visiting_doctors(id),
 gross REAL NOT NULL, tds REAL NOT NULL DEFAULT 0, net REAL NOT NULL, mode TEXT NOT NULL, reference TEXT, status TEXT NOT NULL DEFAULT 'paid', notes TEXT,
 paid_by INTEGER REFERENCES users(id), paid_at TEXT
);
-- A package bought for a visit or an admission (self-pay). Usage is classified by server/packages.js.
CREATE TABLE IF NOT EXISTS package_assignments (
 id INTEGER PRIMARY KEY, assignment_no TEXT UNIQUE NOT NULL,
 package_id INTEGER NOT NULL REFERENCES packages(id), patient_id INTEGER NOT NULL REFERENCES patients(id),
 encounter_id INTEGER REFERENCES encounters(id), admission_id INTEGER REFERENCES admissions(id),
 claim_id INTEGER REFERENCES insurance_claims(id), bill_id INTEGER REFERENCES bills(id),
 price REAL NOT NULL, status TEXT NOT NULL DEFAULT 'active',      -- active | closed | cancelled
 assigned_by INTEGER REFERENCES users(id), assigned_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
 closed_at TEXT, cancel_reason TEXT, notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_pkga_enc ON package_assignments(encounter_id);
CREATE INDEX IF NOT EXISTS idx_pkga_adm ON package_assignments(admission_id);
-- Team chat conversations besides the hospital-wide channel (staff_chat.thread_id NULL = All staff)
CREATE TABLE IF NOT EXISTS chat_threads (
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL,            -- group | direct
 name TEXT, direct_key TEXT UNIQUE,                     -- direct: "<lower user id>-<higher user id>"
 created_by INTEGER REFERENCES users(id), archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS chat_members (
 thread_id INTEGER NOT NULL REFERENCES chat_threads(id), user_id INTEGER NOT NULL REFERENCES users(id),
 is_admin INTEGER NOT NULL DEFAULT 0, added_by INTEGER REFERENCES users(id),
 added_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (thread_id, user_id)
);
CREATE TABLE IF NOT EXISTS chat_reads (                 -- thread_key: 'all' or the thread id
 user_id INTEGER NOT NULL REFERENCES users(id), thread_key TEXT NOT NULL, last_read_id INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (user_id, thread_key)
);
CREATE TABLE IF NOT EXISTS staff_tasks (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, assigned_to INTEGER NOT NULL REFERENCES users(id),
 assigned_by INTEGER NOT NULL REFERENCES users(id), due_at TEXT, status TEXT NOT NULL DEFAULT 'open',
 progress_note TEXT, reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  role        TEXT,
  level       TEXT NOT NULL DEFAULT 'info',
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sequences (
  name        TEXT PRIMARY KEY,
  prefix      TEXT NOT NULL,
  next_val    INTEGER NOT NULL DEFAULT 1,
  width       INTEGER NOT NULL DEFAULT 5,
  period      TEXT                       -- NULL | 'day' | 'year' : resets
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter_id  INTEGER REFERENCES counters(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  agent       TEXT,
  ip          TEXT
);

---------------------------------------------------------------- double-entry accounts
-- Every financial event posts a balanced voucher. Nothing writes a one-sided row.

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,            -- asset | liability | equity | income | expense
  subtype     TEXT,                     -- cash | bank | clearing | receivable | payable | inventory | tax_input | tax_output | revenue | contra_revenue | cogs | expense | fixed_asset | accrual | advance | equity
  parent_code TEXT,
  system_key  TEXT UNIQUE,              -- stable handle used by the posting engine
  is_group    INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS journal_vouchers (
  id            INTEGER PRIMARY KEY,
  voucher_no    TEXT UNIQUE NOT NULL,
  voucher_type  TEXT NOT NULL,          -- SV sales | RV receipt | PV payment | JV journal | PUR purchase | STL settlement | COGS | EXP expense | STK stock
  voucher_date  TEXT NOT NULL,
  narration     TEXT,
  source        TEXT,                   -- bill | payment | settlement | settlement_receipt | purchase | supplier_payment | expense | stock | dispense | manual
  source_id     INTEGER,
  total         REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'posted',   -- posted | reversed
  reversal_of   INTEGER REFERENCES journal_vouchers(id),
  reversed_by   INTEGER REFERENCES journal_vouchers(id),
  reason        TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_jv_date   ON journal_vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_jv_source ON journal_vouchers(source, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id          INTEGER PRIMARY KEY,
  voucher_id  INTEGER NOT NULL REFERENCES journal_vouchers(id) ON DELETE CASCADE,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  debit       REAL NOT NULL DEFAULT 0,
  credit      REAL NOT NULL DEFAULT 0,
  party_type  TEXT,                     -- patient | supplier | payer | staff
  party_id    INTEGER,
  segment     TEXT,                     -- OP | IP | ER | LAB | IMAGING | PHARMACY | PROCEDURE | OT | ICU | PACKAGE | OTHER
  category    TEXT,                     -- patient financial category of the bill, where relevant
  memo        TEXT
);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jl_voucher ON journal_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_jl_party   ON journal_lines(party_type, party_id);

CREATE TABLE IF NOT EXISTS day_closings (
  id            INTEGER PRIMARY KEY,
  close_date    TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'closed',   -- closed | reopened
  cash_expected REAL NOT NULL DEFAULT 0,
  cash_counted  REAL,
  variance      REAL,
  receipts      REAL NOT NULL DEFAULT 0,
  by_mode       TEXT,                             -- JSON {mode: amount}
  notes         TEXT,
  closed_by     INTEGER REFERENCES users(id),
  closed_at     TEXT,
  reopened_by   INTEGER REFERENCES users(id),
  reopened_at   TEXT,
  reopen_reason TEXT
);

---------------------------------------------------------------- non-cash settlement of bills
-- Money received lives in payments. Everything else that clears a patient
-- balance (a payer taking it over, an approved free treatment, an approved due)
-- is a settlement, so cash income is never mixed with receivables.

CREATE TABLE IF NOT EXISTS bill_settlements (
  id                     INTEGER PRIMARY KEY,
  settlement_no          TEXT UNIQUE NOT NULL,
  bill_id                INTEGER NOT NULL REFERENCES bills(id),
  patient_id             INTEGER NOT NULL REFERENCES patients(id),
  mode                   TEXT NOT NULL,   -- insurance | aarogyasri | corporate | credit | trust | free | due
  amount                 REAL NOT NULL,
  payer_name             TEXT,
  reference              TEXT,
  claim_id               INTEGER REFERENCES insurance_claims(id),
  status                 TEXT NOT NULL DEFAULT 'open',  -- open | partially_settled | settled | written_off | cancelled
  settled_amount         REAL NOT NULL DEFAULT 0,
  written_off            REAL NOT NULL DEFAULT 0,
  transferred_to_patient REAL NOT NULL DEFAULT 0,
  reason                 TEXT,
  collection_group       TEXT,
  created_by             INTEGER REFERENCES users(id),
  approved_by            INTEGER REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  closed_at              TEXT,
  cancelled_by           INTEGER REFERENCES users(id),
  cancelled_at           TEXT,
  cancel_reason          TEXT
);
CREATE INDEX IF NOT EXISTS idx_settle_bill ON bill_settlements(bill_id);
CREATE INDEX IF NOT EXISTS idx_settle_mode ON bill_settlements(mode, status);

CREATE TABLE IF NOT EXISTS settlement_receipts (
  id                  INTEGER PRIMARY KEY,
  receipt_no          TEXT UNIQUE NOT NULL,
  settlement_id       INTEGER NOT NULL REFERENCES bill_settlements(id),
  amount              REAL NOT NULL DEFAULT 0,
  disallowed          REAL NOT NULL DEFAULT 0,
  disallowance_action TEXT,                  -- write_off | transfer_to_patient
  mode                TEXT NOT NULL,         -- bank_transfer | cheque | cash | upi
  reference           TEXT,
  notes               TEXT,
  received_by         INTEGER REFERENCES users(id),
  received_on         TEXT NOT NULL DEFAULT (date('now','localtime')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

---------------------------------------------------------------- payables and returns

CREATE TABLE IF NOT EXISTS supplier_payments (
  id           INTEGER PRIMARY KEY,
  payment_no   TEXT UNIQUE NOT NULL,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_id  INTEGER REFERENCES purchases(id),
  amount       REAL NOT NULL,
  mode         TEXT NOT NULL,              -- cash | bank_transfer | cheque | upi
  reference    TEXT,
  paid_on      TEXT NOT NULL DEFAULT (date('now','localtime')),
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id           INTEGER PRIMARY KEY,
  return_no    TEXT UNIQUE NOT NULL,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_id  INTEGER REFERENCES purchases(id),
  batch_id     INTEGER NOT NULL REFERENCES medicine_batches(id),
  qty          REAL NOT NULL,              -- dispensing units
  value        REAL NOT NULL DEFAULT 0,    -- cost value excluding tax
  cgst         REAL NOT NULL DEFAULT 0,
  sgst         REAL NOT NULL DEFAULT 0,
  igst         REAL NOT NULL DEFAULT 0,
  reason       TEXT NOT NULL,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id           INTEGER PRIMARY KEY,
  return_no    TEXT UNIQUE NOT NULL,
  bill_id      INTEGER NOT NULL REFERENCES bills(id),
  bill_item_id INTEGER NOT NULL REFERENCES bill_items(id),
  batch_id     INTEGER REFERENCES medicine_batches(id),
  qty          REAL NOT NULL,
  amount       REAL NOT NULL,
  refund_mode  TEXT,
  reason       TEXT NOT NULL,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

---------------------------------------------------------------- pharmacy movement

CREATE TABLE IF NOT EXISTS stock_transfers (
  id            INTEGER PRIMARY KEY,
  transfer_no   TEXT UNIQUE NOT NULL,
  source        TEXT NOT NULL,          -- Central | OP | IP | ICU | ER | OT | Ward
  destination   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'requested',
                -- requested | approved | issued | partially_received | received | rejected | cancelled
  requested_by  INTEGER REFERENCES users(id),
  approved_by   INTEGER REFERENCES users(id),
  issued_by     INTEGER REFERENCES users(id),
  received_by   INTEGER REFERENCES users(id),
  closed_by     INTEGER REFERENCES users(id),
  requested_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  approved_at   TEXT,
  issued_at     TEXT,
  received_at   TEXT,
  closed_at     TEXT,
  reason        TEXT,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id             INTEGER PRIMARY KEY,
  transfer_id    INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  medicine_id    INTEGER NOT NULL REFERENCES medicines(id),
  qty_requested  REAL NOT NULL,
  qty_approved   REAL,
  qty_issued     REAL NOT NULL DEFAULT 0,
  qty_received   REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_transfer_issues (
  id              INTEGER PRIMARY KEY,
  line_id         INTEGER NOT NULL REFERENCES stock_transfer_lines(id) ON DELETE CASCADE,
  source_batch_id INTEGER NOT NULL REFERENCES medicine_batches(id),
  dest_batch_id   INTEGER REFERENCES medicine_batches(id),
  qty             REAL NOT NULL,
  qty_received    REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ward_indents (
  id            INTEGER PRIMARY KEY,
  indent_no     TEXT UNIQUE NOT NULL,
  admission_id  INTEGER NOT NULL REFERENCES admissions(id),
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  location      TEXT NOT NULL DEFAULT 'IP',       -- which pharmacy stock serves it
  kind          TEXT NOT NULL DEFAULT 'medicine', -- medicine | consumable
  status        TEXT NOT NULL DEFAULT 'requested',-- requested | partially_dispensed | dispensed | cancelled
  requested_by  INTEGER REFERENCES users(id),
  dispensed_by  INTEGER REFERENCES users(id),
  notes         TEXT,
  requested_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  dispensed_at  TEXT
);
CREATE TABLE IF NOT EXISTS ward_indent_lines (
  id            INTEGER PRIMARY KEY,
  indent_id     INTEGER NOT NULL REFERENCES ward_indents(id) ON DELETE CASCADE,
  medicine_id   INTEGER NOT NULL REFERENCES medicines(id),
  qty           REAL NOT NULL,
  dispensed_qty REAL NOT NULL DEFAULT 0,
  instructions  TEXT
);

CREATE TABLE IF NOT EXISTS ward_replacements (
 id INTEGER PRIMARY KEY, replacement_no TEXT UNIQUE NOT NULL,
 patient_id INTEGER NOT NULL REFERENCES patients(id), encounter_id INTEGER REFERENCES encounters(id),
 admission_id INTEGER REFERENCES admissions(id), location TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'awaiting_replacement', notes TEXT,
 recorded_by INTEGER REFERENCES users(id), recorded_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS ward_replacement_usage (
 id INTEGER PRIMARY KEY, replacement_id INTEGER NOT NULL REFERENCES ward_replacements(id),
 batch_id INTEGER NOT NULL REFERENCES medicine_batches(id), qty REAL NOT NULL CHECK(qty>0)
);
CREATE TABLE IF NOT EXISTS ward_replacement_supply (
 id INTEGER PRIMARY KEY, replacement_id INTEGER NOT NULL REFERENCES ward_replacements(id),
 bill_item_id INTEGER UNIQUE NOT NULL REFERENCES bill_items(id), qty REAL NOT NULL CHECK(qty>0),
 received_qty REAL NOT NULL DEFAULT 0 CHECK(received_qty>=0 AND received_qty<=qty),
 received_by INTEGER REFERENCES users(id), received_at TEXT
);
CREATE TABLE IF NOT EXISTS ward_replacement_receipts (
 id INTEGER PRIMARY KEY, replacement_id INTEGER NOT NULL REFERENCES ward_replacements(id),
 created_by INTEGER REFERENCES users(id), detail TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

---------------------------------------------------------------- patient messaging
-- Results and bills queue a message for the patient. No SMS or WhatsApp
-- gateway is configured in this build, so messages stay queued until one is.

CREATE TABLE IF NOT EXISTS patient_messages (
  id          INTEGER PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id),
  channel     TEXT NOT NULL DEFAULT 'sms',
  mobile      TEXT,
  body        TEXT NOT NULL,
  ref_type    TEXT,
  ref_id      INTEGER,
  status      TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | failed
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  sent_at     TEXT
);

CREATE TABLE IF NOT EXISTS shift_handovers (
 id INTEGER PRIMARY KEY, desk TEXT NOT NULL, shift_date TEXT NOT NULL,
 from_user INTEGER NOT NULL REFERENCES users(id), to_user INTEGER NOT NULL REFERENCES users(id),
 from_shift TEXT NOT NULL, to_shift TEXT NOT NULL, cash_count REAL NOT NULL DEFAULT 0,
 notes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted',
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS admission_forms (
 id INTEGER PRIMARY KEY, admission_id INTEGER NOT NULL REFERENCES admissions(id),
 form_type TEXT NOT NULL CHECK(form_type IN ('estimate','consent','feedback')),
 details_json TEXT NOT NULL, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
