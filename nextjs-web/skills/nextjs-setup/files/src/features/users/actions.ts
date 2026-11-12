"use server";
import { APIError } from "better-auth/api";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";
import { auth } from "@/features/auth/server";
import { getCurrentUser, requirePermission } from "@/features/auth/session";
import { generateTemporaryPassword } from "@/features/auth/temporary-password";
import { usersTag } from "./data";
import { newUserSchema, roleChangeSchema, userIdSchema } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Each action checks the app permission and validates its input, then calls better-auth's admin API as the
// signed-in user, so better-auth applies its role checks and the super-admin guard in auth/server.ts too.
async function run<S extends z.ZodType>(schema: S, input: unknown, call: (data: z.infer<S>, requestHeaders: Headers) => Promise<unknown>): Promise<ActionResult> {
  await requirePermission("users:manage");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await call(parsed.data, await headers());
  } catch (error) {
    if (error instanceof APIError) return { ok: false, error: error.message };
    throw error;
  }
  updateTag(usersTag);
  return { ok: true };
}

// New accounts and resets get a generated temporary password, kept on the user and shown to user managers until the
// person signs in with it and chooses their own (src/features/auth/temporary-password.ts).
export async function createUser(input: unknown) {
  return run(newUserSchema, input, (body, h) => {
    const temporaryPassword = generateTemporaryPassword();
    return auth.api.createUser({ body: { ...body, password: temporaryPassword, data: { mustChangePassword: true, temporaryPassword } }, headers: h });
  });
}

// The old password stops working and every session of the account ends.
export async function resetPassword(input: unknown) {
  return run(userIdSchema, input, async ({ userId }, h) => {
    if (userId === (await getCurrentUser()).id) throw new APIError("BAD_REQUEST", { message: "You can't reset your own password here." });
    const temporaryPassword = generateTemporaryPassword();
    await auth.api.setUserPassword({ body: { userId, newPassword: temporaryPassword }, headers: h });
    await auth.api.adminUpdateUser({ body: { userId, data: { mustChangePassword: true, temporaryPassword } }, headers: h });
    await auth.api.revokeUserSessions({ body: { userId }, headers: h });
  });
}

export async function changeRole(input: unknown) {
  return run(roleChangeSchema, input, (body, h) => auth.api.setRole({ body, headers: h }));
}

export async function banUser(input: unknown) {
  return run(userIdSchema, input, (body, h) => auth.api.banUser({ body, headers: h }));
}

export async function unbanUser(input: unknown) {
  return run(userIdSchema, input, (body, h) => auth.api.unbanUser({ body, headers: h }));
}
