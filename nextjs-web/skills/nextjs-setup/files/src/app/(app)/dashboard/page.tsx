import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNotes } from "@/features/notes/data";
import { NoteForm } from "@/features/notes/note-form";

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <NoteForm />
      <Suspense fallback={<p className="text-muted-foreground">Loading notes…</p>}>
        <Notes />
      </Suspense>
    </div>
  );
}

async function Notes() {
  const notes = await getNotes();
  if (!notes.length) return <p className="text-muted-foreground">No notes yet.</p>;
  return (
    <div className="grid gap-3">
      {notes.map((n) => (
        <Card key={n.id}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{n.createdAt.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>{n.body}</CardContent>
        </Card>
      ))}
    </div>
  );
}
