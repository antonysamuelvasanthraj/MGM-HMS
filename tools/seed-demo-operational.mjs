import { db, all, insert, get, tx, localStamp } from '../server/db.js';
import { postVoucher } from '../server/accounting.js';

const D = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return localStamp(d).slice(0, 10);
};

export function seedDemoOperational() {
  tx(() => {
    // 1. Payers
    const payersList = [
      { code: 'STAR', name: 'Star Health Insurance', payer_type: 'insurance', credit_days: 30, discount_pct: 0, contact_person: 'Mr. Rajesh TPA', phone: '9848011223', email: 'claims@starhealth.demo' },
      { code: 'ARG', name: 'Aarogyasri Health Care Trust', payer_type: 'aarogyasri', credit_days: 45, discount_pct: 0, contact_person: 'Govt Aarogyasri Cell', phone: '18005991111', email: 'aarogyasri@telangana.gov.demo' },
      { code: 'CORP', name: 'TCS Corporate Healthcare', payer_type: 'corporate', credit_days: 30, discount_pct: 5, contact_person: 'HR Medical Officer', phone: '9848099887', email: 'corp.claims@tcs.demo' },
      { code: 'TRUST', name: 'MGM Lions Charity Trust', payer_type: 'trust', credit_days: 15, discount_pct: 10, contact_person: 'Trust Manager', phone: '9848055443', email: 'charity@mgmtrust.demo' },
    ];
    const payerMap = {};
    for (const p of payersList) {
      let existing = get('SELECT id FROM payers WHERE code=?', p.code);
      if (!existing) {
        const id = insert('payers', p);
        payerMap[p.code] = id;
      } else {
        payerMap[p.code] = existing.id;
      }
    }

    // 2. Packages
    const pkgList = [
      { code: 'PKG-FEV', name: 'Fever Diagnostic Package', category: 'opd', price: 1200, mrp: 1500, validity_days: 7, description: 'CBC + RBS + Urine + Consultation' },
      { code: 'PKG-IPD', name: 'Inpatient Medical Care Package (3 Days)', category: 'ipd', price: 12500, mrp: 15000, los_days: 3, validity_days: 30, description: '3 Days Ward Stay + Nursing Care + Physician Visits' },
      { code: 'PKG-ARG-MED', name: 'Aarogyasri Medical IP Scheme', category: 'ipd', price: 10000, mrp: 10000, payer_id: payerMap.ARG, payer_code: 'ARG', los_days: 3, validity_days: 30, description: 'State Scheme General Ward Medical Admission' },
    ];
    for (const pkg of pkgList) {
      if (!get('SELECT id FROM packages WHERE code=?', pkg.code)) {
        insert('packages', pkg);
      }
    }

    // 3. Suppliers
    const suppliersList = [
      { code: 'SUP001', name: 'Medlife Distributors Pvt Ltd', contact: 'Kishore Kumar', gstin: '36AAACM1234F1Z1', credit_days: 30, state: 'Telangana' },
      { code: 'SUP002', name: 'Apollo Health Supply Co', contact: 'Venkat Rao', gstin: '36AAACA5678K1Z2', credit_days: 30, state: 'Telangana' },
    ];
    const supMap = {};
    for (const s of suppliersList) {
      let existing = get('SELECT id FROM suppliers WHERE code=?', s.code);
      if (!existing) {
        const id = insert('suppliers', s);
        supMap[s.code] = id;
      } else {
        supMap[s.code] = existing.id;
      }
    }

    // 4. Doctor Schedules
    const doctors = all("SELECT id, username FROM users WHERE role='doctor'");
    for (const doc of doctors) {
      const existing = all('SELECT id FROM doctor_schedules WHERE doctor_id=?', doc.id);
      if (!existing.length) {
        for (let wd = 1; wd <= 6; wd++) {
          insert('doctor_schedules', {
            doctor_id: doc.id,
            weekday: wd,
            start_time: '09:00',
            end_time: '14:00',
            room: 'OPD-101',
            slot_minutes: 15,
            max_tokens: 50,
          });
        }
      }
    }

    // 5. Clinical Templates
    const docUser = get("SELECT id FROM users WHERE username='demo.doctor'") || get("SELECT id FROM users WHERE role='doctor' LIMIT 1");
    const adminUser = get("SELECT id FROM users WHERE username='admin'");
    const tplList = [
      { owner_id: docUser?.id || adminUser?.id, scope: 'hospital', kind: 'consultation', name: 'Acute Febrile Illness', body: 'Chief Complaints:\n- High grade fever with chills x 3 days\n- Generalized body ache and headache\n- Nausea and loss of appetite\n\nClinical Examination:\n- Temp: 101.8 F, PR: 92/min regular, BP: 120/80 mmHg, SpO2: 98% room air\n- Systemic: CVS S1 S2 heard, RS: Clear bilaterally, P/A: Soft, non-tender\n\nProvisional Diagnosis:\n- Acute Febrile Illness / Suspected Viral Infection\n\nPlan & Advice:\n- CBC, Random Blood Sugar, Urine Routine\n- Adequate oral hydration, rest, monitor temperature' },
      { owner_id: docUser?.id || adminUser?.id, scope: 'hospital', kind: 'prescription', name: 'Standard Fever Rx', body: 'Tab Paracetamol 650 mg — 1-1-1 x 3 days\nTab Pantoprazole 40 mg — 1-0-0 (before food) x 5 days\nTab Cetirizine 10 mg — 0-0-1 x 5 days\nORS Sachet — 1 sachet in 1 Litre water as needed' },
      { owner_id: adminUser?.id, scope: 'hospital', kind: 'certificate', name: 'Medical Fitness Certificate', body: 'This is to certify that Mr./Ms. {{patient_name}}, aged {{age}} years, resident of {{city}}, has been clinically examined by me today and is found medically fit to resume normal duties.' },
    ];
    for (const t of tplList) {
      if (!get('SELECT id FROM templates WHERE name=?', t.name)) {
        insert('templates', { ...t, uses: 0 });
      }
    }

    // 6. Medicines & Opening Stock
    const medList = [
      ['MED001', 'Paracetamol 650 mg', 'Paracetamol', 'tablet', '650 mg', 'Dolo 650', 'Micro Labs', 12, 'strip', 'tablet', 'strip', 10, 15, 1.2, 2.1, 100, 1000, 200, 50, 50, 50],
      ['MED002', 'Amoxicillin 500 mg', 'Amoxicillin', 'capsule', '500 mg', 'Mox 500', 'Sun Pharma', 12, 'strip', 'capsule', 'strip', 10, 10, 4.5, 7.8, 60, 500, 100, 20, 20, 20],
      ['MED003', 'Pantoprazole 40 mg', 'Pantoprazole', 'tablet', '40 mg', 'Pan 40', 'Alkem', 12, 'strip', 'tablet', 'strip', 10, 15, 3.2, 9.5, 60, 600, 150, 30, 30, 30],
      ['MED004', 'Cetirizine 10 mg', 'Cetirizine', 'tablet', '10 mg', 'Okacet', 'Cipla', 12, 'strip', 'tablet', 'strip', 10, 10, 0.9, 1.8, 60, 400, 80, 20, 20, 20],
      ['MED005', 'ORS Sachet', 'Oral rehydration salts', 'powder', '21.8 g', 'Electral', 'FDC', 12, 'box', 'sachet', 'sachet', 1, 25, 14.0, 22.0, 30, 200, 50, 20, 20, 20],
      ['MED006', 'Ondansetron 2 mg/ml Inj', 'Ondansetron', 'injection', '2 ml', 'Emeset', 'Cipla', 12, 'box', 'ampoule', 'ampoule', 1, 10, 6.5, 14.0, 20, 150, 20, 30, 30, 20],
      ['MED007', 'Ceftriaxone 1g Inj', 'Ceftriaxone', 'injection', '1 g', 'Monocef 1g', 'Aristo', 12, 'vial', 'vial', 'vial', 1, 1, 35.0, 65.0, 20, 100, 20, 30, 30, 20],
      ['MED008', 'Tramadol 50 mg Inj', 'Tramadol', 'injection', '2 ml', 'Tramazac', 'Zydus', 12, 'box', 'ampoule', 'ampoule', 1, 10, 12.0, 28.0, 15, 100, 10, 25, 25, 15],
      ['CON001', 'IV Cannula 20G', 'IV Cannula', 'consumable', '20G', 'Venflon', 'BD', 12, 'box', 'piece', 'piece', 1, 50, 28.0, 65.0, 20, 200, 20, 40, 40, 30],
      ['CON002', 'Normal Saline 500ml', '0.9% Sodium Chloride', 'infusion', '500 ml', 'NS 500ml', 'Baxter', 12, 'bottle', 'bottle', 'bottle', 1, 1, 22.0, 45.0, 30, 150, 20, 30, 30, 20],
    ];

    const expiry = D(540);
    let totalOpeningValue = 0;

    for (const [code, name, generic, form, strength, brand, manufacturer, gst, pu, du, pt, ps, upp, rate, mrp, reorder, central, op, er, icu, ward] of medList) {
      let med = get('SELECT id FROM medicines WHERE code=?', code);
      let mid = med?.id;
      if (!mid) {
        mid = insert('medicines', {
          code, name, generic, form, strength, brand, manufacturer,
          schedule: form === 'consumable' ? 'OTC' : (code === 'MED008' ? 'H1' : 'H'),
          hsn: form === 'consumable' ? '9018' : '3004',
          gst_pct: gst, default_cgst_pct: gst / 2, default_sgst_pct: gst / 2,
          reorder_level: reorder,
          purchase_unit: pu, dispensing_unit: du, package_type: pt, pack_size: ps, units_per_pack: upp,
          kind: form === 'consumable' ? 'consumable' : 'medicine',
          rack: 'A1',
        });
      }

      const locations = [
        ['Central', central],
        ['OP', op],
        ['ER', er],
        ['ICU', icu],
        ['Ward', ward],
      ];

      for (const [loc, qty] of locations) {
        if (!qty) continue;
        const existingBatch = get('SELECT id FROM medicine_batches WHERE medicine_id=? AND batch_no=? AND location=?', mid, `OPN-${code}`, loc);
        if (!existingBatch) {
          const bid = insert('medicine_batches', {
            medicine_id: mid,
            batch_no: `OPN-${code}`,
            expiry,
            mrp,
            selling_price: mrp,
            purchase_rate: rate,
            qty,
            location: loc,
            supplier_id: supMap.SUP001 || null,
            rack: loc === 'Central' ? 'A1' : loc,
          });
          insert('stock_moves', {
            medicine_id: mid,
            batch_id: bid,
            location: loc,
            move_type: 'opening',
            qty,
            balance_after: qty,
            ref_type: 'opening',
            reason: 'Opening stock demo initialization',
          });
          totalOpeningValue += qty * rate;
        }
      }
    }

    if (totalOpeningValue > 0) {
      const roundedVal = Math.round(totalOpeningValue * 100) / 100;
      postVoucher({
        type: 'JV',
        source: 'opening',
        narration: 'Opening pharmacy stock demo initialization',
        lines: [
          { account: 'inventory_pharmacy', debit: roundedVal, segment: 'PHARMACY' },
          { account: 'opening_equity', credit: roundedVal },
        ],
      });
    }
  });

  console.log('Operational demo masters seeded successfully.');
}

if (process.argv[1]?.endsWith('seed-demo-operational.mjs')) {
  seedDemoOperational();
}
