import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
import { buildStudioPageMetadata } from "@/lib/page-seo";
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

const METRICS = [
  { value: "Campo", label: "Diagnóstico e instalación con evidencia en sitio" },
  { value: "Multi-sede", label: "Estándares repetibles para sucursales y campus" },
  { value: "Soporte", label: "Continuidad después del arranque, no solo entrega" },
  { value: "Nacional", label: "Base Puebla · CDMX, cobertura extendida" },
];

/** Galería: fotografías reales de instalaciones NEXARA (en /public/fotos). */
const GALERIA: {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  kicker: string;
  caption: string;
}[] = [
  {
    src: "/fotos/tecnico-nexara-entrega-equipo-sitio-1920.webp",
    srcSet:
      "/fotos/tecnico-nexara-entrega-equipo-sitio-1200.webp 1200w, /fotos/tecnico-nexara-entrega-equipo-sitio-1920.webp 1920w",
    sizes: "(max-width: 800px) 100vw, 300px",
    alt: "Técnico de NEXARA manejando cajas de equipo durante entrega en sitio",
    kicker: "Logística",
    caption: "Entrega de equipo en instalación exterior",
  },
  {
    src: "/fotos/cableado-interno-pc-guantes-taller-1920.webp",
    srcSet:
      "/fotos/cableado-interno-pc-guantes-taller-1200.webp 1200w, /fotos/cableado-interno-pc-guantes-taller-1920.webp 1920w",
    sizes: "(max-width: 800px) 100vw, 300px",
    alt: "Manos con guantes realizando cableado interno de una PC en taller",
    kicker: "Soporte",
    caption: "Armado y cableado de equipos en taller",
  },
  {
    src: "/fotos/equipo-tecnico-nexara-uniforme-1920.webp",
    srcSet:
      "/fotos/equipo-tecnico-nexara-uniforme-1200.webp 1200w, /fotos/equipo-tecnico-nexara-uniforme-1920.webp 1920w",
    sizes: "(max-width: 800px) 100vw, 300px",
    alt: "Equipo técnico de NEXARA con uniforme oficial en sitio de instalación",
    kicker: "Equipo",
    caption: "Ingeniería e instalación con el mismo equipo",
  },
  { src: "/fotos/campo-enlace-antena-ciudad.jpg", alt: "Radioenlace sobre la ciudad", kicker: "Enlaces", caption: "Radioenlace punto a punto entre sedes" },
  { src: "/fotos/campo-mastil-antenas.jpg", alt: "Mástil con antenas", kicker: "Redes", caption: "Mástil con antenas de enlace inalámbrico" },
  { src: "/fotos/monitoreo-pantallas-cctv.jpg", alt: "Pantallas de CCTV", kicker: "CCTV", caption: "Monitores de videovigilancia multi‑cámara" },
  { src: "/fotos/campo-instalacion-rack.jpg", alt: "Técnicos instalando un rack", kicker: "Instalación", caption: "Montaje de rack de telecomunicaciones" },
  { src: "/fotos/control-acceso-terminal-facial.jpg", alt: "Terminal de reconocimiento facial", kicker: "Control de acceso", caption: "Terminal facial en acceso de oficinas" },
  { src: "/fotos/campo-levantamiento-patio.jpg", alt: "Levantamiento en patio logístico", kicker: "Diagnóstico", caption: "Levantamiento en patio de maniobras" },
];

const DOCUMENTACION = [
  { num: "01", title: "Levantamiento en sitio", text: "Recorrido, riesgos, planos y prioridades antes de cotizar. Sin propuestas a ciegas." },
  { num: "02", title: "Memoria técnica", text: "Diagramas, direccionamiento, etiquetado y configuraciones entregadas al cliente." },
  { num: "03", title: "Entrega con evidencia", text: "Pruebas, fotografías y capacitación. Después, soporte con SLA." },
];

