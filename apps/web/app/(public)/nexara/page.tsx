import Link from "next/link";
import type { Metadata } from "next";
import baseStyles from "./page.module.css";
import styles from "./home-sections.module.css";
import HomeHero from "../../components/HomeHero";
import {
  fetchPageSection,
  DEFAULT_METRICAS,
  DEFAULT_SERVICIOS,
  DEFAULT_PROCESO,
  DEFAULT_INDUSTRIAS,
  DEFAULT_CTA,
  INDUSTRIA_SLUGS,
  type MetricaItem,
  type ServicioItem,
  type ProcesoItem,
  type CtaContent,
} from "@/lib/page-content-api";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nexara | Tecnología que sostiene tu operación",
  description:
    "Integración tecnológica en México: CCTV, redes, cómputo y soporte TI con disciplina de campo. Continuidad operativa desde Puebla y CDMX.",
  keywords: [
    "Nexara",
    "cctv Puebla",
    "redes empresariales",
    "soporte ti Mexico",
    "integracion tecnologica",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Nexara | Tecnología que sostiene tu operación",
    description: "CCTV, redes, cómputo y soporte con una sola firma responsable.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexara | Tecnología que sostiene tu operación",
    description: "Integración tecnológica de campo para operaciones empresariales.",
    images: ["/logo-nexara.png"],
  },
};

export const dynamic = "force-dynamic";

const resolveIndustriaSlug = (label: string) =>
  INDUSTRIA_SLUGS[label] || label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default async function NexaraPage() {
  const [metricasData, serviciosData, procesoData, industriasData, ctaData] =
    await Promise.all([
      fetchPageSection<{ items: MetricaItem[] }>("home_metricas"),
      fetchPageSection<{ items: ServicioItem[] }>("home_servicios"),
      fetchPageSection<{ items: ProcesoItem[] }>("home_proceso"),
      fetchPageSection<{ items: string[] }>("home_industrias"),
      fetchPageSection<CtaContent>("home_cta"),
    ]);

  const metricas = metricasData?.items ?? DEFAULT_METRICAS;
  const servicios = (serviciosData?.items ?? DEFAULT_SERVICIOS).slice(0, 4);
  const proceso = (procesoData?.items ?? DEFAULT_PROCESO).slice(0, 3);
  const industrias = industriasData?.items ?? DEFAULT_INDUSTRIAS;
  const cta = ctaData ?? DEFAULT_CTA;

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    url: siteUrl,
    name: "NEXARA",
    logo: `${siteUrl}/logo-nexara.png`,
    description:
      "Integrador tecnológico de operación en México: videovigilancia, redes, cómputo y soporte.",
  };

  return (
    <main className={`${baseStyles.brochurePage} home-main-flush`} aria-label="Nexara — Inicio">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />

      <HomeHero />

      <section className={styles.metricsBand} aria-label="Cifras clave de Nexara">
        <div className={styles.metricsInner}>
          {metricas.map((m) => (
            <div key={m.label} className={styles.metricItem}>
              <span className={styles.metricValue}>{m.value}</span>
              <span className={styles.metricLabel}>{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.homeBody}>
        <section id="servicios" aria-label="Qué hacemos">
          <header className={styles.sectionHead}>
            <p className={styles.eyebrow}>Qué hacemos</p>
            <h2 className={styles.sectionTitle}>
              Cuatro capacidades para <em className={styles.accent}>operar sin fricciones</em>
            </h2>
            <p className={styles.sectionLead}>
              Diseñamos, instalamos y acompañamos. Sin entregar un proyecto y desaparecer.
            </p>
          </header>
          <div className={styles.serviciosList}>
            {servicios.map((s, i) => (
              <Link key={s.title} href={s.href} className={styles.servicioRow}>
                <div className={styles.servicioMeta}>
                  <span className={styles.servicioNum}>0{i + 1}</span>
                  <span className={styles.servicioCat}>{s.badge}</span>
                </div>
                <div>
                  <h3 className={styles.servicioTitle}>{s.title}</h3>
                  <p className={styles.servicioText}>{s.text}</p>
                </div>
                <span className={styles.servicioArrow} aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section id="proceso" aria-label="Cómo trabajamos" className={styles.procesoSection}>
          <header className={`${styles.sectionHead} ${styles.centered}`}>
            <p className={styles.eyebrow}>Cómo trabajamos</p>
            <h2 className={styles.sectionTitle}>
              Tres fases, <em className={styles.accent}>cero ambigüedad</em>
            </h2>
            <p className={styles.sectionLead}>
              Diagnóstico honesto, implementación con evidencia y operación continua.
            </p>
          </header>
          <div className={styles.procesoGrid}>
            {proceso.map((p) => (
              <div key={p.title} className={styles.procesoStep}>
                <span className={styles.procesoNum} aria-hidden>
                  {p.num}
                </span>
                <h3 className={styles.procesoTitle}>{p.title}</h3>
                <p className={styles.procesoText}>{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Industrias" className={styles.industriasSection}>
          <header className={`${styles.sectionHead} ${styles.centered}`}>
            <p className={styles.eyebrow}>Sectores</p>
            <h2 className={styles.sectionTitle}>
              Soluciones que hablan el idioma de <em className={styles.accent}>tu industria</em>
            </h2>
            <p className={styles.sectionLead}>
              Multi-sede, cumplimiento y uptime: adaptamos la tecnología a tu ritmo operativo.
            </p>
          </header>
          <div className={styles.industriasFlow}>
            {industrias.map((ind) => {
              const label = typeof ind === "string" ? ind : String(ind);
              const slug = resolveIndustriaSlug(label);
              return (
                <Link key={label} href={`/soluciones/${slug}`} className={styles.industriaChip}>
                  {label}
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section aria-label="Empecemos" className={styles.ctaBand}>
        <div className={styles.ctaInner}>
          <p className={styles.ctaEyebrow}>{cta.eyebrow}</p>
          <h2 className={styles.ctaTitle}>
            {cta.title} <em className={styles.ctaAccent}>{cta.titleAccent}</em>
          </h2>
          <p className={styles.ctaText}>{cta.text}</p>
          <div className={styles.ctaActions}>
            <Link
              href={cta.primaryHref}
              data-track-conversion="home_cta_primary"
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              {cta.primaryLabel}
              <span className={styles.btnArrow} aria-hidden>
                →
              </span>
            </Link>
            <Link
              href={cta.secondaryHref}
              data-track-conversion="home_cta_secondary"
              className={`${styles.btn} ${styles.btnGhost}`}
            >
              {cta.secondaryLabel}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
