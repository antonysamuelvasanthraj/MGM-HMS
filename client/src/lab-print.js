export function printedReference(result) {
  const reference = String(result.ref_range || '').trim();
  const unit = String(result.unit || '').trim();
  const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasUnit = unit && new RegExp(`(^|[^a-zA-Z])${escapedUnit}($|[^a-zA-Z])`, 'i').test(reference);
  return [reference, !hasUnit && unit].filter(Boolean).join(' ');
}

