import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { user } from "@/db/schema";

// better-auth writes these tables through its own API (see src/features/users/actions.ts and
// src/features/auth/temporary-password.ts); the app only reads them here.

// temporaryPassword is set only until the person chooses their own (src/features/auth/temporary-password.ts).
export type UserRow = { id: string; name: string; email: string; role: string; banned: boolean; temporaryPassword: string | null; createdAt: Date };

export async function list(db: Db): Promise<UserRow[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword, temporaryPassword: user.temporaryPassword, createdAt: user.createdAt })
    .from(user)
    .orderBy(asc(user.createdAt));
  return rows.map(({ mustChangePassword, temporaryPassword, ...r }) => ({ ...r, role: r.role ?? "member", banned: r.banned ?? false, temporaryPassword: mustChangePassword ? temporaryPassword : null }));
}

export async function listIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: user.id }).from(user);
  return rows.map((r) => r.id);
}

export async function getRole(db: Db, id: string): Promise<string | null> {
  const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, id)).limit(1);
  return row?.role ?? null;
}
