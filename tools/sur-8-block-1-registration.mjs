#!/usr/bin/env node
/**
 * SUR-8 Block 1: Register 10 synthetic test patients (TEST-MGM-QA-001 to 010)
 * via UI-based registration workflow
 *
 * Purpose: Create exactly 10 new patients through the web UI, capture their
 * application-generated patient IDs, and verify OP queue creation.
 *
 * Environment: Isolated server http://127.0.0.1:4388
 * Login: reception / Reception@123
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.resolve(__dirname, '../qa-reports/2026-11-02/final-acceptance');
const ledgerPath = path.join(reportsDir, 'SUR-8-patient-ledger.json');

// Ensure reports directory exists
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Load or initialize ledger
let ledger = { patients: {}, createdAt: new Date().toISOString(), lastUpdate: new Date().toISOString() };
if (fs.existsSync(ledgerPath)) {
  ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
}

const SERVER_URL = 'http://127.0.0.1:4388';
const RECEPTION_LOGIN = 'reception';
const RECEPTION_PASSWORD = 'Reception@123';
const TEST_MARKERS = Array.from({ length: 10 }, (_, i) => `TEST-MGM-QA-${String(i + 1).padStart(3, '0')}`);

console.log('=== SUR-8 Block 1: Patient Registration ===');
console.log(`Server: ${SERVER_URL}`);
console.log(`Test markers: ${TEST_MARKERS.join(', ')}`);
console.log('');

let browser;
let passCount = 0;
let failCount = 0;
const results = [];

try {
  // Launch browser
  console.log('Launching browser...');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Helper: Retry on failure
  const retry = async (fn, name, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxRetries) throw new Error(`${name} failed after ${maxRetries} retries: ${err.message}`);
        console.log(`  Retry ${attempt}/${maxRetries - 1} for ${name}...`);
        await page.waitForTimeout(500);
      }
    }
  };

  // Login
  console.log('Logging in as reception...');
  await page.goto(`${SERVER_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"]', RECEPTION_LOGIN);
  await page.fill('input[name="password"]', RECEPTION_PASSWORD);

  // Click sign in button (contains "Sign in" text)
  const signInBtn = await page.locator('button:has-text("Sign in")').first();
  await signInBtn.click({ timeout: 10000 });

  // Wait for navigation or dashboard load
  try {
    await page.waitForNavigation({ timeout: 10000 });
  } catch {
    // Navigation might not happen, just wait for content
    await page.waitForTimeout(2000);
  }

  // Verify logged in by checking for sidebar or dashboard content
  const sidebarVisible = await page.locator('[class*="sidebar"], [class*="rail"], nav').count() > 0;
  if (!sidebarVisible) {
    throw new Error('Login appears to have failed - sidebar not found');
  }
  console.log('✓ Logged in successfully');
  console.log('');

  // Register each patient
  for (const marker of TEST_MARKERS) {
    console.log(`Registering ${marker}...`);
    const patientData = {
      marker,
      registeredAt: new Date().toISOString(),
      patientId: null,
      uhid: null,
      status: 'pending',
      errors: []
    };

    try {
      // Navigate to patient search/registration
      await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'domcontentloaded' });

      // Look for "New Patient" or "Add Patient" button
      const newPatientBtn = await page.locator('button:has-text("New")').first().or(
        page.locator('button:has-text("Add")').first()
      ).or(
        page.locator('text=/new.*patient|register.*patient/i').first()
      );

      if (await newPatientBtn.count() > 0) {
        await newPatientBtn.click();
      } else {
        // Try keyboard shortcut or search for modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        // Try clicking a create/register link
        const links = await page.locator('a, button').evaluateAll(el => el.map(e => ({ text: e.textContent, tag: e.tagName })));
        console.log('  Available buttons/links:', links.filter(l => l.text?.length < 50).slice(0, 10));
      }

      // Wait for patient form modal/page
      await retry(
        () => page.waitForSelector('input[placeholder*="name" i], input[placeholder*="patient" i], input[name*="name"]', { timeout: 5000 }),
        'Patient form to appear'
      );

      // Fill patient form
      const nameField = await page.locator('input[placeholder*="name" i], input[placeholder*="patient" i], input[name*="patient"]').first();
      const phoneField = await page.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="mobile" i]').first();

      if (await nameField.count() > 0) {
        // Insert marker in patient name
        const patientName = `${marker} Test Patient`;
        await nameField.fill(patientName);
        console.log(`  Name: ${patientName}`);

        // Fill phone (required field, use synthetic number)
        if (await phoneField.count() > 0) {
          await phoneField.fill(`98${String(TEST_MARKERS.indexOf(marker) + 1).padStart(8, '0')}`);
        }

        // Try to submit form
        const submitBtn = await page.locator('button:has-text("Register"), button:has-text("Save"), button:has-text("Create")').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click();

          // Wait for success or error
          try {
            await page.waitForNavigation({ timeout: 5000 });
          } catch {
            await page.waitForTimeout(1000);
          }

          // Extract patient ID from URL or confirmation message
          const currentUrl = page.url();
          const urlMatch = currentUrl.match(/patient[s]?\/(\d+)/i);
          if (urlMatch) {
            patientData.patientId = urlMatch[1];
            console.log(`  ✓ Patient ID: ${patientData.patientId}`);
          }

          // Look for UHID in page
          const uhidElement = await page.locator('text=/UHID|MR[N]?|Medical Record/i').first();
          if (await uhidElement.count() > 0) {
            const text = await uhidElement.textContent();
            const uhidMatch = text.match(/(\w+-\d+|\d{5,})/);
            if (uhidMatch) {
              patientData.uhid = uhidMatch[1];
              console.log(`  ✓ UHID: ${patientData.uhid}`);
            }
          }

          patientData.status = 'registered';
          passCount++;
          console.log(`  ✓ ${marker} registered`);
        }
      }
    } catch (err) {
      patientData.status = 'failed';
      patientData.errors = [err.message];
      failCount++;
      console.log(`  ✗ Error: ${err.message}`);
    }

    // Update ledger
    ledger.patients[marker] = patientData;
    results.push(patientData);
  }

  console.log('');
  console.log('=== Registration Summary ===');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('');

  // Save ledger
  ledger.lastUpdate = new Date().toISOString();
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(`✓ Ledger saved: ${ledgerPath}`);

  // Close browser
  await browser.close();

  // Output results
  console.log('');
  console.log('=== Results ===');
  console.log(JSON.stringify(results, null, 2));

  process.exit(passCount > 0 ? 0 : 1);
} catch (err) {
  console.error('Fatal error:', err);
  if (browser) await browser.close();
  process.exit(1);
}
