/* global document */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.join(__dirname, "..", "user-data");
const AUTH_FILE = path.join(__dirname, "..", "auth.json");

const BLOCKED_TYPES = new Set(["image", "font", "media", "ping"]);
const BLOCKED_DOMAINS = [
  "analytics",
  "tracking",
  "ads",
  "doubleclick",
  "google-analytics",
];

// ─── Scraping browser (in-memory, no disk writes) ────────────────────────────
let _browser = null;
let _scrapingContext = null;

// ─── Login browser (persistent context, visible) ─────────────────────────────
let _loginContext = null;

let loginState = { inProgress: false, completed: false };
const setLoginState = (state) => {
  loginState = { ...loginState, ...state };
};

// ─── Resource blocking ────────────────────────────────────────────────────────
async function _blockResources(context) {
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (
      BLOCKED_TYPES.has(type) ||
      BLOCKED_DOMAINS.some((d) => url.includes(d))
    ) {
      return route.abort();
    }
    return route.continue();
  });
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Checks if auth.json exists and the session is still valid by loading it
 * into a clean in-memory browser and hitting /feed.
 */
export async function hasValidSession() {
  console.log("[SESSION] Checking session validity...");
  if (!fs.existsSync(AUTH_FILE)) {
    console.log("[SESSION] ✗ auth.json not found — not logged in");
    return false;
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();
    await page.goto("https://www.linkedin.com/feed", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    }).catch(() => {});
    // ✅ Check for login indicators (multiple selectors for resilience)
    const loggedIn = await page.evaluate(() => {
      const url = window.location.href;
      if (url.includes("/login") || url.includes("/authwall")) return false;

      const selectors = [
        "img.global-nav__me-photo",
        ".global-nav__me-photo",
        ".global-nav__primary-link-me-menu-trigger img",
        ".feed-identity-module__actor-meta",
        ".scaffold-layout__main",
      ];
      for (const sel of selectors) {
        if (document.querySelector(sel)) return true;
      }
      // Fallback: on /feed with real content
      return url.includes("/feed") && document.body.innerText.length > 500;
    });

    console.log(
      `[SESSION] ${loggedIn ? "✓ Session is active" : "✗ Session expired"}`,
    );

    return loggedIn;
  } catch (err) {
    console.warn(`[SESSION] ✗ Session check failed — ${err.message}`);
    return false;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Opens a visible persistent-context browser for manual LinkedIn login.
 * Once the feed is detected, saves storage state to auth.json and closes.
 */
export async function startLoginSession() {
  if (_loginContext) return;

  setLoginState({ inProgress: true, completed: false });

  _loginContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: ["--start-maximized"],
    viewport: null,
  });

  // ✅ Use the default page that launchPersistentContext already creates
  const pages = _loginContext.pages();
  const page = pages.length > 0 ? pages[0] : await _loginContext.newPage();

  console.log("[SESSION] Opening LinkedIn login...");
  await page.goto("https://www.linkedin.com/login");

  // Debug navigation
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      console.log("[NAV]", frame.url());
    }
  });

  try {
    console.log("[SESSION] Waiting for manual login...");

    // ✅ Detect login via URL change + multiple avatar selectors
    //    LinkedIn frequently renames CSS classes, so we check several
    //    indicators rather than relying on a single selector.
    await page.waitForFunction(() => {
      const url = window.location.href;

      // Still on login/checkpoint pages → not logged in yet
      if (url.includes("/login") || url.includes("/checkpoint")) return false;

      // Check for known avatar / nav selectors (any one is enough)
      const avatarSelectors = [
        "img.global-nav__me-photo",                  // classic
        "img.evi-image.ember-view.global-nav__me-photo",
        ".global-nav__me-photo",
        ".global-nav__primary-link-me-menu-trigger img",
        "img[alt*='photo']",
        ".feed-identity-module__actor-meta",          // feed sidebar
        ".scaffold-layout__main",                     // main feed scaffold
      ];

      for (const sel of avatarSelectors) {
        if (document.querySelector(sel)) return true;
      }

      // Fallback: if we're on /feed and the page has substantial content
      if (url.includes("/feed") && document.body.innerText.length > 500) {
        return true;
      }

      return false;
    }, { timeout: 300000, polling: 2000 });

    console.log("[SESSION] ✓ Login detected on URL:", page.url());

    // ✅ Small delay to let cookies / storage fully stabilize
    await page.waitForTimeout(3000);

    console.log("[SESSION] Saving storage state to", AUTH_FILE);
    await _loginContext.storageState({ path: AUTH_FILE });

    // ✅ Verify file was actually written
    if (!fs.existsSync(AUTH_FILE)) {
      throw new Error("auth.json was not created after storageState() call");
    }

    const stats = fs.statSync(AUTH_FILE);
    console.log(`[SESSION] ✅ auth.json saved (${stats.size} bytes)`);

    setLoginState({ inProgress: false, completed: true });

  } catch (err) {
    console.error("[SESSION] ✗ Login failed:", err.message);
    setLoginState({ inProgress: false, completed: false });
  } finally {
    await closeLoginSession();
  }
}

