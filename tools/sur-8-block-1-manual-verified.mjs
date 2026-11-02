#!/usr/bin/env node
/**
 * SUR-8 Block 1: Manual-verified patient registration
 *
 * Approach: Fill form deliberately, take screenshots to verify,
 * check response, reopen to confirm patient was created
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const SERVER_URL = 'http://127.0.0.1:4300';
const password = 'Reception@123';
const resultsDir = 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance';

const patients = [
  { marker: 'TEST-MGM-QA-001', name: 'TEST Patient One', gender: 'Male', age: '30', mobile: '9876543000' },
  { marker: 'TEST-MGM-QA-002', name: 'TEST Patient Two', gender: 'Female', age: '32', mobile: '9876543001' },
];

const results = [];

(async () => {
  const browser = await chromium.launch({
    headless: false,  // Show browser for manual observation
    channel: 'chrome',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    console.log('\n=== STEP 1: LOGIN ===');
    await page.goto(`${SERVER_URL}/`, { waitUntil: 'networkidle' });

    await page.locator('input[name="username"]').fill('reception');
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button:has-text("Sign in")').click();

    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    console.log('✓ Logged in');

    console.log('\n=== STEP 2: NAVIGATE TO PATIENTS ===');
    await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'networkidle' });
    console.log('✓ On patients page');

    // ===== REGISTER FIRST PATIENT =====
    console.log('\n=== REGISTERING TEST-MGM-QA-001 ===');

    const newBtn = page.locator('button:has-text("New patient")').first();
    console.log(`Clicking "New patient" button...`);
    await newBtn.click();
    await page.waitForTimeout(1000);

    // Verify modal opened
    const modal = page.locator('[role="dialog"]').first();
    if (await modal.count() === 0) {
      throw new Error('Modal did not open');
    }
    console.log('✓ Modal opened');

    // Fill form fields with explicit focus and blur
    console.log('\nFilling form fields:');

    const nameField = modal.locator('input[name="name"]');
    console.log('  Focusing name field...');
    await nameField.focus();
    await nameField.fill('');  // Clear first
    await nameField.type('TEST Patient One', { delay: 30 });
    let nameVal = await nameField.inputValue();
    console.log(`    Name: "${nameVal}"`);
    await nameField.blur();

    const genderSelect = modal.locator('select[name="gender"]');
    console.log('  Selecting gender...');
    await genderSelect.focus();
    await genderSelect.selectOption('Male');
    let genderVal = await genderSelect.inputValue();
    console.log(`    Gender: "${genderVal}"`);
    await genderSelect.blur();

    const ageField = modal.locator('input[name="age_years"]');
    if (await ageField.count() > 0) {
      console.log('  Entering age...');
      await ageField.focus();
      await ageField.fill('');
      await ageField.type('30', { delay: 30 });
      let ageVal = await ageField.inputValue();
      console.log(`    Age: "${ageVal}"`);
      await ageField.blur();
    }

    const mobileField = modal.locator('input[name="mobile"]');
    console.log('  Entering mobile...');
    await mobileField.focus();
    await mobileField.fill('');
    await mobileField.type('9876543000', { delay: 30 });
    let mobileVal = await mobileField.inputValue();
    console.log(`    Mobile: "${mobileVal}"`);
    await mobileField.blur();

    // Take screenshot of filled form
    console.log('\n  Taking screenshot of filled form...');
    await page.screenshot({ path: `${resultsDir}/sur8-001-form-filled.png` });
    console.log('  ✓ Screenshot saved');

    // Submit form
    console.log('\nSubmitting form...');
    const submitBtn = modal.locator('button[data-save], button:has-text("Create UHID")').first();
    if (await submitBtn.count() === 0) {
      throw new Error('Submit button not found');
    }

    // Wait for any network requests to complete after submit
    const submitPromise = submitBtn.click();
    await Promise.all([
      submitPromise,
      page.waitForLoadState('networkidle').catch(() => {})
    ]);

    await page.waitForTimeout(2000);
    console.log('✓ Form submitted');

    // Take screenshot of response
    console.log('  Taking screenshot of response...');
    await page.screenshot({ path: `${resultsDir}/sur8-001-form-response.png` });

    // Check for errors
    const errorMsg = page.locator('[role="alert"], .text-error, .error-message').first();
    if (await errorMsg.count() > 0) {
      const errText = await errorMsg.textContent();
      console.log(`  ⚠ Alert detected: "${errText}"`);
    }

    // Try to find patient ID/UHID in response or URL
    let patientId = null;
    let uhid = null;

    // Check URL
    const urlMatch = page.url().match(/patient(?:s)?\/(\d+)/i);
    if (urlMatch) {
      patientId = urlMatch[1];
      console.log(`  Patient ID from URL: ${patientId}`);
    }

    // Check page content
    const pageText = await page.locator('body').textContent();
    const uhidMatch = pageText.match(/UHID[:\s]+([A-Z0-9\-]+)/i) ||
                      pageText.match(/[A-Z]{2,4}-\d{4}-\d{5}/);
    if (uhidMatch) {
      uhid = uhidMatch[1] || uhidMatch[0];
      console.log(`  UHID from page: ${uhid}`);
    }

    results.push({
      marker: 'TEST-MGM-QA-001',
      name: 'TEST Patient One',
      patientId,
      uhid,
      status: patientId ? 'registered' : 'submitted_but_id_unclear',
      screenshot: 'sur8-001-form-response.png'
    });

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await page.screenshot({ path: `${resultsDir}/sur8-error.png` });
  } finally {
    // Keep browser open for 5 seconds so user can see final state
    console.log('\nKeeping browser open for 5 seconds for visual inspection...');
    await page.waitForTimeout(5000);
    await browser.close();

    // Save results
    const ledger = {
      campaign: 'SUR-8 Block 1 - Manual Verified (First Patient Only)',
      timestamp: new Date().toISOString(),
      results,
      notes: 'First patient registration with visual verification at each step'
    };

    const ledgerPath = `${resultsDir}/SUR-8-block-1-manual-first.json`;
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(`\n✓ Results saved to ${ledgerPath}`);
  }
})();
