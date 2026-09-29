import { Suspense } from "react";
import { getCurrentUser } from "@/features/auth/session";

// The shell prerenders; only the part that reads the session waits for the request.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <span className="font-medium">Notes</span>
        <Suspense fallback={<span className="text-sm text-muted-foreground">…</span>}>
          <UserName />
        </Suspense>
      </header>
      <main className="mx-auto max-w-3xl p-6">{children}</main>
    </div>
  );
}

async function UserName() {
  const user = await getCurrentUser();
  return <span className="text-sm text-muted-foreground">{user.name}</span>;
}
