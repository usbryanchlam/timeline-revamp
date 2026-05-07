import 'dotenv/config';
import { z } from 'zod';

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
