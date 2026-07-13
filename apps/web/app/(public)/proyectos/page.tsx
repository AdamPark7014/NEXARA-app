import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";

export const metadata = {
  title: "Proyectos | Nexara",
  description: "Casos y proyectos representativos ejecutados por Nexara en distintos sectores.",
};
export const dynamic = "force-dynamic";

const casos = [
  {
    sector: "Retail",
    title: "Modernización multi-sede",
    desc: "CCTV, redes y soporte de punta de venta con estándar repetible por sucursal.",
    image: "/images/hero/hero-01.png",
    metric: "60 sedes",
  },
  {
    sector: "Manufactura",
    title: "Continuidad de planta",
    desc: "Redes de piso, perímetro y monitoreo para reducir paros por falla de infraestructura.",
    image: "/images/hero/hero-02.png",
    metric: "Menos paros",
  },
  {
    sector: "Hospitalidad",
    title: "Wi‑Fi de alta densidad",
    desc: "Diseño RF y cableado para habitaciones y áreas públicas sin saturar la experiencia.",
    image: "/images/hero/hero-03.png",
    metric: "480 hab.",
  },
  {
    sector: "Salud",
    title: "Infraestructura clínica",
    desc: "Segmentación, respaldos y soporte prioritario para continuidad de atención.",
    image: "/images/hero/hero-04.png",
    metric: "12 sitios",
  },
  {
    sector: "Educación",
    title: "Campus conectado",
    desc: "Wi‑Fi, CCTV y mesa de ayuda para aulas, labs y edificios administrativos.",
    image: "/images/hero/hero-05.png",
    metric: "3 campus",
  },
  {
    sector: "Gobierno",
    title: "Modernización por fases",
    desc: "Infraestructura documentada, entregables auditables y continuidad operativa.",
    image: "/images/hero/hero-06.png",
    metric: "Por fases",
  },
];

const METRICS = [
  { value: "Campo", label: "Diagnóstico e instalación con evidencia en sitio" },
  { value: "Multi-sede", label: "Estándares repetibles para sucursales y campus" },
  { value: "Soporte", label: "Continuidad después del go-live, no solo entrega" },
  { value: "Nacional", label: "Base Puebla · CDMX, cobertura extendida" },
];

type StudioProject = {
  id: number;
  slug: string;
  title: string;
  sector: string;
  summary: string;
  impact: string;
  services: string[];
  tags: string[];
  highlights: string[];
  gallery: string[];
  mainImage?: string | null;
  createdAt: string;
};

function normalizeProjectImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) return "/images/hero/hero-07.png";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  const origin = getApiAssetOrigin();
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/projects/image/")) return `${origin}${imageUrl}`;
    return imageUrl;
  }
  return `${origin}/projects/image/${imageUrl}`;
}

async function fetchStudioProjects(): Promise<StudioProject[]> {
  try {
    const res = await fetch(buildApiUrl("projects?limit=12"), { cache: "no-store" });
    if (!res.ok) return [];
    const payload = (await res.json()) as StudioProject[] | { data?: StudioProject[] };
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload.data) ? payload.data : [];
  } catch {
    return [];
  }
}

export default async function ProyectosPage() {
  const studioProjects = await fetchStudioProjects();

  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Proyectos"
        title={
          <>
            Casos de campo,{" "}
            <span className={heroStyles.titleAccent}>no demos bonitos</span>
          </>
        }
        lead="Selección de trabajos donde CCTV, redes, cómputo o soporte cambiaron la operación del cliente."
        imageSrc="/images/hero/hero-07.png"
        imageAlt="Proyectos Nexara"
      />

      <section className={shared.sectionTight} data-reveal="soft">
        <div className={shared.inner}>
          <div className={shared.metricsStrip}>
            {METRICS.map((m) => (
              <div key={m.value} className={shared.metric}>
                <span className={shared.metricValue}>{m.value}</span>
                <span className={shared.metricLabel}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Casos</p>
            <h2 className={shared.sectionTitle}>
              {studioProjects.length ? (
                <>
                  Desde <span className={shared.sectionTitleAccent}>Studio</span>
                </>
              ) : (
                <>
                  Seis verticales,{" "}
                  <span className={shared.sectionTitleAccent}>seis ejemplos</span>
                </>
              )}
            </h2>
            <p className={shared.sectionLead}>
              {studioProjects.length
                ? "Proyectos publicados desde Studio con impacto, servicios y evidencia visual."
                : "Referencias representativas. El detalle de cada vertical vive en Soluciones."}
            </p>
          </header>

          {studioProjects.length ? (
            <div className={styles.studioCasesList} data-reveal-stagger>
              {studioProjects.map((p) => (
                <article key={p.id} className={styles.studioCaseCard} data-reveal="up">
                  <div className={styles.studioCaseMedia}>
                    <Image
                      src={normalizeProjectImageUrl(p.mainImage)}
                      alt={p.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 42vw"
                      className={styles.studioCasePhoto}
                      unoptimized
                    />
                    {p.impact ? <span className={styles.caseMetric}>{p.impact}</span> : null}
                  </div>
                  <div className={styles.studioCaseBody}>
                    <span className={styles.caseSector}>{p.sector || "Proyecto"}</span>
                    <h3 className={styles.studioCaseTitle}>{p.title}</h3>
                    <p className={styles.studioCaseSummary}>{p.summary}</p>

                    {p.services?.length > 0 && (
                      <p className={styles.infoRow}>
                        <strong>Servicios:</strong> {p.services.join(" · ")}
                      </p>
                    )}

                    {p.highlights?.length > 0 && (
                      <ul className={styles.highlights}>
                        {p.highlights.slice(0, 4).map((h, idx) => (
                          <li key={`${p.id}-h-${idx}`}>{h}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={shared.industryBoard} data-reveal-stagger>
              {casos.map((c) => (
                <Link
                  key={c.title}
                  href={`/soluciones/${c.sector
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/educacion/, "educacion")}`}
                  className={`${shared.industryCell} ${styles.caseCell}`}
                  data-reveal="up"
                >
                  <span className={shared.industryRisk}>{c.sector}</span>
                  <h3 className={shared.industryCellTitle}>{c.title}</h3>
                  <p className={shared.industryCellText}>{c.desc}</p>
                  <span className={shared.industryCellLink}>{c.metric} →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>Siguiente paso</p>
            <h2 className={shared.ctaTitle}>¿Tu sitio es el siguiente?</h2>
            <p className={shared.ctaLead}>
              Cuéntanos el riesgo y el alcance. Armamos diagnóstico y propuesta sin compromiso.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Iniciar conversación <span className={shared.btnArrow}>→</span>
              </Link>
              <Link href="/soluciones" className={`${shared.btn} ${shared.btnSecondary}`}>
                Ver industrias
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
