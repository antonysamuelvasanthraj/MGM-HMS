#!/usr/bin/env node
/**
 * SUR-8 Block 1: Simple patient registration test
 * Create first 3 test patients to verify the workflow
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const SERVER_URL = 'http://127.0.0.1:4388';
const RECEPTION_LOGIN = 'reception';
const RECEPTION_PASSWORD = 'Reception@123';
const TEST_MARKERS = ['TEST-MGM-QA-001', 'TEST-MGM-QA-002', 'TEST-MGM-QA-003'];

console.log('=== SUR-8 Block 1: Simple Patient Registration Test ===\n');

const resultsDir = 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance';
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const results = [];

try {
  // 1. Login
  console.log('Step 1: Logging in as reception...');
  await page.goto(`${SERVER_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"]', RECEPTION_LOGIN);
  await page.fill('input[name="password"]', RECEPTION_PASSWORD);
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(3000);
  console.log('✓ Logged in\n');

  // 2. Navigate to patients
  console.log('Step 2: Navigating to Patients page...');
  await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Verify page loaded
  const pageTitle = await page.locator('h1, h2').first().textContent();
  if (!pageTitle || !pageTitle.includes('Patient')) {
    throw new Error(`Patients page failed to load. Title: ${pageTitle}`);
  }
  console.log(`✓ Page loaded: "${pageTitle}"\n`);

  // 3. Register each test patient
  for (let i = 0; i < TEST_MARKERS.length; i++) {
    const marker = TEST_MARKERS[i];
    console.log(`Step 3.${i + 1}: Registering ${marker}...`);

    const result = {
      marker,
      timestamp: new Date().toISOString(),
      patientId: null,
      uhid: null,
      status: 'pending',
      error: null,
    };

    try {
      // Click "New patient" button
      const newPatientBtn = await page.locator('button:has-text("New patient")').first();
      if (await newPatientBtn.count() === 0) {
        throw new Error('New patient button not found');
      }

      console.log('  - Clicking "New patient" button...');
      await newPatientBtn.click();
      await page.waitForTimeout(1500);

      // Wait for modal/form to appear
      const formInputs = await page.locator('input[type="text"], input[placeholder*="name" i]').count();
      if (formInputs === 0) {
        throw new Error('No text input found in form');
      }

      console.log('  - Form appeared');

      // Find and fill patient name
      const nameInput = await page.locator('input[placeholder*="name" i], input[placeholder*="patient" i]').first();
      if (await nameInput.count() === 0) {
        throw new Error('Name input not found');
      }

      const patientName = `${marker} Test`;
      await nameInput.fill(patientName);
      console.log(`  - Name: "${patientName}"`);

      // Find and fill phone (required field)
      const phoneInputs = await page.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="mobile" i]');
      if (await phoneInputs.count() > 0) {
        const phone = `98${String(i + 1).padStart(9, '0')}`;
        await phoneInputs.first().fill(phone);
        console.log(`  - Phone: ${phone}`);
      }

      // Submit form
      console.log('  - Submitting form...');
      const submitBtn = await page.locator('button:has-text("Register"), button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")').first();
      if (await submitBtn.count() === 0) {
        throw new Error('Submit button not found');
      }

      await submitBtn.click();
      await page.waitForTimeout(2000);

      // Check for success
      const currentUrl = page.url();
      const urlMatch = currentUrl.match(/patient[s]?\/(\d+)/i);
      if (urlMatch) {
        result.patientId = urlMatch[1];
        console.log(`  - Patient ID: ${result.patientId}`);
      }

      // Look for UHID
      const uhidText = await page.locator('body').textContent();
      const uhidMatch = uhidText.match(/UHID[:\s]+([A-Z0-9-]+)/i);
      if (uhidMatch) {
        result.uhid = uhidMatch[1];
        console.log(`  - UHID: ${result.uhid}`);
      }

      result.status = 'registered';
      console.log(`✓ ${marker} registered\n`);
    } catch (err) {
      result.status = 'failed';
      result.error = err.message;
      console.log(`✗ Error: ${err.message}\n`);

      // Take screenshot of error state
      await page.screenshot({
        path: `${resultsDir}/error-${marker}.png`,
      });
    }

    results.push(result);
  }

  // 4. Summary
  console.log('=== Summary ===');
  const success = results.filter(r => r.status === 'registered').length;
  const failed = results.filter(r => r.status === 'failed').length;
  console.log(`Registered: ${success}`);
  console.log(`Failed: ${failed}`);

  // 5. Save results
  fs.writeFileSync(
    `${resultsDir}/SUR-8-block-1-results.json`,
    JSON.stringify(results, null, 2)
  );
  console.log(`\n✓ Results saved: SUR-8-block-1-results.json`);

  // Final screenshot
  await page.screenshot({ path: `${resultsDir}/final-page.png` });
  console.log('✓ Final screenshot: final-page.png');
} catch (err) {
  console.error('Fatal error:', err.message);
  results.push({ marker: 'FATAL', error: err.message, status: 'failed' });
} finally {
  await browser.close();

  // Output results as JSON for parsing
  console.log('\nResults:');
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.every(r => r.status === 'registered') ? 0 : 1);
}
