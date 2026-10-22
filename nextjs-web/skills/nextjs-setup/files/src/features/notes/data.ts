import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import * as notesRepo from "@/db/repositories/notes";
import { getCurrentUser } from "@/features/auth/session";

export const notesTag = (userId: string) => `notes:${userId}`;

export async function getNotes() {
  const user = await getCurrentUser();
  return notesByUser(user.id);
}

// Unexported, so no caller can ask for another user's notes by passing a different id.
async function notesByUser(userId: string) {
  "use cache";
  cacheTag(notesTag(userId));
  cacheLife("minutes");
  return notesRepo.listForUser(db, userId);
}
