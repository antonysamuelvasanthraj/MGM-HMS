/** Inventory values use dispensing units. Unknown original tax values stay blank. */
export function pharmacyStockRow(b, index = 0) {
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const pack = Number(b.units_per_pack || b.medicine_units_per_pack) || 1;
  const qty = Number(b.qty) || 0, cost = Number(b.purchase_rate) || 0;
  const sell = Number(b.selling_price || b.mrp) || 0;
  // Master GST is not evidence of the rate applied on a historical purchase.
  const tax = b.gst_pct == null ? null : Number(b.gst_pct);
  const divisor = tax == null ? null : 1 + tax / 100;
  return {
    'SL No': index + 1, 'Product Code': b.medicine_code,
    'HSN Code': b.hsn || b.medicine_hsn || '', 'Product Name': b.medicine_name,
    Schedule: b.medicine_schedule || '', 'Mfg / Company': b.medicine_manufacturer || '',
    'Pack (Units per Pack)': pack, 'Batch No': b.batch_no, 'Expiry Date': b.expiry,
    'Expiry Status': b.days_to_expiry < 0 ? 'Expired' : b.days_to_expiry <= 90 ? 'Expiring within 90 days' : 'Valid',
    'Stock Qty (Units)': qty, 'Stock Qty (Packs)': round(qty / pack),
    'MRP / Pack (Patient Price)': round(Number(b.mrp || 0) * pack),
    'Rate / Unit (Patient)': sell, 'Discount %': 0,
    'Selling Price / Pack (after Disc.)': round(sell * pack), 'GST %': tax ?? '',
    'Selling Price / Pack (excl. GST)': divisor ? round(sell * pack / divisor) : '',
    'Cost Price / Pack (incl. GST)': '', 'Cost Price / Pack (excl. GST)': '',
    'Cost / Unit': cost, 'Margin / Pack': '', 'Margin %': '',
    'Amount (Stock Value @ Selling Price)': round(qty * sell),
    'GST Amount (in Selling Value)': divisor ? round(qty * sell - qty * sell / divisor) : '',
    'Stock Value @ Cost': round(qty * cost), 'Expected Profit': '',
    'Supplier (last purchase)': b.supplier_name || '', 'Purchase Inv No': '',
    'Purchase Date': b.received_at || '', 'HSN Source': b.hsn ? 'Batch' : b.medicine_hsn ? 'Medicine master' : '',
    Location: b.location || '', Remarks: 'Cost uses existing inventory valuation. Original purchase tax basis and invoice linkage require verification; unknown tax and margin values are blank.',
  };
}
