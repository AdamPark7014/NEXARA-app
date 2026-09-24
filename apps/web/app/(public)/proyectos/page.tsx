import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import PublicIcon, { type PublicIconName } from "../../components/PublicIcon";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { INDUSTRIA_SLUGS } from "@/lib/page-content-api";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import { GEO_CITIES } from "@/lib/seo/geo-cities";

const resolveIndustriaSlug = (label: string) =>
  INDUSTRIA_SLUGS[label] || label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("proyectos");
}
export const dynamic = "force-dynamic";

const SECTOR_ICONS: Record<string, PublicIconName> = {
  retail: "store",
  manufactura: "factory",
  hospitalidad: "hotel",
  salud: "hospital",
  educacion: "school",
  gobierno: "landmark",
};

/** Referencias representativas por vertical (sin cliente nombrado). */
const casos = [
  {
    sector: "Retail",
    title: "Modernización multi-sede",
    desc: "CCTV, redes y soporte de punto de venta con estándar repetible por sucursal.",
    metric: "60 sedes",
    services: ["CCTV", "Redes", "Soporte"],
  },
  {
    sector: "Manufactura",
    title: "Continuidad de planta",
    desc: "Redes de piso, perímetro y monitoreo para reducir paros por falla de infraestructura.",
    metric: "Menos paros",
    services: ["Redes", "CCTV", "Infraestructura"],
  },
  {
    sector: "Hospitalidad",
    title: "Wi‑Fi de alta densidad",
    desc: "Diseño RF y cableado para habitaciones y áreas públicas sin saturar la experiencia.",
    metric: "480 hab.",
    services: ["Wi‑Fi", "Cableado", "Soporte"],
  },
  {
    sector: "Salud",
    title: "Infraestructura clínica",
    desc: "Segmentación, respaldos y soporte prioritario para continuidad de atención.",
    metric: "12 sitios",
    services: ["Redes", "Infraestructura", "Soporte"],
  },
  {
    sector: "Educación",
    title: "Campus conectado",
    desc: "Wi‑Fi, CCTV y mesa de ayuda para aulas, labs y edificios administrativos.",
    metric: "3 campus",
    services: ["Wi‑Fi", "CCTV", "Mesa de ayuda"],
  },
  {
    sector: "Gobierno",
    title: "Modernización por fases",
    desc: "Infraestructura documentada, entregables auditables y continuidad operativa.",
    metric: "Por fases",
    services: ["Infraestructura", "Redes", "Documentación"],
  },
];

const METRICS: { icon: PublicIconName; value: string; label: string }[] = [
  { icon: "search", value: "Campo", label: "Diagnóstico e instalación con evidencia en sitio" },
  { icon: "building", value: "Multi-sede", label: "Estándares repetibles para sucursales y campus" },
  { icon: "headset", value: "Soporte", label: "Continuidad después del arranque, no solo entrega" },
  { icon: "mapPin", value: "Nacional", label: "Base Puebla · CDMX, cobertura extendida" },
];

