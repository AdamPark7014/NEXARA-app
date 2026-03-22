import "./globals.scss";
import "./utilities.scss";
import "./ecosystem.scss";
import type { Metadata, Viewport } from "next";
import ClientLayout from "./ClientLayout";
import Providers from "./providers";

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEXARA | ERP Industrial y Soluciones Tecnologicas",
    template: "%s | NEXARA",
  },
  description:
    "NEXARA integra ERP industrial, automatizacion y servicios tecnologicos para operaciones empresariales de alta demanda.",
  keywords: [
    "ERP industrial",
    "software empresarial",
    "transformacion digital",
    "automatizacion industrial",
    "infraestructura TI",
    "ciberseguridad empresarial",
    "servicios gestionados TI",
    "Mexico",
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
    title: "NEXARA | ERP Industrial y Soluciones Tecnologicas",
    description:
      "Plataforma y servicios de tecnologia empresarial para escalar operaciones industriales con seguridad y continuidad.",
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
    title: "NEXARA | ERP Industrial y Soluciones Tecnologicas",
    description:
      "Tecnologia empresarial para operaciones de alto rendimiento: ERP, infraestructura, soporte y transformacion digital.",
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
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <ClientLayout>
            {children}
          </ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
