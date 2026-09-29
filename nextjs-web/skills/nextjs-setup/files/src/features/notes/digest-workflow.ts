import { sleep } from "workflow";
import { countNotesSince, recordDigest } from "./digest-steps";

// A durable workflow: each step is retried on failure and its result is persisted, so a crash or redeploy
// resumes where it stopped. Workflow code itself must be deterministic; all I/O happens in steps.
export async function sendDigest(userId: string) {
  "use workflow";
  const count = await countNotesSince(userId, 24);
  await recordDigest(userId, count);
  await sleep("1 day");
  await recordDigest(userId, await countNotesSince(userId, 24));
}
