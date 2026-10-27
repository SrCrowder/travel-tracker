import express from 'express';
import cors from 'cors';
import multer from 'multer';
import tripsRouter from './routes/trips';
import locationsRouter from './routes/locations';
import photosRouter from './routes/photos';
import { authRouter, requireAuth } from './middleware/auth';
import { removeUploadedFiles, uploadHeaders } from './middleware/upload';
import { CLIENT_URL, UPLOADS_DIR } from './config';

const app = express();
// Behind nginx / a reverse proxy: only trust X-Forwarded-* from private
// networks, so a client reaching the API directly can't fake its IP
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');

// ─── Middleware ───────────────────────────────────────────────────────────────
// CORS is only needed when the frontend lives on another origin (CLIENT_URL)
if (CLIENT_URL) {
  app.use(cors({
    origin: CLIENT_URL,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  }));
}

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
app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  removeUploadedFiles(req);
  // Multer errors (file too large, too many files…) are client errors
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
});

export default app;
