"use client";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { temporaryPassword } from "./temporary-password";

const temporaryPasswordClient = () => ({ id: "temporary-password", $InferServerPlugin: {} as ReturnType<typeof temporaryPassword> }) satisfies BetterAuthClientPlugin;

export const authClient = createAuthClient({ plugins: [adminClient(), temporaryPasswordClient()] });
