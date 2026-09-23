import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./home-sections.module.css";
import HomeHero, { type HomeHeroBootstrap } from "../../components/HomeHero";
import EditorialImage from "../../components/EditorialImage";
import LogoStrip from "../../components/LogoStrip";
import {
  fetchPageSection,
  fetchPageVisuals,
  DEFAULT_PROCESO,
  DEFAULT_INDUSTRIAS,
  DEFAULT_CTA,
  INDUSTRIA_SLUGS,
  type ProcesoItem,
  type CtaContent,
  type HeroMediaConfig,
} from "@/lib/page-content-api";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";
import { GEO_CITIES } from "@/lib/seo/geo-cities";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { fetchPublicHeroSlidesCached } from "@/lib/hero-slides-api";
import { fetchPublicHeroVideoCached, resolveHeroVideoUrl } from "@/lib/hero-video-api";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("home");
}

export const dynamic = "force-dynamic";

const CAPABILITIES = [
  {
    id: "cctv",
    title: "Videovigilancia Inteligente",
    text: "Cobertura bien diseñada, grabación confiable y acceso seguro — evidencia que se opera.",
  },
  {
    id: "redes",
    title: "Redes Empresariales y Wi‑Fi",
    text: "Cableado, switching y Wi‑Fi estable en una o muchas sedes — con documentación.",
  },
  {
    id: "computo",
    title: "Infraestructura Tecnológica",
    text: "Equipos, servidores, racks y respaldos estandarizados para continuidad y crecimiento.",
  },
  {
    id: "soporte",
    title: "Soporte y Gestión TI",
    text: "Mesa de ayuda remota y en sitio con SLAs — mantenimiento y continuidad sin sorpresas.",
  },
  {
    id: "software",
    title: "Desarrollo de Plataformas",
    text: "Portales, apps e integraciones por fases — alcance claro y entregables revisables.",
  },
];

const METRICS = [
  { value: "1 firma", label: "Diseño, instalación y soporte bajo el mismo contrato" },
  { value: "Puebla · CDMX", label: "Base operativa con cobertura nacional" },
  { value: "< 24 h", label: "Respuesta típica en horario laboral" },
  { value: "Campo", label: "Diagnóstico en sitio antes de la propuesta" },
];

/** Logos reales en /public/marcas — decorativos, el grupo lleva la etiqueta. */
const MARCAS = Array.from({ length: 36 }, (_, i) => ({
  src: `/marcas/marcas-${String(i + 1).padStart(2, "0")}.png`,
  alt: "",
}));

const INDUSTRIA_BLURBS: Record<string, { risk: string; text: string }> = {
  Retail: {
    risk: "Multi-sede",
    text: "CCTV por sucursal, Wi‑Fi estable y soporte de punta de venta sin reinventar cada apertura.",
  },
  Manufactura: {
    risk: "Uptime de planta",
    text: "Redes industriales, perímetro y continuidad en equipos donde una caída cuesta un turno.",
  },
  Hospitalidad: {
    risk: "Experiencia huésped",
    text: "Wi‑Fi denso, vigilancia y operación unificada por propiedad, no por “mejor esfuerzo”.",
  },
  Salud: {
    risk: "Continuidad",
    text: "Segmentación, respaldos y soporte prioritario para que la red no sea el cuello de botella clínico.",
  },
  Educación: {
    risk: "Campus",
    text: "Wi‑Fi, CCTV y mesa de ayuda pensados para aulas, laboratorios y edificios administrativos.",
  },
  Gobierno: {
    risk: "Auditoría",
    text: "Modernización por fases con documentación clara y entregables que se pueden revisar.",
  },
};

const resolveIndustriaSlug = (label: string) =>
  INDUSTRIA_SLUGS[label] || label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function fetchHomeHeroBootstrap(): Promise<HomeHeroBootstrap> {
  const [mediaRow, video, slides] = await Promise.all([
    fetchPageSection<HeroMediaConfig>("home_hero"),
    fetchPublicHeroVideoCached(),
    fetchPublicHeroSlidesCached(),
  ]);

  const mediaType = mediaRow?.mediaType === "video" ? "video" : "carousel";
  const hasVideo = Boolean(video?.videoUrl && video.isActive);
  const useVideo = mediaType === "video" || hasVideo;

  const rawSlides = slides.map((s) => ({
    id: s.id,
    imageUrl: s.imageUrl,
    imageUrlMobile: s.imageUrlMobile ?? null,
    altText: s.altText,
  }));

  let posterUrl: string | null = null;
  if (video?.posterUrl) {
    posterUrl = resolveHeroVideoUrl(video.posterUrl);
  }

  return {
    mediaType: useVideo ? "video" : "carousel",
    video:
      useVideo && video?.videoUrl
        ? {
            videoUrl: video.videoUrl,
            videoUrlMobile: video.videoUrlMobile ?? null,
            isActive: video.isActive,
          }
        : null,
    slides: rawSlides,
    posterUrl,
  };
}

