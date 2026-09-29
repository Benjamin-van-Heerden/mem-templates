import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { serverEnv } from "@/env/server";
import * as schema from "./schema";

// Dev hot reload re-evaluates this module; reuse one pool instead of leaking a new one per reload.
const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? new Pool({ connectionString: serverEnv.DATABASE_URL, max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 });
if (serverEnv.NEXT_PUBLIC_APP_ENV === "development") globalForDb.pool = pool;

// Lets Vercel Fluid compute close idle connections before a function instance is suspended.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema, casing: "snake_case" });
