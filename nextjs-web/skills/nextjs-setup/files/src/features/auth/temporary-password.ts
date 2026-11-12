import "server-only";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { PASSWORD_CHANGE_REQUIRED, temporaryPasswordChangeSchema } from "./temporary-password-schema";

// Accounts get a temporary password from an admin (on creation or a reset; src/features/users/actions.ts), kept on the
// user so a user manager can read it until it is used. Signing in with it never opens a session: the session hook below
// refuses while mustChangePassword is set, and the sign-in form then asks for a new password. Only this plugin's
// endpoint, which checks the temporary password again, sets the new one, clears both fields and then opens the session.

export const TEMPORARY_PASSWORD_CHANGE_PATH = "/temporary-password/change";

const wrongCredentials = () => new APIError("UNAUTHORIZED", { message: "The email or temporary password is wrong." });

export const temporaryPassword = () =>
  ({
    id: "temporary-password",
    schema: {
      user: {
        fields: {
          mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
          temporaryPassword: { type: "string", required: false, input: false, returned: false },
        },
      },
    },
    init: () => ({
      options: {
        databaseHooks: {
          session: {
            create: {
              before: async (session, ctx) => {
                const user = (await ctx?.context.internalAdapter.findUserById(session.userId)) as { mustChangePassword?: boolean | null } | null | undefined;
                if (user?.mustChangePassword) {
                  throw new APIError("FORBIDDEN", { message: "Choose a new password to finish signing in.", code: PASSWORD_CHANGE_REQUIRED });
                }
              },
            },
          },
        },
      },
    }),
    endpoints: {
      changeTemporaryPassword: createAuthEndpoint(TEMPORARY_PASSWORD_CHANGE_PATH, { method: "POST", body: temporaryPasswordChangeSchema }, async (ctx) => {
        const { email, temporaryPassword, newPassword } = ctx.body;
        const found = await ctx.context.internalAdapter.findUserByEmail(email.trim().toLowerCase(), { includeAccounts: true });
        const credential = found?.accounts.find((account) => account.providerId === "credential");
        if (!found || !credential?.password) {
          // Hash anyway, so an unknown email takes as long to refuse as a wrong password.
          await ctx.context.password.hash(temporaryPassword);
          throw wrongCredentials();
        }
        if (!(await ctx.context.password.verify({ hash: credential.password, password: temporaryPassword }))) throw wrongCredentials();
        const user = found.user as typeof found.user & { mustChangePassword?: boolean | null; banned?: boolean | null };
        if (!user.mustChangePassword) throw wrongCredentials();
        if (user.banned) throw new APIError("FORBIDDEN", { message: "This account is banned." });

        const { minPasswordLength, maxPasswordLength } = ctx.context.password.config;
        if (newPassword.length < minPasswordLength || newPassword.length > maxPasswordLength) throw new APIError("BAD_REQUEST", { message: `Use ${minPasswordLength} to ${maxPasswordLength} characters.` });
        if (newPassword === temporaryPassword) throw new APIError("BAD_REQUEST", { message: "Choose a password of your own, not the temporary one." });

        await ctx.context.internalAdapter.updatePassword(user.id, await ctx.context.password.hash(newPassword));
        const updated = await ctx.context.internalAdapter.updateUser(user.id, { mustChangePassword: false, temporaryPassword: null });
        const session = await ctx.context.internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user: updated ?? user });
        return ctx.json({ ok: true });
      }),
    },
    // Guesses at a temporary password are limited like sign-in attempts.
    rateLimit: [{ pathMatcher: (path) => path === TEMPORARY_PASSWORD_CHANGE_PATH, window: 60, max: 5 }],
  }) satisfies BetterAuthPlugin;

// Twenty characters from an alphabet without look-alikes (0/O, 1/l/I), in groups of five so it can be read out.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTemporaryPassword(): string {
  const chars: string[] = [];
  // Bytes at or above the largest multiple of the alphabet's length are skipped, so every character is equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  while (chars.length < 20) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < limit && chars.length < 20) chars.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return chars.join("").match(/.{5}/g)!.join("-");
}
