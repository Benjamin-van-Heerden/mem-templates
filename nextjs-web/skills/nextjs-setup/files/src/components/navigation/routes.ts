import type { LucideIcon } from "lucide-react";
import { LayoutDashboardIcon, UsersRoundIcon } from "lucide-react";
import type { Permission } from "@/features/auth/permissions";

// The signed-in app's navigation. An item with a permission only shows for users who have it;
// the page itself still checks with requirePermission.
export type NavItem = { href: string; label: string; icon: LucideIcon; permission?: Permission };

export const navigation: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/admin/users", label: "Users", icon: UsersRoundIcon, permission: "users:manage" },
];

export function visibleItems(permissions: readonly Permission[]) {
  return navigation.filter((item) => !item.permission || permissions.includes(item.permission));
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageTitle(pathname: string) {
  return navigation.find((item) => isActive(pathname, item.href))?.label ?? "";
}
