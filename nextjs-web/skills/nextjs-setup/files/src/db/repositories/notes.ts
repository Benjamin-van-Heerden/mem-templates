import "server-only";
import { and, count, desc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { note } from "@/db/schema";

export type Note = { id: string; body: string; createdAt: Date };

export async function listForUser(db: Db, userId: string, limit = 50): Promise<Note[]> {
  return db.select({ id: note.id, body: note.body, createdAt: note.createdAt }).from(note).where(eq(note.userId, userId)).orderBy(desc(note.createdAt)).limit(limit);
}

export async function create(db: Db, values: { userId: string; body: string }): Promise<void> {
  await db.insert(note).values(values);
}

export async function countSince(db: Db, userId: string, since: Date): Promise<number> {
  const [row] = await db.select({ n: count() }).from(note).where(and(eq(note.userId, userId), gte(note.createdAt, since)));
  return row.n;
}
