/* global document */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, '..', 'auth');

const BLOCKED_TYPES = new Set(['image', 'font', 'media', 'stylesheet', 'ping', 'other']);
const BLOCKED_DOMAINS = ['analytics', 'tracking', 'ads', 'doubleclick', 'google-analytics'];

// sessionId → { browser, context, status: 'pending'|'ready'|'failed' }
const sessions = new Map();

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

function sessionPath(sessionId) {
  return path.join(AUTH_DIR, `session-${sessionId}.json`);
}

async function _blockResources(context) {
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (BLOCKED_TYPES.has(type)) return route.abort();
    if (BLOCKED_DOMAINS.some(d => url.includes(d))) return route.abort();
    return route.continue();
  });
}

/**
 * Start a login flow for a new session.
 * Opens a visible browser page at LinkedIn login and waits for the user to authenticate.
 * Returns sessionId immediately; caller should poll getSessionStatus().
 */
export async function startLoginSession(sessionId) {
  console.log(`[SCRAPER:startLoginSession] Starting session ${sessionId}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
  });

  sessions.set(sessionId, { browser, context, status: 'pending' });

  // Watch for successful login in background
  _watchForLogin(sessionId).catch(err => {
    console.error(`[SCRAPER:startLoginSession] Watch failed for ${sessionId}: ${err.message}`);
    const s = sessions.get(sessionId);
    if (s) s.status = 'failed';
  });

  return sessionId;
}

async function _watchForLogin(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const { context } = session;
  const page = await context.newPage();

  console.log(`[SCRAPER:_watchForLogin] Navigating to LinkedIn login for ${sessionId}`);
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });

  // Poll until user lands on feed or any non-auth page (max 5 min)
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log(`[SCRAPER:_watchForLogin] ${sessionId} current url: ${url}`);

    if (
      !url.includes('/login') &&
      !url.includes('/checkpoint') &&
      !url.includes('/authwall') &&
      url.includes('linkedin.com')
    ) {
      console.log(`[SCRAPER:_watchForLogin] ✓ Login detected for ${sessionId}`);
      await context.storageState({ path: sessionPath(sessionId) });
      session.status = 'ready';
      await page.close();
      return;
    }
  }

  session.status = 'failed';
  await page.close();
  console.warn(`[SCRAPER:_watchForLogin] ✗ Timed out waiting for login — ${sessionId}`);
}

/**
 * Returns 'pending' | 'ready' | 'failed' | 'unknown'
 */
export function getSessionStatus(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    // Check if we have a saved session file (from a previous run)
    if (fs.existsSync(sessionPath(sessionId))) return 'ready';
    return 'unknown';
  }
  return session.status;
}

/**
 * Load a saved session from disk (for app restarts).
 */
async function _loadSession(sessionId) {
  const filePath = sessionPath(sessionId);
  if (!fs.existsSync(filePath)) throw new Error(`No saved session for ${sessionId}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({
    storageState: filePath,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
  });

  await _blockResources(context);
  sessions.set(sessionId, { browser, context, status: 'ready' });
  console.log(`[SCRAPER:_loadSession] ✓ Session loaded from disk for ${sessionId}`);
}

/**
 * Get or restore a ready context for a session.
 */
async function _getContext(sessionId) {
  let session = sessions.get(sessionId);

  if (!session || session.status !== 'ready') {
    await _loadSession(sessionId);
    session = sessions.get(sessionId);
  }

  return session.context;
}

export async function scrapeProfile(sessionId, profileUrl) {
  console.log(`[SCRAPER:scrapeProfile] session=${sessionId} url="${profileUrl}"`);

  const context = await _getContext(sessionId);
  const url = normalizeUrl(profileUrl);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Session expired?
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      // Invalidate and tell caller to re-auth
      const session = sessions.get(sessionId);
      if (session) session.status = 'failed';
      const filePath = sessionPath(sessionId);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw new Error('SESSION_EXPIRED');
    }

    await page.waitForSelector('main', { timeout: 30000 });

    const basicInfo = await _extractBasicInfo(page);
    const contactInfo = await _extractContactInfo(page);

    return { ...basicInfo, ...contactInfo, profileUrl: url, scrapedAt: new Date() };
  } finally {
    await page.close();
  }
}

export function normalizeUrl(url) {
  let normalized = url.trim().replace('://m.linkedin', '://www.linkedin');
  if (!normalized.startsWith('http')) normalized = 'https://' + normalized;
  const parsed = new URL(normalized);
  let pathname = parsed.pathname.split('?')[0].split('#')[0];
  const parts = pathname.split('/').filter(Boolean);
  if (parsed.hostname.includes('linkedin.com') && parts[0] === 'in' && parts[1]) {
    pathname = `/in/${parts[1]}/`;
  }
  return `${parsed.origin}${pathname}`;
}

export function deleteSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.browser) session.browser.close().catch(() => {});
  sessions.delete(sessionId);
  const filePath = sessionPath(sessionId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  console.log(`[SCRAPER:deleteSession] Session ${sessionId} removed`);
}

async function _extractBasicInfo(page) {
  return page.evaluate(() => {
    const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
    return { name: getText('main h1') || getText('main h2') };
  });
}

async function _extractContactInfo(page) {
  const result = { emails: [], phones: [], websites: [] };
  try {
    const contactSelectors = [
      '#top-card-text-details-contact-info',
      'a[href*="overlay/contact-info"]',
      'a[href*="contact-info"]',
    ];
    let clicked = false;
    for (const sel of contactSelectors) {
      try {
        const link = page.locator(sel).first();
        if (await link.isVisible({ timeout: 2000 })) {
          await link.click();
          clicked = true;
          break;
        }
      } catch { /* not visible */ }
    }
    if (!clicked) return result;

    await page.waitForSelector('a[href^="mailto:"], div span', { timeout: 6000 });

    const contactData = await page.evaluate(() => {
      const emails = [], phones = [], websites = [];
      document.querySelectorAll('div').forEach(block => {
        const label = block.querySelector('p')?.innerText?.trim()?.toLowerCase();
        if (!label) return;
        if (label.includes('phone')) {
          const match = block.innerText.match(/\d{10,}/);
          if (match && !phones.includes(match[0])) phones.push(match[0]);
        }
        if (label.includes('email')) {
          const link = block.querySelector('a[href^="mailto:"]');
          if (link) {
            const email = link.href.replace('mailto:', '').trim();
            if (!emails.includes(email)) emails.push(email);
          }
        }
        if (label.includes('website')) {
          const link = block.querySelector('a[href]');
          if (link && !link.href.includes('linkedin.com') && !websites.includes(link.href)) {
            websites.push(link.href);
          }
        }
      });
      return { emails, phones, websites };
    });

    Object.assign(result, contactData);

    try {
      const closeBtn = page.locator('button[aria-label="Dismiss"], button.artdeco-modal__dismiss');
      if (await closeBtn.isVisible({ timeout: 1000 })) await closeBtn.click();
    } catch { /* no dismiss button */ }
  } catch (err) {
    console.warn(`[SCRAPER:_extractContactInfo] ${err.message}`);
  }
  return result;
}
