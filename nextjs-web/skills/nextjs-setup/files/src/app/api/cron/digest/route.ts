import { start } from "workflow/api";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { serverEnv } from "@/env/server";
import { sendDigest } from "@/features/notes/digest-workflow";

// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. It only starts workflows and returns;
// the work itself runs durably in the workflow, not inside the cron request.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const users = await db.select({ id: user.id }).from(user);
  const runs = await Promise.all(users.map((u) => start(sendDigest, [u.id])));
  return Response.json({ started: runs.length });
}
