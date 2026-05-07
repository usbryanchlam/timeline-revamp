import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env.local first (per-developer secrets, gitignored), then fall
// back to .env (committed defaults if any). Variables already in
// process.env are NOT overwritten — Docker / CI env wins.
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

// Server env contract. Loaded once at process start; throws synchronously
// if DATABASE_URL is missing so we fail fast instead of crashing on first query.
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Use process.stderr (not console) per typescript/coding-style.md no-console-log rule.
  process.stderr.write(`Invalid server env:\n${parsed.error.toString()}\n`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
