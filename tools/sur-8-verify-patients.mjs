#!/usr/bin/env node
/**
 * Verify that registered patients actually exist in the system
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';

const password = 'Reception@123';
const resultsDir = 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance';

// Patient IDs to verify
const patientIds = [29, 30, 31];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome'
  });

  const page = await browser.newPage();

  try {
    // Login
    console.log('Logging in...');
    await page.goto('http://127.0.0.1:4300/', { waitUntil: 'networkidle' });
    await page.locator('input[name="username"]').fill('reception');
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button:has-text("Sign in")').click();
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    console.log('✓ Logged in\n');

    // Verify each patient
    for (const id of patientIds) {
      console.log(`Verifying Patient ID ${id}...`);
      await page.goto(`http://127.0.0.1:4300/patients/${id}`, { waitUntil: 'networkidle' });

      const pageContent = await page.content();
      if (pageContent.includes('TEST Patient') || pageContent.includes('TEST-MGM-QA')) {
        console.log(`  ✓ Patient ${id} found in system`);

        // Try to find UHID
        const uhidMatch = pageContent.match(/UHID[:\s]+([A-Z0-9\-]+)/i);
        if (uhidMatch) {
          console.log(`    UHID: ${uhidMatch[1]}`);
        }
      } else {
        console.log(`  ⚠ Patient ${id} not found or loaded incorrectly`);
      }

      await page.waitForTimeout(300);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
