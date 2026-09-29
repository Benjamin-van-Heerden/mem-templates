"use server";
import { updateTag } from "next/cache";
import { db } from "@/db/client";
import { note } from "@/db/schema";
import { getCurrentUser } from "@/features/auth/session";
import { notesTag } from "./data";
import { newNoteSchema } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addNote(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = newNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.insert(note).values({ userId: user.id, body: parsed.data.body });
  updateTag(notesTag(user.id));
  return { ok: true };
}
