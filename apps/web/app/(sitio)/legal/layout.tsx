import type { Metadata } from "next";
import styles from "./legal.module.css";
import IndiceLegal from "./IndiceLegal";

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
  return (
    <div className={styles.marco}>
      <IndiceLegal />
      <div data-legal-doc>{children}</div>
    </div>
  );
}
