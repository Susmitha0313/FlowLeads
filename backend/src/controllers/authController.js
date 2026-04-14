import axios from "axios";
import jwt from "jsonwebtoken";

// Read at call-time so dotenv.config() in server.js has already run
const env = () => ({
  LINKEDIN_CLIENT_ID:     process.env.LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI:  process.env.LINKEDIN_REDIRECT_URI,
  JWT_SECRET:             process.env.JWT_SECRET,
  APP_DEEP_LINK_SCHEME:   process.env.APP_DEEP_LINK_SCHEME,
});

/**
 * GET /api/auth/linkedin/callback
 * LinkedIn redirects here → we deep-link the code back to the app.
 */
export const linkedinOAuthCallback = (req, res) => {
  const { code, error, error_description, state } = req.query;
  const { APP_DEEP_LINK_SCHEME } = env();
  const scheme = APP_DEEP_LINK_SCHEME || "bobi";

  console.log(`[AUTH:oauthCallback] Received callback — code=${!!code} error=${error ?? 'none'} state=${state ?? 'none'}`);

  if (error || !code) {
    const msg = error_description || error || "unknown_error";
    console.error(`[AUTH:oauthCallback] ✗ LinkedIn returned error: "${msg}"`);
    return res.redirect(`${scheme}://login?error=${encodeURIComponent(msg)}`);
  }

  console.log(`[AUTH:oauthCallback] ✓ Code received, deep-linking to ${scheme}://login`);
  res.redirect(`${scheme}://login?code=${encodeURIComponent(code)}`);
};

/**
 * POST /api/auth/linkedin
 * Body: { code }
 * Exchanges the code for a LinkedIn access token, fetches profile, issues JWT.
 */
export const linkedinCallback = async (req, res) => {
  const { code } = req.body;
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI, JWT_SECRET } = env();

  console.log(`[AUTH:linkedinCallback] Code exchange request received — code present: ${!!code}`);
  console.log(`[AUTH:linkedinCallback] Using redirect_uri: ${LINKEDIN_REDIRECT_URI}`);
  console.log(`[AUTH:linkedinCallback] client_id present: ${!!LINKEDIN_CLIENT_ID} | client_secret present: ${!!LINKEDIN_CLIENT_SECRET} | jwt_secret present: ${!!JWT_SECRET}`);

  if (!code) {
    console.warn('[AUTH:linkedinCallback] ✗ No code in request body');
    return res.status(400).json({ error: "Authorization code required" });
  }

  // ── Step 1: Exchange code for access token ─────────────────────────────
  let linkedinAccessToken;
  try {
    console.log('[AUTH:linkedinCallback] Step 1 — Exchanging code for LinkedIn access token...');
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: LINKEDIN_REDIRECT_URI,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    linkedinAccessToken = tokenRes.data.access_token;
    const masked = linkedinAccessToken
      ? `${linkedinAccessToken.slice(0, 8)}...${linkedinAccessToken.slice(-4)}`
      : 'MISSING';
    console.log(`[AUTH:linkedinCallback] ✓ Step 1 — LinkedIn access token: ${masked} (expires_in: ${tokenRes.data.expires_in}s)`);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    console.error(`[AUTH:linkedinCallback] ✗ Step 1 — Token exchange failed (HTTP ${status})`);
    console.error(`[AUTH:linkedinCallback]   LinkedIn response:`, JSON.stringify(detail));
    console.error(`[AUTH:linkedinCallback]   Hint: check client_id, client_secret, redirect_uri match LinkedIn Dev Console`);
    return res.status(502).json({ error: "Token exchange failed", detail });
  }

  // ── Step 2: Fetch user profile (r_liteprofile + r_emailaddress) ───────────
  let profileData;
  try {
    console.log('[AUTH:linkedinCallback] Step 2 — Fetching name + email in parallel...');
    const headers = { Authorization: `Bearer ${linkedinAccessToken}` };

    const [meRes, emailRes] = await Promise.all([
      axios.get("https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)", { headers }),
      axios.get("https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))", { headers }),
    ]);

    const firstName = meRes.data.localizedFirstName ?? "";
    const lastName  = meRes.data.localizedLastName  ?? "";
    const id        = meRes.data.id;
    const email     = emailRes.data?.elements?.[0]?.["handle~"]?.emailAddress ?? null;

    profileData = { id, name: `${firstName} ${lastName}`.trim(), email };
    console.log(`[AUTH:linkedinCallback] ✓ Step 2 — Profile: id=${id} name="${profileData.name}" email=${email ?? 'none'}`);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    console.error(`[AUTH:linkedinCallback] ✗ Step 2 — Profile fetch failed (HTTP ${status})`);
    console.error(`[AUTH:linkedinCallback]   LinkedIn response:`, JSON.stringify(detail));
    console.error(`[AUTH:linkedinCallback]   Hint: ensure r_liteprofile and r_emailaddress products are enabled in LinkedIn Dev Console`);
    return res.status(502).json({ error: "Profile fetch failed", detail });
  }

  // ── Step 3: Issue JWT ──────────────────────────────────────────────────
  try {
    const { id, name: displayName, email = null } = profileData;

    console.log(`[AUTH:linkedinCallback] Step 3 — Signing JWT for "${displayName}" (${id})`);
    const token = jwt.sign({ linkedinId: id, name: displayName, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    const maskedJwt = `${token.slice(0, 12)}...${token.slice(-6)}`;
    console.log(`[AUTH:linkedinCallback] ✓ Step 3 — JWT issued for "${displayName}" | token: ${maskedJwt}`);
    res.json({ token, user: { name: displayName, email } });
  } catch (err) {
    console.error(`[AUTH:linkedinCallback] ✗ Step 3 — JWT signing failed: ${err.message}`);
    console.error(`[AUTH:linkedinCallback]   Hint: check JWT_SECRET is set in .env`);
    res.status(500).json({ error: "JWT signing failed", detail: err.message });
  }
};

/**
 * GET /api/auth/me
 * Returns the decoded JWT payload (requires Authorization: Bearer <token>).
 */
export const getMe = (req, res) => {
  console.log(`[AUTH:getMe] User: ${req.user?.name} (${req.user?.linkedinId})`);
  res.json({ user: req.user });
};
