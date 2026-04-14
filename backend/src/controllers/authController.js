import axios from "axios";
import jwt from "jsonwebtoken";

// Read at call-time so dotenv.config() in server.js has already run
const env = () => ({
  LINKEDIN_CLIENT_ID:     process.env.LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI:  process.env.LINKEDIN_REDIRECT_URI,
  JWT_SECRET:             process.env.JWT_SECRET,
  APP_DEEP_LINK_SCHEME:   process.env.APP_DEEP_LINK_SCHEME,
  APP_WEB_URL:            process.env.APP_WEB_URL,
});

/**
 * GET /api/auth/linkedin/callback
 * LinkedIn redirects here → we deep-link the code back to the app.
 */
export const linkedinOAuthCallback = (req, res) => {
  const { code, error, error_description, state } = req.query;
  const { APP_DEEP_LINK_SCHEME, APP_WEB_URL } = env();
  const scheme = APP_DEEP_LINK_SCHEME || "bobi";

  // Detect if the request came from the web platform via the state param
  const isWeb = typeof state === 'string' && state.includes('platform=web');
  const webBase = APP_WEB_URL || "http://localhost:8081";

  console.log(`[AUTH:oauthCallback] Received callback — code=${!!code} error=${error ?? 'none'} state=${state ?? 'none'} isWeb=${isWeb}`);

  if (error || !code) {
    const msg = error_description || error || "unknown_error";
    console.error(`[AUTH:oauthCallback] ✗ LinkedIn returned error: "${msg}"`);
    const dest = isWeb
      ? `${webBase}/login?error=${encodeURIComponent(msg)}`
      : `${scheme}://login?error=${encodeURIComponent(msg)}`;
    return res.redirect(dest);
  }

  const dest = isWeb
    ? `${webBase}/login?code=${encodeURIComponent(code)}`
    : `${scheme}://login?code=${encodeURIComponent(code)}`;

  console.log(`[AUTH:oauthCallback] ✓ Code received, redirecting to ${dest}`);
  res.redirect(dest);
};

/**
 * POST /api/auth/linkedin
 * Body: { code }
 * Exchanges the code for a LinkedIn access token, fetches profile, issues JWT.
 */
export const linkedinCallback = async (req, res) => {
  const { code, redirectUri: clientRedirectUri } = req.body;
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI, JWT_SECRET } = env();

  // Prefer the redirectUri sent by the client (varies per environment: Expo Go proxy, web, build)
  // Fall back to the env var for backwards compatibility
  const effectiveRedirectUri = clientRedirectUri || LINKEDIN_REDIRECT_URI;

  console.log(`[AUTH:linkedinCallback] Code exchange request received — code present: ${!!code}`);
  console.log(`[AUTH:linkedinCallback] Using redirect_uri: ${effectiveRedirectUri} (from ${clientRedirectUri ? 'client' : 'env'})`);
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
        redirect_uri: effectiveRedirectUri,
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

  // ── Step 2: Fetch user profile via OpenID Connect ──────────────────────
  let profileData;
  try {
    console.log('[AUTH:linkedinCallback] Step 2 — Fetching user profile from /v2/userinfo...');
    const profileRes = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${linkedinAccessToken}` },
    });
    profileData = profileRes.data;
    console.log(`[AUTH:linkedinCallback] ✓ Step 2 — Profile fetched: sub=${profileData.sub} name="${profileData.name}" email=${profileData.email ?? 'none'}`);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    console.error(`[AUTH:linkedinCallback] ✗ Step 2 — Profile fetch failed (HTTP ${status})`);
    console.error(`[AUTH:linkedinCallback]   LinkedIn response:`, JSON.stringify(detail));
    console.error(`[AUTH:linkedinCallback]   Hint: ensure "Sign In with LinkedIn using OpenID Connect" product is enabled`);
    return res.status(502).json({ error: "Profile fetch failed", detail });
  }

  // ── Step 3: Issue JWT ──────────────────────────────────────────────────
  try {
    const { sub: id, name, given_name, family_name, email = null } = profileData;
    const displayName = name || `${given_name ?? ""} ${family_name ?? ""}`.trim();

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
