/* global document */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, '..', 'auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'storage-state.json');

class LinkedInScraper {
  constructor() {
    this.browser = null;
    this.context = null;
  }

  isAuthenticated() {
    const exists = fs.existsSync(STORAGE_STATE_PATH);
    console.log(`[SCRAPER:isAuthenticated] session file exists → ${exists}`);
    return exists;
  }

  async init() {
    console.log('[SCRAPER:init] Launching Chromium browser (headless)...');
    if (!fs.existsSync(AUTH_DIR)) {
      console.log(`[SCRAPER:init] Auth dir missing — creating: ${AUTH_DIR}`);
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    this.browser = await chromium.launch({
      headless: true, //change to true
      // channel: 'chrome', //remove this 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-features=site-per-process',
        '--single-process'
      ],
    });
    console.log('[SCRAPER:init] ✓ Browser launched');

    if (this.isAuthenticated()) {
      console.log('[SCRAPER:init] Loading saved session from storage state...');
      this.context = await this.browser.newContext({
        storageState: STORAGE_STATE_PATH,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 390, height: 844 },
        locale: 'en-US',
      });
      console.log('[SCRAPER:init] ✓ Context created with saved session');
      await this.context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
          return route.abort();
        }
        route.continue();
      })
    } else {
      console.log('[SCRAPER:init] No session found — will auto-login');
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
      });
      await this._autoLogin();
    }
  }

  async _autoLogin() {
    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;

    console.log('[SCRAPER:_autoLogin] Starting auto-login flow...');

    if (!email || !password) {
      console.error('[SCRAPER:_autoLogin] ✗ LINKEDIN_EMAIL or LINKEDIN_PASSWORD not set in .env');
      throw new Error('LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set in .env');
    }

    console.log(`[SCRAPER:_autoLogin] Logging in as: ${email}`);
    const page = await this.context.newPage();

    console.log('[SCRAPER:_autoLogin] Navigating to linkedin.com/login...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });

    await page.fill('#username', email);
    await page.fill('#password', password);

    console.log('[SCRAPER:_autoLogin] Submitting login form...');
    await page.click('button[type="submit"]');

    console.log('[SCRAPER:_autoLogin] Waiting for redirect (4s)...');
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log(`[SCRAPER:_autoLogin] Post-login URL → "${currentUrl}"`);

    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/checkpoint') ||
      currentUrl.includes('/authwall')
    ) {
      console.error(`[SCRAPER:_autoLogin] ✗ Login failed — still on auth page: ${currentUrl}`);
      await page.close();
      throw new Error('LOGIN_FAILED: Check your LinkedIn credentials or complete any security challenge manually.');
    }

    console.log('[SCRAPER:_autoLogin] ✓ Login successful — saving session state...');
    await this.context.storageState({ path: STORAGE_STATE_PATH });
    await page.close();
    console.log(`[SCRAPER:_autoLogin] ✓ Session saved to ${STORAGE_STATE_PATH}`);
  }

  async _ensureSession(page) {
    const currentUrl = page.url();
    console.log(`[SCRAPER:_ensureSession] Current page URL → "${currentUrl}"`);

    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/authwall')
    ) {
      console.warn('[SCRAPER:_ensureSession] ⚠ Session expired — clearing and re-authenticating...');
      if (fs.existsSync(STORAGE_STATE_PATH)) {
        fs.unlinkSync(STORAGE_STATE_PATH);
        console.log('[SCRAPER:_ensureSession] Old session file deleted');
      }
      await this.close();
      console.log('[SCRAPER:_ensureSession] Browser closed — re-initialising...');
      await this.init();
      console.log('[SCRAPER:_ensureSession] ✓ Re-init complete — will retry scrape');
      return true;
    }

    console.log('[SCRAPER:_ensureSession] ✓ Session looks valid');
    return false;
  }

  async scrapeProfile(profileUrl) {
    console.log(`\n[SCRAPER:scrapeProfile] ▶ Called with url: "${profileUrl}"`);

    if (!this.browser) {
      console.log('[SCRAPER:scrapeProfile] Browser not running — calling init()...');
      await this.init();
    }

    const url = this.normalizeUrl(profileUrl);
    console.log(`[SCRAPER:scrapeProfile] Normalized URL → "${url}"`);

    const page = await this.context.newPage();
    console.log('[SCRAPER:scrapeProfile] New page opened');

    try {
      console.log('[SCRAPER:scrapeProfile] Navigating to profile page...');
      const navStart = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`[SCRAPER:scrapeProfile] Page loaded in ${Date.now() - navStart}ms`);

      const delay = 2000 + Math.random() * 2000;
      console.log(`[SCRAPER:scrapeProfile] Human-like delay: ${Math.round(delay)}ms`);
      await page.waitForTimeout(delay);

      const expired = await this._ensureSession(page);
      if (expired) {
        console.log('[SCRAPER:scrapeProfile] Session was expired — retrying scrape after re-login...');
        await page.close();
        return this.scrapeProfile(profileUrl);
      }
      console.log('[SCRAPER:scrapeProfile] Waiting for profile h1 to confirm page is fully loaded...');
      await page.waitForSelector('main', { timeout: 30000 });
      console.log('[SCRAPER:scrapeProfile] ✓ <main> found — page is a profile');

      // Scroll down to trigger lazy-loaded sections (experience, contact link, etc.) //whole section new , was not before
      // console.log('[SCRAPER:scrapeProfile] Scrolling to trigger lazy-loaded sections...');
      // await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      // await page.waitForTimeout(1500);
      // await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      // await page.waitForTimeout(1500);
      // await page.evaluate(() => window.scrollTo(0, 0));
      // await page.waitForTimeout(500);

      console.log('[SCRAPER:scrapeProfile] Extracting basic info...');
      const basicInfo = await this._extractBasicInfo(page);
      console.log(`[SCRAPER:scrapeProfile] basicInfo →`, basicInfo);

      console.log('[SCRAPER:scrapeProfile] Extracting contact info...');
      const contactInfo = await this._extractContactInfo(page);
      console.log(`[SCRAPER:scrapeProfile] contactInfo →`, contactInfo);

      // console.log('[SCRAPER:scrapeProfile] Extracting experience...');
      // const experienceInfo = await this._extractExperience(page);
      // console.log(`[SCRAPER:scrapeProfile] experienceInfo →`, experienceInfo);

      // console.log('[SCRAPER:scrapeProfile] Extracting profile image...');
      // const profileImage = await this._extractProfileImage(page);
      // console.log(`[SCRAPER:scrapeProfile] profileImageUrl → "${profileImage || 'none'}"`);

      const result = {
        ...basicInfo,
        ...contactInfo,
        // ...experienceInfo,
        // profileImageUrl: profileImage,
        // profileUrl: url,
        scrapedAt: new Date(),
      };

      console.log(`[SCRAPER:scrapeProfile] ✓ Done — name: "${result.name}" | company: "${result.company || 'N/A'}" | emails: ${result.emails?.length ?? 0} | phones: ${result.phones?.length ?? 0}`);
      return result;
    } catch (err) {
      console.error(`[SCRAPER:scrapeProfile] ✗ Failed for "${url}" — ${err.message}`);
      console.error(err.stack);
      throw err;
    } finally {
      await page.close();
      console.log('[SCRAPER:scrapeProfile] Page closed');
    }
  }

  async _extractBasicInfo(page) {
    console.log('[SCRAPER:_extractBasicInfo] Running page.evaluate...');
    const result = await page.evaluate(() => {
      const getText = (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.innerText?.trim()) return el.innerText.trim();
        }
        return '';
      };
      const getLocation = () => {
        const spans = Array.from(document.querySelectorAll('main span'));
        for (const el of spans) {
          const text = el.innerText?.trim();
          if (text && text.includes('India')) return text;
        }
        return '';
      };
      return {
        name: getText(['main h1, main h2']),
        // headline: getText(['main div[dir=ltr]']),
        // location: getLocation(),
      };
    });
    if (!result.name) console.warn('[SCRAPER:_extractBasicInfo] ⚠ name came back empty — selector may have changed');
    return result;
  }

  async _extractContactInfo(page) {
    console.log('[SCRAPER:_extractContactInfo] Attempting to open contact info modal...');
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
            console.log(`[SCRAPER:_extractContactInfo] Clicking selector: "${sel}"`);
            await link.click();
            clicked = true;
            break;
          }
        } catch {
          console.log(`[SCRAPER:_extractContactInfo] Selector not visible: "${sel}"`);
        }
      }

      if (!clicked) {
        console.warn('[SCRAPER:_extractContactInfo] ⚠ Could not find contact info link — skipping');
        return result;
      }

      console.log('[SCRAPER:_extractContactInfo] Modal opened — waiting 2s for content...');
      await page.waitForSelector('a[href^="mailto:"], div span', { timeout: 6000 });

      const contactData = await page.evaluate(() => {
        const emails = [], phones = [], websites = [];

        const blocks = document.querySelectorAll('div');
        blocks.forEach(block => {
          const label = block.querySelector('p')?.innerText?.trim();
          if (!label) return;

          if (label.toLowerCase().includes('phone')) {
            const text = block.innerText;
            const match = text.match(/\d{10,}/);
            if (match && !phones.includes(match[0])) {
              phones.push(match[0]);
            }
          }
          if (label.toLowerCase().includes('email')) {
            const link = block.querySelector('a[href^="mailto:"]');
            if (link) {
              const email = link.href.replace('mailto:', '').trim();
              if (!emails.includes(email)) emails.push(email);
            }
          }
          if (label.toLowerCase().includes('website')) {
            const link = block.querySelector('a[href]');
            if (link) {
              const url = link.href;
              if (!url.includes('linkedin.com') && !websites.includes(url)) {
                websites.push(url);
              }
            }
          }
        });

        return { emails, phones, websites };
      });

      console.log(`[SCRAPER:_extractContactInfo] ✓ emails: ${contactData.emails.length} | phones: ${contactData.phones.length} | websites: ${contactData.websites.length}`);
      Object.assign(result, contactData);

      try {
        const closeBtn = page.locator('button[aria-label="Dismiss"], button.artdeco-modal__dismiss');
        if (await closeBtn.isVisible({ timeout: 1000 })) {
          await closeBtn.click();
          await page.waitForTimeout(500);
          console.log('[SCRAPER:_extractContactInfo] Modal dismissed');
        }
      } catch {
        console.log('[SCRAPER:_extractContactInfo] No dismiss button found — continuing');
      }
    } catch (err) {
      console.warn(`[SCRAPER:_extractContactInfo] ⚠ Error during contact extraction — ${err.message}`);
    }

    return result;
  }

  // async _extractExperience(page) {
  //   console.log('[SCRAPER:_extractExperience] Waiting for experience section...');
  //   try {
  //     // Wait for experience section to be present (lazy-loaded)
  //     await page.waitForSelector('#experience', { timeout: 10000 }).catch(() => {
  //       console.warn('[SCRAPER:_extractExperience] ⚠ #experience section not found within timeout — proceeding anyway');
  //     });
  //     const result = await page.evaluate(() => {
  //       let company = '', designation = '';
  //       const expSection = document.querySelector('#experience');
  //       if (expSection) {
  //         const expContainer = expSection.closest('section');
  //         if (expContainer) {
  //           const firstItem = expContainer.querySelector('li.artdeco-list__item, .pvs-list__paged-list-item');
  //           if (firstItem) {
  //             const boldSpans = firstItem.querySelectorAll('.t-bold span[aria-hidden="true"]');
  //             const normalSpans = firstItem.querySelectorAll('.t-normal:not(.t-black--light) span[aria-hidden="true"]');
  //             if (boldSpans.length >= 1) designation = boldSpans[0]?.textContent?.trim() || '';
  //             if (normalSpans.length >= 1) company = (normalSpans[0]?.textContent?.trim() || '').split('·')[0].trim();
  //           }
  //         }
  //       }
  //       // Fallback: parse from headline
  //       if (!company || !designation) {
  //         const headline = document.querySelector('.text-body-medium.break-words');
  //         if (headline) {
  //           const text = headline.innerText || '';
  //           if (!company) {
  //             const atMatch = text.match(/(?:at|@|,)\s+(.+)/i);
  //             if (atMatch) company = atMatch[1].trim();
  //           }
  //           if (!designation) {
  //             const parts = text.split(/\s+(?:at|@|\||,)\s+/i);
  //             if (parts.length > 0) designation = parts[0].trim();
  //           }
  //         }
  //       }
  //       return { company, designation };
  //     });

  //     if (!result.company && !result.designation) {
  //       console.warn('[SCRAPER:_extractExperience] ⚠ Both company and designation came back empty');
  //     }
  //     return result;
  //   } catch (err) {
  //     console.error(`[SCRAPER:_extractExperience] ✗ Failed — ${err.message}`);
  //     return { company: '', designation: '' };
  //   }
  // }

  // async _extractProfileImage(page) {
  //   console.log('[SCRAPER:_extractProfileImage] Looking for profile image...');
  //   try {
  //     const src = await page.evaluate(() => {
  //       const img = document.querySelector(
  //         'img.pv-top-card-profile-picture__image, img.profile-photo-edit__preview, .pv-top-card__photo-wrapper img'
  //       );
  //       return img?.src || '';
  //     });
  //     if (!src) console.warn('[SCRAPER:_extractProfileImage] ⚠ No image found');
  //     return src;
  //   } catch (err) {
  //     console.error(`[SCRAPER:_extractProfileImage] ✗ Error — ${err.message}`);
  //     return '';
  //   }
  // }

  normalizeUrl(url) {
    let normalized = url.trim().replace('://m.linkedin', '://www.linkedin');
    if (!normalized.startsWith('http')) {
      normalized = 'https://' + normalized
    };
    const parsed = new URL(normalized);

    let pathname = parsed.pathname.split('?')[0].split('#')[0];
    const parts = pathname.split('/').filter(Boolean);
    // Handle LinkedIn profile URLs
    if (parsed.hostname.includes('linkedin.com')) {
      if (parts[0] === 'in' && parts[1]) {
        pathname = `/in/${parts[1]}/`;
      }
    }
    const finalUrl = `${parsed.origin}${pathname}`;
    console.log(`[SCRAPER:normalizeUrl] "${url}" → "${finalUrl}"`);
    return finalUrl;
  }

  async close() {
    if (this.browser) {
      console.log('[SCRAPER:close] Closing browser...');
      await this.browser.close();
      this.browser = null;
      this.context = null;
      console.log('[SCRAPER:close] ✓ Browser closed');
    }
  }
}

const scraper = new LinkedInScraper();
export default scraper;
