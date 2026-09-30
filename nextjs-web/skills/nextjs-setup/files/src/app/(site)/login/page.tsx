import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import styles from "../site.module.css";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className={styles.auth}>
      <Link href="/" className="justify-self-center">
        <Image src="/logo.svg" alt="Home" width={44} height={44} priority />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Accounts are created by an administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
