import { z } from "zod";

// Shared by the form (client validation) and the Server Action (the check that counts).
export const newNoteSchema = z.object({ body: z.string().trim().min(1, "Write something first.").max(2000) });
export type NewNote = z.infer<typeof newNoteSchema>;
