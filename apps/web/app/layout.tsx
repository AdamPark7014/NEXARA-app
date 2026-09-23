import "./globals.scss";
import "./utilities.scss";
import "./ecosystem.scss";
import "./ui-tokens.scss";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, Inter_Tight, Manrope, Fraunces, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import ClientLayout from "./ClientLayout";
import Providers from "./providers";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import {
  NEXARA_APPLE_TOUCH,
  NEXARA_FAVICON_192,
  NEXARA_FAVICON_48,
  NEXARA_FAVICON_512,
  NEXARA_FAVICON_ICO,
  NEXARA_LOGO_LOCKUP,
} from "@/lib/brand";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--nx-font-display",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--nx-font-ui",
});

// Paneles (ERP y demás): Inter a 14 px. Sin preload para no cargarlo en el sitio público.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--nx-font-app",
  preload: false,
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
  variable: "--nx-font-body",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
  variable: "--ds-font-serif",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--ds-font-mono",
});

// Sans redondeada para headings públicos (look más amable)
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700", "800"],
  variable: "--nx-font-rounded",
});

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://www.nexara.com.mx").replace(/\/+$/, "");
const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || "";
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim() || "";
const defaultOgImage = "/opengraph-image";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEXARA | CCTV, redes y soporte TI en México",
    template: "%s | NEXARA",
  },
  description:
    "Integramos CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas. Una sola firma: diseño, instalación y operación en Puebla, CDMX y cobertura nacional.",
  authors: [{ name: "NEXARA", url: siteUrl }],
  creator: "NEXARA",
  publisher: "NEXARA",
  applicationName: "NEXARA",
  alternates: {
    types: {
      "application/rss+xml": `${siteUrl}/feed.xml`,
    },
  },
  icons: {
    icon: [
      // Prefer PNG (transparent) over ICO so tabs don't show a black square
      { url: NEXARA_FAVICON_48, sizes: "48x48", type: "image/png" },
      { url: NEXARA_FAVICON_192, sizes: "192x192", type: "image/png" },
      { url: NEXARA_FAVICON_512, sizes: "512x512", type: "image/png" },
      { url: NEXARA_FAVICON_ICO, sizes: "48x48" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: NEXARA_FAVICON_48,
    apple: [{ url: NEXARA_APPLE_TOUCH, sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: siteUrl,
    siteName: "NEXARA",
    title: "NEXARA | CCTV, redes y soporte TI en México",
    description:
      "CCTV, redes Wi‑Fi, cómputo y soporte TI con una sola firma responsable. Puebla · CDMX · cobertura nacional.",
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: "NEXARA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NEXARA | CCTV, redes y soporte TI en México",
    description:
      "CCTV, redes Wi‑Fi, cómputo y soporte TI con una sola firma responsable. Puebla · CDMX · cobertura nacional.",
    images: [defaultOgImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
  ...(googleSiteVerification || bingSiteVerification
    ? {
        verification: {
          ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
          ...(bingSiteVerification
            ? { other: { "msvalidate.01": bingSiteVerification } }
            : {}),
        },
      }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563EB",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationJson = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "NEXARA",
    alternateName: ["Nexara", "Zynora", "Zynora Tek", "Zynoratek", "Nexyx", "Nexo"],
    url: siteUrl,
    logo: `${siteUrl}${NEXARA_LOGO_LOCKUP}`,
    image: `${siteUrl}${NEXARA_LOGO_LOCKUP}`,
    description:
      "NEXARA integra CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas en México.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: "+52 222 696 0350",
      email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined,
      areaServed: "MX",
      availableLanguage: "Spanish",
    },
    areaServed: { "@type": "Country", name: "Mexico" },
  };

  const localBusinessJson = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "NEXARA",
    alternateName: ["Nexara", "Zynora", "Zynora Tek", "Zynoratek", "Nexyx", "Nexo"],
    description:
      "CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas en Puebla, CDMX y cobertura nacional.",
    url: siteUrl,
    image: `${siteUrl}${NEXARA_LOGO_LOCKUP}`,
    logo: `${siteUrl}${NEXARA_LOGO_LOCKUP}`,
    telephone: "+52 222 696 0350",
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Calle Ignacio Allende 512",
      addressLocality: "Santiago Momoxpan",
      postalCode: "72774",
      addressRegion: "Puebla",
      addressCountry: "MX",
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "18:00",
    },
    areaServed: ["Puebla", "Ciudad de Mexico", "Mexico"],
    priceRange: "$$",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Servicios NEXARA",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Camaras CCTV e IP" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Equipo de computo" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Redes y WiFi empresarial" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Soporte TI para PyMEs" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Infraestructura TI" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mesa de ayuda TI" } },
      ],
    },
  };

  const websiteJson = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "NEXARA",
    alternateName: ["Nexara", "Zynora", "Zynora Tek", "Zynoratek", "Nexyx", "Nexo"],
    url: siteUrl,
    inLanguage: "es-MX",
    publisher: { "@type": "Organization", name: "NEXARA", url: siteUrl },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/blog?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html
      lang="es-MX"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${interTight.variable} ${manrope.variable} ${fraunces.variable} ${jetbrainsMono.variable} ${plusJakarta.variable}`}
    >
      <body suppressHydrationWarning>
        {/* Organization structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJson) }}
        />
        {/* ProfessionalService structured data (sin geo/mapa en SERP) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJson) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJson) }}
        />

        <Providers>
          <ClientLayout>
            {children}
          </ClientLayout>
        </Providers>

        {/* GA4 solo tras consentimiento de analítica (CookieConsentBanner). */}
        {gaId ? <GoogleAnalytics measurementId={gaId} /> : null}
      </body>
    </html>
  );
}
