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
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Database migrations are up to date.");
} finally {
  await client.end();
}
