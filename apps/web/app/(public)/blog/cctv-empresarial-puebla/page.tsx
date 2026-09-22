import type { Metadata } from "next";
import Link from "next/link";
import shared from "../../_shared/public.module.css";
import styles from "../page.module.css";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
const path = "/blog/cctv-empresarial-puebla";
const title =
  "Instalación de CCTV empresarial en Puebla: cámaras IP, red PoE y diagnóstico con alcance cerrado";
const description =
  "Cómo abordar un CCTV B2B en Puebla: cámaras IP, NVR/VMS, cableado PoE, segmentación y diagnóstico de alcance cerrado. NEXARA opera en Puebla/Cholula (Momoxpan) y CDMX. Enlaces a cobertura local.";

export const metadata: Metadata = {
  title: { absolute: `${title} | NEXARA` },
  description,
  alternates: { canonical: path },
  openGraph: {
    type: "article",
    locale: "es_MX",
    url: `${siteUrl}${path}`,
    siteName: "NEXARA",
    title,
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/opengraph-image"],
  },
};

export default function BlogCctvPuebla() {
  const articleJson = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    image: `${siteUrl}/opengraph-image`,
    author: { "@type": "Organization", name: "NEXARA", url: siteUrl },
    publisher: {
      "@type": "Organization",
      name: "NEXARA",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo-nexara-lockup.png` },
    },
    mainEntityOfPage: `${siteUrl}${path}`,
  };

  return (
    <main className={`${shared.page} home-main-flush`} aria-label={title}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJson).replace(/</g, "\\u003c") }}
      />

      <article className={shared.section} data-reveal="up">
        <div className={`${shared.inner} ${styles.articleInner}`}>
          <p className={styles.articleBreadcrumb}>
            <Link href="/blog">Blog</Link>
            <span aria-hidden> / </span>
            <span>CCTV empresarial Puebla</span>
          </p>

          <header className={styles.articleHeader}>
            <h1 className={styles.articleTitle}>{title}</h1>
            <p className={styles.articleLead}>
              NEXARA es la firma de campo que integra <strong>CCTV + redes + soporte</strong> bajo un mismo
              contrato. Base <strong>Puebla/Cholula (Momoxpan)</strong> y hub CDMX. Esta guía resume
              alcance típico y cómo <em>cerramos</em> una cotización sin sorpresas.
            </p>
          </header>

          <div className={styles.articleBody}>
            <h2>Qué incluye un CCTV empresarial (no un kit residencial)</h2>
            <ul className={shared.bulletList}>
              <li>Cámaras IP/HD, NVR/VMS y política de retención.</li>
              <li>Cableado PoE, switches y UPS en rack organizado.</li>
              <li>Segmentación VLAN para que CCTV no sature POS/LAN.</li>
            </ul>

            <h2>Tipologías locales</h2>
            <ul className={shared.checkList}>
              <li>PyME de una sede (mostrador + accesos + bodega).</li>
              <li>Retail / multi‑punto (estándar por sucursal, acceso centralizado).</li>
              <li>Planta / perímetro (exteriores, patio, andenes).</li>
            </ul>

            <h2>Diagnóstico con alcance cerrado</h2>
            <p>
              Visitamos, documentamos exclusiones y regresamos con propuesta por fases y calendario.
              Entregamos con evidencia y, si se requiere, soporte bajo el mismo contrato.
            </p>

            <h2>Cobertura Puebla, Cholula y más</h2>
            <ul className={shared.bulletList}>
              <li>
                CCTV Puebla: <Link href="/cobertura/puebla/camaras-cctv">/cobertura/puebla/camaras-cctv</Link>
              </li>
              <li>
                CCTV Cholula:{" "}
                <Link href="/cobertura/cholula/camaras-cctv">/cobertura/cholula/camaras-cctv</Link>
              </li>
              <li>
                CDMX: <Link href="/cobertura/cdmx/camaras-cctv">/cobertura/cdmx/camaras-cctv</Link>
              </li>
            </ul>

            <h2>FAQ</h2>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>¿Quién instala CCTV en Puebla?</summary>
              <p className={styles.faqAnswer}>
                NEXARA instala y opera CCTV empresarial en Puebla y San Andrés Cholula (Momoxpan). Tel:
                +52 222 696 0350 · <Link href="/cobertura/puebla/camaras-cctv">Ver cobertura</Link>.
              </p>
            </details>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>¿NEXARA es lo mismo que Grupo Nexara?</summary>
              <p className={styles.faqAnswer}>
                No. Somos <strong>nexara.com.mx</strong> (Puebla/Cholula + CDMX) con CCTV + redes + soporte en
                campo. Grupo Nexara opera en <strong>gruponexara.com</strong>.
              </p>
            </details>
          </div>

          <footer className={styles.articleFooter}>
            <Link href="/contacto" className={styles.articleCta}>
              Agendar diagnóstico CCTV →
            </Link>
            <a
              href="https://wa.me/522226960350?text=Hola%20Nexara%2C%20quiero%20diagn%C3%B3stico%20CCTV%20en%20Puebla%20%28ref%3A%20%2Fblog%2Fcctv-empresarial-puebla%29"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.articleCta}
            >
              WhatsApp +52 222 696 0350 →
            </a>
          </footer>
        </div>
      </article>
    </main>
  );
}

