import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { clientEnvSchema, serverEnvSchema } from "./src/env/schema";

// Fail the build, not the first request, when the environment is incomplete.
clientEnvSchema.parse(process.env);
serverEnvSchema.parse(process.env);

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
};

export default withWorkflow(nextConfig);
