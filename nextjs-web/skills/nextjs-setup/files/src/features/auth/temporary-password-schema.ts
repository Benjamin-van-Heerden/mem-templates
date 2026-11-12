import { z } from "zod";

// Shared by the sign-in form (client validation) and the temporary-password endpoint (the check that counts).

// The code sign-in returns when the password was right but is a temporary one: no session is opened.
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

export const newPasswordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Use at most 128 characters.");

export const temporaryPasswordChangeSchema = z.object({
  email: z.email(),
  temporaryPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
});
