import 'dotenv/config';
import app from './app';
import { initDatabase } from './database';
import { AUTH_ENABLED } from './middleware/auth';
import { PORT } from './config';

initDatabase();

app.listen(PORT, () => {
  console.log(`\n🌍 Travel Tracker API running on http://localhost:${PORT}`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log(`   Login:    ${AUTH_ENABLED ? 'enabled' : 'disabled (set WEB_PASSWORD to enable)'}\n`);
});
