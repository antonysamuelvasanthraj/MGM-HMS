/** Recorded confirmations, not a substitute for the hospital's clinical safety protocol. */
export const OT_CHECKLIST_KEYS = ['consent', 'site_marked', 'fasting', 'allergy', 'implants', 'blood', 'antibiotic', 'count'];
export function checklistGaps(checklist, notes = '') {
  const c = checklist && typeof checklist === 'object' && !Array.isArray(checklist) ? checklist : {};
  const confirmed = value => value === true || value === 1;
  const missing = OT_CHECKLIST_KEYS.filter(key => !confirmed(c[key]) && !(key !== 'consent' && c[key] === 'not_applicable'));
  const needsReason = OT_CHECKLIST_KEYS.some(key => c[key] === 'not_applicable') && !String(notes || '').trim();
  return {missing, needsReason};
}
