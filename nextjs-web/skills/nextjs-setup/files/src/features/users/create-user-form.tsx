"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUser } from "./actions";
import { newUserSchema } from "./schema";

export function CreateUserForm() {
  const form = useForm({ resolver: zodResolver(newUserSchema), defaultValues: { name: "", email: "", password: "", role: "member" as const } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createUser(values);
    if (!result.ok) return form.setError("root", { message: result.error });
    form.reset();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <Input id="name" autoComplete="off" {...form.register("name")} />
        <FieldError errors={[errors.name]} />
      </Field>
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" autoComplete="off" {...form.register("email")} />
        <FieldError errors={[errors.email]} />
      </Field>
      <Field data-invalid={!!errors.password}>
        <FieldLabel htmlFor="password">Initial password</FieldLabel>
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
        <FieldError errors={[errors.password]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="role">Role</FieldLabel>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="role" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>Create user</Button>
        <FieldError errors={[errors.root]} />
      </div>
    </form>
  );
}
