// Drive real Mobile Safari on an iOS Simulator via Appium (XCUITest) and
// capture a screenshot per URL. This is the piece Playwright can't do —
// Playwright's "webkit" is not real iOS Safari; Appium + XCUITest is.
//
// Env: LAB_DEVICE, LAB_VERSION, LAB_URLS (JSON array or comma/newline list) or
//      LAB_URL, LAB_OUT (output dir), APPIUM_HOST, APPIUM_PORT.
// Emits progress on stdout and a final `RESULT {json}` line the backend parses.
import { remote } from 'webdriverio';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const device = process.env.LAB_DEVICE || 'iPhone 15';
const version = process.env.LAB_VERSION || '17.5';
const outDir = process.env.LAB_OUT || './out';
const host = process.env.APPIUM_HOST || '127.0.0.1';
const port = Number(process.env.APPIUM_PORT || 4723);

function parseUrls(raw) {
  if (!raw) return [];
  const t = raw.trim();
  if (t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch { /* fall through to delimiter split */ }
  }
  return t.split(/[\n,]+/);
}

const urls = parseUrls(process.env.LAB_URLS || process.env.LAB_URL)
  .map((u) => String(u).trim())
  .filter(Boolean);
if (!urls.length) urls.push('https://www.adobe.com');

const log = (...a) => console.log(a.join(' '));
const slug = (u) => u.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'page';

const caps = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': device,
  'appium:platformVersion': version,
  browserName: 'Safari',
  'appium:newCommandTimeout': 300,
  'appium:webviewConnectTimeout': 30000,
};

let browser;
const shots = [];
try {
  await mkdir(outDir, { recursive: true });
  log(`[ios] connecting Appium ${host}:${port} → ${device} · iOS ${version}`);
  browser = await remote({ hostname: host, port, path: '/', capabilities: caps, logLevel: 'error' });

  for (const url of urls) {
    log(`[ios] open ${url}`);
    await browser.url(url);
    await browser.waitUntil(
      async () => (await browser.execute(() => document.readyState)) === 'complete',
      { timeout: 30000, timeoutMsg: 'page did not finish loading' }
    );
    await browser.pause(1500); // let fonts / lazy content settle
    const file = join(outDir, `${slug(url)}.png`);
    await browser.saveScreenshot(file);
    log(`[ios] shot ${file}`);
    shots.push({ url, screenshot: file });
  }

  console.log(`RESULT ${JSON.stringify({ status: 'passed', device, version, shots })}`);
} catch (e) {
  log(`[ios] ERROR ${e.message}`);
  console.log(`RESULT ${JSON.stringify({ status: 'failed', device, version, error: e.message, shots })}`);
  process.exitCode = 1;
} finally {
  if (browser) {
    try {
      await browser.deleteSession();
    } catch { /* noop */ }
  }
}
