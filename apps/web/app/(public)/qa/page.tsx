import FAQ from "../../components/FAQ";
import type { Metadata } from "next";
import styles from "./page.module.css";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Preguntas Frecuentes de Tecnologia Empresarial | Nexara",
  description: "Respuestas ejecutivas sobre ERP industrial, infraestructura, soporte, seguridad y tiempos de implementacion.",
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
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "FAQ Nexara" }],
  },
};

export default function QAPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Que tipo de servicios tecnologicos ofrece Nexara?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Nexara ofrece ERP industrial, infraestructura TI, ciberseguridad, soporte especializado y servicios gestionados para empresas.",
        },
      },
      {
        "@type": "Question",
        name: "En cuanto tiempo se implementa una solucion?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "El tiempo depende del alcance. Se trabaja por fases con hitos de control para acelerar resultados sin comprometer continuidad operativa.",
        },
      },
      {
        "@type": "Question",
        name: "Nexara tiene cobertura en Mexico?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Si. Nexara atiende proyectos con cobertura nacional para organizaciones de distintos sectores.",
        },
      },
    ],
  };

  return (
    <main className={styles.container} aria-label="Página de preguntas y respuestas">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
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
    </main>
  );
}