export default async function NexaraPage() {
  const [procesoData, industriasData, ctaData, visuals, heroBootstrap] = await Promise.all([
    fetchPageSection<{ items: ProcesoItem[] }>("home_proceso"),
    fetchPageSection<{ items: string[] }>("home_industrias"),
    fetchPageSection<CtaContent>("home_cta"),
    fetchPageVisuals("page_home"),
    fetchHomeHeroBootstrap(),
  ]);

  const proceso = (procesoData?.items ?? DEFAULT_PROCESO).slice(0, 3);
  const industrias = (industriasData?.items ?? DEFAULT_INDUSTRIAS).slice(0, 4);
  const cta = ctaData ?? DEFAULT_CTA;
  const slotCaps = visuals.slots.find((s) => s.id === "home_band_capabilities");
  const slotInd = visuals.slots.find((s) => s.id === "home_band_industrias");
  const heroVideoDesktop = heroBootstrap.video?.videoUrl
    ? resolveHeroVideoUrl(heroBootstrap.video.videoUrl)
    : null;
  const heroVideoMobile = heroBootstrap.video?.videoUrlMobile
    ? resolveHeroVideoUrl(heroBootstrap.video.videoUrlMobile)
    : heroVideoDesktop;

  return (
    <main className={`${shared.page} home-main-flush`} aria-label="Nexara — Inicio">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "NEXARA | CCTV, redes y soporte TI en México",
          url: siteBaseUrl(),
          description:
            "Integramos CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas en Puebla, CDMX y cobertura nacional.",
          isPartOf: { "@type": "WebSite", name: "NEXARA", url: siteBaseUrl() },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: CAPABILITIES.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.title,
              url: `${siteBaseUrl()}/servicios#${c.id}`,
            })),
          },
        }}
      />
      {heroBootstrap.posterUrl ? (
        <link rel="preload" as="image" href={heroBootstrap.posterUrl} fetchPriority="high" />
      ) : null}
      {heroVideoDesktop ? (
        <link
          rel="preload"
          as="video"
          href={heroVideoDesktop}
          media="(min-width: 768px)"
          fetchPriority="high"
        />
      ) : null}
      {heroVideoMobile && heroVideoMobile !== heroVideoDesktop ? (
        <link
          rel="preload"
          as="video"
          href={heroVideoMobile}
          media="(max-width: 767px)"
          fetchPriority="high"
        />
      ) : null}
      <HomeHero bootstrap={heroBootstrap} />

      <div className={styles.homeBody}>
        <section className={styles.brandBand} aria-label="Fabricantes" data-reveal="soft">
          <div className={shared.inner}>
            <LogoStrip
              label="Integramos tecnología de fabricantes líderes"
              items={MARCAS}
              display="marquee"
              rows={2}
            />
          </div>
        </section>

        <section className={shared.section} aria-label="Capacidades" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${styles.headSplit}`}>
              <div>
                <p className={shared.eyebrow}>Capacidades</p>
                <h2 className={shared.sectionTitle}>
                  Lo que instalamos y <span className={shared.sectionTitleAccent}>sostenemos</span>
                </h2>
              </div>
              <p className={`${shared.sectionLead} ${styles.headLead}`}>Diseñamos, instalamos y damos soporte. Tecnología que opera y escala.</p>
            </header>
            <div className={`${shared.grid3} ${styles.visualBridge}`} data-reveal-stagger>
              <Link href="/servicios#cctv" className={shared.imageCard} data-reveal="up">
                <div className={shared.imageCardImg}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/hero/hero-02.png" alt="CCTV en sitio — proyecto Nexara" loading="lazy" decoding="async" />
                </div>
                <div className={shared.imageCardBody}>
                  <h3 className={shared.imageCardTitle}>CCTV</h3>
                  <p className={shared.imageCardText}>Cobertura y evidencia confiable.</p>
                </div>
              </Link>
              <Link href="/servicios#redes" className={shared.imageCard} data-reveal="up">
                <div className={shared.imageCardImg}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/hero/hero-04.png" alt="Redes y Wi‑Fi — implementación Nexara" loading="lazy" decoding="async" />
                </div>
                <div className={shared.imageCardBody}>
                  <h3 className={shared.imageCardTitle}>Redes</h3>
                  <p className={shared.imageCardText}>Conectividad estable en cada sede.</p>
                </div>
              </Link>
              <Link href="/servicios#computo" className={shared.imageCard} data-reveal="up">
                <div className={shared.imageCardImg}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/hero/hero-06.png" alt="Infraestructura y racks — instalación Nexara" loading="lazy" decoding="async" />
                </div>
                <div className={shared.imageCardBody}>
                  <h3 className={shared.imageCardTitle}>Cómputo</h3>
                  <p className={shared.imageCardText}>Infraestructura lista para operar.</p>
                </div>
              </Link>
            </div>
            <div className={shared.capList} data-reveal-stagger>
              {CAPABILITIES.map((cap, i) => (
                <Link
                  key={cap.id}
                  href={`/servicios#${cap.id}`}
                  className={shared.capRow}
                  data-reveal="up"
                >
                  <span className={shared.capNum}>0{i + 1}</span>
                  <div>
                    <h3 className={shared.capTitle}>{cap.title}</h3>
                    <p className={shared.capText}>{cap.text}</p>
                  </div>
                  <span className={shared.capGo} aria-hidden>
                    →
                  </span>
                </Link>
              ))}
            </div>
            <p className={styles.sectionMore}>
              <Link href="/servicios">Detalle por línea →</Link>
            </p>
          </div>
        </section>

        {slotCaps?.desktopUrl ? (
          <section className={shared.sectionTight} aria-label="En sitio" data-reveal="up">
            <div className={shared.inner}>
              <EditorialImage
                desktopUrl={slotCaps.desktopUrl}
                mobileUrl={slotCaps.mobileUrl}
                alt={slotCaps.alt}
                kicker="En sitio"
                title="Donde la propuesta se vuelve instalación"
                caption={
                  slotCaps.caption ||
                  "Campo y entrega — entre el diseño y el soporte. Fotografía de proyectos reales, no banco de imágenes."
                }
                layout={
                  slotCaps.layout === "bleed_cinema" || slotCaps.layout === "bleed_landscape"
                    ? "framed_wide"
                    : slotCaps.layout
                }
                objectPosition={slotCaps.objectPosition}
                compose="split"
                mediaSide="right"
              />
            </div>
          </section>
        ) : null}

        <section id="proceso" className={`${shared.section} ${styles.band}`} data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${styles.headSplit}`}>
              <div>
                <p className={shared.eyebrow}>Método</p>
                <h2 className={shared.sectionTitle}>
                  De diagnóstico a <span className={shared.sectionTitleAccent}>operación</span>
                </h2>
              </div>
              <p className={`${shared.sectionLead} ${styles.headLead}`}>Tres fases, alcance cerrado. Instalación clara y soporte después.</p>
            </header>
            <div className={shared.timeline} data-reveal-stagger>
              {proceso.map((p) => (
                <div key={p.title} className={shared.timelineStep} data-reveal="up">
                  <span className={shared.timelineDot} aria-hidden />
                  <span className={shared.timelineNum}>{p.num}</span>
                  <h3 className={shared.timelineTitle}>{p.title}</h3>
                  <p className={shared.timelineText}>{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={shared.sectionTight} aria-label="Cifras operativas" data-reveal="soft">
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

        {slotInd?.desktopUrl ? (
          <section className={shared.sectionTight} aria-label="Trabajo en campo" data-reveal="up">
            <div className={shared.inner}>
              <EditorialImage
                desktopUrl={slotInd.desktopUrl}
                mobileUrl={slotInd.mobileUrl}
                alt={slotInd.alt}
                kicker="En campo"
                title="Antes de hablar de verticales"
                caption={slotInd.caption || "Cada industria con su riesgo; cada sitio con su alcance."}
                layout={
                  slotInd.layout === "portrait_featured"
                    ? "portrait_featured"
                    : slotInd.layout === "bleed_cinema" || slotInd.layout === "bleed_landscape"
                      ? "portrait_featured"
                      : slotInd.layout
                }
                objectPosition={slotInd.objectPosition}
                compose="split"
                mediaSide="left"
              />
            </div>
          </section>
        ) : null}

        <section className={shared.section} aria-label="Industrias" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${styles.headSplit}`}>
              <div>
                <p className={shared.eyebrow}>Sectores</p>
                <h2 className={shared.sectionTitle}>
                  Verticales con <span className={shared.sectionTitleAccent}>riesgo real</span>
                </h2>
              </div>
              <p className={`${shared.sectionLead} ${styles.headLead}`}>Cada industria tiene su riesgo típico; la solución se arma a la medida.</p>
            </header>
            <div className={shared.industryBoard} data-reveal-stagger>
              {industrias.map((ind) => {
                const label = typeof ind === "string" ? ind : String(ind);
                const blurb = INDUSTRIA_BLURBS[label];
                return (
                  <Link
                    key={label}
                    href={`/soluciones/${resolveIndustriaSlug(label)}`}
                    className={shared.industryCell}
                    data-reveal="up"
                  >
                    {blurb?.risk ? (
                      <span className={shared.industryRisk}>{blurb.risk}</span>
                    ) : null}
                    <h3 className={shared.industryCellTitle}>{label}</h3>
                    <p className={shared.industryCellText}>
                      {blurb?.text || "Solución a la medida de tu operación."}
                    </p>
                    <span className={shared.industryCellLink}>Ver solución →</span>
                  </Link>
                );
              })}
            </div>
            <p className={styles.sectionMore}>
              <Link href="/servicios#verticales">Todas las industrias →</Link>
              {" · "}
              <Link href="/proyectos">Ver casos de campo →</Link>
            </p>
          </div>
        </section>

        <section className={shared.section} data-reveal="up">
          <div className={shared.inner}>
            <div className={styles.coverageSplit}>
              <div className={styles.coverageCopy}>
                <header>
                  <p className={shared.eyebrow}>Cobertura</p>
                  <h2 className={shared.sectionTitle}>
                    Cotiza cerca de{" "}
                    <span className={shared.sectionTitleAccent}>tu ciudad</span>
                  </h2>
                  <p className={shared.sectionLead}>Base en Puebla y CDMX; presencia nacional. Elige tu ciudad.</p>
                </header>
                <div className={styles.geoRow}>
                  {GEO_CITIES.filter((c) => c.mode === "base" || c.slug === "queretaro").map((c) => (
                    <Link key={c.slug} href={`/cobertura/${c.slug}/camaras-cctv`} className={styles.geoChip}>
                      CCTV {c.name}
                    </Link>
                  ))}
                  <Link href="/cobertura/puebla/redes-y-conectividad" className={styles.geoChip}>
                    Redes Puebla
                  </Link>
                  <Link href="/cobertura/cdmx/soporte-ti-pyme" className={styles.geoChip}>
                    Soporte CDMX
                  </Link>
                </div>
                <p className={styles.sectionMore}>
                  <Link href="/cobertura">Toda la cobertura →</Link>
                </p>
              </div>
              <figure className={styles.mapPanel} data-reveal="right">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/mapa-operaciones.png"
                  alt="Mapa de cobertura NEXARA en México: zonas de operación por estado"
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className={styles.mapCaption}>
                  <span>Geografía de operaciones NEXARA</span>
                  <Link href="/cobertura">Ver detalle por ciudad →</Link>
                </figcaption>
              </figure>
            </div>
            <SeoInterlinkHub
              title="Rutas que más convierten"
              subtitle="CCTV, redes y soporte por industria — listas para Google y para WhatsApp."
              currentPath="/"
              maxIndustries={4}
              maxServicesPerIndustry={3}
              showGeo={false}
            />
          </div>
        </section>

        <section className={`${shared.section} ${styles.ctaSection}`} aria-label="Empecemos" data-reveal="up">
          <div className={shared.inner}>
            <div className={shared.ctaBand}>
              <p className={shared.ctaEyebrow}>{cta.eyebrow}</p>
              <h2 className={shared.ctaTitle}>
                {cta.title} <span className={shared.sectionTitleAccent}>{cta.titleAccent}</span>
              </h2>
              <p className={shared.ctaLead}>{cta.text}</p>
              <div className={shared.ctaActions}>
                <Link
                  href={cta.primaryHref}
                  className={`${shared.btn} ${shared.btnPrimary}`}
                  data-track-conversion="home_cta_primary"
                >
                  {cta.primaryLabel} <span className={shared.btnArrow} aria-hidden>→</span>
                </Link>
                <a
                  href={buildWhatsAppLeadUrl({
                    industryName: "tu empresa",
                    serviceName: "CCTV, redes o soporte TI",
                    path: "/",
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${shared.btn} ${shared.btnSecondary}`}
                  data-track-conversion="home_cta_whatsapp"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
