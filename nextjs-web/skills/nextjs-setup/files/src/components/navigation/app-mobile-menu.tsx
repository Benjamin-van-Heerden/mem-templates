"use client";
import { MenuIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Permission } from "@/features/auth/permissions";
import { cn } from "@/lib/utils";
import { isActive, visibleItems } from "./routes";
import { SignOutButton } from "./sign-out-button";

// Phone and tablet navigation: a menu button that opens the items, the user and sign-out in a left sheet.
export function AppMobileMenu({ permissions = [], email }: { permissions?: Permission[]; email?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-0">
        <SheetHeader className="border-b p-4 text-left">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="" width={28} height={28} className="size-7" />
            <div className="min-w-0">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription className="truncate">{email ?? " "}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <nav aria-label="Primary" className="grid flex-1 content-start gap-1 p-3">
          {visibleItems(permissions).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors", active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")}
              >
                <item.icon className="size-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-4">
          <SignOutButton className="w-full" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
