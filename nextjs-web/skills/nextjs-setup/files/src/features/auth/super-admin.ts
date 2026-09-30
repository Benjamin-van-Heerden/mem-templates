import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Client } from "pg";

export type SuperAdmin = { email: string; name: string; password: string };

// Makes the account from SUPER_ADMIN_* the one and only super_admin: creates it or updates its name, role
// and password, unbans it, and demotes any other super_admin to admin. Runs inside the caller's
// transaction; the table lock keeps concurrent deploys from racing.
export async function syncSuperAdmin(client: Client, superAdmin: SuperAdmin) {
  const email = superAdmin.email.toLowerCase();
  await client.query('LOCK TABLE "user", account IN EXCLUSIVE MODE');
  const existing = await client.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email) = $1', [email]);
  const id = existing.rows[0]?.id ?? randomUUID();
  if (existing.rows.length === 0)
    await client.query('INSERT INTO "user" (id, name, email, email_verified, role, banned, created_at, updated_at) VALUES ($1, $2, $3, true, $4, false, now(), now())', [id, superAdmin.name, email, "super_admin"]);
  else
    await client.query('UPDATE "user" SET name = $2, role = $3, email_verified = true, banned = false, ban_reason = null, ban_expires = null, updated_at = now() WHERE id = $1', [id, superAdmin.name, "super_admin"]);
  const demoted = await client.query('UPDATE "user" SET role = $2, updated_at = now() WHERE role = $3 AND id <> $1', [id, "admin", "super_admin"]);

  const credential = await client.query<{ id: string; password: string | null }>('SELECT id, password FROM account WHERE user_id = $1 AND provider_id = $2 LIMIT 1', [id, "credential"]);
  const current = credential.rows[0];
  if (!current)
    await client.query('INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, now(), now())', [randomUUID(), id, "credential", id, await hashPassword(superAdmin.password)]);
  else if (!current.password || !(await verifyPassword({ hash: current.password, password: superAdmin.password })))
    await client.query("UPDATE account SET password = $2, updated_at = now() WHERE id = $1", [current.id, await hashPassword(superAdmin.password)]);
  return { created: existing.rows.length === 0, demoted: demoted.rowCount ?? 0 };
}
