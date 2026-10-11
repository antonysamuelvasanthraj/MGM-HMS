import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preMigrate, migrate } from './migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SURELY_DATA || path.join(__dirname, '..', 'data');
if (process.env.HMS_REQUIRE_EXISTING_DB === '1' && !fs.existsSync(path.join(DATA_DIR, 'surelyhms.db'))) {
  throw new Error('Configured hospital database is missing. Refusing to create an empty replacement. Check the data drive and server configuration.');
}
fs.mkdirSync(DATA_DIR, { recursive: true });

export { DATA_DIR };
export const DB_FILE = path.join(DATA_DIR, 'surelyhms.db');
export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA busy_timeout = 5000');

db.exec('PRAGMA foreign_keys = ON');
preMigrate(db);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
migrate(db);

/* ------------------------------------------------------------------ helpers */

const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}

const clean = (r) => (r ? { ...r } : r);          // strip null-prototype

export const all = (sql, ...p) => stmt(sql).all(...p).map(clean);
export const get = (sql, ...p) => clean(stmt(sql).get(...p));
export const run = (sql, ...p) => stmt(sql).run(...p);
export const one = (sql, ...p) => { const r = get(sql, ...p); return r ? Object.values(r)[0] : null; };

/** Insert an object as a row; returns the new id. */
export function insert(table, obj) {
  if (table === 'bills' && obj.bill_no) {
    const series = { self: 'SELF', insurance: 'TPA', aarogyasri: 'AAR', corporate: 'COR', trust: 'TRUST', credit: 'CREDIT', due: 'DUE', free: 'FREE' };
    const kind = series[obj.payer_type || 'self'] || 'SELF';
    obj = { ...obj, bill_no: `${nextNo(`bill_${kind}`)}-${kind}` };
  }
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  const r = stmt(sql).run(...keys.map((k) => norm(obj[k])));
  return Number(r.lastInsertRowid);
}

/** Update a row by id with the supplied fields. */
export function update(table, id, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`;
  return stmt(sql).run(...keys.map((k) => norm(obj[k])), id).changes;
}

function norm(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Run fn inside a transaction. */
export function tx(fn) {
  const savepoint = `tx_${++transactionNumber}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  try { const r = fn(); db.exec(`RELEASE ${savepoint}`); return r; }
  catch (e) { db.exec(`ROLLBACK TO ${savepoint}`); db.exec(`RELEASE ${savepoint}`); throw e; }
}
let transactionNumber = 0;

/* ---------------------------------------------------------------- sequences */

/**
 * Human-readable document numbers (UHID, bill no, receipt no, ...).
 * `period` = 'day' | 'year' resets the counter, matching how Indian hospitals
 * number receipts per financial period.
 */
const DEFAULT_SEQUENCES = {
  settlement: ['STL-{P}-', 5, 'year'], settlement_receipt: ['SRC-{P}-', 5, 'year'],
  supplier_payment: ['SPY-{P}-', 5, 'year'], transfer: ['TRF-{P}-', 5, 'year'],
  indent: ['IND-{P}-', 5, 'year'], sales_return: ['SRN-{P}-', 5, 'year'],
  purchase_return: ['PRN-{P}-', 5, 'year'], handover: ['HO-{P}-', 5, 'year'], purchase_request: ['PR-{P}-', 5, 'year'],
  counselling: ['CNS-{P}-', 5, 'year'], store_move: ['SMV-{P}-', 6, 'year'], store_receipt: ['SRV-{P}-', 5, 'year'], store_request: ['SMR-{P}-', 5, 'year'], store_transfer: ['STF-{P}-', 5, 'year'],
};

