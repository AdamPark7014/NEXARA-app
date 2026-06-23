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
  type MetricaItem,
  type ServicioItem,
  type ProcesoItem,
  type CtaContent,
} from "@/lib/page-content-api";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nexara | Tecnología que sostiene tu operación",
  description:
    "Nexara: integración tecnológica, ingeniería y servicios de extremo a extremo para empresas en México. Continuidad operativa, ejecución impecable y resultados medibles.",
  keywords: [
    "Nexara",
    "empresa de tecnologia en Mexico",
    "integracion tecnologica empresarial",
    "consultoria tecnologica",
    "servicios TI Mexico",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Nexara | Tecnología que sostiene tu operación",
    description: "Equipo de integración tecnológica orientado a continuidad operativa y resultados medibles.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexara | Tecnología que sostiene tu operación",
    description: "Experiencia de campo, ejecución y acompañamiento para operaciones empresariales.",
    images: ["/logo-nexara.png"],
  },
};

export const dynamic = 'force-dynamic';

export default async function NexaraPage() {
  const [metricasData, serviciosData, procesoData, industriasData, ctaData] =
    await Promise.all([
      fetchPageSection<{ items: MetricaItem[] }>("home_metricas"),
      fetchPageSection<{ items: ServicioItem[] }>("home_servicios"),
      fetchPageSection<{ items: ProcesoItem[] }>("home_proceso"),
      fetchPageSection<{ items: string[] }>("home_industrias"),
      fetchPageSection<CtaContent>("home_cta"),
    ]);

  const metricas   = metricasData?.items   ?? DEFAULT_METRICAS;
  const servicios  = serviciosData?.items  ?? DEFAULT_SERVICIOS;
  const proceso    = procesoData?.items    ?? DEFAULT_PROCESO;
  const industrias = industriasData?.items ?? DEFAULT_INDUSTRIAS;
  const cta        = ctaData               ?? DEFAULT_CTA;

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    url: siteUrl,
    name: "NEXARA",
    logo: `${siteUrl}/logo-nexara.png`,
    description: "Empresa de integración tecnológica enfocada en continuidad operativa y resultados empresariales.",
  };

  return (
    <main className={`${baseStyles.brochurePage} home-main-flush`} aria-label="Nexara — Inicio">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />

      {/* 1. Hero */}
      <HomeHero />

      {/* 2. Métricas — banda oscura full-bleed */}
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

      {/* Cuerpo central */}
      <div className={styles.homeBody}>

        {/* 3. Servicios */}
        <section id="servicios" aria-label="Servicios de Nexara">
          <header className={styles.sectionHead}>
            <p className={styles.eyebrow}>Qué hacemos</p>
            <h2 className={styles.sectionTitle}>
              Servicios pensados para{" "}
              <em className={styles.accent}>operaciones reales</em>
            </h2>
            <p className={styles.sectionLead}>
              Cobertura de extremo a extremo: desde el diseño hasta el monitoreo continuo.
              Sin entregar y desaparecer.
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
                <span className={styles.servicioArrow} aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </section>

        {/* 4. Proceso */}
        <section id="proceso" aria-label="Cómo trabajamos" className={styles.procesoSection}>
          <header className={`${styles.sectionHead} ${styles.centered}`}>
            <p className={styles.eyebrow}>Cómo trabajamos</p>
            <h2 className={styles.sectionTitle}>
              Un método <em className={styles.accent}>claro y predecible</em>
            </h2>
            <p className={styles.sectionLead}>
              Cuatro fases visibles, hitos cortos y comunicación honesta en cada paso.
            </p>
          </header>
          <div className={styles.procesoGrid}>
            {proceso.map((p) => (
              <div key={p.title} className={styles.procesoStep}>
                <span className={styles.procesoNum} aria-hidden>{p.num}</span>
                <h3 className={styles.procesoTitle}>{p.title}</h3>
                <p className={styles.procesoText}>{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Industrias */}
        <section aria-label="Industrias que atendemos" className={styles.industriasSection}>
          <header className={`${styles.sectionHead} ${styles.centered}`}>
            <p className={styles.eyebrow}>Sectores</p>
            <h2 className={styles.sectionTitle}>
              Hablamos el idioma de tu <em className={styles.accent}>industria</em>
            </h2>
            <p className={styles.sectionLead}>
              Cada sector tiene su ritmo y sus normas. Adaptamos la solución a tu realidad
              operativa, no al revés.
            </p>
          </header>
          <div className={styles.industriasFlow}>
            {industrias.map((ind) => (
              <span key={ind} className={styles.industriaChip}>{ind}</span>
            ))}
          </div>
        </section>

      </div>

      {/* 6. CTA — banda oscura full-bleed */}
      <section aria-label="Empecemos a trabajar" className={styles.ctaBand}>
        <div className={styles.ctaInner}>
          <p className={styles.ctaEyebrow}>{cta.eyebrow}</p>
          <h2 className={styles.ctaTitle}>
            {cta.title}{" "}
            <em className={styles.ctaAccent}>{cta.titleAccent}</em>
          </h2>
          <p className={styles.ctaText}>{cta.text}</p>
          <div className={styles.ctaActions}>
            <Link
              href={cta.primaryHref}
              data-track-conversion="home_cta_primary"
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              {cta.primaryLabel}
              <span className={styles.btnArrow} aria-hidden>→</span>
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
