import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";

// A real Postgres in memory with the project's migrations applied, so tests never touch the shared database.
export async function createTestDb() {
  const db = drizzle(new PGlite(), { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}
