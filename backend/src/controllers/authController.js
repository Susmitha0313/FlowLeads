import {
  hasValidSession,
  startLoginSession,
  closeLoginSession,
  clearSession,
} from "../services/scraperService.js";
let loginState = {
  inProgress: false,
  completed: false,
};

export const getAuthStatus = async (_req, res) => {
  try {
    if (loginState.inProgress) {
      return res.json({
        active: false,
        inProgress: true,
        completed: false,
      });
    }

    const active = await hasValidSession();

    res.json({
      active, // session exists
      inProgress: loginState.inProgress,
      completed: loginState.completed,
    });
  } catch (err) {
    console.error(`[AUTH:getAuthStatus] ✗ ${err.message}`);

    res.status(500).json({
      active: false,
      inProgress: false,
      completed: false,
    });
  }
};

/**
 * POST /api/auth/login
 * Opens a visible Playwright browser on the server for manual LinkedIn login.
 * Client polls /auth/status every few seconds until active.
 */
export const login = async (_req, res) => {
  if (await hasValidSession()) {
    return res.json({
      success: true,
      message: "Already logged in",
      active: true,
    });
  }
  try {
    await startLoginSession();
    res.json({
      success: true,
      message: "Browser opened — log in manually",
      active: false,
    });
  } catch (err) {
    console.error(`[AUTH:login] ✗ ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/auth/logout
 * Closes the shared browser context so the session is dropped.
 */
export const logout = async (_req, res) => {
  console.log("[SESSION] User triggered logout — removing session...");
  try {
    await closeLoginSession();
    await clearSession();
    loginState = { inProgress: false, completed: false };
    console.log("[SESSION] ✓ Session removed");
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    console.error(`[AUTH:logout] ✗ ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
