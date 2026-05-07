import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { env } from '../env.js';

// Standalone short-lived process: open a single connection, migrate,
// close, exit. Do NOT reuse the long-lived Pool from db/client.ts —
// a one-shot client is the simpler and safer pattern for migrations.
async function main() {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './server/db/migrations' });
  await client.end();
  process.stdout.write('Migrations applied.\n');
}

main().catch((err) => {
  process.stderr.write(`Migration failed:\n${err.stack ?? err}\n`);
  process.exit(1);
});
