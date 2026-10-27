import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { initializeSchema } from './database/schema';
import { seedIfEmpty } from './database/seed';
import tripsRouter from './routes/trips';
import locationsRouter from './routes/locations';
import photosRouter from './routes/photos';
import { authRouter, requireAuth, AUTH_ENABLED } from './middleware/auth';
import { UPLOADS_DIR, uploadHeaders, removeUploadedFiles } from './middleware/upload';

const app = express();
// Behind nginx: lets req.ip / req.secure reflect the real client
app.set('trust proxy', 1);
app.disable('x-powered-by');
const PORT = Number(process.env.PORT) || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [CLIENT_URL, 'http://localhost:5173', 'http://localhost:4173'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Auth (public) ────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ─── Static files (uploaded images) ──────────────────────────────────────────
app.use('/uploads', requireAuth, express.static(UPLOADS_DIR, { setHeaders: uploadHeaders }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', requireAuth);
app.use('/api/trips', tripsRouter);
app.use('/api/trips/:tripId/locations', locationsRouter);
app.use('/api/trips/:tripId/photos', photosRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  removeUploadedFiles(req);
  // Multer errors (file too large, too many files…) are client errors
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
initializeSchema();
seedIfEmpty(); // no-op if data already exists

app.listen(PORT, () => {
  console.log(`\n🌍 Travel Tracker API running on http://localhost:${PORT}`);
  console.log(`   Uploads:  http://localhost:${PORT}/uploads/<filename>`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log(`   Login:    ${AUTH_ENABLED ? 'enabled' : 'disabled (set WEB_PASSWORD to enable)'}\n`);
});

export default app;
