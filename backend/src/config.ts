import path from 'path';

// Paths can be overridden with env vars (used by the tests to get a throwaway
// database). Defaults resolve to backend/data and backend/uploads, which are
// /app/data and /app/uploads inside the Docker image.
export const PORT = Number(process.env.PORT) || 3001;
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '../data'));
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));

// Only needed when the frontend is served from another origin. Behind the
// bundled nginx (or the Vite dev proxy) everything is same-origin.
export const CLIENT_URL = process.env.CLIENT_URL && process.env.CLIENT_URL !== '*' ? process.env.CLIENT_URL : '';

// Demo trips are added once, when the database is created. SEED_DEMO=false skips them.
export const SEED_DEMO = process.env.SEED_DEMO !== 'false';

// Video support needs ffmpeg + ffprobe (bundled in the Docker image)
export const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

// Per-file upload limits
export const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB) || 50;
export const MAX_VIDEO_MB = Number(process.env.MAX_VIDEO_MB) || 4096;
