import type { Metadata } from "next";
import styles from "./legal.module.css";
import IndiceLegal, { DocumentosLegales } from "./IndiceLegal";
import FondoNoche from "@/components/sitio/FondoNoche";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import n from "@/components/sitio/noche.module.css";
import x from "@/components/sitio/profundo.module.css";

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
    <>
      <section className={`${s.noche} ${p.hero} ${n.escena} ${x.legalHero}`} data-hero-noche="" aria-label="Documentos legales">
        <FondoNoche />
        <div className={s.contenedor}>
          <p>
            Centro <span className={s.degradado}>legal.</span>
          </p>
          <DocumentosLegales />
        </div>
      </section>
      <div className={styles.marco}>
        <IndiceLegal />
        <div data-legal-doc>{children}</div>
      </div>
    </>
  );
}
