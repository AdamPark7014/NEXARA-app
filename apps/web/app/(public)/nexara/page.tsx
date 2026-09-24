import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./home-sections.module.css";
import HomeHero, { type HomeHeroBootstrap } from "../../components/HomeHero";
import LogoStrip from "../../components/LogoStrip";
import PublicIcon, { type PublicIconName } from "../../components/PublicIcon";
import {
  fetchPageSection,
  fetchPageVisuals,
  resolvePageMediaUrl,
  DEFAULT_PROCESO,
  DEFAULT_INDUSTRIAS,
  DEFAULT_CTA,
  DEFAULT_METRICAS,
  INDUSTRIA_SLUGS,
  type ProcesoItem,
  type CtaContent,
  type HeroMediaConfig,
  type MetricaItem,
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

type Capability = {
  id: string;
  icon: PublicIconName;
  title: string;
  text: string;
};

const CAPABILITIES: Capability[] = [
  {
    id: "cctv",
    icon: "camera",
    title: "Videovigilancia Inteligente",
    text: "Cobertura diseñada por riesgo, cámaras IP, NVR/VMS y evidencia confiable cuando se necesita.",
  },
  {
    id: "redes",
    icon: "wifi",
    title: "Redes Empresariales y Wi‑Fi",
    text: "Cableado certificado, switching administrable y Wi‑Fi estable, todo documentado.",
  },
  {
    id: "computo",
    icon: "server",
    title: "Infraestructura Tecnológica",
    text: "Racks, servidores, respaldos y equipos de trabajo estandarizados y listos para operar.",
  },
  {
    id: "soporte",
    icon: "headset",
    title: "Soporte y Gestión TI",
    text: "Mesa de ayuda con SLA, atención remota y en sitio. Continuidad para tu operación.",
  },
  {
    id: "software",
    icon: "code",
    title: "Desarrollo de Plataformas",
    text: "Portales, automatización e indicadores, implementados por fases con objetivos claros.",
  },
];

const PROMISES = [
  "Diagnóstico en sitio antes de la propuesta",
  "Alcance cerrado y calendario visible",
  "Instalación documentada con evidencia",
  "Soporte con SLA después del arranque",
];

/** Logos reales en /public/marcas — decorativos, el grupo lleva la etiqueta. */
const MARCAS = Array.from({ length: 36 }, (_, i) => ({
  src: `/marcas/marcas-${String(i + 1).padStart(2, "0")}.png`,
  alt: "",
}));

const INDUSTRIA_ICONS: Record<string, PublicIconName> = {
  retail: "store",
  manufactura: "factory",
  hospitalidad: "hotel",
  salud: "hospital",
  educacion: "school",
  gobierno: "landmark",
};

const INDUSTRIA_BLURBS: Record<string, { risk: string; text: string }> = {
  Retail: {
    risk: "Multi-sede",
    text: "CCTV por sucursal, Wi‑Fi estable y soporte de punto de venta sin reinventar cada apertura.",
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

/** Evidencia fija: fotografías reales de instalaciones NEXARA (en /public/fotos). */
const EVIDENCE = [
  {
    src: "/fotos/rack-servidores-led.jpg",
    alt: "Rack de servidores y switching instalado por NEXARA",
    kicker: "Infraestructura",
    caption: "Rack de servidores y switching, etiquetado y documentado.",
    tall: true,
  },
  {
    src: "/fotos/control-acceso-torniquetes.jpg",
    alt: "Torniquetes con terminales de reconocimiento facial",
    kicker: "Control de acceso",
    caption: "Torniquetes con reconocimiento facial en acceso principal.",
    tall: false,
  },
  {
    src: "/fotos/monitoreo-videowall.jpg",
    alt: "Centro de monitoreo con video wall de CCTV",
    kicker: "Monitoreo",
    caption: "Centro de monitoreo con video wall de videovigilancia.",
    tall: false,
  },
];

const resolveIndustriaSlug = (label: string) =>
  INDUSTRIA_SLUGS[label] || label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
  const [metricasData, procesoData, industriasData, ctaData, visuals, heroBootstrap] = await Promise.all([
    fetchPageSection<{ items: MetricaItem[] }>("home_metricas"),
    fetchPageSection<{ items: ProcesoItem[] }>("home_proceso"),
    fetchPageSection<{ items: string[] }>("home_industrias"),
    fetchPageSection<CtaContent>("home_cta"),
    fetchPageVisuals("page_home"),
    fetchHomeHeroBootstrap(),
  ]);

  const metricas = (metricasData?.items?.length ? metricasData.items : DEFAULT_METRICAS).slice(0, 4);
  const proceso = (procesoData?.items ?? DEFAULT_PROCESO).slice(0, 3);
  const industrias = (industriasData?.items ?? DEFAULT_INDUSTRIAS).slice(0, 6);
  const cta = ctaData ?? DEFAULT_CTA;
  const slotCaps = visuals.slots.find((s) => s.id === "home_band_capabilities");
  const splitPhoto = slotCaps?.desktopUrl
    ? { src: resolvePageMediaUrl(slotCaps.desktopUrl), alt: slotCaps.alt || "Instalación NEXARA en sitio" }
    : { src: "/fotos/campo-instalacion-rack.jpg", alt: "Técnicos NEXARA instalando un rack en sitio" };
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
        {/* Por qué NEXARA: foto real + promesas */}
        <section className={`${shared.sectionSpacious} ${shared.sectionLight}`} aria-label="Por qué NEXARA" data-reveal="up">
          <div className={shared.inner}>
            <div className={shared.split}>
              <figure className={`${shared.photoFrame} ${shared.ar43} ${shared.splitMedia}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={splitPhoto.src} alt={splitPhoto.alt} loading="lazy" decoding="async" />
                <span className={shared.photoBadge}>Proyecto real</span>
              </figure>
              <div className={shared.splitCopy}>
                <header className={shared.sectionHead}>
                  <p className={shared.eyebrow}>Por qué NEXARA</p>
                  <h2 className={shared.sectionTitle}>
                    Una sola firma del diagnóstico <span className={shared.sectionTitleAccent}>al soporte</span>
                  </h2>
                  <p className={shared.sectionLead}>
                    Diseñamos, instalamos y operamos con el mismo equipo. Sin intermediarios, sin alcances
                    abiertos y con evidencia de cada entrega.
                  </p>
                </header>
                <ul className={`${shared.checkList} ${shared.checkListSingle}`}>
                  {PROMISES.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <ul className={shared.factsInline} aria-label="Cifras de operación">
                  {metricas.map((m) => (
                    <li key={`${m.value}-${m.label}`}>
                      <strong>{m.value}</strong>
                      <span>{m.label}</span>
                    </li>
                  ))}
                </ul>
                <div className={shared.splitActions}>
                  <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`} data-track-conversion="home_why_cta">
                    Cotiza tu proyecto <span className={shared.btnArrow} aria-hidden>→</span>
                  </Link>
                  <Link href="/nosotros" className={`${shared.btn} ${shared.btnSecondary}`}>
                    Conocer al equipo
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Evidencia real */}
        <section className={shared.section} aria-label="Trabajo real en sitio" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
              <p className={shared.eyebrow}>Trabajo real</p>
              <h2 className={shared.sectionTitle}>
                Instalaciones que <span className={shared.sectionTitleAccent}>operan hoy</span>
              </h2>
              <p className={shared.sectionLead}>
                Fotografía de proyectos reales de NEXARA, no banco de imágenes.
              </p>
            </header>
            <div className={shared.mosaic}>
              {EVIDENCE.map((e) => (
                <figure
                  key={e.src}
                  className={`${shared.photoFrame} ${e.tall ? shared.mosaicTall : shared.mosaicWide}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.src} alt={e.alt} loading="lazy" decoding="async" />
                  <figcaption className={shared.photoCaption}>
                    <span className={shared.photoCaptionKicker}>{e.kicker}</span>
                    {e.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className={styles.sectionMore}>
              <Link href="/proyectos" className={shared.linkArrow}>
                Ver casos de campo <PublicIcon name="arrowRight" size={16} />
              </Link>
            </p>
          </div>
        </section>

        {/* Servicios (después de evidencia) */}
        <section className={shared.section} aria-label="Servicios" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
              <p className={shared.eyebrow}>Servicios</p>
              <h2 className={shared.sectionTitle}>
                Lo que instalamos y <span className={shared.sectionTitleAccent}>sostenemos</span>
              </h2>
              <p className={shared.sectionLead}>
                Videovigilancia, redes, cómputo y soporte bajo una sola responsabilidad técnica.
                Diseñamos, instalamos y operamos.
              </p>
            </header>
            <div className={shared.iconGrid} data-reveal-stagger>
              {CAPABILITIES.map((c) => (
                <Link key={c.id} href={`/servicios#${c.id}`} className={shared.iconCard} data-reveal="up">
                  <span className={shared.iconTile}>
                    <PublicIcon name={c.icon} />
                  </span>
                  <h3 className={shared.iconCardTitle}>{c.title}</h3>
                  <p className={shared.iconCardText}>{c.text}</p>
                  <span className={shared.iconCardLink}>
                    Ver servicio <PublicIcon name="arrowRight" size={16} />
                  </span>
                </Link>
              ))}
              <Link href="/soluciones" className={`${shared.iconCard} ${shared.iconCardDark}`} data-reveal="up">
                <span className={shared.iconTile}>
                  <PublicIcon name="layers" />
                </span>
                <h3 className={shared.iconCardTitle}>¿Tu operación es distinta?</h3>
                <p className={shared.iconCardText}>
                  Soluciones por industria: retail, manufactura, hospitalidad, salud, educación y gobierno.
                </p>
                <span className={shared.iconCardLink}>
                  Ver soluciones <PublicIcon name="arrowRight" size={16} />
                </span>
              </Link>
            </div>
          </div>
        </section>

        {/* Método (banda navy) */}
        <section className={`${shared.section} ${shared.sectionNavy}`} aria-label="Cómo trabajamos" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
              <p className={shared.eyebrow}>Cómo trabajamos</p>
              <h2 className={shared.sectionTitle}>
                De diagnóstico a <span className={shared.sectionTitleAccent}>operación</span>
              </h2>
              <p className={shared.sectionLead}>
                Tres fases, alcance cerrado y un solo responsable de principio a fin.
              </p>
            </header>
            <div className={shared.stepsRow} data-reveal-stagger>
              {proceso.map((p) => (
                <article key={p.num} className={shared.stepItemOpen} data-reveal="up">
                  <span className={shared.stepNumOpen}>{p.num}</span>
                  <h3 className={shared.stepTitleOpen}>{p.title}</h3>
                  <p className={shared.stepTextOpen}>{p.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Industrias */}
        <section className={`${shared.section} ${shared.sectionAlt}`} aria-label="Industrias" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
              <p className={shared.eyebrow}>Industrias</p>
              <h2 className={shared.sectionTitle}>
                Soluciones por <span className={shared.sectionTitleAccent}>vertical</span>
              </h2>
              <p className={shared.sectionLead}>
                Cada industria tiene su riesgo típico. La solución se arma a la medida de tu operación.
              </p>
            </header>
            <div className={shared.industryGrid} data-reveal-stagger>
              {industrias.map((label) => {
                const slug = resolveIndustriaSlug(label);
                const blurb = INDUSTRIA_BLURBS[label];
                return (
                  <Link key={label} href={`/soluciones/${slug}`} className={shared.industryCard} data-reveal="up">
                    <div className={shared.industryCardHead}>
                      <span className={`${shared.iconTile} ${shared.iconTileSm}`}>
                        <PublicIcon name={INDUSTRIA_ICONS[slug] ?? "building"} />
                      </span>
                      <div>
                        {blurb ? <span className={shared.industryCardRisk}>{blurb.risk}</span> : null}
                        <h3 className={shared.industryCardTitle}>{label}</h3>
                      </div>
                    </div>
                    {blurb ? <p className={shared.industryCardText}>{blurb.text}</p> : null}
                    <span className={shared.industryCardLink}>Ver solución →</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Fabricantes */}
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

        {/* Cobertura + rutas */}
        <section className={shared.section} aria-label="Cobertura" data-reveal="up">
          <div className={shared.inner}>
            <div className={styles.coverageSplit}>
              <div className={styles.coverageCopy}>
                <header className={shared.sectionHead} style={{ margin: 0 }}>
                  <p className={shared.eyebrow}>Cobertura</p>
                  <h2 className={shared.sectionTitle}>
                    Base en Puebla y CDMX, <span className={shared.sectionTitleAccent}>alcance nacional</span>
                  </h2>
                  <p className={shared.sectionLead}>
                    Diagnóstico en sitio en el centro del país y proyectos multi‑sede en toda la República.
                  </p>
                </header>
                <div className={styles.geoRow}>
                  {GEO_CITIES.filter((c) => c.mode === "base" || c.slug === "queretaro").map((c) => (
                    <Link key={c.slug} href={`/cobertura/${c.slug}/camaras-cctv`} className={styles.geoChip}>
                      <PublicIcon name="mapPin" /> CCTV {c.name}
                    </Link>
                  ))}
                  <Link href="/cobertura/puebla/redes-y-conectividad" className={styles.geoChip}>
                    <PublicIcon name="wifi" /> Redes Puebla
                  </Link>
                  <Link href="/cobertura/cdmx/soporte-ti-pyme" className={styles.geoChip}>
                    <PublicIcon name="headset" /> Soporte CDMX
                  </Link>
                </div>
                <p className={styles.sectionMore}>
                  <Link href="/cobertura" className={shared.linkArrow}>
                    Toda la cobertura <PublicIcon name="arrowRight" size={16} />
                  </Link>
                </p>
              </div>
              <figure className={styles.mapPanel}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/fotos/mapa-cobertura-nexara.jpg"
                  alt="Mapa de cobertura NEXARA: 32 estados y más de 200 puntos de presencia en México, con base en Puebla y CDMX"
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className={styles.mapCaption}>
                  <span>32 estados · +200 puntos de presencia · Base en Puebla y CDMX</span>
                  <Link href="/cobertura">Ver ciudades</Link>
                </figcaption>
              </figure>
            </div>
            <div className={styles.interlink}>
              <SeoInterlinkHub
                title="Rutas que más convierten"
                subtitle="CCTV, redes y soporte por industria — listas para Google y para WhatsApp."
                currentPath="/"
                maxIndustries={4}
                maxServicesPerIndustry={3}
                showGeo={false}
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={shared.sectionTight} aria-label="Empecemos" data-reveal="up">
          <div className={shared.inner}>
            <div className={shared.ctaBand}>
              <div className={shared.ctaBandGrid}>
                <div>
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
                <ul className={shared.ctaFacts}>
                  <li>
                    <PublicIcon name="clock" /> Primera respuesta típica en menos de 24 horas hábiles.
                  </li>
                  <li>
                    <PublicIcon name="mapPin" /> Diagnóstico en sitio en Puebla y CDMX; proyectos en todo México.
                  </li>
                  <li>
                    <PublicIcon name="fileCheck" /> Propuesta con alcance cerrado y memoria técnica al entregar.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
