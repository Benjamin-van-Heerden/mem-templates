import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export type CurrentUser = { id: string; name: string; email: string };

// The data access layer's entry point: every protected read and every Server Action starts here.
// `use cache: private` may read headers and caches per browser only, so the session lookup is reused across
// components and prefetches without ever being stored on the server.
export async function getCurrentUser(): Promise<CurrentUser> {
  "use cache: private";
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}