export function nextNo(name) {
  let seq = get('SELECT * FROM sequences WHERE name=?', name);
  if (!seq) {
    // Voucher series are named vch_<TYPE>; other new document types have defaults.
    const def = name.startsWith('vch_') ? [`${name.slice(4)}-{P}-`, 5, 'year'] : name.startsWith('bill_') ? ['BL-{P}-', 5, 'day'] : DEFAULT_SEQUENCES[name];
    if (!def) throw new Error(`unknown sequence ${name}`);
    run('INSERT INTO sequences (name, prefix, next_val, width, period) VALUES (?,?,1,?,?)', name, def[0], def[1], def[2]);
    seq = get('SELECT * FROM sequences WHERE name=?', name);
  }
  const now = new Date();
  let scope = '';
  if (seq.period === 'day') scope = fmt(now, 'yyMMdd');
  if (seq.period === 'year') scope = finYear(now);
  const prefix = seq.prefix.replace('{P}', scope);
  // Imported/demo records may precede the sequence counter. Skip occupied
  // numbers so new emergency, theatre and finance records can still be saved.
  const documents = {
    uhid: [['patients', 'uhid']], encounter: [['encounters', 'encounter_no']],
    bill: [['bills', 'bill_no']], receipt: [['payments', 'receipt_no']],
    refund: [['refunds', 'refund_no']], order: [['orders', 'order_no']],
    ip: [['admissions', 'ip_no']], appt: [['appointments', 'appt_no']],
    grn: [['purchases', 'grn_no']], claim: [['insurance_claims', 'claim_no']],
    emergency: [['emergency_cases', 'case_no']], ot: [['ot_bookings', 'booking_no']],
    cert: [['certificates', 'cert_no']], voucher: [['expenses', 'voucher_no'], ['ledger_entries', 'voucher_no']],
    incident: [['quality_incidents', 'ref_no']],
    settlement: [['bill_settlements', 'settlement_no']], settlement_receipt: [['settlement_receipts', 'receipt_no']],
    supplier_payment: [['supplier_payments', 'payment_no']], transfer: [['stock_transfers', 'transfer_no']],
    indent: [['ward_indents', 'indent_no']], sales_return: [['sales_returns', 'return_no']],
    purchase_return: [['purchase_returns', 'return_no']], handover: [['cash_handovers', 'handover_no']], purchase_request: [['purchase_requests', 'pr_no']],
    counselling: [['counselling_sessions', 'session_no']], store_move: [['store_moves', 'move_no']], store_receipt: [['store_receipts', 'receipt_no']], store_request: [['store_requests', 'request_no']],
  };
  if (name.startsWith('vch_')) documents[name] = [['journal_vouchers', 'voucher_no']];
  if (name.startsWith('bill_')) documents[name] = [['bills', 'bill_no']];
  let next = seq.next_val;
  let number;
  do { number = prefix + String(next++).padStart(seq.width, '0'); }
  while ((documents[name] || []).some(([table, column]) => name.startsWith('bill_')
    ? get('SELECT 1 FROM bills WHERE bill_no=? LIMIT 1', `${number}-${name.slice(5)}`)
    : name === 'bill'
    ? get(`SELECT 1 FROM bills WHERE bill_no=? OR bill_no LIKE ? LIMIT 1`, number, `${number}-%`)
    : get(`SELECT 1 FROM ${table} WHERE ${column}=? LIMIT 1`, number)));
  run('UPDATE sequences SET next_val=? WHERE name=?', next, name);
  return number;
}

function fmt(d, f) {
  const p = (x, n = 2) => String(x).padStart(n, '0');
  return f.replace('yy', String(d.getFullYear()).slice(2))
          .replace('MM', p(d.getMonth() + 1))
          .replace('dd', p(d.getDate()));
}
function finYear(d) {
  const y = d.getFullYear(), m = d.getMonth();
  const s = m >= 3 ? y : y - 1;
  return `${String(s).slice(2)}${String(s + 1).slice(2)}`;
}

/** Local wall-clock stamp: the hospital runs on its own clock, not UTC. */
const p2 = (n) => String(n).padStart(2, '0');
export const localStamp = (d = new Date()) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
  `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
export const today = () => localStamp().slice(0, 10);
export const nowIso = () => localStamp();
