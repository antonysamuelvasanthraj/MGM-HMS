#!/usr/bin/env node
/**
 * Inspect the registration form HTML and test different fill methods
 */

import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';

const password = 'Reception@123';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--no-sandbox']
});

const page = await browser.newPage();

// Login
await page.goto('http://127.0.0.1:4300/', { waitUntil: 'networkidle' });
await page.locator('input[name="username"]').fill('reception');
await page.locator('input[name="password"]').fill(password);
await page.locator('button:has-text("Sign in")').click();
await page.waitForNavigation({ waitUntil: 'networkidle' });
await page.goto('http://127.0.0.1:4300/patients', { waitUntil: 'networkidle' });

console.log('Logged in, navigating to patients page\n');

// Click "New patient" button
const newBtn = page.locator('button:has-text("New patient"), button:has-text("New"), #btnNewReg').first();
console.log(`New patient button count: ${await newBtn.count()}`);

if (await newBtn.count() > 0) {
  await newBtn.click();
  await page.waitForTimeout(1500);

  // Inspect modal HTML
  const modal = page.locator('[role="dialog"], .modal, [data-modal]').first();
  console.log(`Modal count: ${await modal.count()}\n`);

  if (await modal.count() > 0) {
    // Get the actual HTML content
    const modalHTML = await modal.evaluate(el => el.outerHTML);
    console.log('Modal HTML (first 2000 chars):');
    console.log(modalHTML.substring(0, 2000));
    console.log('\n...\n');

    // List all form fields
    const inputs = await modal.$$('input, select, textarea');
    console.log(`\nFound ${inputs.length} input/select/textarea elements:\n`);
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      const type = await el.getAttribute('type');
      const name = await el.getAttribute('name');
      const id = await el.getAttribute('id');
      const value = await el.inputValue().catch(() => null);
      const placeholder = await el.getAttribute('placeholder');
      console.log(`[${i}] type=${type} name=${name} id=${id} value="${value}" placeholder="${placeholder}"`);
    }

    // Try to find buttons in modal
    const buttons = await modal.$$('button');
    console.log(`\nFound ${buttons.length} buttons:\n`);
    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].textContent();
      const dataAttr = await buttons[i].getAttribute('data-save');
      console.log(`[${i}] "${text.trim()}" data-save=${dataAttr}`);
    }

    // Test form filling with different methods
    console.log('\n=== Testing Form Fill Methods ===\n');

    const nameField = modal.locator('input[name="name"]').first();
    if (await nameField.count() > 0) {
      console.log('Testing NAME field:');

      // Method 1: fill()
      await nameField.fill('TEST METHOD');
      let val = await nameField.inputValue();
      console.log(`  After fill("TEST METHOD"): "${val}"`);

      // Method 2: type()
      await nameField.clear();
      await nameField.type('TEST TYPE', { delay: 50 });
      val = await nameField.inputValue();
      console.log(`  After type("TEST TYPE", delay): "${val}"`);

      // Method 3: direct evaluate
      await nameField.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', {bubbles: true})); }, 'TEST EVAL');
      val = await nameField.inputValue();
      console.log(`  After evaluate().dispatchEvent("input"): "${val}"`);

      // Check if form has any event listeners or custom logic
      const eventListeners = await nameField.evaluate(el => {
        return {
          tagName: el.tagName,
          className: el.className,
          type: el.type,
          hasOninput: el.oninput ? 'yes' : 'no',
          hasOnchange: el.onchange ? 'yes' : 'no',
          dataAttributes: Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value}`)
        };
      });
      console.log(`  Element properties:`, eventListeners);
    }
  }
}

await browser.close();
