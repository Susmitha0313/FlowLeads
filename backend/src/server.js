import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './config/db.js';
import profileRoutes from './routes/profileRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Request / Response logger ──────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const body = req.body && Object.keys(req.body).length
    ? JSON.stringify(req.body)
    : '';
  console.log(`[HTTP] → ${req.method} ${req.path} ${body}`);

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR'
                : res.statusCode >= 400 ? 'WARN'
                : 'INFO';
    console.log(`[HTTP] ← ${req.method} ${req.path} ${res.statusCode} (${ms}ms) [${level}]`);
  });

  next();
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, _res, next) => {
  console.error(`[SERVER] Unhandled error on ${req.method} ${req.path}`);
  console.error(`[SERVER] ${err.stack || err.message}`);
  next(err);
});

app.use('/api', profileRoutes);
console.log('[SERVER] ✓ Routes registered under /api');

connectDB();

app.listen(PORT, () => {
  console.log(`\n[SERVER] ✓ Running on http://localhost:${PORT}`);
  console.log(`[SERVER] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[SERVER] LINKEDIN_REDIRECT_URI=${process.env.LINKEDIN_REDIRECT_URI}`);
  console.log('[SERVER] Ready to accept requests\n');
});