const CIUDADES = GEO_CITIES.slice(0, 12);

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
    const casesRes = await fetch(buildApiUrl("case-studies/public?limit=12"), { cache: "no-store" });
    if (casesRes.ok) {
      const payload = (await casesRes.json()) as { id: number; slug: string; titulo: string; vertical?: string; descripcion?: string; impacto?: string; cliente?: string; imageUrl?: string; cover?: string; createdAt: string }[] | { data?: { id: number; slug: string; titulo: string; vertical?: string; descripcion?: string; impacto?: string; cliente?: string; imageUrl?: string; cover?: string; createdAt: string }[] };
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

function CityLine({ cities }: { cities: typeof CIUDADES }) {
  return (
    <p className={styles.cities}>
      {cities.map((city, index) => (
        <span key={city.slug}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          <Link href={`/cobertura/${city.slug}`}>{city.name}</Link>
        </span>
      ))}
    </p>
  );
}

export default async function ProyectosPage() {
  const studioProjects = await fetchStudioProjects();
  const whatsAppHref = buildWhatsAppLeadUrl({
    industryName: "mi empresa",
    serviceName: "CCTV, redes o soporte",
    path: "/proyectos",
  });

  return (
    <main className={`${shared.page} home-main-flush`} aria-label="Proyectos">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Proyectos | NEXARA",
          url: `${siteBaseUrl()}/proyectos`,
          description: "Casos y proyectos de CCTV, redes y soporte ejecutados por Nexara.",
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

      <header className={styles.opening}>
        <h1>Casos de campo, no demos bonitos.</h1>
        <p>Instalaciones reales donde CCTV, redes, cómputo o soporte cambiaron la operación.</p>
        <p>{METRICS.slice(0, 3).map((item) => item.label).join(". ")}.</p>
        <Link href="/contacto" data-track-conversion="proyectos_hero_cta">
          Cotiza tu proyecto
        </Link>
      </header>

      <figure className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fotos/control-acceso-torniquetes.jpg"
          alt="Torniquetes con reconocimiento facial instalados por NEXARA"
        />
      </figure>

      <section id="galeria" className={styles.block} aria-label="Galería de campo">
        <h2>Galería</h2>
        <p className={styles.lead}>
          Fotografías de instalaciones y sitios reales operados por NEXARA: control de acceso, monitoreo, enlaces, racks y redes.
        </p>
        <ul className={styles.gallery}>
          {GALERIA.map((item) => (
            <li key={item.src}>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  srcSet={item.srcSet}
                  sizes={item.sizes}
                  alt={item.alt}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>
                  {item.kicker}. {item.caption}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      {studioProjects.length ? (
        <section className={styles.block} aria-label="Casos publicados">
          <h2>Publicados</h2>
          <p className={styles.lead}>Casos publicados desde Studio con impacto, servicios y evidencia visual.</p>
          <ul className={styles.rows}>
            {studioProjects.map((project) => {
              const image = normalizeProjectImageUrl(project.mainImage);
              const tags = [...(project.services || []), ...(project.tags || [])].slice(0, 4);
              const meta = [project.sector, project.impact, ...tags].filter(Boolean).join(" · ");
              return (
                <li key={project.id}>
                  <article>
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.rowPhoto} src={image} alt={project.title} loading="lazy" decoding="async" />
                    ) : null}
                    <strong>{project.title}</strong>
                    {meta ? <span>{meta}</span> : null}
                    {project.summary ? <span>{project.summary}</span> : null}
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={styles.block} aria-label="Referencias por vertical">
        <h2>Verticales</h2>
        <p className={styles.lead}>
          Referencias representativas de proyectos ejecutados. El detalle de cada vertical vive en Soluciones.
        </p>
        <ul className={styles.rows}>
          {casos.map((item) => {
            const slug = resolveIndustriaSlug(item.sector);
            return (
              <li key={item.title}>
                <Link href={`/soluciones/${slug}`}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.sector} · {item.metric} · {item.services.join(" · ")}
                  </span>
                  <span>{item.desc}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.block} aria-label="Cobertura">
        <h2>Ciudades</h2>
        <p className={styles.lead}>
          {METRICS[3].label}. Ciudades con páginas listas para cotizar por WhatsApp o formulario.
        </p>
        <CityLine cities={CIUDADES} />
      </section>

      <section className={`${styles.block} ${styles.contact}`} aria-label="Contacto">
        <h2>Contacto</h2>
        <ul className={styles.rows}>
          {DOCUMENTACION.map((item) => (
            <li key={item.num}>
              <article>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </article>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/contacto">Cotiza tu proyecto</Link>
          <span aria-hidden="true"> · </span>
          <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" data-track-conversion="proyectos_wa">
            WhatsApp
          </a>
        </p>
      </section>
    </main>
  );
}
