import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { RevealController } from "@/components/ui/Reveal";
import { company, seo } from "@/lib/content";
import "./globals.css";

/**
 * Inter, self-hosted by next/font with zero layout shift. Latin subset only —
 * the site is English throughout, so nothing else is worth the bytes.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(company.url),
  title: { default: seo.title, template: seo.titleTemplate },
  description: seo.description,
  applicationName: company.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: company.url,
    siteName: company.fullName,
    title: seo.title,
    description: seo.description,
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: seo.ogImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: seo.title,
    description: seo.description,
    images: ["/og-image.jpg"],
  },
  robots: { index: true, follow: true },
};

/**
 * Organisation markup. Every value is taken from the client brief — no invented
 * ratings, review counts, awards or price ranges.
 */
const organisationSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: company.fullName,
  alternateName: company.name,
  description: seo.description,
  url: company.url,
  email: company.email,
  telephone: company.phone,
  foundingDate: String(company.founded),
  slogan: company.tagline,
  address: {
    "@type": "PostalAddress",
    addressLocality: company.city,
    addressCountry: "IR",
  },
  founder: {
    "@type": "Person",
    name: "Babak Arianfar",
    jobTitle: "Founder & CEO",
  },
  areaServed: company.country,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      <body>
        <a
          href="#main"
          className="sr-only rounded-btn focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-pine focus:px-5 focus:py-3 focus:text-bone"
        >
          Skip to main content
        </a>

        <Header />
        <main id="main">{children}</main>
        <Footer />

        <RevealController />

        <script
          type="application/ld+json"
          // Serialised from a local literal, not from user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationSchema) }}
        />
      </body>
    </html>
  );
}
