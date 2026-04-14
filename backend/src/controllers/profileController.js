import Profile from '../models/Profile.js';
import * as scraperService from '../services/scraperService.js';
import { exportToExcel } from '../services/excelService.js';
import { generateVCF } from '../services/contactService.js';

const SHARED_SESSION = 'shared';

export const extractProfile = async (req, res) => {
  const { url } = req.body;
  console.log(`[CTRL:extractProfile] Request — url="${url}" user=${req.user?.name}`);

  if (!url) {
    console.warn('[CTRL:extractProfile] ✗ No URL in request body');
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    const normalizedUrl = scraperService.normalizeUrl(url);
    console.log(`[CTRL:extractProfile] Normalized URL: "${normalizedUrl}"`);

    if (!normalizedUrl.includes('linkedin.com/in/')) {
      console.warn(`[CTRL:extractProfile] ✗ Invalid LinkedIn URL: "${normalizedUrl}"`);
      return res.status(400).json({ error: 'Invalid LinkedIn profile URL' });
    }

    console.log(`[CTRL:extractProfile] Starting scrape...`);
    const data = await scraperService.scrapeProfile(SHARED_SESSION, normalizedUrl);
    console.log(`[CTRL:extractProfile] ✓ Scrape complete — name="${data.name}"`);

    const profile = await Profile.findOneAndUpdate(
      { profileUrl: normalizedUrl },
      { ...data, profileUrl: normalizedUrl },
      { new: true, upsert: true }
    );
    console.log(`[CTRL:extractProfile] ✓ Saved to DB — id=${profile._id}`);

    res.json({ profile, cached: false });
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      console.warn('[CTRL:extractProfile] ✗ LinkedIn session expired — user must re-authenticate');
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    console.error(`[CTRL:extractProfile] ✗ Unexpected error: ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
};

export const getProfiles = async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const skip   = (page - 1) * limit;
  const search = req.query.search?.trim() || '';

  console.log(`[CTRL:getProfiles] page=${page} limit=${limit} search="${search}" user=${req.user?.name}`);

  try {
    const filter = search ? { $text: { $search: search } } : {};
    const [profiles, total] = await Promise.all([
      Profile.find(filter).sort({ scrapedAt: -1 }).skip(skip).limit(limit),
      Profile.countDocuments(filter),
    ]);
    console.log(`[CTRL:getProfiles] ✓ Returning ${profiles.length}/${total} profiles`);
    res.json({ profiles, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(`[CTRL:getProfiles] ✗ DB error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const getProfileById = async (req, res) => {
  console.log(`[CTRL:getProfileById] id=${req.params.id}`);
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) {
      console.warn(`[CTRL:getProfileById] ✗ Not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(profile);
  } catch (err) {
    console.error(`[CTRL:getProfileById] ✗ DB error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const deleteProfile = async (req, res) => {
  console.log(`[CTRL:deleteProfile] id=${req.params.id} user=${req.user?.name}`);
  try {
    await Profile.findByIdAndDelete(req.params.id);
    console.log(`[CTRL:deleteProfile] ✓ Deleted ${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(`[CTRL:deleteProfile] ✗ DB error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  const allowed = ['name','headline','designation','company','location','emails','phones','websites','notes','tags'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  console.log(`[CTRL:updateProfile] id=${req.params.id} fields=${Object.keys(updates).join(', ')}`);

  try {
    const profile = await Profile.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!profile) {
      console.warn(`[CTRL:updateProfile] ✗ Not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Not found' });
    }
    console.log(`[CTRL:updateProfile] ✓ Updated ${req.params.id}`);
    res.json({ profile });
  } catch (err) {
    console.error(`[CTRL:updateProfile] ✗ DB error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const refreshProfile = async (req, res) => {
  console.log(`[CTRL:refreshProfile] id=${req.params.id} user=${req.user?.name}`);
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) {
      console.warn(`[CTRL:refreshProfile] ✗ Not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Not found' });
    }

    console.log(`[CTRL:refreshProfile] Re-scraping "${profile.profileUrl}"...`);
    const data = await scraperService.scrapeProfile(SHARED_SESSION, profile.profileUrl);
    Object.assign(profile, data);
    profile.scrapedAt = new Date();
    await profile.save();

    console.log(`[CTRL:refreshProfile] ✓ Refreshed "${profile.name}"`);
    res.json({ profile, refreshed: true });
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      console.warn('[CTRL:refreshProfile] ✗ LinkedIn session expired');
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    console.error(`[CTRL:refreshProfile] ✗ Error: ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
};

export const exportProfiles = async (req, res) => {
  console.log(`[CTRL:exportProfiles] user=${req.user?.name}`);
  try {
    const profiles = await Profile.find().sort({ scrapedAt: -1 });
    console.log(`[CTRL:exportProfiles] Exporting ${profiles.length} profiles to Excel...`);
    const buffer = await exportToExcel(profiles);
    console.log(`[CTRL:exportProfiles] ✓ Excel buffer size: ${buffer.length} bytes`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="linkedin-contacts.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error(`[CTRL:exportProfiles] ✗ Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const downloadContact = async (req, res) => {
  console.log(`[CTRL:downloadContact] id=${req.params.id}`);
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) {
      console.warn(`[CTRL:downloadContact] ✗ Not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Not found' });
    }
    const vcf = generateVCF(profile.toObject());
    const filename = `${(profile.name || 'contact').replace(/\s+/g, '_')}.vcf`;
    console.log(`[CTRL:downloadContact] ✓ Sending VCF: "${filename}"`);
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(vcf);
  } catch (err) {
    console.error(`[CTRL:downloadContact] ✗ Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
