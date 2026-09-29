"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addNote } from "./actions";
import { newNoteSchema } from "./schema";

export function NoteForm() {
  const form = useForm({ resolver: zodResolver(newNoteSchema), defaultValues: { body: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await addNote(values);
    if (!result.ok) return form.setError("body", { message: result.error });
    form.reset();
  });

  return (
    <form onSubmit={onSubmit} className="flex items-start gap-2">
      <Field data-invalid={!!form.formState.errors.body}>
        <Input placeholder="New note" aria-label="New note" {...form.register("body")} />
        <FieldError errors={[form.formState.errors.body]} />
      </Field>
      <Button type="submit" disabled={form.formState.isSubmitting}>Add</Button>
    </form>
  );
}
