// Optional real-browser smoke test. Run with: npm run test:browser
// It uses a locally installed Playwright package and browser; no browser download is performed by the project.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.ROUTINE_APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error));
await page.goto(baseURL); await page.locator('#locationSearch').fill('Del'); await page.getByRole('option', { name: /Delhi/ }).waitFor(); await page.getByRole('option', { name: /Delhi/ }).click();
assert.equal(await page.locator('#profileCity').inputValue(), 'Delhi'); assert.equal(await page.locator('#profileLatitude').inputValue(), '28.6139'); assert.equal(await page.locator('#profileTimezone').inputValue(), 'Asia/Kolkata'); assert.deepEqual(pageErrors, []);
await browser.close();
