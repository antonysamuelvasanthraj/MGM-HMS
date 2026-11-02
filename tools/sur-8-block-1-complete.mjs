#!/usr/bin/env node
/**
 * SUR-8 Block 1: Complete 10-patient registration
 *
 * Uses proven method: focus/type with delay for form fill,
 * captures patient IDs from response URL
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const SERVER_URL = 'http://127.0.0.1:4300';
const password = 'Reception@123';
const resultsDir = 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance';

const patients = [
  { marker: 'TEST-MGM-QA-001', name: 'TEST Patient 001', gender: 'Male', age: '30', mobile: '9876543000' },
  { marker: 'TEST-MGM-QA-002', name: 'TEST Patient 002', gender: 'Female', age: '32', mobile: '9876543001' },
  { marker: 'TEST-MGM-QA-003', name: 'TEST Patient 003', gender: 'Male', age: '34', mobile: '9876543002' },
  { marker: 'TEST-MGM-QA-004', name: 'TEST Patient 004', gender: 'Female', age: '36', mobile: '9876543003' },
  { marker: 'TEST-MGM-QA-005', name: 'TEST Patient 005', gender: 'Male', age: '38', mobile: '9876543004' },
  { marker: 'TEST-MGM-QA-006', name: 'TEST Patient 006', gender: 'Female', age: '40', mobile: '9876543005' },
  { marker: 'TEST-MGM-QA-007', name: 'TEST Patient 007', gender: 'Male', age: '42', mobile: '9876543006' },
  { marker: 'TEST-MGM-QA-008', name: 'TEST Patient 008', gender: 'Female', age: '44', mobile: '9876543007' },
  { marker: 'TEST-MGM-QA-009', name: 'TEST Patient 009', gender: 'Male', age: '46', mobile: '9876543008' },
  { marker: 'TEST-MGM-QA-010', name: 'TEST Patient 010', gender: 'Female', age: '48', mobile: '9876543009' },
];

const results = [];
let successCount = 0;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SUR-8 Block 1: Complete 10-Patient Registration');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // LOGIN
    console.log('LOGIN: Connecting...');
    await page.goto(`${SERVER_URL}/`, { waitUntil: 'networkidle' });
    await page.locator('input[name="username"]').fill('reception');
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button:has-text("Sign in")').click();
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    console.log('✓ Logged in\n');

    // NAVIGATE TO PATIENTS PAGE
    await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'networkidle' });
    console.log('✓ On patients page\n');

    // REGISTER EACH PATIENT
    for (let i = 0; i < patients.length; i++) {
      const p = patients[i];
      console.log(`[${i + 1}/${patients.length}] ${p.marker}...`);

      const result = {
        ...p,
        patientId: null,
        uhid: null,
        status: 'pending',
        error: null,
        timestamp: new Date().toISOString()
      };

      try {
        // Close any existing modal
        try {
          await page.keyboard.press('Escape');
        } catch {}
        await page.waitForTimeout(300);

        // Click "New patient" button
        const newBtn = page.locator('button:has-text("New patient")').first();
        if (await newBtn.count() === 0) {
          throw new Error('New patient button not found');
        }
        await newBtn.click();
        await page.waitForTimeout(800);

        // Wait for modal
        const modal = page.locator('[role="dialog"]').first();
        if (await modal.count() === 0) {
          throw new Error('Modal did not open');
        }

        // Fill name
        const nameField = modal.locator('input[name="name"]');
        await nameField.focus();
        await nameField.fill('');
        await nameField.type(p.name, { delay: 20 });
        await nameField.blur();

        // Fill gender
        const genderSelect = modal.locator('select[name="gender"]');
        await genderSelect.focus();
        await genderSelect.selectOption(p.gender);
        await genderSelect.blur();

        // Fill age
        const ageField = modal.locator('input[name="age_years"]');
        if (await ageField.count() > 0) {
          await ageField.focus();
          await ageField.fill('');
          await ageField.type(p.age, { delay: 20 });
          await ageField.blur();
        }

        // Fill mobile
        const mobileField = modal.locator('input[name="mobile"]');
        await mobileField.focus();
        await mobileField.fill('');
        await mobileField.type(p.mobile, { delay: 20 });
        await mobileField.blur();

        // Submit
        const submitBtn = modal.locator('button[data-save], button:has-text("Create UHID")').first();
        if (await submitBtn.count() === 0) {
          throw new Error('Submit button not found');
        }

        await submitBtn.click();

        // Wait for response
        await Promise.all([
          page.waitForLoadState('networkidle').catch(() => {}),
          page.waitForTimeout(1500)
        ]);

        // Extract patient ID from URL
        const urlMatch = page.url().match(/patient(?:s)?\/(\d+)/i);
        if (urlMatch) {
          result.patientId = urlMatch[1];
          result.status = 'registered';
          successCount++;
          console.log(`  ✓ ID: ${result.patientId}`);
        } else {
          result.status = 'submitted_no_id';
          console.log(`  ⚠ Submitted but ID not found`);
        }

        // Navigate back to patients list for next registration
        await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(500);

      } catch (err) {
        result.status = 'failed';
        result.error = err.message;
        console.log(`  ✗ ${err.message}`);
      }

      results.push(result);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`RESULTS: ${successCount}/${patients.length} patients registered`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Save ledger
    const ledger = {
      campaign: 'SUR-8 Block 1 - Complete Registration',
      timestamp: new Date().toISOString(),
      target: SERVER_URL,
      login: 'reception',
      patients: results,
      summary: {
        total: patients.length,
        registered: successCount,
        failed: patients.length - successCount,
        successRate: `${Math.round((successCount / patients.length) * 100)}%`
      }
    };

    const ledgerPath = `${resultsDir}/SUR-8-block-1-complete-ledger.json`;
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(`✓ Ledger saved: ${ledgerPath}\n`);

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
