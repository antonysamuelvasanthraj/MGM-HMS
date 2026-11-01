import { can } from './auth.js';
import { fail, money } from './lib.js';
import { itemMoney } from './accounting.js';

// Batch-linked drugs and consumables remain protected even on consolidated IP bills.
export function pharmacyLine(item, bill = {}) {
  return bill.bill_type === 'PHARM' || !!item.batch_id || item.revenue_head === 'PHARMACY' ||
    ['pharmacy', 'medicine', 'drug'].includes(String(item.category || '').toLowerCase());
}

export function eligibleDiscount(items, bill = {}) {
  return money(Math.max(0,items.reduce((sum, item) => sum + (pharmacyLine(item, bill) ? 0 : itemMoney(item).total), 0)));
}

export function approveDiscount(req, amount, reason, maximum, pharmacy = false) {
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0) fail(400, 'discount_invalid');
  amount = money(amount);
  if (!amount) return amount;
  if (pharmacy) fail(400, 'pharmacy_discounts_disabled');
  if (!can(req.user, 'billing.discount') && !can(req.user, 'payment.authorize')) fail(403, 'forbidden', { need: 'billing.discount' });
  if (!String(reason || '').trim()) fail(400, 'discount_reason_required');
  if (amount > maximum + 0.005) fail(400, 'discount_exceeds_eligible_charges', { max: money(maximum) });
  return amount;
}
