import { db } from "@/db/client";
import * as notesRepo from "@/db/repositories/notes";

export async function countNotesSince(userId: string, hours: number) {
  "use step";
  return notesRepo.countSince(db, userId, new Date(Date.now() - hours * 3600_000));
}

export async function recordDigest(userId: string, notes: number) {
  "use step";
  console.log(`digest for ${userId}: ${notes} notes`);
}
