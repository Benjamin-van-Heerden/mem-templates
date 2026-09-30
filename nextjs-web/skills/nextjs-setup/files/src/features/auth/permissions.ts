// Roles and what each may do in the app. better-auth stores the role on the user; the app checks
// permissions, never role names, so adding a role or a permission is a change here only.

export const roles = ["super_admin", "admin", "member"] as const;
export type Role = (typeof roles)[number];

// super_admin exists exactly once, synced from SUPER_ADMIN_* by scripts/seed.ts; nobody can assign it.
export const assignableRoles = ["admin", "member"] as const satisfies readonly Role[];

export type Permission = "app:use" | "users:manage";

const grants: Record<Role, readonly Permission[]> = {
  super_admin: ["app:use", "users:manage"],
  admin: ["app:use", "users:manage"],
  member: ["app:use"],
};

export function hasPermission(role: string | null | undefined, permission: Permission) {
  return (grants[role as Role] ?? []).includes(permission);
}

export function permissionsFor(role: string | null | undefined): Permission[] {
  return [...(grants[role as Role] ?? [])];
}
