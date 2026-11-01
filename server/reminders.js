/**
 * Daily reminder texts (Settings → Reminder texts). Once a day, at the chosen hour:
 *   - every patient with an appointment tomorrow (booked / confirmed) gets a reminder;
 *   - every patient with an open self-pay / credit balance gets a due reminder, at most once a week.
 * Messages are queued in patient_messages and go out through the SMS / WhatsApp gateway
 * (sendQueued); without a gateway they wait on the Patient Messages screen as usual.
 */
import { all, get, run, today } from './db.js';
import { queueMessage, sendQueued } from './messages.js';

const setting = (k, d = '') => get('SELECT value FROM settings WHERE key=?', k)?.value ?? d;
const saveSetting = (k, v) => run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v));
const fmtTime = (stamp) => { const d = new Date(String(stamp).replace(' ', 'T')); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`; };

/** Run the day's reminders if they are due. Returns what was queued (or null when not due). */
export function runDailyReminders({ force = false } = {}) {
  if (setting('reminders_enabled') !== '1' && !force) return null;
  const day = today();
  if (!force && (setting('reminders_last_run') === day || new Date().getHours() < (+setting('reminder_hour', '18') || 18))) return null;
  saveSetting('reminders_last_run', day);              // claim the day first, so a slow run is never repeated
  const hosp = setting('hospital_name', 'the hospital');
  const phone = setting('phone');
  let appts = 0, dues = 0;

  for (const a of all(`SELECT a.id, a.patient_id, a.slot_start, coalesce(p.name, a.patient_name) name, u.name doctor
      FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.doctor_id
      WHERE date(a.slot_start)=date(?, '+1 day') AND a.status IN ('booked','confirmed')
        AND NOT EXISTS (SELECT 1 FROM patient_messages m WHERE m.ref_type='appt_reminder' AND m.ref_id=a.id)`, day)) {
    const body = `Dear ${a.name}, a reminder of your appointment${a.doctor ? ` with ${a.doctor}` : ''} tomorrow at ${fmtTime(a.slot_start)}, ${hosp}.${phone ? ` To change it, call ${phone}.` : ''}`;
    if (queueMessage({ patient_id: a.patient_id, body, ref_type: 'appt_reminder', ref_id: a.id })) appts++;
  }

  for (const d of all(`SELECT p.id patient_id, p.name, round(sum(b.balance),2) due, count(*) bills
      FROM bills b JOIN patients p ON p.id=b.patient_id
      WHERE b.status IN ('unpaid','partial') AND b.balance > 0.5 AND coalesce(b.payer_type,'self') IN ('self','credit')
        AND coalesce(p.mobile,'')<>'' AND NOT EXISTS (SELECT 1 FROM admissions ad WHERE ad.patient_id=p.id AND ad.status<>'discharged')
        AND NOT EXISTS (SELECT 1 FROM patient_messages m WHERE m.patient_id=p.id AND m.ref_type IN ('bill_due','due_reminder') AND m.created_at >= datetime('now','localtime','-7 days'))
      GROUP BY p.id`)) {
    const body = `Dear ${d.name}, an amount of Rs ${Number(d.due).toFixed(2)} is due at ${hosp}${d.bills > 1 ? ` on ${d.bills} bills` : ''}. Please pay at the reception counter${phone ? ` or call ${phone}` : ''}. Thank you.`;
    if (queueMessage({ patient_id: d.patient_id, body, ref_type: 'due_reminder', ref_id: null })) dues++;
  }
  sendQueued().catch(() => {});
  return { day, appointments: appts, dues };
}
