import type { Metadata } from "next";
import Link from "next/link";
import shared from "../../_shared/public.module.css";
import styles from "../page.module.css";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
const path = "/blog/soporte-ti-cholula-puebla-pyme";
const title =
  "Soporte TI en Cholula y Puebla para PyME: póliza, remoto y visitas en sitio";
const description =
  "Qué cambia entre soporte por evento y póliza; alcances típicos (remoto / en sitio), relación con CCTV y redes, y cómo iniciar con diagnóstico de alcance cerrado en Cholula (Momoxpan) y Puebla.";

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

export default function BlogSoporteCholula() {
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
            <span>Soporte TI Cholula / Puebla</span>
          </p>

          <header className={styles.articleHeader}>
            <h1 className={styles.articleTitle}>{title}</h1>
            <p className={styles.articleLead}>
              El soporte que conoce tu <strong>CCTV y red</strong> porque la misma firma los instaló.
              NEXARA opera en <strong>Cholula (Momoxpan)</strong> y Puebla, con hub CDMX y cobertura
              nacional según mapa.
            </p>
          </header>

          <div className={styles.articleBody}>
            <h2>Por evento vs póliza</h2>
            <p>
              Por evento atiende incidentes puntuales. La póliza incluye mesa de ayuda, mantenimiento
              y visitas planificadas según acuerdo — sin inventar SLA numéricos no validados.
            </p>

            <h2>Qué suele incluir un alcance de soporte Nexara</h2>
            <ul className={shared.bulletList}>
              <li>Atención remota en horario laboral y canal claro de contacto.</li>
              <li>Visita en sitio cuando el riesgo o el caso lo piden (Cholula/Puebla).</li>
              <li>Relación directa con CCTV, Wi‑Fi y cómputo para resolver más rápido.</li>
            </ul>

            <h2>Multi‑sucursal ligera</h2>
            <p>Estándar común de tickets y reportes para cadenas pequeñas o con pocas sedes.</p>

            <h2>Cómo iniciar</h2>
            <p>Diagnóstico corto con <strong>alcance cerrado</strong>: qué incluye y qué no por escrito.</p>

            <h2>Enlaces de cobertura</h2>
            <ul className={shared.bulletList}>
              <li>
                Soporte TI Cholula:{" "}
                <Link href="/cobertura/cholula/soporte-ti-pyme">/cobertura/cholula/soporte-ti-pyme</Link>
              </li>
              <li>
                Soporte TI Puebla:{" "}
                <Link href="/cobertura/puebla/soporte-ti-pyme">/cobertura/puebla/soporte-ti-pyme</Link>
              </li>
            </ul>

            <h2>FAQ</h2>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>¿Publican tiempos de respuesta?</summary>
              <p className={styles.faqAnswer}>
                Solo lo que esté validado en el contrato. Sin números inventados.
              </p>
            </details>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>¿NEXARA es lo mismo que Grupo Nexara?</summary>
              <p className={styles.faqAnswer}>
                No. Somos <strong>nexara.com.mx</strong> con base Cholula/Puebla + CDMX, y oferta de{" "}
                <strong>CCTV, redes y soporte bajo un contrato</strong>. Grupo Nexara opera en{" "}
                <strong>gruponexara.com</strong>.
              </p>
            </details>
          </div>

          <footer className={styles.articleFooter}>
            <Link href="/contacto" className={styles.articleCta}>
              Hablar de póliza o soporte →
            </Link>
            <a
              href="https://wa.me/522226960350?text=Hola%20Nexara%2C%20quiero%20hablar%20de%20p%C3%B3liza%20o%20soporte%20%28ref%3A%20%2Fblog%2Fsoporte-ti-cholula-puebla-pyme%29"
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

