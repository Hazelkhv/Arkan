import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";

/**
 * The admin panel's root layout — the third of three, alongside the website and
 * the embed frame.
 *
 * It shares the design tokens and nothing else. The marketing header, the
 * footer and the ProfessionalService markup all belong to a page selling
 * Arkan's services; this is a tool for the people who deliver them, and it is
 * denser, quieter and — per the robots directive below — not a page for
 * anybody who is not signed in to find.
 */

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: { default: "Arkan admin", template: "%s · Arkan admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      <body className="bg-bone text-ink">{children}</body>
    </html>
  );
}
