import 'dotenv/config';
import app from './app';
import { initDatabase } from './database';
import { AUTH_ENABLED } from './middleware/auth';
import { PORT } from './config';
import { backfillMetadata, backfillPhotos } from './services/backfill';
import { resumePendingVideos } from './services/videoQueue';
import { videoSupport } from './services/videos';

initDatabase();

app.listen(PORT, () => {
  console.log(`\n🌍 Travel Tracker API running on http://localhost:${PORT}`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log(`   Login:    ${AUTH_ENABLED ? 'enabled' : 'disabled (set WEB_PASSWORD to enable)'}\n`);

  // Background work: thumbnails for old photos, interrupted video conversions
  void videoSupport().then((ok) => {
    if (!ok) console.warn('⚠️  ffmpeg/ffprobe not found: video uploads are disabled');
    else if (resumePendingVideos() > 0) console.log('🎬 Resuming pending video conversions');
  });
  void backfillPhotos()
    .then(() => backfillMetadata())
    .catch((err) => console.error('Photo backfill failed:', err));
});
