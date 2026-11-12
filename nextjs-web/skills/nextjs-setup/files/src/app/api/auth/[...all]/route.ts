import { toNextJsHandler } from "better-auth/next-js";
import { revalidateTag } from "next/cache";
import { auth } from "@/features/auth/server";
import { TEMPORARY_PASSWORD_CHANGE_PATH } from "@/features/auth/temporary-password";
import { usersTag } from "@/features/users/data";

const handler = toNextJsHandler(auth);

export const { GET } = handler;

// Choosing a password clears the temporary one, but that endpoint is not a Server Action that can call updateTag, so the
// cached user list is expired here; otherwise user managers would keep seeing a temporary password that no longer works.
export async function POST(request: Request) {
  const response = await handler.POST(request);
  if (response.ok && new URL(request.url).pathname.endsWith(TEMPORARY_PASSWORD_CHANGE_PATH)) revalidateTag(usersTag, { expire: 0 });
  return response;
}
