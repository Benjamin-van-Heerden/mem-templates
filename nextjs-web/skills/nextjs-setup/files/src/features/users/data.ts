import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import * as usersRepo from "@/db/repositories/users";
import { requirePermission } from "@/features/auth/session";

export type UserRow = usersRepo.UserRow;

export const usersTag = "users";

export async function getUsers(): Promise<UserRow[]> {
  await requirePermission("users:manage");
  return allUsers();
}

// Unexported: only reachable through getUsers, which checks the permission first.
async function allUsers(): Promise<UserRow[]> {
  "use cache";
  cacheTag(usersTag);
  cacheLife("minutes");
  return usersRepo.list(db);
}
