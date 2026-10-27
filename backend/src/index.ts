import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeSchema } from './database/schema';
import { seedIfEmpty } from './database/seed';
import tripsRouter from './routes/trips';
import locationsRouter from './routes/locations';
import photosRouter from './routes/photos';

const app = express();
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

// ─── Static files (uploaded images) ──────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// ─── Routes ───────────────────────────────────────────────────────────────────
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
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
initializeSchema();
seedIfEmpty(); // no-op if data already exists

app.listen(PORT, () => {
  console.log(`\n🌍 Travel Tracker API running on http://localhost:${PORT}`);
  console.log(`   Uploads:  http://localhost:${PORT}/uploads/<filename>`);
  console.log(`   Health:   http://localhost:${PORT}/health\n`);
});

export default app;
