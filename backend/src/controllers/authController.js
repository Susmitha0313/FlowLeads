import axios from "axios";
import jwt from "jsonwebtoken";

const {
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI,
  JWT_SECRET,
  APP_DEEP_LINK_SCHEME,
} = process.env;

/**
 * GET /api/auth/linkedin/callback
 * LinkedIn redirects here with ?code=xxx&state=yyy
 * We deep-link the code back to the app so the app can call /api/auth/linkedin to exchange it.
 */
export const linkedinOAuthCallback = (req, res) => {
  const { code, error, error_description } = req.query;

  // e.g. "bobi" — the app scheme registered in app.json
  const scheme = APP_DEEP_LINK_SCHEME || "bobi";

  if (error || !code) {
    const msg = error_description || error || "unknown_error";
    console.error("[AUTH:oauthCallback] LinkedIn error:", msg);
    // Deep-link back with the error so the app can show an alert
    return res.redirect(`${scheme}://login?error=${encodeURIComponent(msg)}`);
  }

  console.log("[AUTH:oauthCallback] Got code, redirecting to app...");
  // Hand the code back to the app via deep link
  res.redirect(`${scheme}://login?code=${encodeURIComponent(code)}`);
};

/**
 * POST /api/auth/linkedin
 * Body: { code }
 * Exchanges the authorization code for a LinkedIn access token,
 * fetches the user profile via OpenID Connect, then issues a signed JWT.
 * The redirect_uri used here MUST match the one registered in LinkedIn Dev Console
 * (i.e. LINKEDIN_REDIRECT_URI — the backend HTTPS callback URL).
 */
export const linkedinCallback = async (req, res) => {
  const { code } = req.body;
  if (!code)
    return res.status(400).json({ error: "Authorization code required" });

  try {
    // 1. Exchange code for LinkedIn access token
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: LINKEDIN_REDIRECT_URI, // must match exactly what LinkedIn redirected to
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const linkedinAccessToken = tokenRes.data.access_token;

    // 2. Fetch profile via OpenID Connect userinfo endpoint
    //    (requires "Sign In with LinkedIn using OpenID Connect" product)
    const profileRes = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${linkedinAccessToken}` },
    });

    const { sub: id, name, given_name, family_name, email = null } = profileRes.data;
    const displayName = name || `${given_name ?? ""} ${family_name ?? ""}`.trim();

    // 3. Issue our own JWT
    const token = jwt.sign({ linkedinId: id, name: displayName, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    console.log(`[AUTH:linkedinCallback] ✓ Issued JWT for ${displayName} (${id})`);
    res.json({ token, user: { name: displayName, email } });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error("[AUTH:linkedinCallback] ✗", detail);
    res.status(500).json({ error: "LinkedIn authentication failed", detail });
  }
};


 /* GET /api/auth/me
 * Returns the decoded JWT payload (requires Authorization: Bearer <token>).
 */
export const getMe = (req, res) => {
  res.json({ user: req.user });
};
