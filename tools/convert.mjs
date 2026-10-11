/**
 * Stitch → SurelyHMS view converter.
 *
 * Each Stitch export is a whole standalone page (its own header, sidebar and
 * Tailwind CDN config). The running app has ONE shell, so this pipeline keeps
 * the designed <main> content and drops the duplicated chrome. Inline demo
 * scripts are preserved in a <template data-view-script> block and executed by
 * the router when the view mounts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'design-source', 'stitch_surelyhms_hospital_information_system');
const OUT = path.join(ROOT, 'client', 'views');

/** folder → { route, title, shell } */
export const MAP = {
  admin_owner_daily_operations:                          ['daily-operations',   'Daily Operations'],
  appointments_doctor_scheduling:                        ['appointments',       'Appointments & Doctor Scheduling'],
  cashier_billing_desk:                                  ['collections',        'All Collections'],
  clinical_consultation_workspace:                       ['consultation',       'Clinical Consultation'],
  clinical_orders_requisitions:                          ['orders',             'Clinical Orders & Requisitions'],
  consultation_history_amendments:                       ['consultation-history', 'Consultation History & Amendments'],
  demo_synthetic_data_management_utility:                ['demo-data',          'Demo & Synthetic Data'],
  discharge_coordination_desk:                           ['discharge',          'Discharge Coordination'],
  doctor_opd_consultation:                               ['doctor-consultation', 'Doctor OPD Consultation'],
  doctor_practice_dashboard:                             ['doctor-dashboard',   'My Practice'],
  emergency_casualty_desk:                               ['emergency',          'Emergency & Casualty Desk'],
  follow_up_teleconsultation_workspace:                  ['follow-up',          'Follow-up & Teleconsultation'],
  goods_receipt_grn:                                     ['grn',                'Goods Receipt (GRN)'],
  health_packages_bundles:                               ['packages',           'Health Packages & Bundles'],
  hospital_accounts_financial_ledger:                    ['ledger',             'Accounts & General Ledger'],
  hospital_accounts_payments_receipts_ledger:            ['receipts',           'Payments & Receipts'],
  hospital_administration_access_control:                ['users',              'Users, Roles & Access Control'],
  hospital_billing_invoice_management:                   ['bills',              'Billing & Invoice Management'],
  hospital_operational_financial_reports:                ['reports',            'Hospital Reports'],
  icu_critical_care_unit:                                ['icu',                'ICU & Critical Care'],
  imaging_radiology_pacs_usg:                            ['imaging',            'Imaging & Radiology'],
  inpatient_admissions_bed_management:                   ['admissions',         'Admissions & Bed Management'],
  insurance_tpa_claims_desk:                             ['insurance',          'Insurance & TPA Claims'],
  interactive_clinical_resilience_prototype_walkthrough: ['walkthrough',        'System Walkthrough'],
  intrapartum_partograph_chart:                          ['partograph',         'Intrapartum Partograph'],
  laboratory_diagnostics:                                ['laboratory',         'Laboratory & Diagnostics'],
  local_server_hybrid_cloud_sync:                        ['local-sync',         'Local Server & Cloud Sync'],
  management_overview:                                   ['owner-overview',     'Owner Overview'],
  maternity_obstetric_care:                              ['maternity',          'Maternity & Obstetric Care'],
  medical_certificates_workspace:                        ['certificates',       'Medical Certificates'],
  medicine_master_catalog:                               ['medicines',          'Medicine Master Catalog'],
  my_access_system_diagnostics:                          ['my-access',          'My Access & Diagnostics'],
  op_fee_collection_desk:                                ['op-fee-collection',  'OP Fee Collection'],
  op_reception_registration:                             ['op-registration',    'OP Registration'],
  operation_theatre_suite:                               ['ot',                 'Operation Theatre Suite'],
  operational_expense_register:                          ['expenses',           'Operational Expenses'],
  outpatient_queue_clinical_routing:                     ['doctor-queue',       'Doctor Queue'],
  owner_admin_analytics:                                 ['analytics',          'Admin Analytics'],
  patient_profile_encounter_timeline:                    ['patient',            'Patient Record'],
  patient_search_registration:                           ['patients',           'Patient Search & Registration'],
  pharmacy_analytics_valuation_commercial_reports:       ['pharmacy-reports',   'Pharmacy & Inventory Reports'],
  pharmacy_dispense_pos:                                 ['pharmacy',           'Pharmacy Sales & Dispensing'],
  public_queue_token_display:                            ['display-queue',      'Token Display',        'blank'],
  public_waiting_room_token_display:                     ['display-waiting',    'Waiting Room Display', 'blank'],
  quality_audit_workspace:                               ['quality',            'Quality & Audit'],
  reception_visit_tracking_queue:                        ['visit-tracking',     'Visit Tracking'],
  role_specific_work_dashboard:                          ['dashboard',          'My Dashboard'],
  secure_patient_portal:                                 ['portal',             'Patient Portal',       'blank'],
  staff_roster_duty_attendance:                          ['attendance',         'Roster & Attendance'],
  staff_sign_in_offline_credentials:                     ['login',              'Sign in',              'blank'],
  stock_ledger_batches:                                  ['stock',              'Stock Ledger & Batches'],
  suppliers_vendor_accounts_directory:                   ['suppliers',          'Suppliers & Vendors'],
  tariff_service_fee_master:                             ['tariff',             'Doctor Fees & Service Tariff'],
  ultrasound_usg_reporting_templates:                    ['usg-reporting',      'USG Reporting'],
  ward_nursing_workspace:                                ['nursing',            'Ward Nursing Workspace'],
};

