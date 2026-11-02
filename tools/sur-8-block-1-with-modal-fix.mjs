#!/usr/bin/env node
/**
 * SUR-8 Block 1: Patient registration with modal dialog handling
 * Register 10 synthetic test patients (TEST-MGM-QA-001 to 010)
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const SERVER_URL = 'http://127.0.0.1:4388';
const RECEPTION_LOGIN = 'reception';
const RECEPTION_PASSWORD = 'Reception@123';
const TEST_MARKERS = Array.from({ length: 10 }, (_, i) =>
  `TEST-MGM-QA-${String(i + 1).padStart(3, '0')}`
);

console.log('=== SUR-8 Block 1: Patient Registration (10 patients) ===\n');
console.log(`Markers: ${TEST_MARKERS.join(', ')}\n`);

const resultsDir = 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance';
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const results = [];
let successCount = 0;
let failCount = 0;

// Helper to close any open modal
const closeModal = async (p, timeout = 2000) => {
  try {
    const closeBtn = p.locator('[data-close]');
    if (await closeBtn.count() > 0) {
      await closeBtn.click({ timeout: 1000 }).catch(() => {});
    }
  } catch {}

  try {
    // Try pressing Escape
    await p.keyboard.press('Escape');
  } catch {}

  await p.waitForTimeout(500);
};

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
  console.log('✓ Page loaded\n');

  // 3. Register each patient
  for (let i = 0; i < TEST_MARKERS.length; i++) {
    const marker = TEST_MARKERS[i];
    console.log(`[${i + 1}/${TEST_MARKERS.length}] Registering ${marker}...`);

    const result = {
      marker,
      timestamp: new Date().toISOString(),
      patientId: null,
      uhid: null,
      status: 'pending',
      error: null,
    };

    try {
      // Close any existing modal
      await closeModal(page);

      // Make sure we're on the patients page
      if (i > 0 && !page.url().includes('/patients')) {
        console.log('  - Navigating back to patients page...');
        await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
      }

      // Click "New patient" button
      console.log('  - Clicking "New patient"...');
      const newPatientBtn = await page.locator('button:has-text("New patient")').first();

      if (await newPatientBtn.count() === 0) {
        throw new Error('New patient button not found');
      }

      await newPatientBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1500);

      // Wait for form to appear
      const nameInput = await page.locator('input[placeholder*="name" i], input[placeholder*="patient" i]').first();
      if (await nameInput.count() === 0) {
        throw new Error('Name input not found in form');
      }

      // Fill form
      const patientName = `${marker} Test`;
      await nameInput.fill(patientName);
      console.log(`    Name: "${patientName}"`);

      // Fill phone
      const phoneInputs = await page.locator('input[type="tel"], input[placeholder*="phone" i]');
      if (await phoneInputs.count() > 0) {
        const phone = `98${String(i + 1).padStart(9, '0')}`;
        await phoneInputs.first().fill(phone);
        console.log(`    Phone: ${phone}`);
      }

      // Submit
      const submitBtn = await page.locator('button:has-text("Register"), button:has-text("Save"), button:has-text("Create")').first();
      if (await submitBtn.count() === 0) {
        throw new Error('Submit button not found');
      }

      console.log('  - Submitting form...');
      await submitBtn.click();
      await page.waitForTimeout(2000);

      // Extract patient ID from URL
      const currentUrl = page.url();
      const urlMatch = currentUrl.match(/patient[s]?\/(\d+)/i);
      if (urlMatch) {
        result.patientId = urlMatch[1];
      }

      // Look for UHID in page text
      const bodyText = await page.locator('body').textContent();
      if (bodyText) {
        const uhidMatch = bodyText.match(/UHID[:\s]+([A-Z0-9-]+)/i);
        if (uhidMatch) {
          result.uhid = uhidMatch[1];
        }
      }

      result.status = 'registered';
      successCount++;
      console.log(`  ✓ Patient ID: ${result.patientId}, UHID: ${result.uhid || 'pending'}\n`);

    } catch (err) {
      result.status = 'failed';
      result.error = err.message;
      failCount++;
      console.log(`  ✗ Error: ${err.message}\n`);

      // Take error screenshot
      try {
        await page.screenshot({
          path: `${resultsDir}/error-${marker}.png`,
        });
      } catch {}
    }

    results.push(result);
  }

  // Summary
  console.log('=== Registration Summary ===');
  console.log(`Registered: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${TEST_MARKERS.length}\n`);

  // Save results
  const ledger = {
    campaignId: 'SUR-8-Block-1',
    timestamp: new Date().toISOString(),
    results,
    summary: {
      total: TEST_MARKERS.length,
      registered: successCount,
      failed: failCount,
    }
  };

  fs.writeFileSync(
    `${resultsDir}/SUR-8-block-1-ledger.json`,
    JSON.stringify(ledger, null, 2)
  );
  console.log('✓ Ledger saved: SUR-8-block-1-ledger.json');

  // Final screenshot
  try {
    await page.screenshot({ path: `${resultsDir}/block-1-final.png`, fullPage: true });
    console.log('✓ Screenshot: block-1-final.png');
  } catch {}

} catch (err) {
  console.error('Fatal error:', err.message);
  results.push({
    marker: 'FATAL_ERROR',
    status: 'failed',
    error: err.message,
    timestamp: new Date().toISOString()
  });
  failCount++;
} finally {
  await browser.close();

  // Output final results
  console.log('\nFinal Results:');
  console.log(JSON.stringify({
    total: TEST_MARKERS.length,
    registered: successCount,
    failed: failCount,
    timestamp: new Date().toISOString()
  }, null, 2));

  process.exit(failCount === 0 ? 0 : 1);
}
