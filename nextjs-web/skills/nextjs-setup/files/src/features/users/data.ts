import "server-only";
import { asc } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { requirePermission } from "@/features/auth/session";

export const usersTag = "users";

export type UserRow = { id: string; name: string; email: string; role: string; banned: boolean; createdAt: Date };

export async function getUsers(): Promise<UserRow[]> {
  await requirePermission("users:manage");
  return allUsers();
}

// Unexported: only reachable through getUsers, which checks the permission first.
async function allUsers(): Promise<UserRow[]> {
  "use cache";
  cacheTag(usersTag);
  cacheLife("minutes");
  const rows = await db.select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned, createdAt: user.createdAt }).from(user).orderBy(asc(user.createdAt));
  return rows.map((r) => ({ ...r, role: r.role ?? "member", banned: r.banned ?? false }));
}
