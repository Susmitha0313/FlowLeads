import Profile from '../models/Profile.js';
import scraperService from '../services/scraperService.js';
import { exportToExcel } from '../services/excelService.js';
import { generateVCF } from '../services/contactService.js';

export const checkAuthStatus = (_req, res) => {
  console.log('[CTRL:checkAuthStatus] ▶ Request received');
  const authenticated = scraperService.isAuthenticated();
  console.log(`[CTRL:checkAuthStatus] ✓ Result → authenticated: ${authenticated}`);
  res.json({ authenticated });
};

export const extractProfile = async (req, res) => {
  const { url } = req.body;
  console.log(`\n[CTRL:extractProfile] ▶ Request received — url: "${url}"`);

  if (!url) {
    console.warn('[CTRL:extractProfile] ✗ Missing url in request body');
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    const normalizedUrl = scraperService.normalizeUrl(url);

    console.log('[CTRL:extractProfile] Checking DB cache...');
    const cached = await Profile.findOne({ profileUrl: normalizedUrl });
    if (cached) {
      console.log(`[CTRL:extractProfile] ✓ Cache hit — id: ${cached._id}, name: "${cached.name}"`);
      return res.json({ profile: cached, cached: true });
    }
    console.log('[CTRL:extractProfile] Cache miss — handing off to scraperService');

    const scrapeStart = Date.now();
    const data = await scraperService.scrapeProfile(url);
    console.log(`[CTRL:extractProfile] ✓ Scrape returned in ${Date.now() - scrapeStart}ms`);
    console.log(`[CTRL:extractProfile] Scraped data summary — name: "${data.name}", emails: ${data.emails?.length ?? 0}, phones: ${data.phones?.length ?? 0}`);

    console.log('[CTRL:extractProfile] Saving to MongoDB...');
    const profile = new Profile(data);
    await profile.save();
    console.log(`[CTRL:extractProfile] ✓ Saved — id: ${profile._id}`);

    res.json({ profile, cached: false });
  } catch (err) {
    if (err.message?.startsWith('LOGIN_FAILED')) {
      console.error(`[CTRL:extractProfile] ✗ Login failed — ${err.message}`);
      return res.status(401).json({ error: err.message });
    }
    console.error(`[CTRL:extractProfile] ✗ Unexpected error — ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
};

export const getProfiles = async (_req, res) => {
  console.log('[CTRL:getProfiles] ▶ Fetching all profiles...');
  try {
    const profiles = await Profile.find().sort({ scrapedAt: -1 });
    console.log(`[CTRL:getProfiles] ✓ Found ${profiles.length} profile(s)`);
    res.json({ profiles, total: profiles.length });
  } catch (err) {
    console.error(`[CTRL:getProfiles] ✗ DB error — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const getProfileById = async (req, res) => {
  const { id } = req.params;
  console.log(`[CTRL:getProfileById] ▶ Fetching id: ${id}`);
  try {
    const profile = await Profile.findById(id);
    if (!profile) {
      console.warn(`[CTRL:getProfileById] ✗ Not found — id: ${id}`);
      return res.status(404).json({ error: 'Not found' });
    }
    console.log(`[CTRL:getProfileById] ✓ Found — name: "${profile.name}"`);
    res.json(profile);
  } catch (err) {
    console.error(`[CTRL:getProfileById] ✗ Error for id ${id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const deleteProfile = async (req, res) => {
  const { id } = req.params;
  console.log(`[CTRL:deleteProfile] ▶ Deleting id: ${id}`);
  try {
    const deleted = await Profile.findByIdAndDelete(id);
    if (!deleted) {
      console.warn(`[CTRL:deleteProfile] ⚠ No document found for id: ${id}`);
    } else {
      console.log(`[CTRL:deleteProfile] ✓ Deleted — name: "${deleted.name}"`);
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(`[CTRL:deleteProfile] ✗ Error for id ${id} — ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const refreshProfile = async (req, res) => {
  const { id } = req.params;
  console.log(`\n[CTRL:refreshProfile] ▶ Refresh requested for id: ${id}`);
  try {
    const profile = await Profile.findById(id);
    if (!profile) {
      console.warn(`[CTRL:refreshProfile] ✗ Profile not found — id: ${id}`);
      return res.status(404).json({ error: 'Not found' });
    }
    console.log(`[CTRL:refreshProfile] Re-scraping "${profile.name}" → ${profile.profileUrl}`);

    const start = Date.now();
    const data = await scraperService.scrapeProfile(profile.profileUrl);
    console.log(`[CTRL:refreshProfile] ✓ Re-scrape done in ${Date.now() - start}ms`);

    Object.assign(profile, data);
    profile.scrapedAt = new Date();
    await profile.save();
    console.log(`[CTRL:refreshProfile] ✓ Profile updated in DB`);

    res.json({ profile, refreshed: true });
  } catch (err) {
    console.error(`[CTRL:refreshProfile] ✗ Error — ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
};

export const exportProfiles = async (_req, res) => {
  console.log('[CTRL:exportProfiles] ▶ Excel export requested');
  try {
    const profiles = await Profile.find().sort({ scrapedAt: -1 });
    console.log(`[CTRL:exportProfiles] Generating Excel for ${profiles.length} profile(s)...`);

    const start = Date.now();
    const buffer = await exportToExcel(profiles);
    console.log(`[CTRL:exportProfiles] ✓ Buffer ready — ${buffer.byteLength} bytes in ${Date.now() - start}ms`);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="linkedin-contacts.xlsx"');
    res.send(buffer);
    console.log('[CTRL:exportProfiles] ✓ Response sent');
  } catch (err) {
    console.error(`[CTRL:exportProfiles] ✗ Failed — ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
};

export const downloadContact = async (req, res) => {
  const { id } = req.params;
  console.log(`[CTRL:downloadContact] ▶ VCF requested for id: ${id}`);
  try {
    const profile = await Profile.findById(id);
    if (!profile) {
      console.warn(`[CTRL:downloadContact] ✗ Profile not found — id: ${id}`);
      return res.status(404).json({ error: 'Not found' });
    }
    console.log(`[CTRL:downloadContact] Generating VCF for "${profile.name}"...`);

    const vcf = generateVCF(profile.toObject());
    const filename = `${(profile.name || 'contact').replace(/\s+/g, '_')}.vcf`;

    console.log(`[CTRL:downloadContact] ✓ VCF ready — filename: "${filename}", ${vcf.length} chars`);
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(vcf);
  } catch (err) {
    console.error(`[CTRL:downloadContact] ✗ Failed — ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
};
