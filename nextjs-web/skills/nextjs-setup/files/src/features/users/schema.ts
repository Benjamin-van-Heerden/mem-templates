import { z } from "zod";
import { assignableRoles } from "@/features/auth/permissions";

// Shared by the forms (client validation) and the Server Actions (the check that counts).
export const newUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.email("Enter a valid email address."),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
  role: z.enum(assignableRoles),
});
export type NewUser = z.infer<typeof newUserSchema>;

export const roleChangeSchema = z.object({ userId: z.string().min(1), role: z.enum(assignableRoles) });
export const userIdSchema = z.object({ userId: z.string().min(1) });
