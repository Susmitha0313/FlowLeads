/* global document */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.join(__dirname, "..", "user-data");
const AUTH_FILE = path.join(__dirname, "..", "auth.json");

// ─── Bootstrap auth.json from env var (for Docker/Render deployments) ────────
if (!fs.existsSync(AUTH_FILE) && process.env.AUTH_JSON) {
  try {
    fs.writeFileSync(AUTH_FILE, process.env.AUTH_JSON, "utf8");
    console.log("[SESSION] ✓ auth.json restored from AUTH_JSON env var");
  } catch (err) {
    console.error("[SESSION] ✗ Failed to write auth.json from env:", err.message);
  }
}

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
    }).catch(() => { });
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
    if (browser) await browser.close().catch(() => { });
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
        ".global-nav__content",                       // top nav bar
        "nav.global-nav",
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

    // ✅ Wait for network to go idle so all auth cookies are fully written
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => { });

    // Extra buffer for LinkedIn's post-auth cookie writes (device approval needs more time)
    await page.waitForTimeout(5000);

    console.log("[SESSION] Saving storage state to", AUTH_FILE, "| current URL:", page.url());
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
    await _loginContext.close().catch(() => { });
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
  await _scrapingContext?.close().catch(() => { });
  await _browser?.close().catch(() => { });
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
  console.log("[_extractBasicInfo] ▶ Starting extraction");

  return page.evaluate(() => {
    const log = (...args) => console.log("[_extractBasicInfo:evaluate]", ...args);
    const getText = (el) => el?.innerText?.trim() || "";

    // ── Name ──────────────────────────────────────────────────────────────────
    const nameEl =
      document.querySelector("main h1") ||
      document.querySelector("main h2");
    const name = getText(nameEl);
    log("Name element found:", !!nameEl, "| Name:", name);

    // ── Location ──────────────────────────────────────────────────────────────
    // let location = "";
    // const contactAnchor = document.querySelector('a[href*="contact-info"]');
    // log("Contact anchor found:", !!contactAnchor);

    // if (contactAnchor) {
    //   const contactP = contactAnchor.closest("p");
    //   log("Contact <p> found:", !!contactP);

    //   if (contactP) {
    //     let sibling = contactP.previousElementSibling;
    //     while (sibling) {
    //       const text = sibling.innerText?.trim();
    //       log("Checking sibling text:", text);

    //       if (text && text !== "·" && text !== "•") {
    //         location = text;
    //         break;
    //       }
    //       sibling = sibling.previousElementSibling;
    //     }
    //   }
    // }

    // log("Final extracted location:", location);
    // ── Location ──────────────────────────────────────────────────────────────
    let location = "";

    // Grab all visible <p> tags in top section and find a likely location
    const possiblePs = Array.from(document.querySelectorAll("main p"));

    for (const p of possiblePs) {
      const text = p.innerText?.trim();

      // heuristic: location usually has comma + no "Contact info"
      if (
        text &&
        text.includes(",") &&
        !text.toLowerCase().includes("contact") &&
        !text.includes("·") &&
        text.length < 100
      ) {
        location = text;
        break;
      }
    }

    log("Final extracted location:", location);

    // ── Profile image ─────────────────────────────────────────────────────────
    const imgEl =
      document.querySelector("img.pv-top-card-profile-picture__image--show") ||
      document.querySelector(".pv-top-card__photo img") ||
      document.querySelector("main img.evi-image");

    const profileImageUrl = imgEl?.src || "";
    log("Profile image found:", !!imgEl, "| URL:", profileImageUrl);

    return { name, location, profileImageUrl };
  });
}


