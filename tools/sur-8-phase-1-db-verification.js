/**
 * SUR-8 Phase 1: Database Verification
 * Verify all 50 test patients persisted in actual port 4300 application
 *
 * Usage: node tools/sur-8-phase-1-db-verification.js
 * Output: qa-reports/2026-11-02/final-acceptance/SUR-8-phase-1-verification.json
 *
 * Read-only verification only. No mutations.
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

// Configuration
const DB_PATH = 'data/app.db';
const REPORT_PATH = 'qa-reports/2026-11-02/final-acceptance/SUR-8-phase-1-verification.json';
const EXPECTED_PATIENTS = 50;
const TEST_MARKER_PREFIX = 'TEST-MGM-QA-';

// Expected verified blocks (from operator verification)
const VERIFIED_BLOCKS = {
  block1: {
    markers: Array.from({length: 10}, (_, i) => `TEST-MGM-QA-${String(i + 1).padStart(3, '0')}`),
    expectedIds: [4, 5, 8, 9, 10, 11, 12, 13, 14, 15],
    expectedUHIDPrefix: 'SHMS-2627-'
  },
  block2: {
    markers: Array.from({length: 10}, (_, i) => `TEST-MGM-QA-${String(i + 11).padStart(3, '0')}`),
    expectedIds: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
    expectedUHIDPrefix: 'SHMS-2627-'
  },
  block3: {
    markers: Array.from({length: 10}, (_, i) => `TEST-MGM-QA-${String(i + 21).padStart(3, '0')}`),
    expectedIds: null, // TBD after SUR-10 completes
    expectedUHIDPrefix: 'SHMS-2627-'
  },
  block4: {
    markers: Array.from({length: 10}, (_, i) => `TEST-MGM-QA-${String(i + 31).padStart(3, '0')}`),
    expectedIds: null, // TBD after SUR-11 completes
    expectedUHIDPrefix: 'SHMS-2627-'
  },
  block5: {
    markers: Array.from({length: 10}, (_, i) => `TEST-MGM-QA-${String(i + 41).padStart(3, '0')}`),
    expectedIds: null, // TBD after SUR-12 completes
    expectedUHIDPrefix: 'SHMS-2627-'
  }
};

async function verifyDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('Failed to open database:', err.message);
        reject(err);
        return;
      }

      console.log('✓ Database opened (read-only)');

      const verification = {
        timestamp: new Date().toISOString(),
        environment: 'http://127.0.0.1:4300',
        dbPath: DB_PATH,
        verification_type: 'phase_1_patient_persistence',
        blocks: {}
      };

      let completed = 0;
      let totalErrors = [];

      // Verify each block
      Object.entries(VERIFIED_BLOCKS).forEach(([blockName, blockConfig]) => {
        verifyBlock(db, blockName, blockConfig, (blockResult) => {
          verification.blocks[blockName] = blockResult;
          if (blockResult.error) {
            totalErrors.push({block: blockName, error: blockResult.error});
          }

          completed++;
          if (completed === Object.keys(VERIFIED_BLOCKS).length) {
            // All blocks verified
            const allPatients = Object.values(verification.blocks)
              .reduce((acc, block) => [...acc, ...(block.patients || [])], []);

            verification.summary = {
              total_patients_searched: 50,
              total_patients_found: allPatients.length,
              blocks_verified: Object.keys(VERIFIED_BLOCKS).length,
              blocks_complete: Object.values(verification.blocks)
                .filter(b => b.status === 'verified').length,
              all_verified: allPatients.length === 50,
              errors: totalErrors.length > 0 ? totalErrors : null
            };

            console.log('\n=== PHASE 1 DATABASE VERIFICATION COMPLETE ===');
            console.log(`Total patients found: ${allPatients.length}/50`);
            console.log(`Blocks verified: ${verification.summary.blocks_complete}/5`);

            if (verification.summary.all_verified) {
              console.log('✅ ALL 50 PATIENTS VERIFIED IN DATABASE');
            } else {
              console.log('⚠️  Some patients missing or blocks incomplete');
            }

            // Write report
            const reportDir = path.dirname(REPORT_PATH);
            if (!fs.existsSync(reportDir)) {
              fs.mkdirSync(reportDir, {recursive: true});
            }
            fs.writeFileSync(REPORT_PATH, JSON.stringify(verification, null, 2));
            console.log(`\nReport saved: ${REPORT_PATH}`);

            db.close();
            resolve(verification);
          }
        });
      });
    });
  });
}

function verifyBlock(db, blockName, blockConfig, callback) {
  const result = {
    block: blockName,
    markers_expected: blockConfig.markers.length,
    patients: [],
    errors: []
  };

  // Build query to find all test patients in this block
  const placeholders = blockConfig.markers.map(() => '?').join(',');
  const query = `
    SELECT id, full_name, uhid, gender, age_years, mobile, created_at
    FROM patients
    WHERE full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR full_name LIKE ?
    ORDER BY id ASC
  `;

  const params = blockConfig.markers.map(marker => `%${marker}%`);

  db.all(query, params, (err, rows) => {
    if (err) {
      result.error = `Database query failed: ${err.message}`;
      result.status = 'error';
      callback(result);
      return;
    }

    if (!rows || rows.length === 0) {
      result.status = 'not_found';
      result.error = 'No patients found with test markers in this block';
      callback(result);
      return;
    }

    // Verify each patient
    rows.forEach(patient => {
      const patientRecord = {
        id: patient.id,
        full_name: patient.full_name,
        uhid: patient.uhid,
        gender: patient.gender,
        age_years: patient.age_years,
        mobile: patient.mobile,
        created_at: patient.created_at,
        verification: {}
      };

      // Check marker in name
      const hasMarker = blockConfig.markers.some(m => patient.full_name.includes(m));
      patientRecord.verification.has_test_marker = hasMarker;

      // Check UHID prefix
      patientRecord.verification.uhid_prefix_correct = patient.uhid.startsWith(blockConfig.expectedUHIDPrefix);

      // If block has expected IDs, verify
      if (blockConfig.expectedIds) {
        patientRecord.verification.id_in_expected_range = blockConfig.expectedIds.includes(patient.id);
      }

      result.patients.push(patientRecord);
    });

    result.patients_found = result.patients.length;
    result.status = result.patients.length === blockConfig.markers.length ? 'verified' : 'partial';

    callback(result);
  });
}

// Run verification
verifyDatabase()
  .then(result => {
    process.exit(result.summary.all_verified ? 0 : 1);
  })
  .catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
