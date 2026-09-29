import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { databaseEnvSchema } from "./src/env/schema";

// drizzle-kit runs under node and does not read .env files; load them the way Next does.
loadEnvConfig(process.cwd());
const env = databaseEnvSchema.parse(process.env);

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: env.DATABASE_URL_UNPOOLED },
  strict: true,
  verbose: true,
});
