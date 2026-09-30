import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { serverEnv } from "@/env/server";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
  // Accounts are created by admins (src/app/(app)/admin/users) and the seed, never by sign-up.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "database" },
  hooks: { before: createAuthMiddleware(protectSuperAdmin) },
  plugins: [
    admin({
      defaultRole: "member",
      adminRoles: ["super_admin", "admin"],
      roles: { super_admin: adminAc, admin: adminAc, member: userAc },
    }),
    // Lets Server Actions that call auth.api set cookies; must be the last plugin.
    nextCookies(),
  ],
});

// The admin plugin's endpoints are public HTTP routes, so the super admin is protected here rather than
// in the UI: no admin endpoint may act on the super admin or hand out the super_admin role. Only
// scripts/seed.ts, which writes to the database directly, manages that account.
async function protectSuperAdmin(ctx: { path?: string; body?: unknown }) {
  if (!ctx.path?.startsWith("/admin/")) return;
  const body = (ctx.body ?? {}) as { userId?: unknown; role?: unknown; data?: { role?: unknown } };
  const assigned = [body.role, body.data?.role].flat();
  if (assigned.includes("super_admin")) throw new APIError("FORBIDDEN", { message: "The super_admin role cannot be assigned." });
  if (typeof body.userId !== "string") return;
  const [target] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, body.userId)).limit(1);
  if (target?.role === "super_admin") throw new APIError("FORBIDDEN", { message: "The super admin is managed through SUPER_ADMIN_* environment variables." });
}
