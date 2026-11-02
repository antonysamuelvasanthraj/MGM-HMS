#!/usr/bin/env node
import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const SERVER_URL = 'http://127.0.0.1:4388';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();

// Login
console.log('Logging in...');
await page.goto(`${SERVER_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name="username"]', 'reception');
await page.fill('input[name="password"]', 'Reception@123');
await page.locator('button:has-text("Sign in")').first().click();
await page.waitForTimeout(3000);

// Go to patients
console.log('Navigating to patients page...');
await page.goto(`${SERVER_URL}/patients`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// Screenshot
await page.screenshot({ path: 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance\\patients-page.png', fullPage: true });
console.log('✓ Screenshot saved: patients-page.png');

// Save HTML
const html = await page.content();
fs.writeFileSync('E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance\\patients-page.html', html);
console.log('✓ HTML saved: patients-page.html');

// Print page text
const text = await page.locator('body').textContent();
if (text) {
  fs.writeFileSync('E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance\\patients-page.txt', text);
  console.log('✓ Page text saved: patients-page.txt');
  console.log('\nPage text (first 800 chars):');
  console.log(text.substring(0, 800));
}

await browser.close();
