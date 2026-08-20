import "./globals.scss";
import "./utilities.scss";
import "./ecosystem.scss";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter_Tight, Manrope, Fraunces, JetBrains_Mono } from "next/font/google";
import ClientLayout from "./ClientLayout";
import Providers from "./providers";
import GoogleAnalytics from "@/components/GoogleAnalytics";

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

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || "";
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim() || "";
const defaultOgImage = "/logo-nexara-lockup.png";
const brandIcon = "/icon.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEXARA | CCTV, redes y soporte TI en México",
    template: "%s | NEXARA",
  },
  description:
    "Integramos CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas. Una sola firma: diseño, instalación y operación en Puebla, CDMX y cobertura nacional.",
  keywords: [
    // CCTV / videovigilancia
    "cctv", "cámaras de seguridad", "cámaras ip", "videovigilancia",
    "cctv Puebla", "cámaras de seguridad Puebla", "cctv CDMX",
    "cámaras de seguridad CDMX", "instalación de cámaras Puebla",
    "sistema de cámaras México",
    // Cómputo
    "equipo de cómputo", "venta de computadoras", "laptops",
    "cómputo Puebla", "equipo de cómputo Puebla", "renta de equipo",
    "mantenimiento de cómputo",
    // Redes
    "redes empresariales", "wifi empresarial", "cableado estructurado",
    "redes Puebla", "wifi empresarial CDMX",
    // Soporte TI
    "soporte técnico", "soporte ti", "mesa de ayuda ti",
    "soporte técnico Puebla", "outsourcing ti México",
    // Infraestructura
    "infraestructura ti", "ciberseguridad empresarial",
    // Marca
    "Nexara", "Nexara Puebla", "Nexara CDMX",
    "soluciones tecnológicas Puebla", "empresa de tecnología Puebla",
  ],
  authors: [{ name: "NEXARA", url: siteUrl }],
  creator: "NEXARA",
  publisher: "NEXARA",
  applicationName: "NEXARA",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: brandIcon, sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
  themeColor: "#0f6ad6",
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
    url: siteUrl,
    logo: `${siteUrl}/icon-192.png`,
    image: `${siteUrl}/logo-nexara-lockup.png`,
    description:
      "NEXARA integra CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas en México.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: process.env.NEXT_PUBLIC_CONTACT_PHONE || undefined,
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
    description:
      "CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas en Puebla, CDMX y cobertura nacional.",
    url: siteUrl,
    image: `${siteUrl}/logo-nexara-lockup.png`,
    logo: `${siteUrl}/icon-192.png`,
    telephone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "",
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Explanada Puebla, Santiago Momoxpan",
      addressLocality: process.env.NEXT_PUBLIC_CITY || "Puebla",
      addressRegion: process.env.NEXT_PUBLIC_STATE || "Puebla",
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
    url: siteUrl,
    inLanguage: "es-MX",
    publisher: { "@type": "Organization", name: "NEXARA", url: siteUrl },
  };

  return (
    <html
      lang="es-MX"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${interTight.variable} ${manrope.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
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
