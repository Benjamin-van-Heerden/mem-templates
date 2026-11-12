import { beforeEach, describe, expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { generateTemporaryPassword, temporaryPassword } from "@/features/auth/temporary-password";
import { createTestDb } from "./test-db";

// better-auth with the temporary-password plugin on a fresh database, driven over HTTP as the browser drives it.
const origin = "http://localhost:3000";
const email = "ada@example.com";

function createAuth(db: Db) {
  return betterAuth({
    baseURL: origin,
    secret: "test-secret-that-is-at-least-32-characters",
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    rateLimit: { enabled: false },
    plugins: [admin({ defaultRole: "member" }), temporaryPassword()],
  });
}

let db: Db;
let auth: ReturnType<typeof createAuth>;
let temporary: string;

const post = (path: string, body: unknown) => auth.handler(new Request(`${origin}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) }));
const sessionCount = async () => (await db.select().from(schema.session)).length;
const storedUser = async () => (await db.select().from(schema.user).where(eq(schema.user.email, email)))[0];

beforeEach(async () => {
  db = await createTestDb();
  auth = createAuth(db);
  temporary = generateTemporaryPassword();
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({ email, name: "Ada", mustChangePassword: true, temporaryPassword: temporary }, { method: "admin" });
  await context.internalAdapter.linkAccount({ providerId: "credential", accountId: user.id, userId: user.id, password: await context.password.hash(temporary) });
});

describe("temporary passwords", () => {
  test("the right temporary password opens no session and asks for a new password", async () => {
    const response = await post("/sign-in/email", { email, password: temporary });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
    expect(await sessionCount()).toBe(0);
  });

  test("a wrong temporary password changes nothing", async () => {
    const response = await post("/temporary-password/change", { email, temporaryPassword: "wrong-wrong-wrong", newPassword: "a-new-password-of-mine" });

    expect(response.status).toBe(401);
    expect(await sessionCount()).toBe(0);
    expect(await storedUser()).toMatchObject({ mustChangePassword: true, temporaryPassword: temporary });
  });

  test("choosing a new password signs in, clears the temporary one and retires it", async () => {
    const response = await post("/temporary-password/change", { email, temporaryPassword: temporary, newPassword: "a-new-password-of-mine" });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
    expect(await sessionCount()).toBe(1);
    expect(await storedUser()).toMatchObject({ mustChangePassword: false, temporaryPassword: null });
    expect((await post("/sign-in/email", { email, password: "a-new-password-of-mine" })).status).toBe(200);
    expect((await post("/sign-in/email", { email, password: temporary })).status).toBe(401);
  });

  test("the temporary password can't be kept as the new one, and can't be used twice", async () => {
    expect((await post("/temporary-password/change", { email, temporaryPassword: temporary, newPassword: temporary })).status).toBe(400);
    expect(await sessionCount()).toBe(0);

    await post("/temporary-password/change", { email, temporaryPassword: temporary, newPassword: "a-new-password-of-mine" });
    expect((await post("/temporary-password/change", { email, temporaryPassword: "a-new-password-of-mine", newPassword: "another-password-here" })).status).toBe(401);
  });
});
