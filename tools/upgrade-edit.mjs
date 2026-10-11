import fs from 'node:fs';
const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));
edit('server/routes/clinical.js',s=>s.replace('recalcBill, patientCard, tx, setting, nowIso,','recalcBill, patientCard, tx, setting, nowIso, requireOrderClearance,').replace("import { requireAuth, requirePerm }", "import { requireAuth, requirePerm, can }")
 .replace("status: b.bill === false ? 'awaiting_payment' : 'ordered',", "status: ['lab','imaging'].includes(category) && e.kind !== 'EMG' && e.priority !== 'emergency' && (!svc || svc.price > 0) ? 'awaiting_payment' : 'ordered',")
 .replace("  const nowStamp = nowIso();", `  if (patch.status && ['lab','imaging'].includes(o.category)) {
    requireOrderClearance(o);
    if (['reported','verified'].includes(patch.status)) fail(409, 'use_report_workflow');
    if (!can(req.user, o.category === 'lab' ? 'lab.collect' : 'imaging.schedule')) fail(403, 'forbidden');
    if (o.status === 'verified') fail(409, 'verified_order_locked');
  }
  const nowStamp = nowIso();`)
 .replace("const doctorId = num(req.query.doctor_id, req.user.id);", "const doctorId = req.user.role === 'doctor' ? req.user.id : num(req.query.doctor_id, req.user.id);"));
edit('server/routes/diagnostics.js',s=>s.replace('  nowIso,','  nowIso, requireOrderClearance,')
 .replace("  if (o.status === 'awaiting_payment') fail(409, 'payment_pending');", "  requireOrderClearance(o);\n  if (o.category !== 'lab' || !['ordered','scheduled'].includes(o.status)) fail(409, 'sample_state_invalid');")
 .replace("  const results = req.body.results || [];", "  requireOrderClearance(o);\n  if (o.category !== 'lab' || !['collected','in_progress','reported'].includes(o.status)) fail(409, 'lab_result_state_invalid');\n  const results = req.body.results || [];\n  if (!results.length) fail(400, 'results_required');")
 .replace("  if (!one('SELECT count(*) FROM lab_results WHERE order_id=?', id))", "  requireOrderClearance(o);\n  if (o.category !== 'lab' || o.status !== 'reported') fail(409, 'report_not_ready');\n  if (!one('SELECT count(*) FROM lab_results WHERE order_id=?', id))")
 .replace("  const b = req.body || {};\n  let rep", "  requireOrderClearance(o);\n  if (o.category !== 'imaging') fail(409, 'imaging_order_required');\n  const b = req.body || {};\n  let rep")
 .replace("  update('orders', id, { status: 'scheduled'", "  requireOrderClearance(get('SELECT * FROM orders WHERE id=?', id));\n  update('orders', id, { status: 'scheduled'")
 .replace("            (SELECT b.status FROM bill_items", "            (SELECT b.authorization_status FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) authorization_status,\n            (SELECT b.payer_type FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.order_id=o.id LIMIT 1) financial_category,\n            (SELECT b.status FROM bill_items"));
edit('server/routes/billing.js',s=>s.replaceAll('p.mobile, p.payer_type,', 'p.mobile,').replaceAll('p.mobile, p.gender, p.age_years, p.payer_type, p.vip,','p.mobile, p.gender, p.age_years, p.vip,').replace('p.mobile, p.payer_type, p.payer_name,','p.mobile, p.payer_name,'));
