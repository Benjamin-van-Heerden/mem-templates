import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { clientEnv } from "@/env/client";
import "./globals.css";

// Swap the fonts for the project's own; keep the variable names, which the tokens in globals.css expect.
const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_APP_URL),
  title: { default: "App", template: "%s · App" },
  description: "",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