const SKIP = new Set(['clinical_precision', 'surelyhms_logo',
  'professional_clean_portrait_headshot_of_an_indian_female_senior_hospital']);

function extractMain(html) {
  // Take everything between the first <main ...> and the last </main>.
  const open = html.match(/<main[^>]*>/);
  if (!open) return null;
  const start = html.indexOf(open[0]);
  const end = html.lastIndexOf('</main>');
  if (end < 0) return null;
  let main = html.slice(start + open[0].length, end);

  // A couple of pages nest a second <main>; unwrap those tags too.
  main = main.replace(/<\/?main[^>]*>/g, '');
  return main;
}

function extractScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1];
    if (/tailwind\.config/.test(body)) continue;
    if (!body.trim()) continue;
    // Script text inside an HTML document arrives entity-escaped (&& -> &amp;&amp;).
    out.push(decodeEntities(body.trim()));
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENTITIES[n])
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Remote demo images will not load on a hospital LAN — swap for local assets. */
function localiseAssets(html) {
  return html
    .replace(/src="https:\/\/lh3\.googleusercontent\.com\/[^"]*"/g, 'src="/assets/avatar.svg"')
    .replace(/url\(['"]?https:\/\/lh3\.googleusercontent\.com\/[^)'"]*['"]?\)/g, 'url(/assets/avatar.svg)')
    .replace(/src="https:\/\/[^"]*\.(png|jpg|jpeg|webp)"/g, 'src="/assets/avatar.svg"');
}

/** Dead `href="#"` anchors inside the design become no-ops, not page jumps. */
function neutraliseLinks(html) {
  return html.replace(/href="#"/g, 'href="javascript:void(0)" data-stub');
}

export function convert({ quiet = false } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const folder of fs.readdirSync(SRC)) {
    if (SKIP.has(folder)) continue;
    const file = path.join(SRC, folder, 'code.html');
    if (!fs.existsSync(file)) continue;
    const entry = MAP[folder];
    if (!entry) { if (!quiet) console.warn('  unmapped:', folder); continue; }
    const [route, title, shell = 'app'] = entry;

    const html = fs.readFileSync(file, 'utf8');
    let main = extractMain(html);
    if (!main) { console.warn('  no <main>:', folder); continue; }
    main = neutraliseLinks(localiseAssets(main));
    const scripts = extractScripts(html).map(localiseAssets);

    const header =
      `<!-- Generated by tools/convert.mjs from design-source/…/${folder}/code.html.\n` +
      `     Design markup is preserved; behaviour lives in client/src/views/${route}.js -->\n`;
    const body = header +
      `<div class="view-root" data-view="${route}" data-shell="${shell}">\n${main.trim()}\n</div>\n` +
      scripts.map((s) => `<template data-view-script>\n${s}\n</template>`).join('\n');

    fs.writeFileSync(path.join(OUT, `${route}.html`), body, 'utf8');
    manifest.push({ route, title, shell, source: folder, bytes: body.length, scripts: scripts.length });
  }
  const controllers = new Set(fs.readdirSync(path.join(ROOT,'client','src','views')).filter(f => f.endsWith('.js') && !f.startsWith('_')).map(f => f.slice(0,-3)));
  for (const entry of manifest) { entry.status = controllers.has(entry.route) ? 'active' : 'archived-design'; entry.controller = controllers.has(entry.route) ? `client/src/views/${entry.route}.js` : null; }
  for (const route of controllers) if (!manifest.some(e => e.route === route)) manifest.push({route,title:route.replace(/-/g,' '),shell:'app',source:null,controller:`client/src/views/${route}.js`,status:'active',design_html:null,bytes:0,scripts:0});
  manifest.sort((a, b) => a.route.localeCompare(b.route));
  fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));
  if (!quiet) {
    console.log(`  converted ${manifest.length} views → client/views/`);
    const big = manifest.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 3);
    console.log('  largest:', big.map((m) => `${m.route} ${(m.bytes / 1024).toFixed(0)}k`).join(', '));
  }
  return manifest;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('convert.mjs')) convert();
