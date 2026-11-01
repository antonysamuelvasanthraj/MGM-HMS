/**
 * Hospital operating mode — Paper, Paperless or Hybrid — set once for the whole hospital by the
 * Hospital Admin (permission `hospital_mode.manage`). The mode drives the department switches the
 * screens already read (workflow_doctor / workflow_pharmacy / workflow_lab), so there is one source
 * of truth and no department keeps a setting of its own.
 *
 *   paper      doctors write on paper; reception bills tests from the slip; pharmacy dispenses by hand
 *   paperless  doctor portal, e-prescription queue, doctor-ordered tests
 *   hybrid     both: portal and paper side by side ('both'), with the duplicate-order guard
 *
 * Registration, billing, collections, stock, admissions and accounts work the same in every mode.
 * A change applies to new work only; nothing already recorded is converted or removed.
 */
import { all, insert, localStamp } from './db.js';
import { setting as cached, setSetting } from './lib.js';

export const MODES = {
  paper: { workflow_doctor: 'manual', workflow_pharmacy: 'manual', workflow_lab: 'reception' },
  paperless: { workflow_doctor: 'portal', workflow_pharmacy: 'eprescription', workflow_lab: 'doctor' },
  hybrid: { workflow_doctor: 'both', workflow_pharmacy: 'both', workflow_lab: 'both' },
};
export const MODE_LABEL = { paper: 'Paper', paperless: 'Paperless', hybrid: 'Hybrid (both)' };
export const WORKFLOW_KEYS = ['workflow_doctor', 'workflow_pharmacy', 'workflow_lab'];

const setting = (k, d = '') => cached(k, d) ?? d;
const save = (k, v) => setSetting(k, v);   // through lib, so its settings cache stays true

/** The mode the department switches add up to (used for the first run and for direct switch edits). */
export function deriveMode(w) {
  const paper = { workflow_doctor: 'manual', workflow_pharmacy: 'manual', workflow_lab: 'reception' };
  const digital = MODES.paperless;
  if (WORKFLOW_KEYS.every((k) => w[k] === paper[k])) return 'paper';
  if (WORKFLOW_KEYS.every((k) => (w[k] || digital[k]) === digital[k])) return 'paperless';
  return 'hybrid';
}

export const currentMode = () => {
  const m = setting('hospital_mode');
  return MODES[m] ? m : deriveMode(Object.fromEntries(WORKFLOW_KEYS.map((k) => [k, setting(k)])));
};

/** Paper entry allowed for an area (doctor / pharmacy / lab)? */
export const paperAllowed = (area) => ({ doctor: ['manual', 'both'], pharmacy: ['manual', 'both'], lab: ['reception', 'both'] })[area].includes(setting(`workflow_${area}`));
/** Electronic workflow allowed for an area? */
export const digitalAllowed = (area) => ({ doctor: ['portal', 'both'], pharmacy: ['eprescription', 'both'], lab: ['doctor', 'both'] })[area].includes(setting(`workflow_${area}`));

/** Switch the hospital to `mode`. Returns { before, after } for the audit row. */
export function applyMode(mode, userId, reason) {
  const before = { mode: currentMode(), ...Object.fromEntries(WORKFLOW_KEYS.map((k) => [k, setting(k)])) };
  for (const [k, v] of Object.entries(MODES[mode])) save(k, v);
  save('hospital_mode', mode);
  save('hospital_mode_since', localStamp());
  insert('operating_mode_changes', { from_mode: before.mode, to_mode: mode, reason, changed_by: userId });
  return { before, after: { mode, ...MODES[mode] } };
}

export const modeHistory = (limit = 20) => all(`SELECT c.*, u.name changed_by_name FROM operating_mode_changes c
  LEFT JOIN users u ON u.id=c.changed_by ORDER BY c.id DESC LIMIT ?`, limit);

/** How an order arrived, from who placed it (callers may say so explicitly). */
export function orderSourceFor(user, explicit) {
  if (['doctor_portal', 'paper_prescription', 'department_entry', 'ward'].includes(explicit)) return explicit;
  if (user?.role === 'doctor') return 'doctor_portal';
  if (['lab', 'lab_admin', 'radiology', 'imaging_admin'].includes(user?.role)) return 'department_entry';
  if (['reception', 'reception_admin', 'cashier'].includes(user?.role)) return 'paper_prescription';
  if (['nurse', 'nursing_incharge', 'er_incharge', 'ot_incharge'].includes(user?.role)) return 'ward';
  return 'doctor_portal';
}
export const SOURCE_LABEL = { doctor_portal: 'Doctor portal', paper_prescription: 'Paper prescription', department_entry: 'Department entry', ward: 'Ward / nursing' };
