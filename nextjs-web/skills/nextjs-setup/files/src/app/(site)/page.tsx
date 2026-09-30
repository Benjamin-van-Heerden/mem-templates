import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import styles from "./site.module.css";

// A deliberately small public home page: replace the copy, and grow it with bespoke sections on the tokens.
export default function Home() {
  return (
    <main className={styles.hero}>
      <Image src="/logo.svg" alt="" width={56} height={56} priority className={styles.logo} />
      <h1 className={styles.title}>The app name, and what it does for you.</h1>
      <p className={styles.lead}>One or two sentences that explain the product to someone who has never heard of it.</p>
      <div>
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
