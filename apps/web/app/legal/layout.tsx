import type { Metadata } from "next";

export const metadata: Metadata = {
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "NEXARA",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "NEXARA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
  },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
