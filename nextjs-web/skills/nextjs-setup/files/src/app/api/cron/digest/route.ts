import { start } from "workflow/api";
import { db } from "@/db/client";
import * as usersRepo from "@/db/repositories/users";
import { serverEnv } from "@/env/server";
import { sendDigest } from "@/features/notes/digest-workflow";

// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. It only starts workflows and returns;
// the work itself runs durably in the workflow, not inside the cron request.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const userIds = await usersRepo.listIds(db);
  const runs = await Promise.all(userIds.map((id) => start(sendDigest, [id])));
  return Response.json({ started: runs.length });
}
