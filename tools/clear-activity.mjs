/**
 * Clear patient activity, keep patients and stock:  node tools/clear-activity.mjs --confirm
 *
 * Removes every visit, consultation, vital, lab / imaging test, prescription, bill, receipt, refund,
 * admission, ER / OT / maternity record, payer case, expense and their accounting entries.
 * Keeps patients (and their allergies / documents), templates, medicines, suppliers, GRNs, stock
 * transfers, stores, assets, staff and settings. Pharmacy sales and ward usage are undone: each batch
 * returns to exactly what its GRN and transfers brought in. The books keep only the purchase vouchers.
 *
 * Offline (stop the server first). Takes a backup, works in one transaction, re-creates any protective
 * triggers it had to lift, checks references and integrity, and records itself in the audit trail.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
if (!process.argv.includes('--confirm')) { console.error('Removes all visits, bills and tests (patients and stock are kept). Re-run with --confirm.'); process.exit(1); }
const dataDir = path.resolve(arg('--data', process.env.SURELY_DATA || path.join(root, 'data')));
const port = Number(process.env.PORT || 4300);
const up = await new Promise((res) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
if (dataDir === path.join(root, 'data') && up) { console.error(`Stop the HMS on port ${port} first.`); process.exit(1); }

const ACTIVITY = ['admission_charges', 'admission_forms', 'admissions', 'appointments', 'bill_items', 'bill_settlements', 'bills', 'cash_handovers', 'certificates',
  'collection_requests', 'consultation_amendments', 'consultations', 'counselling_sessions', 'counter_sessions', 'day_closings', 'emergency_cases', 'encounters', 'expenses',
  'insurance_claims', 'lab_results', 'ledger_entries', 'maternity_cases', 'med_admin', 'notifications', 'nursing_notes', 'orders', 'ot_bookings', 'package_assignments',
  'partograph_entries', 'patient_messages', 'payments', 'prescription_items', 'prescriptions', 'problems', 'procedure_consumptions', 'refunds', 'reports', 'sales_returns',
  'settlement_receipts', 'sync_queue', 'vitals', 'ward_indent_lines', 'ward_indents', 'ward_replacement_receipts', 'ward_replacement_supply', 'ward_replacement_usage',
  'ward_replacements', 'visiting_payouts', 'visiting_statements', 'shift_handovers'];
const KEEP_MOVES = ['purchase', 'transfer_in', 'transfer_out', 'purchase_return', 'adjustment', 'opening'];
const KEEP_VOUCHERS = ['purchase', 'purchase_return', 'supplier_payment', 'stock_adjustment', 'opening'];

const file = path.join(dataDir, 'surelyhms.db');
const backupDir = path.join(dataDir, 'backups'); fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(backupDir, `before-clear-activity-${stamp}.db`);
const db = new DatabaseSync(file);
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`backup: ${backup}`);

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
const q = (t) => `"${t}"`;
const count = (t) => db.prepare(`SELECT count(*) n FROM ${q(t)}`).get().n;
const before = Object.fromEntries([...ACTIVITY.filter((t) => tables.has(t)), 'stock_moves', 'journal_vouchers', 'journal_lines', 'patients', 'medicines', 'purchases'].map((t) => [t, count(t)]));
const touched = [...ACTIVITY.filter((t) => tables.has(t)), 'stock_moves', 'journal_vouchers', 'journal_lines', 'medicine_batches', 'beds'];
db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
try {
  const triggers = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL").all().filter((t) => touched.includes(t.tbl_name));
  for (const t of triggers) db.exec(`DROP TRIGGER ${q(t.name)}`);
  for (const t of ACTIVITY) if (tables.has(t)) db.exec(`DELETE FROM ${q(t)}`);
  // stock: keep what came in (GRN) and moved between stores; drop sales, ward usage, patient returns
  db.exec(`DELETE FROM stock_moves WHERE move_type NOT IN (${KEEP_MOVES.map((m) => `'${m}'`).join(',')})`);
  db.exec(`UPDATE medicine_batches SET qty = coalesce((SELECT sum(m.qty) FROM stock_moves m WHERE m.batch_id = medicine_batches.id), 0)`);
  const negative = db.prepare('SELECT count(*) n FROM medicine_batches WHERE qty < 0').get().n;
  if (negative) throw new Error(`${negative} batches would go negative — ledger incomplete; nothing changed`);
  // running balance on each kept move, in order
  const moves = db.prepare('SELECT id, batch_id, qty FROM stock_moves ORDER BY batch_id, id').all();
  const bal = new Map(), setBal = db.prepare('UPDATE stock_moves SET balance_after=? WHERE id=?');
  for (const m of moves) { const b = (bal.get(m.batch_id) || 0) + m.qty; bal.set(m.batch_id, b); setBal.run(b, m.id); }
  // books: purchases (and supplier side) only
  db.exec(`DELETE FROM journal_lines WHERE voucher_id IN (SELECT id FROM journal_vouchers WHERE source NOT IN (${KEEP_VOUCHERS.map((s) => `'${s}'`).join(',')}))`);
  db.exec(`DELETE FROM journal_vouchers WHERE source NOT IN (${KEEP_VOUCHERS.map((s) => `'${s}'`).join(',')})`);
  db.exec("UPDATE beds SET status='vacant', status_at=datetime('now','localtime') WHERE status IN ('occupied','cleaning','reserved')");
  for (const t of triggers) db.exec(t.sql);
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) throw new Error(`would leave ${fk.length} broken references (${[...new Set(fk.map((f) => f.table))].join(', ')}) — nothing changed`);
  const admin = db.prepare("SELECT id FROM users WHERE username='admin'").get();
  db.prepare('INSERT INTO audit_log (user_id,user_name,action,entity,detail,before_json,after_json,reason) VALUES (?,?,?,?,?,?,?,?)').run(
    admin?.id ?? null, 'Hospital Administrator', 'system.clear_activity', 'database', JSON.stringify({ backup }), JSON.stringify(before),
    JSON.stringify({ patients: count('patients'), medicines: count('medicines'), purchases: count('purchases') }),
    'Owner requested removal of all visits, consultations, tests, bills and collections; patients, templates, medicines and GRN stock kept');
  db.exec('COMMIT; PRAGMA foreign_keys=ON;');
} catch (e) { db.exec('ROLLBACK'); db.close(); console.error(`Nothing changed: ${e.message}`); process.exit(1); }
if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') { console.error('Integrity check failed — restore the backup above.'); process.exit(1); }
const dr = db.prepare('SELECT coalesce(sum(debit),0) d, coalesce(sum(credit),0) c FROM journal_lines').get();
console.log(JSON.stringify({ removed: before, kept: { patients: count('patients'), medicines: count('medicines'), purchases: count('purchases'), batches_in_stock: db.prepare('SELECT count(*) n FROM medicine_batches WHERE qty>0').get().n, stock_moves: count('stock_moves') }, books_balanced: Math.abs(dr.d - dr.c) < 0.01 }, null, 2));
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
