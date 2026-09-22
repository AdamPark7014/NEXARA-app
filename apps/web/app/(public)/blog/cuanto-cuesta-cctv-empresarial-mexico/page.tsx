import type { Metadata } from "next";
import Link from "next/link";
import shared from "../../_shared/public.module.css";
import styles from "../page.module.css";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
const path = "/blog/cuanto-cuesta-cctv-empresarial-mexico";
const title =
  "¿Cuánto cuesta un CCTV empresarial en México? Factores, tipologías y cómo cotizar en Puebla y CDMX con alcance cerrado";
const description =
  "Guía práctica para entender el costo de CCTV empresarial en México: factores reales de obra y operación, tipologías por sitio y cómo cotizar con diagnóstico de alcance cerrado en Puebla, Cholula (Momoxpan) y CDMX. Sin precios inventados.";

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

export default function BlogCostCctvMx() {
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

  const breadcrumbJson = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
      { "@type": "ListItem", position: 3, name: title, item: `${siteUrl}${path}` },
    ],
  };

  return (
    <main className={`${shared.page} home-main-flush`} aria-label={title}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJson).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJson).replace(/</g, "\\u003c") }}
      />

      <article className={shared.section} data-reveal="up">
        <div className={`${shared.inner} ${styles.articleInner}`}>
          <p className={styles.articleBreadcrumb}>
            <Link href="/blog">Blog</Link>
            <span aria-hidden> / </span>
            <span>Guía de costos CCTV</span>
          </p>

          <header className={styles.articleHeader}>
            <h1 className={styles.articleTitle}>{title}</h1>
            <p className={styles.articleLead}>
              Esta guía explica los factores reales del costo de un CCTV empresarial en México y cómo
              cotizar con diagnóstico de <strong>alcance cerrado</strong> con NEXARA en Puebla, Cholula
              (Momoxpan) y CDMX. Sin precios inventados ni promesas genéricas.
            </p>
          </header>

          <div className={styles.articleBody}>
            <h2>Factores que mueven el costo</h2>
            <ul className={shared.bulletList}>
              <li>Complejidad de obra: canalización, alturas, multi‑piso, acceso a techos y fachadas.</li>
              <li>Alcance técnico: número de cámaras, óptica, grabación (NVR/VMS) y retención.</li>
              <li>Infraestructura: cableado PoE, switches, UPS, organización de rack.</li>
              <li>Red y segmentación: VLAN para aislar CCTV de POS/LAN e invitados.</li>
              <li>Ventanas de trabajo y riesgos operativos del sitio.</li>
            </ul>

            <h2>Tipologías de proyecto</h2>
            <ul className={shared.checkList}>
              <li>PyME de una sede: cobertura interior, accesos y evidencia de mostrador.</li>
              <li>Retail / multi‑punto: estándar repetible por sucursal con acceso centralizado.</li>
              <li>Planta / almacén / perímetro: exteriores, patios y trazabilidad logística.</li>
            </ul>

            <h2>Instalar vs. solo monitorear</h2>
            <p>
              El costo de instalación en campo (cámaras, red, NVR/VMS) no es el mismo que un servicio
              de monitoreo. En NEXARA definimos primero <em>qué</em> se instala y <em>dónde</em>, luego
              acordamos operación y soporte si aplica.
            </p>

            <h2>Cómo cotizar con NEXARA (Puebla / Cholula / CDMX)</h2>
            <ul className={shared.bulletList}>
              <li>Diagnóstico en sitio con <strong>alcance cerrado</strong>: incluye y excluye por escrito.</li>
              <li>Propuesta por fases con entregables verificables y calendario.</li>
              <li>Instalación con evidencia y documentación; soporte bajo el mismo contrato si lo requieres.</li>
            </ul>

            <h2>Ángulo local: Puebla, Cholula (Momoxpan) y CDMX</h2>
            <p>
              Nuestra base operativa está en Puebla / San Andrés Cholula (Momoxpan) y CDMX, con
              cobertura nacional listada en{" "}
              <Link href="/cobertura">/cobertura</Link>. Para intentos locales:
            </p>
            <ul className={shared.bulletList}>
              <li>
                CCTV Puebla: <Link href="/cobertura/puebla/camaras-cctv">/cobertura/puebla/camaras-cctv</Link>
              </li>
              <li>
                CCTV CDMX: <Link href="/cobertura/cdmx/camaras-cctv">/cobertura/cdmx/camaras-cctv</Link>
              </li>
              <li>
                CCTV Cholula:{" "}
                <Link href="/cobertura/cholula/camaras-cctv">/cobertura/cholula/camaras-cctv</Link>
              </li>
            </ul>

            <h2>FAQ</h2>
            <details className={styles.faqItem} open>
              <summary className={styles.faqQuestion}>¿Publican precios o “desde $X”?</summary>
              <p className={styles.faqAnswer}>
                No. Cada sitio cambia la obra, la red y el alcance. Cotizamos por diagnóstico de campo.
                Sin precios Nexara inventados.
              </p>
            </details>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>¿NEXARA es lo mismo que Grupo Nexara?</summary>
              <p className={styles.faqAnswer}>
                No. Somos <strong>nexara.com.mx</strong>, con base en Puebla/Cholula (Momoxpan) y CDMX, y
                oferta de <strong>CCTV + redes + soporte bajo un mismo contrato</strong>. Grupo Nexara
                opera en <strong>gruponexara.com</strong>.
              </p>
            </details>
          </div>

          <footer className={styles.articleFooter}>
            <Link href="/contacto" className={styles.articleCta}>
              Agendar diagnóstico con alcance cerrado →
            </Link>
            <a
              href="https://wa.me/522226960350?text=Hola%20Nexara%2C%20me%20interesa%20CCTV%20empresarial.%20%28Ref%3A%20%2Fblog%2Fcuanto-cuesta-cctv-empresarial-mexico%29"
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

