import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";

export const metadata = {
  title: "Proyectos | Nexara",
  description: "Casos de éxito y proyectos representativos ejecutados por Nexara en distintos sectores.",
};
export const dynamic = "force-dynamic";

const casos = [
  {
    sector: "Retail",
    title: "Modernización de POS multi-sede",
    desc: "Integración con SAP y monitoreo centralizado en 60 sucursales.",
    image: "/images/hero/hero-01.png",
    metric: "60 sedes",
  },
  {
    sector: "Manufactura",
    title: "Línea de producción IoT",
    desc: "Sensórica, dashboards en tiempo real y alertas predictivas.",
    image: "/images/hero/hero-02.png",
    metric: "-23% paros",
  },
  {
    sector: "Hospitalidad",
    title: "Red Wi-Fi de alta densidad",
    desc: "Diseño RF y cableado estructurado para 480 habitaciones.",
    image: "/images/hero/hero-03.png",
    metric: "480 hab.",
  },
  {
    sector: "Salud",
    title: "Expediente clínico unificado",
    desc: "Migración a la nube, HL7/FHIR y portal de pacientes.",
    image: "/images/hero/hero-04.png",
    metric: "12 clínicas",
  },
  {
    sector: "Educación",
    title: "Campus conectado",
    desc: "Aulas inteligentes, control de acceso y videovigilancia integrada.",
    image: "/images/hero/hero-05.png",
    metric: "3 campus",
  },
  {
    sector: "Gobierno",
    title: "Centro de datos regional",
    desc: "Infraestructura redundante con SLA 99.95 % y DRP geo-replicado.",
    image: "/images/hero/hero-06.png",
    metric: "99.95% SLA",
  },
];

const sectores = ["Retail", "Manufactura", "Hospitalidad", "Salud", "Educación", "Gobierno"];

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
    const res = await fetch(buildApiUrl("projects?limit=12"), {
      cache: "no-store",
    });
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
    <main className={shared.page}>
      {/* Hero */}
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Proyectos</span>
              <h1 className={shared.heroTitle}>
                Casos reales, <span className={shared.heroTitleAccent}>resultados medibles</span>
              </h1>
              <p className={shared.heroLead}>
                Una selección de proyectos donde la tecnología cambió la forma de operar.
                Cada uno con métricas claras y clientes que recomiendan.
              </p>
              <div className={shared.heroActions}>
                <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Cuéntanos tu reto <span className={shared.btnArrow}>→</span>
                </Link>
                <Link href="/servicios" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Ver servicios
                </Link>
              </div>
            </div>
            <div className={shared.heroImage} data-reveal="soft">
              <Image src="/images/hero/hero-07.png" alt="Proyectos Nexara" width={720} height={540} priority />
              <div className={shared.heroImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.statsGrid} data-reveal-stagger>
            <div className={shared.stat} data-reveal="up">
              <span className={shared.statValue}>+120</span>
              <span className={shared.statLabel}>Proyectos entregados</span>
            </div>
            <div className={shared.stat} data-reveal="up">
              <span className={shared.statValue}>+40</span>
              <span className={shared.statLabel}>Clientes activos</span>
            </div>
            <div className={shared.stat} data-reveal="up">
              <span className={shared.statValue}>10 años</span>
              <span className={shared.statLabel}>De experiencia</span>
            </div>
            <div className={shared.stat} data-reveal="up">
              <span className={shared.statValue}>99.9%</span>
              <span className={shared.statLabel}>SLA promedio</span>
            </div>
          </div>
        </div>
      </section>

      {/* Casos */}
      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Casos destacados</span>
            <h2 className={shared.sectionTitle}>
              Proyectos que <span className={shared.sectionTitleAccent}>contamos con orgullo</span>
            </h2>
            <p className={shared.sectionLead}>
              {studioProjects.length
                ? "Contenido sincronizado desde Studio, con impacto, servicios y evidencias visuales."
                : "Seis casos representativos de los últimos 24 meses."}
            </p>
          </div>
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
                    <span className={styles.caseMetric}>{p.impact || "Impacto validado"}</span>
                  </div>
                  <div className={styles.studioCaseBody}>
                    <span className={styles.caseSector}>{p.sector || "Proyecto"}</span>
                    <h3 className={styles.studioCaseTitle}>{p.title}</h3>
                    <p className={styles.studioCaseSummary}>{p.summary}</p>

                    {p.services?.length > 0 && (
                      <div className={styles.infoRow}>
                        <strong>Servicios:</strong>
                        <span>{p.services.join(" • ")}</span>
                      </div>
                    )}

                    {p.tags?.length > 0 && (
                      <div className={styles.tagsWrap}>
                        {p.tags.slice(0, 8).map((tag) => (
                          <span key={`${p.id}-${tag}`} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {p.highlights?.length > 0 && (
                      <ul className={styles.highlights}>
                        {p.highlights.slice(0, 4).map((h, idx) => (
                          <li key={`${p.id}-h-${idx}`}>{h}</li>
                        ))}
                      </ul>
                    )}

                    {p.gallery?.length > 0 && (
                      <div className={styles.galleryBlock}>
                        <strong className={styles.galleryTitle}>Galería ({p.gallery.length}/8):</strong>
                        <div className={styles.galleryGrid}>
                          {p.gallery.slice(0, 8).map((img, idx) => (
                            <div key={`${p.id}-g-${idx}`} className={styles.galleryThumb}>
                              <Image
                                src={normalizeProjectImageUrl(img)}
                                alt={`${p.title} galería ${idx + 1}`}
                                fill
                                sizes="(max-width: 1024px) 16vw, 80px"
                                className={styles.galleryThumbPhoto}
                                unoptimized
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={styles.metaFooter}>
                      <span>{(p.mainImage ? 1 : 0) + (p.gallery?.length || 0)} imágenes (principal + galería)</span>
                      <span>{new Date(p.createdAt).toLocaleDateString("es-MX")}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={shared.grid3} data-reveal-stagger>
              {casos.map((c) => (
                <article key={c.title} className={shared.imageCard} data-reveal="up">
                  <div className={shared.imageCardImg}>
                    <Image src={c.image} alt={c.title} width={640} height={400} />
                    <span className={styles.caseMetric}>{c.metric}</span>
                  </div>
                  <div className={shared.imageCardBody}>
                    <span className={styles.caseSector}>{c.sector}</span>
                    <h3 className={shared.imageCardTitle}>{c.title}</h3>
                    <p className={shared.imageCardText}>{c.desc}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Sectores */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Sectores</span>
            <h2 className={shared.sectionTitle}>
              Industrias donde <span className={shared.sectionTitleAccent}>operamos</span>
            </h2>
          </div>
          <div className={shared.chipRow} data-reveal-stagger>
            {sectores.map((s) => (
              <span key={s} className={shared.chip} data-reveal="up">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Tu proyecto es el <span className={shared.sectionTitleAccent}>siguiente caso</span>?
            </h2>
            <p className={shared.ctaLead}>
              Escríbenos y armamos juntos el alcance. Sin compromiso.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Iniciar conversación <span className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
