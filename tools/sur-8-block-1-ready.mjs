/**
 * SUR-8 Block 1 Patient Registration (TEST-MGM-QA-001 to 010)
 * Executes after rate limiter expires
 * Uses actual port 4300 per owner authorization
 */

import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:4300';
const LEDGER_FILE = 'qa-reports/2026-11-02/final-acceptance/SUR-8-block-1-ledger.json';

// Test patients to create
const TEST_PATIENTS = Array.from({ length: 10 }, (_, i) => ({
  marker: `TEST-MGM-QA-${String(i + 1).padStart(3, '0')}`,
  name: `Test Patient ${String(i + 1).padStart(2, '0')}`,
  gender: i % 2 === 0 ? 'Male' : 'Female',
  age: 30 + (i * 2),
  mobile: `9876543${String(i).padStart(3, '0')}`
}));

async function loginReception(page, credentials) {
  await page.goto(`${BASE_URL}/login`);
  
  // Wait for login form
  await page.waitForSelector('input[name="user_name"]', { timeout: 5000 });
  
  // Fill credentials
  await page.fill('input[name="user_name"]', credentials.user_name);
  await page.fill('input[name="password"]', credentials.password);
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for dashboard
  await page.waitForURL(`${BASE_URL}/*`, { timeout: 10000 });
  console.log('✓ Login successful');
}

async function createPatient(page, patient) {
  try {
    // Navigate to Patients page
    await page.goto(`${BASE_URL}/patients`);
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    // Click "New patient" button
    const newBtn = await page.$('text=New patient') || await page.$('[data-action="new-patient"]');
    if (!newBtn) {
      throw new Error('New patient button not found');
    }
    await newBtn.click();
    
    // Wait for form modal
    await page.waitForSelector('input[name="name"]', { timeout: 5000 });
    
    // Fill form
    await page.fill('input[name="name"]', `${patient.marker} - ${patient.name}`);
    
    const genderSelect = await page.$('select[name="gender"]');
    if (genderSelect) {
      await genderSelect.selectOption(patient.gender);
    }
    
    await page.fill('input[name="age_years"]', String(patient.age));
    await page.fill('input[name="mobile"]', patient.mobile);
    
    // Submit (look for button with data-save or Create UHID text)
    const submitBtn = await page.$('button[data-save]') || 
                     await page.$('button:has-text("Create UHID")');
    if (!submitBtn) {
      throw new Error('Submit button not found');
    }
    await submitBtn.click();
    
    // Wait for success/response
    await page.waitForTimeout(1000);
    
    // Try to capture patient ID from URL or response
    let patientId = null;
    const currentUrl = page.url();
    const match = currentUrl.match(/patients\/(\d+)/);
    if (match) {
      patientId = match[1];
    }
    
    // Close modal if still open (press Escape)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    return {
      marker: patient.marker,
      name: patient.name,
      status: 'registered',
      patientId,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`✗ Failed to create ${patient.marker}:`, error.message);
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
    user_name: process.env.RECEPTION_LOGIN || 'reception',
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
    // Login
    console.log('Logging in as reception...');
    await loginReception(page, credentials);
    
    // Create 10 patients
    console.log('\nCreating 10 test patients...');
    for (const patient of TEST_PATIENTS) {
      console.log(`Creating ${patient.marker}...`);
      const result = await createPatient(page, patient);
      results.push(result);
      console.log(`  ${result.status}${result.patientId ? ` (ID: ${result.patientId})` : ''}`);
    }
    
    // Save ledger
    const ledgerDir = 'qa-reports/2026-11-02/final-acceptance';
    if (!fs.existsSync(ledgerDir)) {
      fs.mkdirSync(ledgerDir, { recursive: true });
    }
    
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(results, null, 2));
    console.log(`\n✓ Ledger saved to ${LEDGER_FILE}`);
    
    // Summary
    const success = results.filter(r => r.status === 'registered').length;
    console.log(`\nSummary: ${success}/10 patients created`);
    
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
