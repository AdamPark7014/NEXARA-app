import type { Metadata } from "next";
import { NEXARA_LOGO_LOCKUP } from "@/lib/brand";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "NEXARA",
    images: [
      {
        url: NEXARA_LOGO_LOCKUP,
        width: 1200,
        height: 630,
        alt: "NEXARA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [NEXARA_LOGO_LOCKUP],
  },
  alternates: {
    canonical: `${siteUrl}/legal`,
  },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
