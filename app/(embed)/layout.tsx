import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";

/**
 * The root layout for anything embedded on another site.
 *
 * Deliberately bare. The widget renders inside an iframe on a page Arkan does
 * not control, so the site's header, footer, skip link and ProfessionalService
 * markup would all be wrong there — a second copy of Arkan's structured data on
 * a stranger's page is worse than none.
 *
 * `robots: noindex` for the same reason: the widget is a component of other
 * people's pages, not a page of its own, and a search result pointing at a
 * disembodied chat frame helps nobody.
 */

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Arkan assistant",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      {/* Transparent, so a host page's own background shows through the frame
          around the rounded panel instead of a white rectangle. */}
      <body className="bg-transparent">{children}</body>
    </html>
  );
}
