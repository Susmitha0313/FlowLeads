import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './config/db.js';
import profileRoutes from './routes/profileRoutes.js';

dotenv.config();
console.log('[SERVER] Environment loaded');
console.log(`[SERVER] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[SERVER] PORT: ${process.env.PORT || 3000}`);
console.log(`[SERVER] LINKEDIN_EMAIL set: ${!!process.env.LINKEDIN_EMAIL}`);
console.log(`[SERVER] LINKEDIN_PASSWORD set: ${!!process.env.LINKEDIN_PASSWORD}`);
console.log(`[SERVER] MONGO_URL set: ${!!process.env.MONGO_URL}`);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Request logger — logs every incoming HTTP request
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`, Object.keys(req.body || {}).length ? req.body : '');
  next();
});

console.log('[SERVER] Registering routes under /api...');
app.use('/api', profileRoutes);
console.log('[SERVER] ✓ Routes registered');

connectDB();

app.listen(PORT, () => {
  console.log(`\n[SERVER] ✓ Running on http://localhost:${PORT}`);
  console.log('[SERVER] Ready to accept requests\n');
});
