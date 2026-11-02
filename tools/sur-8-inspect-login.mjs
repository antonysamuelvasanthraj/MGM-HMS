#!/usr/bin/env node
/**
 * Inspect login page structure to understand form layout
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';

const SERVER_URL = 'http://127.0.0.1:4388';

console.log('Inspecting login page...');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();

await page.goto(`${SERVER_URL}/login`, { waitUntil: 'domcontentloaded' });

console.log('Page title:', await page.title());
console.log('Page URL:', page.url());
console.log('');

// Get all form elements
const forms = await page.locator('form').count();
console.log(`Forms found: ${forms}`);

// Get all buttons
const buttons = await page.locator('button').evaluateAll(buttons =>
  buttons.map(b => ({
    text: b.textContent?.trim(),
    type: b.getAttribute('type'),
    class: b.getAttribute('class'),
  }))
);
console.log('Buttons:');
buttons.forEach((btn, i) => {
  console.log(`  [${i}] ${btn.type || 'button'}: "${btn.text}"`);
});

// Get all inputs
const inputs = await page.locator('input').evaluateAll(inputs =>
  inputs.map(i => ({
    name: i.getAttribute('name'),
    type: i.getAttribute('type'),
    placeholder: i.getAttribute('placeholder'),
  }))
);
console.log('');
console.log('Inputs:');
inputs.forEach((inp, i) => {
  console.log(`  [${i}] ${inp.type} name="${inp.name}" placeholder="${inp.placeholder}"`);
});

// Take screenshot
await page.screenshot({ path: 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance\\login-page-inspect.png' });
console.log('');
console.log('Screenshot saved: login-page-inspect.png');

// Try to get all text
const bodyText = await page.locator('body').textContent();
console.log('');
console.log('Page content (first 500 chars):');
console.log(bodyText.substring(0, 500));

await browser.close();
