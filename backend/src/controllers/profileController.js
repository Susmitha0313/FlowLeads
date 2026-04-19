import Profile from '../models/Profile.js';
import * as scraperService from '../services/scraperService.js';
import { exportToExcel } from '../services/excelService.js';
import { generateVCF } from '../services/contactService.js';

export const extractProfile = async (req, res) => {
  const { url } = req.body;
  console.log(`[CTRL:extractProfile] url="${url}"`);

  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const normalizedUrl = scraperService.normalizeUrl(url);
    if (!normalizedUrl.includes('linkedin.com/in/')) {
      return res.status(400).json({ error: 'Invalid LinkedIn profile URL' });
    }

    const data = await scraperService.scrapeProfile('shared', normalizedUrl);
    console.log(`[CTRL:extractProfile] ✓ Scraped "${data.name}"`);

    const profile = await Profile.findOneAndUpdate(
      { profileUrl: normalizedUrl },
      { ...data, profileUrl: normalizedUrl },
      { new: true, upsert: true }
    );
    console.log(`[CTRL:extractProfile] ✓ Saved — id=${profile._id}`);
    res.json({ profile, cached: false });
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      console.warn('[CTRL:extractProfile] ✗ Session expired');
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    if (err.message?.startsWith('NO_SESSION')) {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    console.error(`[CTRL:extractProfile] ✗ ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const getProfiles = async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit) || 20);
  const skip   = (page - 1) * limit;
  const search = req.query.search?.trim() || '';

  console.log(`[CTRL:getProfiles] page=${page} limit=${limit} search="${search}"`);

  try {
    const filter = search ? { $text: { $search: search } } : {};
    const [profiles, total] = await Promise.all([
      Profile.find(filter).sort({ scrapedAt: -1 }).skip(skip).limit(limit),
      Profile.countDocuments(filter),
    ]);
    res.json({ profiles, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(`[CTRL:getProfiles] ✗ ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const getProfileById = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteProfile = async (req, res) => {
  try {
    const deleted = await Profile.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    console.log(`[CTRL:deleteProfile] ✓ Deleted ${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  const allowed = ['name','headline','designation','company','industry','location','connections','emails','phones','websites','notes','tags'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

  try {
    const profile = await Profile.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!profile) return res.status(404).json({ error: 'Not found' });
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const refreshProfile = async (req, res) => {
  console.log(`[CTRL:refreshProfile] id=${req.params.id}`);
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });

    const data = await scraperService.scrapeProfile('shared', profile.profileUrl);
    Object.assign(profile, data);
    profile.scrapedAt = new Date();
    await profile.save();

    console.log(`[CTRL:refreshProfile] ✓ Refreshed "${profile.name}"`);
    res.json({ profile, refreshed: true });
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    console.error(`[CTRL:refreshProfile] ✗ ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

export const exportProfiles = async (req, res) => {
  console.log('[CTRL:exportProfiles]');
  try {
    const profiles = await Profile.find().sort({ scrapedAt: -1 });
    const buffer = await exportToExcel(profiles);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="linkedin-contacts.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const downloadContact = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    const vcf = generateVCF(profile.toObject());
    const filename = `${(profile.name || 'contact').replace(/\s+/g, '_')}.vcf`;
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(vcf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
