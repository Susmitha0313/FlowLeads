import jwt from 'jsonwebtoken';

/**
 * Verifies the Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user on success.
 */
export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    console.warn(`[AUTH:requireAuth] ✗ Missing/invalid Authorization header on ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.warn(`[AUTH:requireAuth] ✗ Token verification failed on ${req.method} ${req.path} — ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
