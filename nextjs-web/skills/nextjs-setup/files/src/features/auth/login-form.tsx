"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "./client";

const loginSchema = z.object({ email: z.email(), password: z.string().min(12) });

export function LoginForm() {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signIn.email(values);
    if (error) return form.setError("root", { message: error.message ?? "Sign in failed." });
    router.push("/dashboard");
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field data-invalid={!!form.formState.errors.email}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        <FieldError errors={[form.formState.errors.email]} />
      </Field>
      <Field data-invalid={!!form.formState.errors.password}>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
        <FieldError errors={[form.formState.errors.password]} />
      </Field>
      <FieldError errors={[form.formState.errors.root]} />
      <Button type="submit" disabled={form.formState.isSubmitting}>Sign in</Button>
    </form>
  );
}
