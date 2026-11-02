import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:4300';
const LEDGER_FILE = 'qa-reports/2026-11-02/final-acceptance/SUR-8-block-1-ledger.json';

const TEST_PATIENTS = Array.from({ length: 10 }, (_, i) => ({
  marker: `TEST-MGM-QA-${String(i + 1).padStart(3, '0')}`,
  name: `Test Patient ${String(i + 1).padStart(2, '0')}`,
  gender: i % 2 === 0 ? 'Male' : 'Female',
  age: 30 + (i * 2),
  mobile: `9876543${String(i).padStart(3, '0')}`
}));

async function loginReception(page, credentials) {
  console.log('Navigating to login...');
  await page.goto(`${BASE_URL}/login`);
  
  // Wait for form - use correct selectors
  console.log('Waiting for login form...');
  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  
  console.log('Filling credentials...');
  await page.fill('input[name="username"]', credentials.username);
  await page.fill('input[name="password"]', credentials.password);
  
  console.log('Submitting login...');
  await page.click('button:has-text("Sign in")');
  
  // Wait for dashboard
  console.log('Waiting for dashboard...');
  await page.waitForURL(`${BASE_URL}/**`, { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log('✓ Login successful');
}

async function createPatient(page, patient, index) {
  try {
    console.log(`\n[${index + 1}/10] Creating ${patient.marker}...`);
    
    // Navigate to Patients
    await page.goto(`${BASE_URL}/patients`);
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    console.log('  Patients page loaded');
    
    // Find and click New Patient button
    const newBtn = await page.$('button:has-text("New patient")') || 
                   await page.$('text=/new patient/i') ||
                   await page.$('[data-action="new-patient"]');
    
    if (!newBtn) {
      // Try to find by aria-label
      const allButtons = await page.locator('button').all();
      for (const btn of allButtons) {
        const text = await btn.textContent();
        if (text && text.toLowerCase().includes('new patient')) {
          await btn.click();
          break;
        }
      }
    } else {
      await newBtn.click();
    }
    
    console.log('  Opened registration form');
    
    // Wait for form modal
    await page.waitForSelector('input[name="name"]', { timeout: 5000 });
    
    // Fill form with marker in name
    const fullName = `${patient.marker} - ${patient.name}`;
    await page.fill('input[name="name"]', fullName);
    console.log(`  Filled name: ${fullName}`);
    
    // Fill gender
    const genderSelect = await page.$('select[name="gender"]');
    if (genderSelect) {
      await genderSelect.selectOption(patient.gender);
      console.log(`  Selected gender: ${patient.gender}`);
    }
    
    // Fill age
    await page.fill('input[name="age_years"]', String(patient.age));
    console.log(`  Filled age: ${patient.age}`);
    
    // Fill mobile
    await page.fill('input[name="mobile"]', patient.mobile);
    console.log(`  Filled mobile: ${patient.mobile}`);
    
    // Submit form
    const submitBtn = await page.$('button[data-save]') || 
                     await page.$('button:has-text("Create UHID")');
    
    if (!submitBtn) {
      throw new Error('Submit button not found');
    }
    
    await submitBtn.click();
    console.log('  Submitted form');
    
    // Wait for response
    await page.waitForTimeout(2000);
    
    // Try to capture patient ID
    let patientId = null;
    try {
      const currentUrl = page.url();
      const match = currentUrl.match(/patients\/(\d+)/);
      if (match) {
        patientId = match[1];
        console.log(`  ✓ Created (ID: ${patientId})`);
      }
    } catch (e) {
      console.log('  Created (ID unknown)');
    }
    
    // Close modal
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch {}
    
    return {
      marker: patient.marker,
      name: patient.name,
      status: 'registered',
      patientId: patientId || 'generated',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return {
      marker: patient.marker,
      name: patient.name,
      status: 'failed',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function main() {
  const credentials = {
    username: process.env.RECEPTION_LOGIN || 'reception',
    password: process.env.RECEPTION_PASSWORD
  };
  
  if (!credentials.password) {
    console.error('ERROR: Set RECEPTION_PASSWORD environment variable');
    process.exit(1);
  }
  
  const browser = await chromium.launch({ 
    channel: 'chrome',
    headless: false 
  });
  
  const page = await browser.newPage();
  const results = [];
  
  try {
    console.log('=== Block 1 Patient Registration ===\n');
    await loginReception(page, credentials);
    
    console.log('\n=== Creating 10 test patients ===');
    for (let i = 0; i < TEST_PATIENTS.length; i++) {
      const result = await createPatient(page, TEST_PATIENTS[i], i);
      results.push(result);
    }
    
    // Save ledger
    const ledgerDir = 'qa-reports/2026-11-02/final-acceptance';
    if (!fs.existsSync(ledgerDir)) {
      fs.mkdirSync(ledgerDir, { recursive: true });
    }
    
    const ledgerPath = path.join(ledgerDir, 'SUR-8-block-1-ledger.json');
    fs.writeFileSync(ledgerPath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Ledger saved to ${ledgerPath}`);
    
    const success = results.filter(r => r.status === 'registered').length;
    console.log(`\n=== Summary: ${success}/10 patients created ===`);
    
    if (success === 10) {
      console.log('✓ Block 1 complete - all patients registered');
      process.exit(0);
    } else {
      console.log(`! ${10 - success} patients failed`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
