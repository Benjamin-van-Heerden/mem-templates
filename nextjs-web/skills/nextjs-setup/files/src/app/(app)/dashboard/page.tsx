import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/features/auth/session";
import { getNotes } from "@/features/notes/data";
import { NoteForm } from "@/features/notes/note-form";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <Suspense fallback={<h2 className="text-2xl font-semibold tracking-tight">Welcome</h2>}>
        <Greeting />
      </Suspense>
      {/* Placeholders for the app's first metrics; replace them with real, cached reads. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["First metric", "Second metric", "Third metric"].map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">—</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>An example feature: a cached read, a Server Action and a form.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <NoteForm />
          <Suspense fallback={<p className="text-muted-foreground">Loading notes…</p>}>
            <Notes />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function Greeting() {
  const user = await getCurrentUser();
  return <h2 className="text-2xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}</h2>;
}

async function Notes() {
  const notes = await getNotes();
  if (!notes.length) return <p className="text-muted-foreground">No notes yet.</p>;
  return (
    <ul className="grid gap-2">
      {notes.map((n) => (
        <li key={n.id} className="rounded-md border bg-background p-3">
          <p>{n.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">{n.createdAt.toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}
