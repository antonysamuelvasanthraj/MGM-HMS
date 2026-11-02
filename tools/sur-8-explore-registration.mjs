#!/usr/bin/env node
/**
 * Explore patient registration page structure
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';

const SERVER_URL = 'http://127.0.0.1:4388';
const RECEPTION_LOGIN = 'reception';
const RECEPTION_PASSWORD = 'Reception@123';

console.log('=== Exploring Patient Registration UI ===\n');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();

// Login
console.log('1. Logging in as reception...');
await page.goto(`${SERVER_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name="username"]', RECEPTION_LOGIN);
await page.fill('input[name="password"]', RECEPTION_PASSWORD);

const signInBtn = await page.locator('button:has-text("Sign in")').first();
await signInBtn.click();

try {
  await page.waitForNavigation({ timeout: 10000 });
} catch {
  await page.waitForTimeout(2000);
}

console.log('✓ Logged in\n');

// Navigate to patients
console.log('2. Navigating to patients page...');
await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'domcontentloaded' });

// Look for registration button
console.log('   Looking for patient registration button...');
const buttons = await page.locator('button').evaluateAll(buttons =>
  buttons.map(b => ({
    text: b.textContent?.trim().substring(0, 50),
    visible: b.offsetHeight > 0,
  })).filter(b => b.visible && b.text && b.text.length > 3)
);

console.log('   Available buttons:');
buttons.slice(0, 15).forEach((btn, i) => {
  console.log(`     [${i}] "${btn.text}"`);
});

// Look for forms/modals
console.log('\n3. Page structure:');
const modals = await page.locator('dialog, [role="dialog"]').count();
const cards = await page.locator('[class*="card"]').count();
const tables = await page.locator('table, [role="table"]').count();
console.log(`   Modals/dialogs: ${modals}`);
console.log(`   Cards: ${cards}`);
console.log(`   Tables: ${tables}`);

// Try to find a "new patient" or "add patient" button
console.log('\n4. Searching for registration trigger...');
const newPatientBtn = await page.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Register"), button:has-text("Create")').first();

if (await newPatientBtn.count() > 0) {
  const btnText = await newPatientBtn.textContent();
  console.log(`   ✓ Found: "${btnText?.trim()}"`);

  // Click it
  console.log('   Clicking...');
  await newPatientBtn.click();
  await page.waitForTimeout(1000);

  // Check for form
  const formInputs = await page.locator('input[type="text"], input[type="tel"], input[type="email"], input[type="date"]').count();
  console.log(`   Form inputs visible: ${formInputs}`);

  // Take screenshot
  await page.screenshot({ path: 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance\\registration-form.png' });
  console.log('   Screenshot: registration-form.png');
} else {
  console.log('   ✗ Registration button not found');

  // Search entire page text
  const content = await page.locator('body').textContent();
  if (content && content.includes('patient')) {
    console.log('   Page contains "patient" text');
  }
}

console.log('\n5. Page URL:', page.url());

// Close
await browser.close();
console.log('\nDone.');
