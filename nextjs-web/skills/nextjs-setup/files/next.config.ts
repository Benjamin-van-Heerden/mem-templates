import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { clientEnvSchema, serverEnvSchema } from "./src/env/schema";

// Fail the build, not the first request, when the environment is incomplete.
clientEnvSchema.parse(process.env);
serverEnvSchema.parse(process.env);

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Enables forbidden() and unauthorized(), used by requirePermission.
  experimental: { authInterrupts: true },
  // Stops `next dev` from writing its own agent block into AGENTS.md; mem manages AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
};

export default withWorkflow(nextConfig);
