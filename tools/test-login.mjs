import { chromium } from 'playwright-core';

async function testLogin() {
  const credentials = {
    user_name: 'reception',
    password: process.env.RECEPTION_PASSWORD
  };
  
  const browser = await chromium.launch({ 
    channel: 'chrome',
    headless: true,
    timeout: 10000
  });
  
  try {
    const page = await browser.newPage();
    console.log('Attempting single login test...');
    
    await page.goto('http://127.0.0.1:4300/login', { waitUntil: 'domcontentloaded' });
    
    try {
      await page.waitForSelector('input[name="user_name"]', { timeout: 5000 });
    } catch (e) {
      console.error('Login form not found - checking page content...');
      const content = await page.content();
      if (content.includes('429')) {
        console.log('✗ HTTP 429 - rate limiter still active');
        process.exit(1);
      }
      throw e;
    }
    
    await page.fill('input[name="user_name"]', credentials.user_name);
    await page.fill('input[name="password"]', credentials.password);
    
    // Get response info before clicking
    let response;
    try {
      response = await Promise.race([
        page.waitForResponse(r => r.url().includes('/api/auth/login')),
        page.click('button[type="submit"]').then(() => Promise.reject(new Error('Click completed')))
      ]).catch(() => null);
    } catch {
      // Response not captured, but click proceeded
    }
    
    // Wait for navigation or error
    await page.waitForTimeout(3000);
    const url = page.url();
    console.log('Post-login URL:', url);
    
    if (url.includes('/login') === false && url.includes('http://127.0.0.1:4300') === true) {
      console.log('✓ Rate limiter cleared - login successful');
      process.exit(0);
    } else if (url.includes('429')) {
      console.log('✗ HTTP 429 - rate limiter still active');
      process.exit(1);
    } else {
      console.log('? Still at login page or unexpected state');
      process.exit(2);
    }
  } catch (error) {
    console.error('Test error:', error.message);
    process.exit(1);
  } finally {
    try { await browser.close(); } catch {}
  }
}

testLogin();
