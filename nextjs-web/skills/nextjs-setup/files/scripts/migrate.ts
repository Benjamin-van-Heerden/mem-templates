import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { databaseEnvSchema } from "../src/env/schema";

// Runs before `next build`, so every deployment migrates its own database (Neon gives previews their own branch).
// Migrations must be additive: the new schema is live before the new code is.
const env = databaseEnvSchema.parse(process.env);
const client = new Client({ connectionString: env.DATABASE_URL_UNPOOLED });
await client.connect();
try {
  // Concurrent builds against the same database wait here instead of racing.
  await client.query("select pg_advisory_lock(hashtext('drizzle-migrate'))");
  const before = await appliedMigrations(client);
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  const applied = (await appliedMigrations(client)) - before;
  console.log(applied ? `Applied ${applied} migration(s).` : "No pending migrations.");
} finally {
  await client.end();
}

// Drizzle records applied migrations in drizzle.__drizzle_migrations; the table does not exist before the first run.
async function appliedMigrations(db: Client) {
  const table = await db.query<{ t: string | null }>("select to_regclass('drizzle.__drizzle_migrations') as t");
  if (!table.rows[0].t) return 0;
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from drizzle.__drizzle_migrations");
  return rows[0].n;
}
