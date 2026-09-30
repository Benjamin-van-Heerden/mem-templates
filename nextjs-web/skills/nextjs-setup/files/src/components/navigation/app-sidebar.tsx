"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Permission } from "@/features/auth/permissions";
import { cn } from "@/lib/utils";
import { isActive, visibleItems } from "./routes";

// Desktop navigation: a fixed icon rail with tooltips. Hidden below md, where AppMobileMenu takes over.
export function AppSidebar({ permissions = [] }: { permissions?: Permission[] }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col border-r bg-background md:flex">
      <div className="flex h-14 shrink-0 items-center justify-center border-b">
        <Link href="/dashboard" className="rounded-md transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Image src="/logo.svg" alt="Home" width={32} height={32} priority className="size-8" />
        </Link>
      </div>
      <TooltipProvider>
        <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-2 px-2 py-4">
          {visibleItems(permissions).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      active ? "bg-muted text-primary" : "text-muted-foreground",
                    )}
                  >
                    <item.icon className="size-5" />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>
    </aside>
  );
}
