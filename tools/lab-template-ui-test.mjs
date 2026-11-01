/** Browser checks with mocked API data: never creates tests in the live database.
 * Set PLAYWRIGHT_MODULE and PLAYWRIGHT_CHROME when Playwright is provided by the desktop runtime.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const services = [{ id: 1, code: 'LAB-CBC', name: 'Complete Blood Count', category: 'lab', description: 'CBC information', lab_section: 'Haematology' }];
  let creation;
  let reportDescription = 'Only Test A information\n<b>Literal text</b>';
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    let response = {};
    if (pathname === '/api/meta') response = { services, departments: [{ id: 1, code: 'LAB', name: 'Laboratory' }], settings: {}, doctors: [], staff: [], wards: [], counters: [], packages: [], payers: [] };
    else if (pathname === '/api/auth/me') { await route.fulfill({ status: 401, json: { error: 'not_authenticated' } }); return; }
    else if (pathname === '/api/lab/params') response = [{ id: 1, name: 'Result', unit: 'mg/dL', ref_low: 1, ref_high: 10, active: 1 }];
    else if (pathname === '/api/services' && request.method() === 'POST') { creation = request.postDataJSON(); response = { ...creation, id: 2 }; services.push(response); }
    else if (pathname.startsWith('/api/lab/tests/') && request.method() === 'PATCH') { response = services.find(s => s.id === +pathname.split('/').at(-1)); Object.assign(response, request.postDataJSON()); }
    else if (pathname === '/api/lab/report/991') response = { order_no: 'UI-TEST', label: 'Test A', patient_name: 'Example patient', uhid: 'UI-001', test_description: reportDescription, results: [
      { name: 'Normal result', value: '5', unit: 'mg/dL', ref_range: '1 - 10' },
      { name: 'High result', value: '6.6', unit: 'million/cumm', ref_range: '4.5 - 5.9 million/cumm (male)', flag: 'high' },
      { name: 'Low result', value: '23', unit: 'pg', ref_range: '27 - 33 pg', flag: 'low' },
      { name: 'Critical result', value: '15', unit: '%', ref_range: '1 - 6 %', flag: 'critical' },
    ], settings: { hospital_name: 'Test Hospital' } };
    await route.fulfill({ json: response });
  });
  await page.goto(process.env.HMS_UI_URL || 'http://localhost:4300/login');
  await page.locator('#auth-gate').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    document.querySelector('#auth-gate').style.display = 'none';
    const { state } = await import('/src/store.js');
    state.user = { role: 'lab_admin', perms: ['staff.manage', 'lab.verify'] };
    await (await import('/src/lab-templates.js')).openLabTemplates();
  });
  await page.locator('[data-edit-info]').waitFor();
  assert.match(await page.locator('[data-test-info]').innerText(), /CBC information/);
  await page.locator('[data-add-test]').click();
  await page.locator('[data-test-form] [name=name]').fill('Custom test');
  await page.locator('[data-test-form] [name=code]').fill('LAB-CUSTOM');
  await page.locator('[data-test-form] [name=price]').fill('125');
  await page.locator('[data-test-form] [name=description]').fill('Custom information\nSecond line');
  await page.locator('[data-param-type]').selectOption('text');
  await page.locator('[data-param-ref]').fill('Negative');
  assert.equal(await page.locator('[data-test-form]').evaluate(form => form.scrollWidth <= form.clientWidth + 1), true);
  fs.mkdirSync('acceptance-evidence/lab-descriptions', { recursive: true });
  await page.screenshot({ path: 'acceptance-evidence/lab-descriptions/create-test.png' });
  await page.locator('[data-save-test]').click();
  await page.waitForFunction(() => document.querySelector('[data-test]')?.value === '2');
  assert.equal(creation.description, 'Custom information\nSecond line');
  assert.equal(creation.initial_parameter.name, 'Custom test');
  assert.equal(creation.initial_parameter.result_type, 'text');
  assert.equal(creation.initial_parameter.ref_text, 'Negative');
  await page.locator('[data-edit-info]').click();
  await page.locator('[data-info-form] [name=description]').fill('Edited information');
  await page.locator('[data-save-info]').click();
  await page.locator('[data-test-info]').getByText('Edited information', { exact: true }).waitFor();
  await page.evaluate(async () => { await (await import('/src/views/laboratory.js')).printReport(991); });
  const report = page.frameLocator('[data-print-preview]');
  await report.getByText('Test information', { exact: true }).waitFor();
  assert.match(await report.locator('body').innerText(), /Only Test A information\n<b>Literal text<\/b>/);
  assert.equal(await report.locator('script').count(), 0);
  assert.equal(await report.locator('b').filter({ hasText: 'Literal text' }).count(), 0);
  const resultTable = report.locator('table').last();
  assert.deepEqual(await resultTable.locator('th').allTextContents(), ['Parameter', 'Result', 'Flag', 'Biological reference']);
  const resultRows = resultTable.locator('tbody tr');
  const expected = [['5', '', '1 - 10 mg/dL'], ['6.6', '↑ HIGH', '4.5 - 5.9 million/cumm (male)'], ['23', '↓ LOW', '27 - 33 pg'], ['15', '‼ CRITICAL', '1 - 6 %']];
  for (let i = 0; i < expected.length; i++) {
    assert.deepEqual((await resultRows.nth(i).locator('td').allTextContents()).slice(1).map(t => t.trim()), expected[i]);
  }
  await page.screenshot({ path: 'acceptance-evidence/lab-descriptions/print-preview.png' });
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  reportDescription = '';
  await page.evaluate(async () => { await (await import('/src/views/laboratory.js')).printReport(991); });
  await page.locator('[data-print-document]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('[data-print-document]').disabled);
  assert.doesNotMatch(await page.frameLocator('[data-print-preview]').locator('body').innerText(), /Test information/);
  console.log('Passed: lab admin creation, descriptions, report preview, separate result flags, units only in reference without duplication.');
} finally { await browser.close(); }
