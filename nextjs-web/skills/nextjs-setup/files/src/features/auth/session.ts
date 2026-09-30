import "server-only";
import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { hasPermission, type Permission } from "./permissions";
import { auth } from "./server";

export type CurrentUser = { id: string; name: string; email: string; role: string };

// The data access layer's entry point: every protected read and every Server Action starts here.
// `use cache: private` may read headers and caches per browser only, so the session lookup is reused across
// components and prefetches without ever being stored on the server.
export async function getCurrentUser(): Promise<CurrentUser> {
  "use cache: private";
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.banned) redirect("/login");
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role ?? "member" };
}

// For pages and Server Actions that need more than a signed-in user.
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!hasPermission(user.role, permission)) forbidden();
  return user;
}