/**
 * Closes the login browser.
 */
export async function closeLoginSession() {
  if (_loginContext) {
    await _loginContext.close().catch(() => {});
    _loginContext = null;
    console.log("[SESSION] ✓ Login browser closed");
  }
}

/**
 * Deletes auth.json and tears down any active scraping context.
 */
export async function clearSession() {
  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  await _resetScrapingContext();
  console.log("[SESSION] ✓ Session cleared");
}

// ─── Scraping context ─────────────────────────────────────────────────────────

async function _resetScrapingContext() {
  await _scrapingContext?.close().catch(() => {});
  await _browser?.close().catch(() => {});
  _scrapingContext = null;
  _browser = null;
}

async function _getScrapingContext() {
  if (_scrapingContext) return _scrapingContext;

  _browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-application-cache",
      "--disk-cache-size=0",
      "--disable-dev-shm-usage",
    ],
  });

  _scrapingContext = await _browser.newContext({
    storageState: AUTH_FILE,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  await _blockResources(_scrapingContext);
  return _scrapingContext;
}

// ─── Public scraping API ──────────────────────────────────────────────────────

export async function scrapeProfile(linkedinId, profileUrl) {
  const url = normalizeUrl(profileUrl);
  console.log(`[SCRAPER] user=${linkedinId} url="${url}"`);

  const context = await _getScrapingContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/authwall")) {
      console.warn("[SESSION] ✗ Session expired — resetting scraping context");
      await _resetScrapingContext();
      throw new Error("SESSION_EXPIRED");
    }

    await page.waitForSelector("main", { timeout: 30000 });

    // // Scroll down to trigger lazy-loading of Experience section
    // await page.evaluate(() => window.scrollTo(0, 600));
    // await page.waitForTimeout(1500);

    const basicInfo = await _extractBasicInfo(page);
    const contactInfo = await _extractContactInfo(page);

    return {
      ...basicInfo,
      ...contactInfo,
      profileUrl: url,
      scrapedAt: new Date(),
    };
  } finally {
    await page.close();
  }
}

