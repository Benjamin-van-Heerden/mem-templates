import { Client } from "pg";
import { seedEnvSchema } from "../src/env/schema";
import { syncSuperAdmin } from "../src/features/auth/super-admin";

// Runs after scripts/migrate.ts in every build, and by hand with `bun run db:seed`. Everything here must be
// idempotent: it runs against the same database on every deploy.
const env = seedEnvSchema.parse(process.env);
const client = new Client({ connectionString: env.DATABASE_URL_UNPOOLED });
await client.connect();
try {
  await client.query("BEGIN");
  const result = await syncSuperAdmin(client, { email: env.SUPER_ADMIN_EMAIL, name: env.SUPER_ADMIN_NAME, password: env.SUPER_ADMIN_PASSWORD });
  // Further seed data goes here, inside the same transaction.
  await client.query("COMMIT");
  console.log(`Super admin ${env.SUPER_ADMIN_EMAIL} is in place${result.created ? " (created)" : ""}${result.demoted ? `; demoted ${result.demoted} other super admin(s)` : ""}.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
