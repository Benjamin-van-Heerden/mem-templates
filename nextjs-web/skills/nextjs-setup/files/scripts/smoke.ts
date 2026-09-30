import { superAdminEnvSchema } from "../src/env/schema";

// Checks a running app end to end without a browser and without printing a secret:
//   bun scripts/smoke.ts http://localhost:3000            (credentials from .env.local)
//   bun scripts/smoke.ts https://<app>.vercel.app          (set SUPER_ADMIN_* in the shell for production)
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const admin = superAdminEnvSchema.parse(process.env);
const headers = { "content-type": "application/json", origin: base };
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? ` (${detail})` : ""}`);
  if (!ok) failed++;
}

const home = await fetch(`${base}/`);
check("the home page loads", home.ok, `status ${home.status}`);

const anonymous = await fetch(`${base}/dashboard`, { redirect: "manual" });
check("/dashboard without a session redirects to /login", anonymous.status === 307 && (anonymous.headers.get("location") ?? "").endsWith("/login"), `status ${anonymous.status}`);

const signUp = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers, body: JSON.stringify({ email: `smoke-${Date.now()}@example.com`, password: "smoke-test-password", name: "Smoke" }) });
check("sign-up is refused", signUp.status >= 400 && signUp.status < 500, `status ${signUp.status}`);

const signIn = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers, body: JSON.stringify({ email: admin.SUPER_ADMIN_EMAIL, password: admin.SUPER_ADMIN_PASSWORD }) });
check("the super admin signs in", signIn.ok, `status ${signIn.status}`);
const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

for (const page of ["/dashboard", "/admin/users"]) {
  const res = await fetch(`${base}${page}`, { headers: { cookie }, redirect: "manual" });
  const html = res.ok ? await res.text() : "";
  // The shell shows the signed-in user's email; a redirect or the forbidden page would not.
  check(`the super admin opens ${page}`, res.ok && html.includes(admin.SUPER_ADMIN_EMAIL), `status ${res.status}`);
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
