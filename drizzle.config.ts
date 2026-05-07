import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://timeline:timeline_dev_pw@localhost:5432/timeline',
  },
  strict: true,
  verbose: true,
});
