import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { note } from "@/db/schema";

export async function countNotesSince(userId: string, hours: number) {
  "use step";
  const since = new Date(Date.now() - hours * 3600_000);
  const [row] = await db.select({ n: count() }).from(note).where(and(eq(note.userId, userId), gte(note.createdAt, since)));
  return row.n;
}

export async function recordDigest(userId: string, notes: number) {
  "use step";
  console.log(`digest for ${userId}: ${notes} notes`);
}
