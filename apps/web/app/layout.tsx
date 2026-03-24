import "./globals.scss";
import "./utilities.scss";
import "./ecosystem.scss";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import ClientLayout from "./ClientLayout";
import Providers from "./providers";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";

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
  alternates: {
    canonical: "/",
  },
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
        url: "/logo-nexara.png",
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
    images: ["/logo-nexara.png"],
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
  other: {
    "google-site-verification": process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "",
    "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || "",
  },
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
    logo: `${siteUrl}/logo-nexara.png`,
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
    image: `${siteUrl}/logo-nexara.png`,
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

  return (
    <html lang="es-MX" suppressHydrationWarning>
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

        <Providers>
          <ClientLayout>
            {children}
          </ClientLayout>
        </Providers>

        {/* Google Analytics 4 — set NEXT_PUBLIC_GA_MEASUREMENT_ID in .env */}
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
