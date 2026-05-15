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
  // Auth0 — wired in plan 04-02. AUTH0_DOMAIN is a bare hostname (e.g.,
  // bryanlam.us.auth0.com), NOT a URL — the JWT middleware constructs
  // `https://${AUTH0_DOMAIN}/` for the issuer claim and the JWKS URL.
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().url(),
  // Phase 6: OCI Object Storage — optional so unit tests without OCI creds
  // still boot. The route handlers throw on first PAR call if missing.
  OCI_TENANCY_OCID: z.string().optional(),
  OCI_USER_OCID: z.string().optional(),
  OCI_FINGERPRINT: z.string().optional(),
  OCI_PRIVATE_KEY_PATH: z.string().optional(),
  // Optional. Set ONLY if the PEM at OCI_PRIVATE_KEY_PATH was generated with
  // a passphrase. Leave unset for unencrypted PEMs.
  OCI_PRIVATE_KEY_PASSPHRASE: z.string().optional(),
  OCI_REGION: z.string().optional(),
  OCI_NAMESPACE: z.string().optional(),
  OCI_BUCKET_NAME: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Use process.stderr (not console) per typescript/coding-style.md no-console-log rule.
  process.stderr.write(`Invalid server env:\n${parsed.error.toString()}\n`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
