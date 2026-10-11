/**
 * The sidebar.
 *
 * `perm` hides an item the signed-in role may not use; `hideIf` hides it when
 * the role already reaches the same screen another way; `badge` names the key
 * from /api/dashboard/badges that supplies the live count. The server enforces
 * every permission again — hiding a link is convenience, not security.
 */
export const NAV = [
  { section: 'Overview', items: [
    { route: '/dashboard',        label: 'Dashboard',         icon: 'space_dashboard' },
    { route: '/staff-workspace', label: 'Team Chat & Tasks', icon: 'forum', badge: 'staff-workspace' },
    { route: '/attendance', label: 'Roster & Attendance', icon: 'badge' },
    { route: '/stores',     label: 'Stores & Materials', icon: 'handyman', badge: 'stores' },
    { route: '/maintenance', label: 'Maintenance & Assets', icon: 'build' },
  ]},
  { section: 'Reception & OPD', items: [
    { route: '/patients',          label: 'Patients',          icon: 'person_search', perm: 'patient.view' },
    { route: '/appointments',      label: 'Appointments',      icon: 'calendar_month', perm: 'appt.view', badge: 'appointments' },
    { route: '/op-registration',   label: 'OP Registration',   icon: 'how_to_reg', perm: 'op.register', badge: 'op-registration' },
    { route: '/op-fee-collection', label: 'OP Fee Collection', icon: 'payments', perm: 'op.collect', badge: 'op-fee-collection' },
    { route: '/bills?new=op', label: 'OPD Procedures & Charges', icon: 'healing', perm: 'op.collect' },
    { route: '/service-payments',  label: 'Service Payments',  icon: 'point_of_sale', perm: 'payment.authorize', badge: 'service-payments' },
    { route: '/visit-tracking',    label: 'Visit Tracking',    icon: 'timeline', perm: 'queue.view', badge: 'visit-tracking' },
    { route: '/vitals-queue',      label: 'Vitals Queue',      icon: 'monitor_heart', perm: ['vitals.record', 'vitals.view', 'patient.clinical'], badge: 'vitals-queue' },
    { route: '/doctor-queue',      label: 'Doctor Queue',      icon: 'groups', perm: ['consult.write', 'queue.manage'], badge: 'doctor-queue' },
    { route: '/follow-up',         label: 'Follow-up',         icon: 'event_repeat', perm: 'queue.view' },
    { route: '/display-queue',     label: 'Queue Display',     icon: 'tv', perm: 'queue.manage', external: true },
  ]},
  { section: 'Clinical', items: [
    { route: '/consultation',         label: 'Consultation',         icon: 'stethoscope', perm: 'consult.write' },
    { route: '/consultation-history', label: 'Consultation History', icon: 'history', perm: 'patient.clinical' },
    { route: '/counselling', label: 'Counselling', icon: 'record_voice_over', perm: ['counsel.view', 'counsel.write', 'counsel.review'], badge: 'counselling' },
    { route: '/orders',               label: 'Clinical Orders',      icon: 'assignment', perm: 'order.view' },
    { route: '/templates',            label: 'My Templates',         icon: 'article', perm: 'template.write' },
    { route: '/certificates',         label: 'Certificates',         icon: 'verified_user', perm: 'certificate.view' },
  ]},
  { section: 'Emergency', items: [
    { route: '/emergency', label: 'Emergency Desk', icon: 'e911_emergency', perm: 'emergency.view', badge: 'emergency', tone: 'danger' },
  ]},
  { section: 'IPD', items: [
    { route: '/admissions', label: 'Admissions & Beds', icon: 'hotel', perm: 'ipd.view', badge: 'admissions' },
    { route: '/nursing',    label: 'Nursing',           icon: 'vaccines', perm: ['nursing.view', 'patient.clinical'], badge: 'nursing' },
    { route: '/indents',    label: 'Ward Stock & Indents', icon: 'inventory', perm: ['ipd.indent','nursing.write','emergency.treat'], badge: 'indents' },
    { route: '/icu',        label: 'ICU',               icon: 'ecg_heart', perm: ['nursing.view', 'patient.clinical'], badge: 'icu' },
    { route: '/discharge',  label: 'Discharge',         icon: 'logout', perm: 'ipd.view', badge: 'discharge' },
    { route: '/housekeeping', label: 'Beds to clean',    icon: 'cleaning_services', perm: ['beds.clean', 'ipd.manage'], badge: 'housekeeping' },
  ]},
  { section: 'Diagnostics', items: [
    { route: '/laboratory',    label: 'Laboratory',    icon: 'science', perm: 'lab.view', badge: 'laboratory' },
    { route: '/imaging',       label: 'Imaging',       icon: 'radiology', perm: 'imaging.view', badge: 'imaging' },
    { route: '/usg-reporting', label: 'USG Reporting', icon: 'pregnant_woman', perm: 'imaging.report' },
  ]},
  { section: 'Pharmacy', items: [
    { route: '/pharmacy',         label: 'Sales & Dispensing', icon: 'local_pharmacy', perm: 'pharmacy.view', badge: 'pharmacy-sales' },
    { route: '/indents',          label: 'Ward Requests & Replacements', icon: 'medication', perm: 'pharmacy.dispense', badge: 'indents' },
    { route: '/reports?report=emergency_store_batches', label: 'ER / ICU / OT Stock', icon: 'medical_services', perm: 'reports.pharmacy' },
    { route: '/stock',            label: 'Stock',              icon: 'inventory_2', perm: 'inventory.view', badge: 'stock' },
    { route: '/stock-transfers',  label: 'Stock Transfers',    icon: 'swap_horiz', perm: 'inventory.view', badge: 'transfers' },
    { route: '/grn',              label: 'Purchases / GRN',    icon: 'receipt', perm: 'purchase.view', badge: 'grn' },
    { route: '/returns',          label: 'Returns',            icon: 'assignment_return', perm: ['pharmacy.view','purchase.view'] },
    { route: '/medicines',        label: 'Medicine Master',    icon: 'pill', perm: 'inventory.view' },
    { route: '/suppliers',        label: 'Suppliers',          icon: 'local_shipping', perm: 'supplier.view' },
    { route: '/day-report?desk=pharmacy', label: 'Daily Sales & Handover', icon: 'summarize', perm: 'pharmacy.view', hideIf: 'reports.collection' },
    { route: '/pharmacy-reports', label: 'Pharmacy Analytics', icon: 'analytics', perm: 'pharmacy.view' },
    { route: '/reports?group=Pharmacy', label: 'Pharmacy Reports', icon: 'summarize', perm: 'reports.pharmacy', hideIf: 'reports.view' },
  ]},
  { section: 'OT & Maternity', items: [
    { route: '/ot',         label: 'OT Schedule', icon: 'surgical', perm: 'ot.view', badge: 'ot-schedule' },
    { route: '/maternity',  label: 'Maternity',   icon: 'child_friendly', perm: 'maternity.view', badge: 'maternity' },
    { route: '/partograph', label: 'Partograph',  icon: 'show_chart', perm: 'maternity.view' },
  ]},
  { section: 'Billing & Insurance', items: [
    { route: '/approvals', label: 'Approvals',          icon: 'approval', perm: 'payment.approve_free', badge: 'approvals' },
    { route: '/day-report', label: 'Daily Collection & Handover', icon: 'summarize', perm: 'reports.collection' },
    { route: '/reports?group=Reception', label: 'Reception Reports', icon: 'summarize', perm: 'reports.reception', hideIf: 'reports.view' },
    { route: '/bills',     label: 'Bills',              icon: 'receipt_long', perm: ['payment.view', 'payment.collect', 'finance.view', 'insurance.view'], badge: 'bills' },
    { route: '/receipts',  label: 'Receipts & Refunds', icon: 'paid', perm: 'payment.view' },
    { route: '/insurance', label: 'Insurance & Payer Cases', icon: 'health_and_safety', perm: 'insurance.view', badge: 'insurance' },
    { route: '/payers',    label: 'Payers & TPAs',      icon: 'handshake', perm: 'insurance.view' },
    { route: '/messages',  label: 'Patient Messages',   icon: 'sms', perm: ['payment.collect', 'finance.view', 'admin.view'] },
    { route: '/packages',  label: 'Packages',           icon: 'inventory', perm: ['op.register', 'insurance.view', 'admin.view'] },
  ]},
  { section: 'Finance', items: [
    { route: '/accounts',                 label: 'Accounts',               icon: 'account_balance', perm: 'finance.view' },
    { route: '/accounts?tab=receivables', label: 'Payer Receivables',      icon: 'request_quote', perm: 'finance.receivables', hideIf: 'finance.view' },
    { route: '/expenses',                 label: 'Expenses',               icon: 'payments', perm: 'expense.view' },
    { route: '/visiting-doctors',         label: 'Visiting Doctors',       icon: 'stethoscope', perm: ['finance.view', 'admin.view'] },
    { route: '/counter-reconciliation',   label: 'Counter Reconciliation', icon: 'balance', perm: 'finance.counter' },
  ]},
  { section: 'Reports', items: [
    { route: '/reports', label: 'Report Centre', icon: 'summarize', perm: 'reports.view' },
  ]},
  { section: 'Administration', items: [
    { route: '/users',      label: 'Users & Roles',      icon: 'manage_accounts', perm: ['admin.view', 'staff.manage'] },
    { route: '/settings',   label: 'Hospital Settings',  icon: 'settings', perm: 'admin.view' },
    { route: '/tariff',     label: 'Fees & Tariffs',     icon: 'price_change', perm: 'admin.view' },
    { route: '/wards',      label: 'Wards & Beds',       icon: 'bed', perm: 'admin.view' },
    { route: '/reports?group=Staff%20%26%20HR', label: 'Attendance Reports', icon: 'summarize', perm: 'reports.attendance', hideIf: 'reports.view' },
    { route: '/audit',      label: 'Audit Trail',        icon: 'policy', perm: 'audit.view' },
    { route: '/quality',    label: 'Quality',            icon: 'verified', perm: 'quality.view', badge: 'quality' },
    { route: '/local-sync', label: 'Local Setup & Sync', icon: 'dns', perm: 'admin.view', badge: 'local-sync' },
    { route: '/my-access',  label: 'My Access',          icon: 'key' },
  ]},
];

/** Routes that are reachable but do not appear in the rail. */
export const HIDDEN_ROUTES = {
  '/patient': 'Patient Record',
  '/visit': 'Visit',
  '/doctor-consultation': 'Doctor OPD Consultation',
  '/display-waiting': 'Waiting Room Display',
  '/portal': 'Patient Portal',
  '/collections': 'Collections',
  '/login': 'Sign in',
};

export function titleFor(route) {
  for (const g of NAV) for (const i of g.items) if (i.route === route) return i.label;
  return HIDDEN_ROUTES[route] || 'MGM HMS';
}

export function sectionFor(route) {
  for (const g of NAV) for (const i of g.items) if (i.route === route) return g.section;
  return '';
}
