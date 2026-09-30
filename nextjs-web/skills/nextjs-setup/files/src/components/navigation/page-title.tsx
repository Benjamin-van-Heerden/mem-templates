"use client";
import { usePathname } from "next/navigation";
import { pageTitle } from "./routes";

export function PageTitle() {
  return <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{pageTitle(usePathname())}</h1>;
}
