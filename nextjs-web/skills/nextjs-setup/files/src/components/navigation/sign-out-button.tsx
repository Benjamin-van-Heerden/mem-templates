"use client";
import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/features/auth/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.push("/login");
          router.refresh();
        })
      }
    >
      <LogOutIcon />
      Sign out
    </Button>
  );
}
