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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEXARA | CCTV, Computo, Redes y Soluciones TI en Mexico",
    template: "%s | NEXARA",
  },
  description:
    "NEXARA: camaras CCTV, equipo de computo, redes WiFi, soporte TI y ERP industrial para empresas en Puebla, CDMX y toda Mexico.",
  keywords: [
    // CCTV / videovigilancia
    "cctv", "camaras de seguridad", "camaras ip", "videovigilancia",
    "cctv Puebla", "camaras de seguridad Puebla", "cctv CDMX",
    "camaras de seguridad CDMX", "instalacion de camaras Puebla",
    "sistema de camaras Mexico",
    // Cómputo
    "equipo de computo", "venta de computadoras", "laptops",
    "computo Puebla", "equipo de computo Puebla", "renta de equipo",
    "mantenimiento de computo",
    // Redes
    "redes empresariales", "wifi empresarial", "cableado estructurado",
    "redes Puebla", "wifi empresarial CDMX",
    // Soporte TI
    "soporte tecnico", "soporte ti", "mesa de ayuda ti",
    "soporte tecnico Puebla", "outsourcing ti Mexico",
    // ERP / infraestructura
    "ERP industrial", "software empresarial", "transformacion digital",
    "infraestructura ti", "ciberseguridad empresarial",
    // Marca
    "Nexara", "Nexara Puebla", "Nexara CDMX",
    "soluciones tecnologicas Puebla", "empresa de tecnologia Puebla",
  ],
  authors: [{ name: "NEXARA", url: siteUrl }],
  creator: "NEXARA",
  publisher: "NEXARA",
  applicationName: "NEXARA",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: siteUrl,
    siteName: "NEXARA",
    title: "NEXARA | CCTV, Computo, Redes y Soluciones TI en Mexico",
    description:
      "Camaras CCTV, equipo de computo, redes WiFi, soporte TI y ERP industrial para empresas en Puebla, CDMX y Mexico.",
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
    title: "NEXARA | CCTV, Computo, Redes y Soluciones TI en Mexico",
    description:
      "Camaras CCTV, equipo de computo, redes WiFi, soporte TI y ERP industrial para empresas en Puebla, CDMX y Mexico.",
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
    logo: `${siteUrl}/logo-nexara-lockup.png`,
    description:
      "NEXARA — Camaras CCTV, equipo de computo, redes WiFi, soporte TI y ERP industrial para empresas en Mexico.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      areaServed: "MX",
      availableLanguage: "Spanish",
    },
    areaServed: { "@type": "Country", name: "Mexico" },
  };

  const localBusinessJson = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "NEXARA",
    description:
      "Camaras CCTV, equipo de computo, redes WiFi, soporte TI y ERP industrial para empresas en Puebla, CDMX y toda la Republica Mexicana.",
    url: siteUrl,
    image: `${siteUrl}/logo-nexara-lockup.png`,
    telephone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "",
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
    address: {
      "@type": "PostalAddress",
      addressLocality: process.env.NEXT_PUBLIC_CITY || "Puebla",
      addressRegion: process.env.NEXT_PUBLIC_STATE || "Puebla",
      addressCountry: "MX",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: "19.0414",
      longitude: "-98.2063",
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "18:00",
    },
    areaServed: ["Puebla", "Ciudad de Mexico", "Republica Mexicana"],
    priceRange: "$$",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Servicios NEXARA",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Camaras CCTV e IP" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Equipo de computo" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Redes y WiFi empresarial" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Soporte TI para PyMEs" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "ERP industrial" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Infraestructura TI" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mesa de ayuda TI" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Ciberseguridad empresarial" } },
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
        {/* LocalBusiness structured data — drives geo-targeted results */}
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
