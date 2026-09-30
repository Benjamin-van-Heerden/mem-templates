import { Suspense } from "react";
import { AppMobileMenu } from "@/components/navigation/app-mobile-menu";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { PageTitle } from "@/components/navigation/page-title";
import { SignOutButton } from "@/components/navigation/sign-out-button";
import { permissionsFor } from "@/features/auth/permissions";
import { getCurrentUser } from "@/features/auth/session";

// The signed-in shell. It prerenders without the session: the rail, header and page frame are static, and
// the parts that depend on the user (their email, the items their permissions unlock) stream in behind
// Suspense, falling back to the same component without them.
// The background is the project's choice: bg-dot-grid or bg-hatch (defined in globals.css).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-dot-grid min-h-dvh md:pl-16">
      <Suspense fallback={<AppSidebar />}>
        <UserSidebar />
      </Suspense>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/90 px-3 backdrop-blur sm:px-6">
          <Suspense fallback={<AppMobileMenu />}>
            <UserMobileMenu />
          </Suspense>
          <PageTitle />
          <div className="hidden items-center gap-3 md:flex">
            <Suspense>
              <UserEmail />
            </Suspense>
            <SignOutButton />
          </div>
        </header>
        <main id="content" className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

async function UserSidebar() {
  const user = await getCurrentUser();
  return <AppSidebar permissions={permissionsFor(user.role)} />;
}

async function UserMobileMenu() {
  const user = await getCurrentUser();
  return <AppMobileMenu permissions={permissionsFor(user.role)} email={user.email} />;
}

async function UserEmail() {
  const user = await getCurrentUser();
  return <p className="hidden max-w-56 truncate text-sm text-muted-foreground lg:block">{user.email}</p>;
}
