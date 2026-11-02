#!/usr/bin/env node
import { chromium } from 'file:///C:/Users/SAMUEL/Documents/Codex/2026-11-02/referenced-chatgpt-conversation-this-is-an/work/mgm-browser/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome'
});

const page = await browser.newPage();
await page.goto('http://127.0.0.1:4300/', { waitUntil: 'networkidle', timeout: 10000 });
await page.screenshot({ path: 'E:\\MGM HMS\\qa-reports\\2026-11-02\\final-acceptance\\page-screenshot.png' });

console.log('Screenshot saved');
console.log('URL:', page.url());
console.log('Title:', await page.title());

// Log form fields
const inputs = await page.$$('input');
console.log(`Found ${inputs.length} input fields`);
for (let i = 0; i < Math.min(5, inputs.length); i++) {
  const type = await inputs[i].getAttribute('type');
  const name = await inputs[i].getAttribute('name');
  const id = await inputs[i].getAttribute('id');
  const placeholder = await inputs[i].getAttribute('placeholder');
  console.log(`  [${i}] type=${type} name=${name} id=${id} placeholder=${placeholder}`);
}

const buttons = await page.$$('button');
console.log(`Found ${buttons.length} button fields`);
for (let i = 0; i < Math.min(5, buttons.length); i++) {
  const text = await buttons[i].textContent();
  console.log(`  [${i}] ${text.trim()}`);
}

await browser.close();