export function normalizeUrl(url) {
  let normalized = url.trim().replace("://m.linkedin", "://www.linkedin");
  if (!normalized.startsWith("http")) normalized = "https://" + normalized;
  const parsed = new URL(normalized);
  let pathname = parsed.pathname.split("?")[0].split("#")[0];
  const parts = pathname.split("/").filter(Boolean);
  if (
    parsed.hostname.includes("linkedin.com") &&
    parts[0] === "in" &&
    parts[1]
  ) {
    pathname = `/in/${parts[1]}/`;
  }
  return `${parsed.origin}${pathname}`;
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

async function _extractBasicInfo(page) {
  return page.evaluate(() => {
    const getText = (el) => el?.innerText?.trim() || "";

    // ── Name ──────────────────────────────────────────────────────────────────
    const nameEl =
      document.querySelector("main h1") ||
      document.querySelector("main h2");
    const name = getText(nameEl);

    // ── Location ──────────────────────────────────────────────────────────────
    // The location <p> is always the sibling just before the "Contact info" <p>:
    //   <div class="flex">
    //     <p> Ernakulam, Kerala, India </p>   ← location
    //     <p> · </p>
    //     <p> <a href="...contact-info/">Contact info</a> </p>
    //   </div>
    let location = "";
    const contactAnchor = document.querySelector('a[href*="contact-info"]');
    if (contactAnchor) {
      const contactP = contactAnchor.closest("p");
      if (contactP) {
        let sibling = contactP.previousElementSibling;
        while (sibling) {
          const text = sibling.innerText?.trim();
          if (text && text !== "·" && text !== "•") {
            location = text;
            break;
          }
          sibling = sibling.previousElementSibling;
        }
      }
    }

    // // ── Company & Designation from Experience section ─────────────────────────
    // // Structure:
    // //   <h2> Experience </h2>
    // //   ...
    // //   <ul>
    // //     <li>                          ← first job entry
    // //       ...
    // //       <p> Software Engineer </p>  ← designation (bold/larger p)
    // //       <p> Datamate Info... </p>   ← company name
    // //       <p> Full-time </p>
    // //       <p> Jun 2025 - Present </p>
    // //     </li>
    // //   </ul>
    // let company = "";
    // let designation = "";

    // // Find the <h2> whose text is "Experience"
    // const expHeading = Array.from(document.querySelectorAll("main h2")).find(
    //   (el) => el.innerText?.trim() === "Experience"
    // );

    // if (expHeading) {
    //   // Walk forward from the Experience heading to find the first <ul>
    //   let cursor = expHeading.parentElement;
    //   // Go up until we find a container that has a <ul> sibling
    //   while (cursor) {
    //     const parent = cursor.parentElement;
    //     if (!parent) break;
    //     const siblings = Array.from(parent.children);
    //     const idx = siblings.indexOf(cursor);
    //     const afterCursor = siblings.slice(idx + 1);
    //     const ul = afterCursor.find((el) => el.tagName === "UL") ||
    //                cursor.querySelector("ul");
    //     if (ul) {
    //       const firstLi = ul.querySelector("li");
    //       if (firstLi) {
    //         // Collect all <p> text inside the first <li>, filter out empty/dates/duration
    //         const allP = Array.from(firstLi.querySelectorAll("p"))
    //           .map((p) => p.innerText?.trim())
    //           .filter(
    //             (t) =>
    //               t &&
    //               t.length > 1 &&
    //               !/^\d/.test(t) &&           // skip dates like "Jun 2025..."
    //               !/\byr\b|\bmos\b/i.test(t) && // skip "1 yr 2 mos"
    //               !/^(full.time|part.time|contract|freelance|internship|hybrid|remote|on.site)$/i.test(t)
    //           );
    //         // First <p> = designation, second <p> = company
    //         designation = allP[0] || "";
    //         company = allP[1] || "";
    //       }
    //       break;
    //     }
    //     cursor = parent;
    //   }
    // }

    // ── Profile image ─────────────────────────────────────────────────────────
    const imgEl =
      document.querySelector("img.pv-top-card-profile-picture__image--show") ||
      document.querySelector(".pv-top-card__photo img") ||
      document.querySelector("main img.evi-image");
    const profileImageUrl = imgEl?.src || "";

    return { name, location, profileImageUrl };
    // return { name, location, company, designation, profileImageUrl };

  });
}

async function _extractContactInfo(page) {
  const result = { emails: [], phones: [], websites: [] };
  try {
    const contactSelectors = [
      "#top-card-text-details-contact-info",
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
      } catch {
        /* not visible */
      }
    }
    if (!clicked) return result;

    await page.waitForSelector('a[href^="mailto:"]', { timeout: 4000 });

    const contactData = await page.evaluate(() => {
      const emails = [],
        phones = [],
        websites = [];
      document.querySelectorAll("div").forEach((block) => {
        const label = block
          .querySelector("p")
          ?.innerText?.trim()
          ?.toLowerCase();
        if (!label) return;
        if (label.includes("phone")) {
          const match = block.innerText.match(/\d{10,}/);
          if (match && !phones.includes(match[0])) phones.push(match[0]);
        }
        if (label.includes("email")) {
          const link = block.querySelector('a[href^="mailto:"]');
          if (link) {
            const email = link.href.replace("mailto:", "").trim();
            if (!emails.includes(email)) emails.push(email);
          }
        }
        if (label.includes("website")) {
          const link = block.querySelector("a[href]");
          if (
            link &&
            !link.href.includes("linkedin.com") &&
            !websites.includes(link.href)
          ) {
            websites.push(link.href);
          }
        }
      });
      return { emails, phones, websites };
    });

    Object.assign(result, contactData);

    try {
      const closeBtn = page.locator(
        'button[aria-label="Dismiss"], button.artdeco-modal__dismiss',
      );
      if (await closeBtn.isVisible({ timeout: 1000 })) await closeBtn.click();
    } catch {
      /* no dismiss button */
    }
  } catch (err) {
    console.warn(`[SCRAPER:_extractContactInfo] ${err.message}`);
  }
  return result;
}