/** Galería: fotografías reales de instalaciones NEXARA (en /public/fotos). */
const GALERIA = [
  {
    src: "/fotos/tecnico-nexara-entrega-equipo-sitio-1920_ba8f.webp",
    srcSet:
      "/fotos/tecnico-nexara-entrega-equipo-sitio-1200_e08f.webp 1200w, /fotos/tecnico-nexara-entrega-equipo-sitio-1920_ba8f.webp 1920w",
    sizes: "(max-width: 980px) 100vw, 640px",
    alt: "Técnico de NEXARA manejando cajas de equipo durante entrega en sitio",
    kicker: "Logística",
    caption: "Entrega de equipo en instalación exterior",
  },
  {
    src: "/fotos/cableado-interno-pc-guantes-taller-1920_8009.webp",
    srcSet:
      "/fotos/cableado-interno-pc-guantes-taller-1200_ab5a.webp 1200w, /fotos/cableado-interno-pc-guantes-taller-1920_8009.webp 1920w",
    sizes: "(max-width: 980px) 100vw, 640px",
    alt: "Manos con guantes realizando cableado interno de una PC en taller",
    kicker: "Soporte",
    caption: "Armado y cableado de equipos en taller",
    tall: true,
  },
  {
    src: "/fotos/equipo-tecnico-nexara-uniforme-1920_5775.webp",
    srcSet:
      "/fotos/equipo-tecnico-nexara-uniforme-1200_edc6.webp 1200w, /fotos/equipo-tecnico-nexara-uniforme-1920_5775.webp 1920w",
    sizes: "(max-width: 980px) 100vw, 640px",
    alt: "Equipo técnico de NEXARA con uniforme oficial en sitio de instalación",
    kicker: "Equipo",
    caption: "Ingeniería e instalación con el mismo equipo",
  },
  { src: "/fotos/campo-enlace-antena-ciudad.jpg", alt: "Radioenlace sobre la ciudad", kicker: "Enlaces", caption: "Radioenlace punto a punto entre sedes" },
  { src: "/fotos/campo-mastil-antenas.jpg", alt: "Mástil con antenas", kicker: "Redes", caption: "Mástil con antenas de enlace inalámbrico", tall: true },
  { src: "/fotos/monitoreo-pantallas-cctv.jpg", alt: "Pantallas de CCTV", kicker: "CCTV", caption: "Monitores de videovigilancia multi‑cámara" },
  { src: "/fotos/campo-instalacion-rack.jpg", alt: "Técnicos instalando un rack", kicker: "Instalación", caption: "Montaje de rack de telecomunicaciones" },
  { src: "/fotos/control-acceso-terminal-facial.jpg", alt: "Terminal de reconocimiento facial", kicker: "Control de acceso", caption: "Terminal facial en acceso de oficinas", tall: true },
  { src: "/fotos/campo-levantamiento-patio.jpg", alt: "Levantamiento en patio logístico", kicker: "Diagnóstico", caption: "Levantamiento en patio de maniobras" },
];

const DOCUMENTACION: { icon: PublicIconName; num: string; title: string; text: string }[] = [
  { icon: "search", num: "01", title: "Levantamiento en sitio", text: "Recorrido, riesgos, planos y prioridades antes de cotizar. Sin propuestas a ciegas." },
  { icon: "fileCheck", num: "02", title: "Memoria técnica", text: "Diagramas, direccionamiento, etiquetado y configuraciones entregadas al cliente." },
  { icon: "shield", num: "03", title: "Entrega con evidencia", text: "Pruebas, fotografías y capacitación. Después, soporte con SLA." },
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

function normalizeProjectImageUrl(imageUrl?: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  const origin = getApiAssetOrigin();
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/projects/image/") || imageUrl.startsWith("/case-studies/image/")) {
      return `${origin}${imageUrl}`;
    }
    return imageUrl;
  }
  return `${origin}/case-studies/image/${imageUrl}`;
}

