import "server-only";
import { desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import { note } from "@/db/schema";
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
  return db.select({ id: note.id, body: note.body, createdAt: note.createdAt }).from(note).where(eq(note.userId, userId)).orderBy(desc(note.createdAt)).limit(50);
}
