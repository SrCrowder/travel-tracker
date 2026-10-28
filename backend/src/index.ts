import 'dotenv/config';
import app from './app';
import { initDatabase } from './database';
import { AUTH_ENABLED } from './middleware/auth';
import { PORT } from './config';
import { backfillMetadata } from './services/backfill';
import { resumePendingMedia } from './services/mediaJobs';
import { videoSupport } from './services/videos';

initDatabase();

const server = app.listen(PORT, () => {
  console.log(`\n🌍 Travel Tracker API running on http://localhost:${PORT}`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log(`   Login:    ${AUTH_ENABLED ? 'enabled' : 'disabled (set WEB_PASSWORD to enable)'}\n`);

  // Background work: thumbnails, HEIC/video conversions (also interrupted ones),
  // metadata that couldn't be read before
  void videoSupport().then((ok) => {
    if (!ok) console.warn('⚠️  ffmpeg/ffprobe not found: video uploads are disabled');
  });
  const pending = resumePendingMedia();
  if (pending > 0) console.log(`🖼  ${pending} photo(s)/video(s) queued for processing`);
  void backfillMetadata().catch((err) => console.error('Metadata backfill failed:', err));
});

// Big videos on a slow connection take longer than Node's default 5 minutes
// per request (4 GB at ~5 Mbit/s ≈ 2 h). A request may last up to 3 hours, but
// a connection that stops sending data for 2 minutes is closed, so stalled
// clients can't hold sockets forever.
server.requestTimeout = 3 * 60 * 60 * 1000;
server.headersTimeout = 60 * 1000;
server.timeout = 2 * 60 * 1000;
