import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { clientEnvSchema, serverEnvSchema } from "./src/env/schema";

// `bun run dev` runs under portless, which serves the app at https://<app>.localhost:<proxy port> (https://<branch>.<app>.localhost:<proxy port>
// in a Git worktree) and passes that URL as PORTLESS_URL. The app's URLs follow it, so auth works in every checkout.
if (process.env.PORTLESS_URL && process.env.NEXT_PUBLIC_APP_ENV === "development") process.env.NEXT_PUBLIC_APP_URL = process.env.BETTER_AUTH_URL = process.env.PORTLESS_URL;

// Fail the build, not the first request, when the environment is incomplete.
clientEnvSchema.parse(process.env);
serverEnvSchema.parse(process.env);

const nextConfig: NextConfig = {
  cacheComponents: true,
  // A <Link> prefetches its route's App Shell; <Link prefetch={true}> also prefetches cached content that depends on the URL.
  partialPrefetching: true,
  // Tailwind is compiled by its Turbopack loader; there is no PostCSS config. CSS modules keep their module type, or their
  // class names would not be exported.
  turbopack: {
    rules: {
      "*.css": [
        { condition: { path: /\.module\.css$/ }, loaders: ["@tailwindcss/turbopack"], as: "*.module.css" },
        { condition: { not: { path: /\.module\.css$/ } }, loaders: ["@tailwindcss/turbopack"], as: "*.css" },
      ],
    },
  },
  // Memoizes components and hooks. The guarantee setting is explicit because its default can differ between compiler implementations.
  reactCompiler: { environment: { enablePreserveExistingMemoizationGuarantees: true } },
  experimental: {
    // Enables forbidden() and unauthorized(), used by requirePermission.
    authInterrupts: true,
    // Runs the React Compiler as the Rust port inside Turbopack instead of through babel-plugin-react-compiler.
    turbopackRustReactCompiler: true,
  },
  // Stops `next dev` from writing its own agent block into AGENTS.md; mem manages AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
};

export default withWorkflow(nextConfig);
