import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import styles from "./site.module.css";

export default function Home() {
  return (
    <main className={styles.hero}>
      <h1 className={styles.title}>Notes that keep up with you.</h1>
      <p className="text-lg text-muted-foreground">A reference app for the nextjs-web template.</p>
      <div>
        <Link href="/login" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