async function _extractContactInfo(page) {
  console.log("[_extractContactInfo] ▶ Starting extraction");

  const result = { emails: [], phones: [], websites: [] };

  // ── Step 1: Click the "Contact info" link ──────────────────────────────────
  let clicked = false;
  try {
    const link = page.getByRole("link", { name: /contact info/i }).first();
    await link.waitFor({ state: "visible", timeout: 5000 });
    await link.click({ force: true });
    clicked = true;
    console.log("[_extractContactInfo] Step 1: ✓ Clicked.");
  } catch (err) {
    console.warn("[_extractContactInfo] Step 1: ✗ Could not click Contact info link:", err.message);
  }

  if (!clicked) {
    console.warn("[_extractContactInfo] ⚠ Skipping contact extraction — link not found.");
    return result;
  }

  // ── Step 2: Wait for the modal to appear ──────────────────────────────────
  try {
    await page.waitForSelector(
      '.artdeco-modal__content, .pv-contact-info, [data-view-name="profile-card-contact-info"]',
      { timeout: 8000 }
    );
  } catch (err) {
    console.warn("[_extractContactInfo] Step 2: ✗ Modal wait timed out:", err.message, "— waiting 3s fallback...");
    await page.waitForTimeout(3000);
  }

  // Dump modal HTML for debugging
  try {
    const modalHtml = await page.evaluate(() => {
      const el =
        document.querySelector(".artdeco-modal__content") ||
        document.querySelector(".pv-contact-info");
      return el ? el.innerHTML.substring(0, 3000) : "(modal not found in DOM)";
    });
  } catch (err) {
    console.warn("[_extractContactInfo] Could not dump modal HTML:", err.message);
  }

  // ── Step 3: Extract emails ─────────────────────────────────────────────────
  try {
    console.log("[_extractContactInfo] Step 3: Extracting emails...");
    const emails = await page.evaluate(() => {
      const found = [];
      document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
        const email = a.href.replace("mailto:", "").split("?")[0].trim();
        if (email && !found.includes(email)) found.push(email);
      });
      // fallback: look for <p> labelled "email" and grab sibling text
      document.querySelectorAll("p").forEach((p) => {
        if (p.innerText?.trim().toLowerCase() !== "email") return;
        const parent = p.parentElement;
        const link = parent?.querySelector('a[href^="mailto:"]');
        if (link) {
          const email = link.href.replace("mailto:", "").split("?")[0].trim();
          if (email && !found.includes(email)) found.push(email);
        }
      });
      return found;
    });
    console.log("[_extractContactInfo] Step 3: emails →", emails);
    result.emails = emails;
  } catch (err) {
    console.warn("[_extractContactInfo] Step 3: ✗ Email extraction failed:", err.message);
  }

  // ── Step 4: Extract phones ─────────────────────────────────────────────────
  try {
    console.log("[_extractContactInfo] Step 4: Extracting phones...");
    const phones = await page.evaluate(() => {
      const found = [];
      document.querySelectorAll("p").forEach((p) => {
        if (p.innerText?.trim().toLowerCase() !== "phone") return;
        const parent = p.parentElement;
        if (!parent) return;
        // phone value is usually in a sibling <p> or <span>
        const siblings = Array.from(parent.querySelectorAll("p, span"));
        for (const el of siblings) {
          const text = el.innerText?.trim();
          const match = text?.match(/[\d\s\-()+]{7,}/);
          if (match) {
            const digits = match[0].replace(/\D/g, "");
            if (digits.length >= 7 && !found.includes(digits)) {
              found.push(digits);
            }
          }
        }
      });
      return found;
    });
    console.log("[_extractContactInfo] Step 4: phones →", phones);
    result.phones = phones;
  } catch (err) {
    console.warn("[_extractContactInfo] Step 4: ✗ Phone extraction failed:", err.message);
  }

  // ── Step 5: Extract websites ───────────────────────────────────────────────
  try {
    console.log("[_extractContactInfo] Step 5: Extracting websites...");
    const websites = await page.evaluate(() => {
      const found = [];
      document.querySelectorAll("p").forEach((p) => {
        if (!p.innerText?.trim().toLowerCase().includes("website")) return;
        const parent = p.parentElement;
        const link = parent?.querySelector("a[href]");
        if (link && !link.href.includes("linkedin.com") && !found.includes(link.href)) {
          found.push(link.href);
        }
      });
      return found;
    });
    console.log("[_extractContactInfo] Step 5: websites →", websites);
    result.websites = websites;
  } catch (err) {
    console.warn("[_extractContactInfo] Step 5: ✗ Website extraction failed:", err.message);
  }

  // ── Step 6: Dismiss modal ──────────────────────────────────────────────────
  try {
    console.log("[_extractContactInfo] Step 6: Dismissing modal...");
    const closeBtn = page.locator('button[aria-label="Dismiss"], button.artdeco-modal__dismiss');
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      console.log("[_extractContactInfo] Step 6: ✓ Modal dismissed.");
    } else {
      console.log("[_extractContactInfo] Step 6: No dismiss button visible.");
    }
  } catch (err) {
    console.warn("[_extractContactInfo] Step 6: ✗ Dismiss failed:", err.message);
  }

  console.log("[_extractContactInfo] ✓ Done. Result:", JSON.stringify(result));
  return result;
}


// ─── Public scraping API ──────────────────────────────────────────────────────

export async function scrapeProfile(linkedinId, profileUrl) {
  const url = normalizeUrl(profileUrl);
  console.log(`[SCRAPER] ▶ Start | user=${linkedinId} | url="${url}"`);

  const context = await _getScrapingContext();
  console.log("[SCRAPER] Context acquired");

  const page = await context.newPage();
  console.log("[SCRAPER] New page created");

  try {
    console.log("[SCRAPER] Navigating to profile...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const currentUrl = page.url();
    console.log("[SCRAPER] Current URL:", currentUrl);

    if (currentUrl.includes("/login") || currentUrl.includes("/authwall")) {
      console.warn("[SESSION] ✗ Session expired — resetting scraping context");
      await _resetScrapingContext();
      throw new Error("SESSION_EXPIRED");
    }

    console.log("[SCRAPER] Waiting for main content...");
    await page.waitForSelector("main", { timeout: 30000 });

    console.log("[SCRAPER] Extracting basic info...");
    const basicInfo = await _extractBasicInfo(page);

    console.log("[SCRAPER] Extracting contact info...");
    const contactInfo = await _extractContactInfo(page);

    const finalData = {
      ...basicInfo,
      ...contactInfo,
      profileUrl: url,
      scrapedAt: new Date(),
    };

    console.log("[SCRAPER] ✅ Extraction complete:", finalData);

    return finalData;
  } catch (err) {
    console.error("[SCRAPER] ❌ Failed:", err.message);
    throw err;
  } finally {
    console.log("[SCRAPER] Closing page");
    await page.close();
  }
}