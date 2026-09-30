import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">No access</h1>
      <p className="text-muted-foreground">Your account does not have access to this page.</p>
      <Link href="/dashboard" className="underline underline-offset-4">Back to the dashboard</Link>
    </main>
  );
}
