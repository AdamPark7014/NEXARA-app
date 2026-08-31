import FAQ from "../../components/FAQ";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Preguntas Frecuentes de Tecnologia Empresarial | Nexara",
  description:
    "Respuestas ejecutivas sobre ERP industrial, infraestructura, soporte, seguridad y tiempos de implementacion.",
  keywords: [
    "preguntas frecuentes ERP",
    "FAQ tecnologia empresarial",
    "soporte TI empresas",
    "implementacion ERP industrial",
    "Nexara",
  ],
  alternates: {
    canonical: "/qa",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/qa`,
    title: "Preguntas Frecuentes de Tecnologia Empresarial | Nexara",
    description: "Aclara dudas clave antes de implementar soluciones tecnologicas empresariales.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "FAQ Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Preguntas Frecuentes de Tecnologia Empresarial | Nexara",
    description: "Aclara dudas clave antes de implementar soluciones tecnologicas empresariales.",
    images: ["/opengraph-image"],
  },
};

export default function QAPage() {
  // FAQ JSON-LD lo inyecta el componente FAQ (una sola fuente).
  return (
    <main className={styles.container} aria-label="Página de preguntas y respuestas">
      <section className={styles.hero}>
        <span className={styles.badge}>Q&A ESTRATÉGICO</span>
        <h1 className={styles.title}>Respuestas claras para tomar decisiones tecnológicas</h1>
        <p className={styles.subtitle}>
          Consulta en un solo lugar las preguntas clave de dirección, operación y compras.
        </p>
      </section>

      <section className={styles.content}>
        <FAQ />
      </section>

      <section style={{ marginTop: 22, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, color: "#0f172a" }}>¿Necesitas una respuesta para tu operación?</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/contacto"
            data-track-conversion="qa_primary_cta"
            style={{ background: "#0f62d6", color: "#fff", textDecoration: "none", padding: "10px 14px", borderRadius: 8, fontWeight: 700 }}
          >
            Cotiza tu proyecto
          </Link>
          <Link
            href="/servicios"
            data-track-conversion="qa_services_cta"
            style={{ border: "1px solid #0f62d6", color: "#0f62d6", textDecoration: "none", padding: "10px 14px", borderRadius: 8, fontWeight: 700 }}
          >
            Ver servicios
          </Link>
        </div>
      </section>

      <div style={{ marginTop: 26 }}>
        <SeoInterlinkHub title="Soluciones recomendadas" currentPath="/qa" maxItems={8} />
      </div>
    </main>
  );
}
