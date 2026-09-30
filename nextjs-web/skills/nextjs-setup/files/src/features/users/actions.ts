"use server";
import { APIError } from "better-auth/api";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";
import { auth } from "@/features/auth/server";
import { requirePermission } from "@/features/auth/session";
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

export async function createUser(input: unknown) {
  return run(newUserSchema, input, (body, h) => auth.api.createUser({ body, headers: h }));
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
