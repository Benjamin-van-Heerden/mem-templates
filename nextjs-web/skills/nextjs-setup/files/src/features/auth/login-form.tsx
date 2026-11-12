"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "./client";
import { newPasswordSchema, PASSWORD_CHANGE_REQUIRED } from "./temporary-password-schema";

const loginSchema = z.object({ email: z.email(), password: z.string().min(12) });
type Login = z.infer<typeof loginSchema>;

// A temporary password signs nobody in: the server answers PASSWORD_CHANGE_REQUIRED without a session, and the person
// chooses their own password here. The endpoint checks the temporary password again before it opens the session.
export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState<Login | null>(null);
  const done = () => {
    router.push("/dashboard");
    router.refresh();
  };
  return pending ? <ChoosePasswordForm login={pending} onDone={done} onBack={() => setPending(null)} /> : <SignInForm onSignedIn={done} onTemporaryPassword={setPending} />;
}

function SignInForm({ onSignedIn, onTemporaryPassword }: { onSignedIn: () => void; onTemporaryPassword: (login: Login) => void }) {
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signIn.email(values);
    if (error?.code === PASSWORD_CHANGE_REQUIRED) return onTemporaryPassword(values);
    if (error) return form.setError("root", { message: error.message ?? "Sign in failed." });
    onSignedIn();
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

const choosePasswordSchema = z.object({ newPassword: newPasswordSchema, confirmPassword: z.string() }).refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The passwords don't match." });

function ChoosePasswordForm({ login, onDone, onBack }: { login: Login; onDone: () => void; onBack: () => void }) {
  const form = useForm({ resolver: zodResolver(choosePasswordSchema), defaultValues: { newPassword: "", confirmPassword: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ newPassword }) => {
    const { error } = await authClient.temporaryPassword.change({ email: login.email, temporaryPassword: login.password, newPassword });
    if (error) return form.setError("root", { message: error.message ?? "Your password wasn't changed." });
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        You signed in with a temporary password. Choose your own password for <span className="font-medium text-foreground wrap-anywhere">{login.email}</span> to finish signing in.
      </p>
      <Field data-invalid={!!errors.newPassword}>
        <FieldLabel htmlFor="newPassword">New password</FieldLabel>
        <Input id="newPassword" type="password" autoComplete="new-password" autoFocus {...form.register("newPassword")} />
        <FieldDescription>At least 12 characters.</FieldDescription>
        <FieldError errors={[errors.newPassword]} />
      </Field>
      <Field data-invalid={!!errors.confirmPassword}>
        <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        <FieldError errors={[errors.confirmPassword]} />
      </Field>
      <FieldError errors={[errors.root]} />
      <div className="grid gap-2">
        <Button type="submit" disabled={isSubmitting}>Set password and sign in</Button>
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
      </div>
    </form>
  );
}
