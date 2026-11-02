/**
 * MGM HMS — Word Document Generator (Single Login Per Department)
 * Generates 8 Departmental Word (.docx) guides + 1 Master Combined Guide
 * Strictly ONE combined login per department.
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, HeadingLevel, AlignmentType, ShadingType
} from 'docx';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = 'E:/MGM HMS/DEMO_DOCUMENTS';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Styling constants
const FONT_FAMILY = 'Calibri';
const COLOR_PRIMARY = '003366';   // Dark Navy
const COLOR_SECONDARY = '006699'; // Medical Blue
const COLOR_ACCENT = '008080';    // Teal
const COLOR_DARK = '1A1A1A';      // Body Text
const COLOR_MUTED = '555555';     // Secondary Text
const COLOR_BG_LIGHT = 'F0F4F8';  // Light Table Header
const COLOR_BORDER = 'CCCCCC';

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 32, // 16pt
        color: COLOR_PRIMARY,
        font: FONT_FAMILY,
      }),
    ],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 26, // 13pt
        color: COLOR_SECONDARY,
        font: FONT_FAMILY,
      }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 140, after: 60 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22, // 11pt
        color: COLOR_ACCENT,
        font: FONT_FAMILY,
      }),
    ],
  });
}

function para(text, bold = false, italic = false) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        bold,
        italics: italic,
        size: 22, // 11pt
        color: COLOR_DARK,
        font: FONT_FAMILY,
      }),
    ],
  });
}

function bullet(text, boldPrefix = '') {
  const children = [];
  if (boldPrefix) {
    children.push(new TextRun({ text: boldPrefix + ' ', bold: true, size: 22, font: FONT_FAMILY, color: COLOR_DARK }));
  }
  children.push(new TextRun({ text, size: 22, font: FONT_FAMILY, color: COLOR_DARK }));
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children,
  });
}

function callout(title, text) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    borders: {
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_PRIMARY },
      top: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: 'F4F8FA', type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                spacing: { after: 40 },
                children: [new TextRun({ text: title, bold: true, size: 22, color: COLOR_PRIMARY, font: FONT_FAMILY })],
              }),
              new Paragraph({
                children: [new TextRun({ text, italics: true, size: 20, color: COLOR_MUTED, font: FONT_FAMILY })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function createTable(headers, rows) {
  const tableRows = [];

  // Header Row
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headers.map(h => new TableCell({
        shading: { fill: COLOR_PRIMARY, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: h, bold: true, size: 20, color: 'FFFFFF', font: FONT_FAMILY })],
          }),
        ],
      })),
    })
  );

  // Data Rows
  rows.forEach((r, idx) => {
    tableRows.push(
      new TableRow({
        children: r.map(c => new TableCell({
          shading: { fill: idx % 2 === 0 ? 'FFFFFF' : COLOR_BG_LIGHT, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
          },
          children: [
            new Paragraph({
              children: [new TextRun({ text: String(c), size: 20, font: FONT_FAMILY, color: COLOR_DARK })],
            }),
          ],
        })),
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

// ─── 8 CORE DEPARTMENTS — STRICTLY ONE COMBINED LOGIN PER DEPT ────────────────
const SECTIONS = [
  {
    id: '01',
    code: 'reception',
    deptName: 'Reception & Billing (Front Office Combined)',
    filename: '01_Reception_and_Billing_Guide.docx',
    title: 'MGM HMS — Reception & Billing Operational Guide',
    subtitle: 'Combined Patient Registration, Appointments, IP Admissions, All Billing, Receipts & Counter Closing',
    login: ['Reception & Billing In-charge', 'Ms. Kavya Sree', 'reception', 'Mgm@19D2E756', 'reception (32 Perms)', 'Registration, appointments, admissions, all OP/IP billing, cash/card/UPI receipts, counter closing'],
    overview: 'This single combined Front Office login manages the entire patient intake and financial billing lifecycle: registering new patients, assigning permanent UHID numbers, scheduling appointments, admitting inpatients to beds, collecting OP consultation fees, billing doctor lab/radiology orders, processing final IP settlements, and balancing cash counters.',
    integrations: [
      { name: 'UHID & Master Patient Index (MPI)', desc: 'Generates permanent unique identifiers (e.g. SHMS-2627-0001). Connects patient demographics, government ID, and emergency contact.' },
      { name: 'OP Visit & Doctor Queue Routing', desc: 'Converts registration into active consultation encounters, automatically placing patients on the consulting doctor’s live waiting board.' },
      { name: 'Combined Billing & Split Settlement', desc: 'Handles all fee collections across OP consultation, lab investigation orders, emergency charges, and running IP accounts with Cash, UPI, and Card split support.' },
      { name: 'Investigation Queue Billing', desc: 'Listens for lab and radiology orders placed by doctors. Collecting payment automatically releases the tests to the laboratory worklist.' },
      { name: 'Inpatient Admissions & Bed Allocation', desc: 'Directly allocates vacant beds across General Ward, Private, ICU, and Maternity, creating the running inpatient billing account.' },
      { name: 'Counter Session & Cash Handover', desc: 'Links all transactions to the cashier’s active counter desk and provides a one-click balanced cash reconciliation handover at shift end.' }
    ],
    steps: [
      { step: 'Step 1: Sign in & Select Active Cash Counter', desc: 'Log in as reception. The system prompts to select a counter desk (e.g. Counter 1). Select your desk to tie all transactions to your session.' },
      { step: 'Step 2: Register Patient & Generate UHID', desc: 'Click "+ Register Patient". Enter Full Name, Age/DOB, Gender, Mobile Number, and Address. System generates unique lifetime UHID.' },
      { step: 'Step 3: Create OP Visit & Collect Fee', desc: 'Click "Start OP Visit". Select Department (General Medicine) and Consulting Doctor (Dr. Suresh Babu). Collect ₹300-₹500 consultation fee via Cash, UPI, or Card and print receipt.' },
      { step: 'Step 4: Collect Investigation Orders', desc: 'When patient returns with doctor-ordered tests, open "Investigation Queue". Select orders, click "Generate Bill", collect payment via UPI/Cash, and print receipt. The lab worklist unlocks immediately.' },
      { step: 'Step 5: Admit Inpatient to Ward Bed', desc: 'Open "Inpatient (IPD)" -> "+ New Admission". Select patient, admitting doctor, and pick an available bed from the visual bed grid.' },
      { step: 'Step 6: Shift-End Counter Reconciliation', desc: 'Open "Counter Reconciliation". Review total Cash, UPI, and Card received. Verify physical cash and click "Submit Handover".' }
    ]
  },
  {
    id: '02',
    code: 'doctor',
    deptName: 'Doctor & Clinical (OPD, IPD & Surgery Combined)',
    filename: '02_Doctor_Clinical_and_Surgery_Guide.docx',
    title: 'MGM HMS — Doctor & Clinical Workstation Guide',
    subtitle: 'Combined OPD Consultations, ICD-10 Coding, e-Prescriptions, Lab Orders, IP Rounds & Clinical Clearance',
    login: ['Consultant Doctor (OPD & IPD)', 'Dr. Suresh Babu', 'doctor', 'Mgm@61684578', 'doctor (24 Perms)', 'Queue, consultation notes, ICD-10 diagnosis, e-Rx, lab orders, inpatient rounds, surgery/OT, clinical clearance'],
    overview: 'This single combined Doctor workstation empowers medical consultants across all clinical touchpoints: conducting outpatient consultations, formulating standardized ICD-10 diagnoses, writing formulary e-prescriptions, ordering diagnostic tests, conducting inpatient ward rounds, scheduling surgeries, and signing clinical discharge summaries.',
    integrations: [
      { name: 'Live Outpatient Consultation Queue', desc: 'Displays patients waiting in real time with nursing vitals (BP, pulse, SpO2, temp) already captured and highlighted.' },
      { name: 'ICD-10 Diagnostic Search', desc: 'Standardized international disease coding (e.g. J06.9 Acute URI, I10 Essential Hypertension, E11 Type 2 Diabetes) integrated into consultation notes.' },
      { name: 'Formulary e-Prescriptions', desc: 'Prescribes from the 142 approved hospital medicines with automated frequency (OD, BD, TDS), duration, and food instructions, syncing immediately to the Pharmacy queue.' },
      { name: 'Investigation Ordering (Lab & Radiology)', desc: 'Direct ordering of CBC, Blood Sugar, LFT, X-Ray, USG, and CT with priority tags (Routine vs. STAT emergency).' },
      { name: 'Inpatient Clinical Clearance & Discharge', desc: 'Surgeons and physicians conduct IP rounds, review progress notes, and record final discharge summaries, legally clearing beds for settlement.' }
    ],
    steps: [
      { step: 'Step 1: Open Live Consultation Queue', desc: 'Log in as doctor. Your waiting board displays registered patients with vitals captured by nursing staff.' },
      { step: 'Step 2: Conduct Consultation & Enter Notes', desc: 'Click "Start Consultation". Enter Chief Complaints, History, and Clinical Examination. Search and select the ICD-10 diagnosis.' },
      { step: 'Step 3: Order Diagnostic Investigations', desc: 'Under "Investigation Orders", select required tests (e.g. Complete Blood Count, Fasting Blood Sugar, Chest X-Ray). Tag Routine or STAT.' },
      { step: 'Step 4: Prescribe Medications', desc: 'Under "Prescriptions", type medicine name (e.g. Pyrexa 500), select dosage, frequency (TDS), duration (5 days). Click "Sign & Complete Consultation".' },
      { step: 'Step 5: IPD Clinical Clearance & Discharge Summary', desc: 'For admitted inpatients ready to go home, open "Inpatient IPD", select patient, click "Clinical Clearance", record discharge summary and follow-up advice, and save.' }
    ]
  },
  {
    id: '03',
    code: 'lab',
    deptName: 'Laboratory & Diagnostics (Combined Tech + Verification)',
    filename: '03_Laboratory_and_Diagnostics_Guide.docx',
    title: 'MGM HMS — Laboratory & Diagnostics Operational Guide',
    subtitle: 'Combined Sample Collection, Tube Barcodes, Analyzer Result Entry & Pathologist Verification',
    login: ['Laboratory In-charge', 'Mrs. Padmavathi', 'lab.manager', 'Mgm@28463881', 'lab_admin (13 Perms)', 'Worklist, sample collection, barcoding, analyzer result entry, critical call alerts, report verification & sign-off'],
    overview: 'This single combined Diagnostic login operates both technical and managerial laboratory workflows: accessioning incoming orders, generating barcode specimen labels, auto-deducting lab consumables, entering analyzer parameters against biological reference ranges, logging critical panic phone-calls, and authorizing final diagnostic reports.',
    integrations: [
      { name: 'Sample Accessioning & Barcoding', desc: 'Generates unique accession numbers (e.g. ACC-261030-0001) and specimen tube barcodes (EDTA, Plain, Fluoride).' },
      { name: 'Consumable Auto-Depletion', desc: 'Sample collection automatically deducts vacutainer tubes, needles, and tips from the internal Lab Store inventory.' },
      { name: 'Parameter Matrix with Reference Ranges', desc: 'Standardized templates across CBC, LFT, RFT, Electrolytes, Lipid Profile, and Urine Analysis with automatic Red/Blue high/low flagging.' },
      { name: 'Critical Result Phone Alert Logging', desc: 'When panic thresholds are breached (e.g. Potassium > 6.5 or Platelets < 20,000), system prompts for read-back confirmed physician notification.' },
      { name: 'Verification & Report Sign-Off', desc: 'Direct authorization of completed test values into digitally signed, printable diagnostic reports viewable by treating doctors.' }
    ],
    steps: [
      { step: 'Step 1: Check Order Worklist & Accession Sample', desc: 'Log in as lab.manager. Open "Lab Orders". Filter by Pending Collection. Click "Accession & Collect Sample" to generate tube barcode.' },
      { step: 'Step 2: Enter Analyzer Results', desc: 'Under "Worklist", select the accessioned test. Enter observed parameter values (e.g. Haemoglobin, RBC, WBC, Platelets). Out-of-range values highlight automatically.' },
      { step: 'Step 3: Record Critical Value Notification (If Applicable)', desc: 'If panic limits are exceeded, record phone call to the attending doctor with date, time, and confirmed read-back.' },
      { step: 'Step 4: Verify & Authorize Report', desc: 'Review all parameter entries. Click "Verify & Authorize Report". The signed report is published instantly to the doctor’s portal and reception desk.' }
    ]
  },
  {
    id: '04',
    code: 'pharmacy',
    deptName: 'Pharmacy & Inventory (Combined Dispensing + GRN + Stock)',
    filename: '04_Pharmacy_and_Inventory_Guide.docx',
    title: 'MGM HMS — Pharmacy Dispensing & Inventory Control Guide',
    subtitle: 'Combined e-Prescription Dispensing, OTC Sales, Supplier GRN, 3-Tier Stock & Ward Indent Fulfillment',
    login: ['Pharmacy In-charge', 'Mr. Chandra Sekhar', 'pharmacy.manager', 'Mgm@0505A492', 'pharmacy_admin (17 Perms)', 'Prescription queue, OTC retail sale, supplier GRN, multi-location stock, inter-store transfers, ward indent dispensing'],
    overview: 'This single combined Pharmacy login controls retail dispensing and warehouse supply chain: auto-receiving doctor e-prescriptions, managing 3-tier physical stock (Central Store, OP Pharmacy, IP Pharmacy), receiving goods from suppliers via GRN, approving inter-store transfers, and fulfilling ward nursing indents directly to running IP bills.',
    integrations: [
      { name: 'Real-Time Prescription Dispensing Queue', desc: 'Auto-receives prescriptions written by doctors during OP consultations with batch matching and instant retail billing.' },
      { name: 'Three-Tier Multi-Location Inventory', desc: 'Maintains isolated physical inventories across Central Warehouse (Bulk), OP Store (Retail), and IP Store (Ward/OT).' },
      { name: 'Goods Receipt Note (GRN) from Suppliers', desc: 'Records incoming shipments with supplier invoice, batch number, expiry date, purchase cost, GST %, and MRP, debiting inventory accounts.' },
      { name: 'Stock Transfer Workflow (TRF)', desc: 'One-click initiation, approval, and receipt of stock replenishment from Central Warehouse into OP or IP dispensing locations.' },
      { name: 'Ward Indent Auto-Billing', desc: 'Fulfills medication indents submitted by ward nurses; dispensed items deduct from IP stock and automatically post to the patient’s active inpatient bill.' }
    ],
    steps: [
      { step: 'Step 1: Dispense from Doctor Prescription Queue', desc: 'Log in as pharmacy.manager. Open "Dispense Queue". Select patient prescription. System matches active OP batch for Pyrexa 500 / Amoxil-D. Click "Dispense & Bill", collect payment, and print receipt.' },
      { step: 'Step 2: Over-The-Counter (OTC) Walk-in Sale', desc: 'Click "Walk-in Sale". Search medicine by name. Enter quantity. Select payment mode (Cash/UPI/Card) and generate retail bill.' },
      { step: 'Step 3: Receive Stock via Supplier GRN', desc: 'Open "GRN & Purchases" -> "+ New GRN". Select Supplier, enter Invoice No, add items with Batch No, Expiry Date, Purchase Rate, and MRP. Click "Save & Post GRN". Stock adds to Central Warehouse.' },
      { step: 'Step 4: Transfer Stock to OP / IP Locations', desc: 'Open "Stock Transfers" -> "+ New Transfer". Select Source: Central, Destination: OP. Select medicine batch and quantity. Confirm issue and receipt to replenish dispensing shelves.' },
      { step: 'Step 5: Dispense Ward Indents to IP Bill', desc: 'Open "Ward Indents". Review nursing requests. Click "Dispense Indent". Medicines deduct from IP inventory and charge directly to the patient’s running IP account.' }
    ]
  },
  {
    id: '05',
    code: 'tpa',
    deptName: 'Insurance & TPA Desk',
    filename: '05_Insurance_and_TPA_Desk_Guide.docx',
    title: 'MGM HMS — Insurance & TPA Desk Operational Guide',
    subtitle: 'Combined Aarogyasri, CGHS, and Private TPA Claims, Pre-Auth Approvals & Insurer Settlements',
    login: ['TPA In-charge', 'Mr. Rajesh', 'tpa.desk', 'Mgm@5D216091', 'insurance (6 Perms)', 'Insurance claims, pre-authorization, package codes, query response, final claim submission, insurer settlements'],
    overview: 'This dedicated TPA desk login manages all non-cash and sponsored healthcare: administering state government welfare schemes (Aarogyasri, CGHS, EHS), corporate health agreements, and private insurance TPAs (Star Health, ICICI Lombard, MD India), tracking pre-authorizations and calculating patient co-pays.',
    integrations: [
      { name: 'Multi-Payer Registry & Scheme Configuration', desc: 'Pre-configured rules for Aarogyasri packages, CGHS tariffs, corporate discounts, and private insurance sub-limits.' },
      { name: 'Pre-Authorization Request & Approval Tracking', desc: 'Logs pre-auth submissions, initial sanctions, enhancement requests, and approved amounts, dynamically splitting patient vs. payer liability on bills.' },
      { name: 'Government Welfare Package Mapping', desc: 'Binds admissions to official scheme package codes (e.g. PKG-ARG-MED) with pre-auth card validation and mandatory document checklists.' },
      { name: 'Claims Submission & Settlement Reconciliation', desc: 'Submits finalized claims with discharge summaries to payers and posts insurer remittances with write-offs or disallowance accounting.' }
    ],
    steps: [
      { step: 'Step 1: Create New Insurance Case', desc: 'Log in as tpa.desk. Open "Insurance Claims" -> "+ New Claim". Select Payer (e.g. Aarogyasri or Star Health). Enter Patient UHID and policy/card number.' },
      { step: 'Step 2: Submit Pre-Authorization Request', desc: 'Enter proposed diagnosis, estimated treatment cost, and requested package. Record pre-auth request reference and upload clinical summary.' },
      { step: 'Step 3: Record Payer Sanction / Approval', desc: 'Upon receiving approval from the insurer, enter Sanctioned Amount and Approval Number. The patient’s running bill automatically adjusts patient due vs. payer due.' },
      { step: 'Step 4: Final Claim Submission upon Discharge', desc: 'Once the patient is discharged with finalized clinical summary, click "Submit Final Claim" to dispatch documentation to the TPA portal.' },
      { step: 'Step 5: Record Insurer Settlement & Remittance', desc: 'Under "Receivables", locate the claim remittance. Enter amount received by bank transfer and record any approved disallowance or deduction.' }
    ]
  },
  {
    id: '06',
    code: 'medsupdt',
    deptName: 'Medical Superintendent (Clinical Governance)',
    filename: '06_Medical_Superintendent_Guide.docx',
    title: 'MGM HMS — Medical Superintendent Clinical Governance Guide',
    subtitle: 'Combined Clinical Census, ICU/ER Critical Load, Quality Compliance, Infection Control & Clinical Audit',
    login: ['Medical Superintendent', 'Dr. Venkata Ramana', 'med.supdt', 'Mgm@FADC3B19', 'medical_superintendent (20 Perms)', 'Clinical census, ICU/ER/OT occupancy, doctor performance, quality incidents, clinical audit trail, infection monitoring'],
    overview: 'The Medical Superintendent oversees hospital-wide clinical quality, patient safety, and medical governance. This login provides bird’s-eye clinical visibility into ward occupancy, emergency caseloads, surgical statistics, average length of stay (ALOS), and hospital incident logs.',
    integrations: [
      { name: 'Clinical Bed Census & Ward Occupancy', desc: 'Real-time overview of admitted patients across all wards, specialty breakdown, and occupancy percentages.' },
      { name: 'Critical Care & Emergency Oversight', desc: 'Live monitoring of Intensive Care Units (ICU, NICU, PICU) and Emergency casualty flow with priority triage distribution.' },
      { name: 'Quality, Incidents & Sentinel Event Logging', desc: 'Tracks hospital incident reporting, medication errors, adverse events, surgical complications, and corrective action plans.' },
      { name: 'Clinical Audit & Documentation Compliance', desc: 'Inspects doctor consultation completeness, discharge summary turnaround times, and statutory clinical record requirements.' }
    ],
    steps: [
      { step: 'Step 1: Review Hospital Clinical Census', desc: 'Log in as med.supdt. The clinical dashboard displays total admitted patients, active ICU beds, and emergency arrivals.' },
      { step: 'Step 2: Inspect Ward & Critical Care Distribution', desc: 'Open "Clinical Census". Filter by ICU, General Ward, or Maternity to inspect patient stay durations and attending consultants.' },
      { step: 'Step 3: Review Quality & Incident Reports', desc: 'Open "Quality & Incidents". Review any reported hospital incidents or clinical discrepancies submitted by department leads.' },
      { step: 'Step 4: Audit Clinical Documentation', desc: 'Inspect recent patient records to ensure signed consultation notes, completed eMAR records, and timely discharge summaries.' }
    ]
  },
  {
    id: '07',
    code: 'owner',
    deptName: 'Executive Management (Owner / Managing Director)',
    filename: '07_Executive_Owner_and_Director_Guide.docx',
    title: 'MGM HMS — Executive Management & Owner Guide',
    subtitle: 'Combined Revenue Analytics, Mode-Wise Collections, Outstanding Receivables, Occupancy & Profitability',
    login: ['Managing Director / Owner', 'Mr. Raghava Reddy', 'owner', 'Mgm@1C75D314', 'owner (20 Perms)', 'Revenue dashboard, collections by mode, patient receivables, bed occupancy %, department profitability, financial audit'],
    overview: 'Designed exclusively for hospital owners, Managing Directors, and board leadership. This executive suite delivers real-time strategic intelligence on daily revenues, cash/UPI/card collections, insurance receivables, bed occupancy rates, and overall hospital operational performance.',
    integrations: [
      { name: 'Executive Revenue Dashboard', desc: 'Live KPIs: Today’s Total Revenue, Collections vs. Billed, Net Patient Receivables, and Year-to-Date gross income.' },
      { name: 'Mode-Wise Collection Breakdown', desc: 'Instant reconciliation of physical Cash in Hand vs. Bank Card settlements vs. UPI Clearing balances with zero variance.' },
      { name: 'Bed Occupancy & Census Analytics', desc: 'Visual analytics on active inpatient occupancy rates across General Wards, Private Suites, and Intensive Care Units.' },
      { name: 'Departmental Revenue Contribution', desc: 'Financial performance segmented across Outpatient, Inpatient, Laboratory, Pharmacy, Operation Theatre, and Imaging.' }
    ],
    steps: [
      { step: 'Step 1: Review Executive Overview Dashboard', desc: 'Log in as owner. The primary screen displays today’s gross revenue, total collections, and active patient occupancy.' },
      { step: 'Step 2: Verify Collections by Payment Mode', desc: 'Inspect the financial summary to see exactly how much money was received via Cash, UPI (GPay/PhonePe), and Credit/Debit Cards.' },
      { step: 'Step 3: Review Outstanding Patient & Payer Receivables', desc: 'Open "Receivables". Review amounts pending from Self-Pay patients, government welfare schemes, and private insurance TPAs.' },
      { step: 'Step 4: Inspect Departmental Growth & Trends', desc: 'Review departmental analytics to evaluate patient footfall and income generation across Pharmacy, Diagnostics, and Surgery.' }
    ]
  },
  {
    id: '08',
    code: 'admin',
    deptName: 'Hospital Administration (Super Administrator)',
    filename: '08_Hospital_Administration_Guide.docx',
    title: 'MGM HMS — Hospital Administration & Governance Guide',
    subtitle: 'Combined Full System Control, Staff Management, 27 Roles & Permissions, Tariffs & Operating Mode',
    login: ['Hospital Administrator', 'Mrs. Lakshmi Prasanna', 'hosp.admin', 'Mgm@8235F729', 'admin (Full * Perms)', 'Full system administration, users, roles & permissions, tariff master, operating mode (Paperless/Paper), audit trail'],
    overview: 'The primary administrative console provides total institutional governance: configuring hospital-wide service tariffs, managing all 65 staff credentials, customizing permissions across 27 system roles, unlocking security-throttled accounts, and toggling operating modes.',
    integrations: [
      { name: 'Full Unrestricted System Access (*)', desc: 'Possesses master administrative privileges across every clinical, financial, inventory, and diagnostic screen.' },
      { name: 'Role-Based Access Control (RBAC)', desc: 'Configures custom security permissions across 27 hospital roles and 65 user accounts.' },
      { name: 'Service Tariff & Pricing Master', desc: 'Sets prices for consultations, bed tariffs, nursing charges, surgical packages, and diagnostic investigation tests.' },
      { name: 'Hospital Operating Mode Switcher', desc: 'Toggles institution between Paperless (Pure digital), Paper-Based (Paper prescription scans), and Hybrid operational modes.' },
      { name: 'Immutable System Audit Trail', desc: 'Maintains comprehensive before/after audit logs for all security changes, financial edits, and operational events.' }
    ],
    steps: [
      { step: 'Step 1: Access System Administration Console', desc: 'Log in as hosp.admin (or admin). The complete administrative navigation menu is unlocked with access to all 71 system screens.' },
      { step: 'Step 2: Manage Staff Users & Security', desc: 'Open "Administration" -> "Users". Add new staff members, update designations, or reset security lockouts if passwords are mistyped.' },
      { step: 'Step 3: Configure Service Tariffs & Price Lists', desc: 'Open "Tariff Master". Update consultation fees, bed charges, or diagnostic investigation rates.' },
      { step: 'Step 4: Configure Operating Mode', desc: 'Under "Settings", inspect "Hospital Operating Mode". Toggle between Paperless, Paper, or Hybrid workflows as required by hospital protocol.' },
      { step: 'Step 5: Review System Audit Logs', desc: 'Open "Audit Logs". Inspect user logins, clinical amendments, price changes, and financial cancellations with timestamps and user IDs.' }
    ]
  }
];

// ─── GENERATE 8 DEPARTMENTAL WORD DOCUMENTS ──────────────────────────────────
console.log('Generating 8 Departmental Word Documents (Single Login per Dept)...');

for (const sec of SECTIONS) {
  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1200, bottom: 1200, left: 1400, right: 1400 } },
      },
      children: [
        heading1(sec.title),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: sec.subtitle, bold: true, size: 22, color: COLOR_SECONDARY, font: FONT_FAMILY })],
        }),

        callout('Department Overview', sec.overview),
        new Paragraph({ spacing: { after: 150 } }),

        heading2('1. Single Department Login (Combined Access)'),
        para('Use this single verified account to operate all workflows for this department:'),
        createTable(
          ['Department Role', 'Employee Name', 'Login ID', 'Password', 'System Role', 'Combined Access Scope'],
          [sec.login]
        ),
        new Paragraph({ spacing: { after: 180 } }),

        heading2('2. Core Departmental Integrations'),
        para('This module connects seamlessly with other hospital operations through these key integrations:'),
        ...sec.integrations.map(int => bullet(int.desc, int.name + ':')),
        new Paragraph({ spacing: { after: 180 } }),

        heading2('3. Step-by-Step Operational Guide (How to Use)'),
        para('Follow this exact workflow during manual demonstration or live hospital operations:'),
        ...sec.steps.flatMap(st => [
          heading3(st.step),
          para(st.desc),
        ]),
        new Paragraph({ spacing: { after: 180 } }),

        heading2('4. Demo Day Tips & Operational Notes'),
        bullet('No account switching needed; this single login possesses all permissions for the entire department.', 'Single Login Architecture:'),
        bullet('All operations write immutable records to the audit log and maintain balanced financial ledger accounts.', 'Audit & Integrity:'),
        bullet('Runs cleanly on local deployment at http://localhost:4300 with zero external dependency.', 'Local Resilience:'),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(OUT_DIR, sec.filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`  ✓ Generated: ${sec.filename}`);
}

// ─── GENERATE MASTER COMBINED WORD DOCUMENT ───────────────────────────────────
console.log('\nGenerating Master Combined Word Document...');

const masterRows = SECTIONS.map(s => [
  s.deptName,
  s.login[1], // Employee Name
  s.login[2], // Login ID
  s.login[3], // Password
  s.login[4], // System Role
  s.login[5]  // Scope
]);

const masterChildren = [
  heading1('MGM Hospital Information System (MGM HMS)'),
  new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: 'Consolidated Single-Login Per Department Operational Manual', bold: true, size: 26, color: COLOR_SECONDARY, font: FONT_FAMILY })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: 'One Combined Login Per Department · Live Demonstration & Hospital Staff Training Manual · October 2026', italics: true, size: 20, color: COLOR_MUTED, font: FONT_FAMILY })],
  }),

  callout('Single-Login Departmental Architecture',
    'To streamline live demonstration and day-to-day operations, all fragmented staff accounts have been consolidated into ' +
    'EXACTLY ONE LOGIN PER DEPARTMENT. Each department account is imbued with full combined permissions, allowing the presenter ' +
    'or staff member to execute all front-to-back workflows (e.g. Reception registers AND bills; Doctor consults AND discharges; ' +
    'Lab Technician enters AND verifies reports; Pharmacy dispenses AND manages stock) without logging out or switching credentials.'
  ),
  new Paragraph({ spacing: { after: 200 } }),

  heading2('Master Key Logins — Exactly One Per Department'),
  para('The 8 official master departmental accounts for live demonstration and hospital operations:'),
  createTable(
    ['Department', 'Staff Name', 'Login ID', 'Password', 'System Role', 'Combined Department Scope'],
    masterRows
  ),
  new Paragraph({ spacing: { after: 240 } }),
];

// Append every section into the Master Document
for (const sec of SECTIONS) {
  masterChildren.push(
    heading1(`Department ${sec.id}: ${sec.deptName}`),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: sec.subtitle, bold: true, size: 22, color: COLOR_SECONDARY, font: FONT_FAMILY })],
    }),
    callout(`${sec.deptName} Scope & Overview`, sec.overview),
    new Paragraph({ spacing: { after: 120 } }),

    heading2(`Official Department Login — ${sec.code.toUpperCase()}`),
    createTable(
      ['Department Role', 'Employee Name', 'Login ID', 'Password', 'System Role', 'Combined Access Scope'],
      [sec.login]
    ),
    new Paragraph({ spacing: { after: 140 } }),

    heading2(`Core Integrations — ${sec.code.toUpperCase()}`),
    ...sec.integrations.map(int => bullet(int.desc, int.name + ':')),
    new Paragraph({ spacing: { after: 140 } }),

    heading2(`Step-by-Step Walkthrough — ${sec.code.toUpperCase()}`),
    ...sec.steps.flatMap(st => [
      heading3(st.step),
      para(st.desc),
    ]),
    new Paragraph({ spacing: { after: 220 } })
  );
}

const masterDoc = new Document({
  sections: [{
    properties: {
      page: { margin: { top: 1200, bottom: 1200, left: 1400, right: 1400 } },
    },
    children: masterChildren,
  }],
});

const masterBuffer = await Packer.toBuffer(masterDoc);
const masterOutPath = path.join(OUT_DIR, 'MGM_HMS_SINGLE_LOGIN_DEMO_MANUAL.docx');
fs.writeFileSync(masterOutPath, masterBuffer);
console.log(`  ✓ Generated Master Document: MGM_HMS_SINGLE_LOGIN_DEMO_MANUAL.docx`);

console.log(`\nAll Word documents generated successfully in: ${OUT_DIR}`);
