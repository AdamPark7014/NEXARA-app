import type { Metadata } from "next";
import Link from "next/link";
import shared from "../../_shared/public.module.css";
import styles from "../page.module.css";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
const path = "/blog/wifi-redes-empresarial-puebla";
const title =
  "Wi‑Fi y redes empresariales en Puebla: diseño, site survey y operación sin saturar el negocio";
const description =
  "Redes y Wi‑Fi empresarial en Puebla: síntomas típicos, auditoría/site survey, diseño (VLAN/PoE) y operación. NEXARA instala y soporta en Puebla/Cholula (Momoxpan) y CDMX.";

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

export default function BlogWifiPuebla() {
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
            <span>Wi‑Fi empresarial Puebla</span>
          </p>

          <header className={styles.articleHeader}>
            <h1 className={styles.articleTitle}>{title}</h1>
            <p className={styles.articleLead}>
              Capacidad no es solo “más antenas”. En NEXARA diseñamos <strong>Wi‑Fi + red</strong> con
              site survey, VLAN y PoE, e instalamos/soportamos en Puebla/Cholula (Momoxpan) y CDMX.
            </p>
          </header>

          <div className={styles.articleBody}>
            <h2>Síntomas típicos</h2>
            <ul className={shared.bulletList}>
              <li>Caídas en horas pico o reuniones grandes.</li>
              <li>Roaming deficiente entre áreas y APs mal ubicados.</li>
              <li>Interferencia por equipos y redes vecinas.</li>
            </ul>

            <h2>¿Qué es un site survey / auditoría?</h2>
            <ul className={shared.bulletList}>
              <li>Levantamiento de plano RF / mapa de calor (concepto).</li>
              <li>Revisión de cableado, PoE y zonas muertas.</li>
              <li>Entregables claros para compra/implementación.</li>
            </ul>

            <h2>Diseño que opera</h2>
            <ul className={shared.checkList}>
              <li>VLAN para invitados, staff y CCTV.</li>
              <li>Switching PoE y respaldo eléctrico.</li>
              <li>Ubicación y densidad de AP por zona.</li>
            </ul>

            <h2>Cobertura local y puente CDMX</h2>
            <ul className={shared.bulletList}>
              <li>
                Redes Puebla:{" "}
                <Link href="/cobertura/puebla/redes-y-conectividad">/cobertura/puebla/redes-y-conectividad</Link>
              </li>
              <li>
                Redes CDMX:{" "}
                <Link href="/cobertura/cdmx/redes-y-conectividad">/cobertura/cdmx/redes-y-conectividad</Link>
              </li>
              <li>
                Redes Cholula:{" "}
                <Link href="/cobertura/cholula/redes-y-conectividad">/cobertura/cholula/redes-y-conectividad</Link>
              </li>
            </ul>

            <h2>FAQ</h2>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>¿NEXARA es lo mismo que Grupo Nexara?</summary>
              <p className={styles.faqAnswer}>
                No. Somos <strong>nexara.com.mx</strong> (Puebla/Cholula + CDMX), con <strong>Wi‑Fi + cableado +
                CCTV</strong> en sitio. Grupo Nexara opera en <strong>gruponexara.com</strong>.
              </p>
            </details>
          </div>

          <footer className={styles.articleFooter}>
            <Link href="/contacto" className={styles.articleCta}>
              Agendar auditoría / site survey →
            </Link>
            <a
              href="https://wa.me/522226960350?text=Hola%20Nexara%2C%20quiero%20auditor%C3%ADa%20Wi‑Fi%20en%20Puebla%20%28ref%3A%20%2Fblog%2Fwifi-redes-empresarial-puebla%29"
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