async function fetchStudioProjects(): Promise<StudioProject[]> {
  try {
    // Preferir casos de Studio (CaseStudy publicados); fallback a catálogo Project
    const casesRes = await fetch(buildApiUrl("case-studies/public?limit=12"), { cache: "no-store" });
    if (casesRes.ok) {
      const payload = (await casesRes.json()) as any[] | { data?: any[] };
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
      if (rows.length) {
        return rows.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.titulo,
          sector: c.vertical || "Proyecto",
          summary: c.descripcion || c.impacto || "",
          impact: c.impacto || "",
          services: [],
          tags: c.cliente ? [c.cliente] : [],
          highlights: c.impacto ? [c.impacto] : [],
          gallery: [],
          mainImage: c.imageUrl || c.cover || null,
          createdAt: c.createdAt,
        }));
      }
    }

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
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Proyectos | NEXARA",
          url: `${siteBaseUrl()}/proyectos`,
          description:
            "Casos y proyectos de CCTV, redes y soporte ejecutados por Nexara.",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: casos.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `${c.sector}: ${c.title}`,
              description: c.desc,
            })),
          },
        }}
      />
      <PublicPageHero
        eyebrow="Proyectos"
        title={
          <>
            Casos de campo,{" "}
            <span className={heroStyles.titleAccent}>no demos bonitos</span>
          </>
        }
        lead="Instalaciones reales donde CCTV, redes, cómputo o soporte cambiaron la operación."
        imageSrc="/fotos/control-acceso-torniquetes.jpg"
        imageAlt="Torniquetes con reconocimiento facial instalados por NEXARA"
        actions={
          <>
            <Link href="/contacto" className={heroStyles.ctaPrimary} data-track-conversion="proyectos_hero_cta">
              Cotiza tu proyecto <span className={heroStyles.ctaArrow} aria-hidden>→</span>
            </Link>
            <a href="#galeria" className={heroStyles.ctaSecondary}>
              Ver galería
            </a>
          </>
        }
      />

      {/* Cifras que montan sobre el hero */}
      <section aria-label="Cómo trabajamos los proyectos" className={shared.statsBand}>
        <div className={shared.inner}>
          <div className={shared.statsCard}>
            <div className={shared.tileRow}>
              {METRICS.map((m) => (
                <div key={m.value} className={shared.tile}>
                  <span className={`${shared.iconTile} ${shared.iconTileSm}`}>
                    <PublicIcon name={m.icon} />
                  </span>
                  <div>
                    <h3 className={shared.tileTitle}>{m.value}</h3>
                    <p className={shared.tileText}>{m.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Galería de campo */}
      <section id="galeria" className={shared.section} aria-label="Galería de campo" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Galería de campo</p>
            <h2 className={shared.sectionTitle}>
              Evidencia, <span className={shared.sectionTitleAccent}>no renders</span>
            </h2>
            <p className={shared.sectionLead}>
              Fotografías de instalaciones y sitios reales operados por NEXARA: control de acceso, monitoreo,
              enlaces, racks y redes.
            </p>
          </header>
          <div className={shared.gallery}>
            {GALERIA.map((g) => (
              <figure key={g.src} className={`${shared.galleryItem} ${g.tall ? shared.galleryTall : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.src}
                  {...(g as any).srcSet ? { srcSet: (g as any).srcSet } : {}}
                  {...(g as any).sizes ? { sizes: (g as any).sizes } : {}}
                  alt={g.alt}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className={shared.photoCaption}>
                  <span className={shared.photoCaptionKicker}>{g.kicker}</span>
                  {g.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Casos publicados desde Studio (si existen) */}
      {studioProjects.length ? (
        <section className={`${shared.section} ${shared.sectionAlt}`} aria-label="Casos publicados" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
              <p className={shared.eyebrow}>Casos publicados</p>
              <h2 className={shared.sectionTitle}>
                Proyectos <span className={shared.sectionTitleAccent}>documentados</span>
              </h2>
              <p className={shared.sectionLead}>Casos publicados desde Studio con impacto, servicios y evidencia visual.</p>
            </header>
            <div className={shared.caseGrid} data-reveal-stagger>
              {studioProjects.map((p) => {
                const img = normalizeProjectImageUrl(p.mainImage);
                const slug = resolveIndustriaSlug(p.sector || "");
                return (
                  <article key={p.id} className={shared.caseCard} data-reveal="up">
                    {img ? (
                      <div className={shared.caseMedia}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt={p.title} loading="lazy" decoding="async" />
                      </div>
                    ) : null}
                    <div className={shared.caseHead}>
                      <span className={shared.caseSector}>
                        <PublicIcon name={SECTOR_ICONS[slug] ?? "building"} size={16} /> {p.sector}
                      </span>
                      {p.impact ? <span className={shared.caseMetric}>{p.impact}</span> : null}
                    </div>
                    <div className={shared.caseBody}>
                      <h3 className={shared.caseTitle}>{p.title}</h3>
                      {p.summary ? <p className={shared.caseText}>{p.summary}</p> : null}
                      {(p.services?.length || p.tags?.length) ? (
                        <ul className={shared.caseTags}>
                          {[...(p.services || []), ...(p.tags || [])].slice(0, 4).map((t) => (
                            <li key={t} className={shared.caseTag}>{t}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Referencias por vertical */}
      <section className={`${shared.sectionSpacious} ${shared.sectionLight}`} aria-label="Referencias por vertical" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Referencias por vertical</p>
            <h2 className={shared.sectionTitle}>
              Seis verticales, <span className={shared.sectionTitleAccent}>seis ejemplos</span>
            </h2>
            <p className={shared.sectionLead}>
              Referencias representativas de proyectos ejecutados. El detalle de cada vertical vive en Soluciones.
            </p>
          </header>
          <div className={shared.caseGrid} data-reveal-stagger>
            {casos.map((c) => {
              const slug = resolveIndustriaSlug(c.sector);
              return (
                <Link key={c.title} href={`/soluciones/${slug}`} className={shared.caseCard} data-reveal="up">
                  <div className={shared.caseHead}>
                    <span className={shared.caseSector}>
                      <PublicIcon name={SECTOR_ICONS[slug] ?? "building"} size={16} /> {c.sector}
                    </span>
                    <span className={shared.caseMetric}>{c.metric}</span>
                  </div>
                  <div className={shared.caseBody}>
                    <h3 className={shared.caseTitle}>{c.title}</h3>
                    <p className={shared.caseText}>{c.desc}</p>
                    <ul className={shared.caseTags}>
                      {c.services.map((s) => (
                        <li key={s} className={shared.caseTag}>{s}</li>
                      ))}
                    </ul>
                    <span className={shared.caseLink}>Ver solución para {c.sector.toLowerCase()} →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cómo documentamos (banda navy) */}
      <section className={`${shared.section} ${shared.sectionNavy}`} aria-label="Cómo documentamos cada proyecto" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Entregables</p>
            <h2 className={shared.sectionTitle}>
              Cómo documentamos <span className={shared.sectionTitleAccent}>cada proyecto</span>
            </h2>
            <p className={shared.sectionLead}>Lo que recibes además de la instalación.</p>
          </header>
          <div className={shared.stepsRow} data-reveal-stagger>
            {DOCUMENTACION.map((d) => (
              <article key={d.num} className={shared.stepItemOpen} data-reveal="up">
                <span className={shared.stepNumOpen}>{d.num}</span>
                <h3 className={shared.stepTitleOpen}>{d.title}</h3>
                <p className={shared.stepTextOpen}>{d.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Cobertura */}
      <section className={shared.section} aria-label="Cobertura" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Cobertura</p>
            <h2 className={shared.sectionTitle}>
              Base en el centro, <span className={shared.sectionTitleAccent}>alcance nacional</span>
            </h2>
            <p className={shared.sectionLead}>
              Ciudades con páginas listas para cotizar por WhatsApp o formulario.
            </p>
          </header>
          <div className={shared.cityGrid}>
            {GEO_CITIES.slice(0, 12).map((c) => (
              <Link key={c.slug} href={`/cobertura/${c.slug}`} className={shared.cityCard}>
                <p className={shared.cityMeta}>{c.region}</p>
                <h3 className={shared.cityName}>{c.name}</h3>
                <p className={shared.cityHint}>{c.keywords[0]}</p>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: "clamp(28px, 4vw, 48px)" }}>
            <SeoInterlinkHub
              title="De caso a cotización"
              subtitle="Si tu vertical o ciudad ya está en estas rutas, entra directo a la landing y agenda diagnóstico."
              currentPath="/proyectos"
              maxIndustries={4}
              maxServicesPerIndustry={2}
            />
          </div>
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <div className={shared.ctaBandGrid}>
              <div>
                <p className={shared.ctaEyebrow}>Siguiente paso</p>
                <h2 className={shared.ctaTitle}>¿Tu sitio es el siguiente?</h2>
                <p className={shared.ctaLead}>
                  Cuéntanos el riesgo y el alcance. Armamos diagnóstico y propuesta sin compromiso.
                </p>
                <div className={shared.ctaActions}>
                  <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                    Cotiza tu proyecto <span className={shared.btnArrow}>→</span>
                  </Link>
                  <a
                    href={buildWhatsAppLeadUrl({
                      industryName: "mi empresa",
                      serviceName: "CCTV, redes o soporte",
                      path: "/proyectos",
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${shared.btn} ${shared.btnSecondary}`}
                    data-track-conversion="proyectos_wa"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
              <ul className={shared.ctaFacts}>
                <li>
                  <PublicIcon name="search" /> Levantamiento en sitio antes de la propuesta.
                </li>
                <li>
                  <PublicIcon name="fileCheck" /> Memoria técnica y evidencia fotográfica al entregar.
                </li>
                <li>
                  <PublicIcon name="headset" /> Soporte con SLA después del arranque.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
