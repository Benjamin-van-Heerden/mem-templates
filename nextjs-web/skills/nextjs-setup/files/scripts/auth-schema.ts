import type { BetterAuthOptions } from "better-auth";
import { generateDrizzleSchema } from "auth/api";
import { auth } from "../src/features/auth/server";

// Regenerates src/db/schema/auth.ts from the live auth config after adding a plugin or field. Run through
// `bun run auth:schema` (react-server condition), because the better-auth CLI cannot load modules that import "server-only".
const file = "src/db/schema/auth.ts";
const { adapter, options } = await auth.$context;
// The generic options type of our instance is narrower than the generator expects; widen it.
const { code } = await generateDrizzleSchema({ adapter: adapter as never, options: options as BetterAuthOptions, file });
if (!code) throw new Error("better-auth generated no schema.");
await Bun.write(file, code);
console.log(`Wrote ${file}. Now run \`bun run db:generate\`.`);
process.exit(0);
