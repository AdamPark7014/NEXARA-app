import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import PublicIcon, { type PublicIconName } from "../../components/PublicIcon";
import LogoStrip from "../../components/LogoStrip";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("servicios");
}

export const dynamic = "force-dynamic";

const PROBLEMAS: { icon: PublicIconName; title: string; text: string }[] = [
  { icon: "camera", title: "CCTV sin evidencia útil", text: "Cámaras mal ubicadas, grabación que falla justo cuando se necesita." },
  { icon: "wifi", title: "Wi‑Fi inestable en horas pico", text: "Cobertura por “mejor esfuerzo”, sin diseño RF ni segmentación." },
  { icon: "server", title: "Racks y cableado sin estándar", text: "Nadie sabe qué va a dónde; cada cambio es una apuesta." },
  { icon: "headset", title: "Tickets sin SLA ni seguimiento", text: "Soporte reactivo, sin tiempos comprometidos ni historial." },
];

type Servicio = {
  id: string;
  icon: PublicIconName;
  nav: string;
  title: string;
  text: string;
  points: string[];
  photo?: { src: string; alt: string };
};

const servicios: Servicio[] = [
  {
    id: "cctv",
    icon: "camera",
    nav: "Videovigilancia",
    title: "Videovigilancia Inteligente",
    text: "CCTV diseñado para tu riesgo real: cobertura pensada por zona, grabación confiable y acceso remoto seguro. Evidencia cuando se necesita, no sorpresas.",
    points: [
      "Diseño estratégico de cobertura",
      "Cámaras IP y sistemas NVR/VMS",
      "Monitoreo y acceso remoto seguro",
      "Mantenimiento preventivo y correctivo",
      "Evidencia técnica y documentación de servicio",
    ],
    photo: { src: "/fotos/monitoreo-pantallas-cctv.jpg", alt: "Monitores de videovigilancia en un centro de monitoreo NEXARA" },
  },
  {
    id: "redes",
    icon: "wifi",
    nav: "Redes y Wi‑Fi",
    title: "Redes Empresariales y Wi‑Fi",
    text: "Cableado estructurado certificado, switching administrable y Wi‑Fi de alta densidad. Redes estables, segmentadas y documentadas para operar y crecer.",
    points: [
      "Cableado estructurado certificado",
      "Switching administrable y segmentación VLAN",
      "Redes Wi‑Fi empresariales",
      "Enlaces entre sedes y radioenlaces",
      "Documentación y optimización de la red",
    ],
    photo: { src: "/fotos/campo-mastil-antenas.jpg", alt: "Mástil con antenas de radioenlace instalado por NEXARA" },
  },
  {
    id: "computo",
    icon: "server",
    nav: "Infraestructura",
    title: "Infraestructura Tecnológica",
    text: "Racks, servidores, respaldos y estaciones de trabajo estandarizadas. Hardware y software alineados a cómo trabaja tu equipo, listos desde el primer día.",
    points: [
      "Estaciones de trabajo y servidores",
      "Instalación y organización de racks",
      "Sistemas de respaldo y recuperación",
      "Configuración estandarizada de equipos",
      "Administración y optimización de recursos",
    ],
    photo: { src: "/fotos/rack-servidores-led.jpg", alt: "Rack de servidores y switching instalado por NEXARA" },
  },
  {
    id: "soporte",
    icon: "headset",
    nav: "Soporte TI",
    title: "Soporte y Gestión TI",
    text: "Mesa de ayuda con acuerdos de nivel de servicio, atención remota y visitas en sitio. Cuando algo falla hay un humano, un plan y un tiempo comprometido.",
    points: [
      "Mesa de ayuda especializada",
      "Soporte remoto y asistencia en sitio",
      "Mantenimiento preventivo y correctivo",
      "Atención bajo SLA",
      "Seguimiento y documentación de incidencias",
    ],
    photo: { src: "/fotos/equipo-nexara-polos.jpg", alt: "Equipo técnico de NEXARA" },
  },
  {
    id: "software",
    icon: "code",
    nav: "Plataformas",
    title: "Desarrollo de Plataformas",
    text: "Portales, automatización e indicadores construidos por fases, con objetivos medibles y sin depender de terceros para cada cambio.",
    points: [
      "Portales empresariales",
      "Automatización de procesos",
      "Integración entre plataformas",
      "Dashboards e indicadores",
      "Implementación por fases con objetivos definidos",
    ],
  },
];

const PASOS: { icon: PublicIconName; num: string; title: string; text: string }[] = [
  { icon: "search", num: "01", title: "Diagnóstico", text: "Recorremos el sitio, levantamos riesgos y priorizamos lo que mueve la operación." },
  { icon: "hardhat", num: "02", title: "Implementación", text: "Alcance cerrado, calendario visible e instalación con evidencia fotográfica." },
  { icon: "refresh", num: "03", title: "Operación", text: "Soporte, monitoreo y mejoras. Seguimos cuando el proyecto ya está en producción." },
];

const CERTIFICACIONES = [
  { src: "/certificaciones/certificaciones-06.png", alt: "HikVision" },
  { src: "/certificaciones/certificaciones-09.png.jpeg", alt: "Dell Technologies Authorized Partner" },
  { src: "/certificaciones/certificaciones-04.png", alt: "Lenovo SEG Silver Partner" },
  { src: "/certificaciones/certificaciones-07.png", alt: "Sophos" },
  { src: "/certificaciones/certificaciones-01.png", alt: "Linksys" },
  { src: "/certificaciones/certificaciones-02.png", alt: "Belden" },
  { src: "/certificaciones/certificaciones-03.png", alt: "Intellinet" },
  { src: "/certificaciones/certificaciones-05.png.jpeg", alt: "Grandstream" },
  { src: "/certificaciones/certificaciones-08.png", alt: "Mimosa" },
  { src: "/certificaciones/certificaciones-04.1.png.webp", alt: "Lenovo SEG Authorized Solutions" },
];

const INDUSTRIAS: { slug: string; name: string; icon: PublicIconName }[] = [
  { slug: "retail", name: "Retail", icon: "store" },
  { slug: "manufactura", name: "Manufactura", icon: "factory" },
  { slug: "hospitalidad", name: "Hospitalidad", icon: "hotel" },
  { slug: "salud", name: "Salud", icon: "hospital" },
  { slug: "educacion", name: "Educación", icon: "school" },
  { slug: "gobierno", name: "Gobierno", icon: "landmark" },
];

export default async function ServiciosPage() {
  const visuals = await fetchPageVisuals("page_servicios");
  const mid = visuals.slots[0];
  const heroDesktop = resolvePageMediaUrl(visuals.heroDesktopUrl);
  const heroMobile = resolvePageMediaUrl(visuals.heroMobileUrl || visuals.heroDesktopUrl);
  const midPhoto = mid?.desktopUrl
    ? { src: resolvePageMediaUrl(mid.desktopUrl), alt: mid.alt || "Instalación NEXARA" }
    : { src: "/fotos/monitoreo-videowall.jpg", alt: "Centro de monitoreo instalado por NEXARA" };

  return (
    <main className={`${shared.page} home-main-flush`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Servicios NEXARA",
          url: `${siteBaseUrl()}/servicios`,
          description:
            "Videovigilancia, redes Wi‑Fi, cómputo, infraestructura y soporte TI bajo el mismo contrato.",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: servicios.map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "Service",
                name: s.title,
                description: s.text,
                url: `${siteBaseUrl()}/servicios#${s.id}`,
              },
            })),
          },
        }}
      />
      <PublicPageHero
        eyebrow="Servicios"
        title={
          <>
            Soluciones tecnológicas diseñadas para operar{" "}
            <span className={heroStyles.titleAccent}>desde el primer día</span>
          </>
        }
        lead="Diseñamos, instalamos, documentamos y damos soporte — para que funcione a la primera."
        imageSrc={heroDesktop}
        imageSrcMobile={heroMobile}
        imageAlt={visuals.heroAlt}
        actions={
          <>
            <Link href="/contacto" className={heroStyles.ctaPrimary} data-track-conversion="servicios_hero_cta">
              Cotiza tu proyecto <span className={heroStyles.ctaArrow} aria-hidden>→</span>
            </Link>
            <a
              href={buildWhatsAppLeadUrl({ industryName: "mi empresa", serviceName: "CCTV, redes o soporte", path: "/servicios" })}
              target="_blank"
              rel="noopener noreferrer"
              className={heroStyles.ctaSecondary}
            >
              WhatsApp
            </a>
          </>
        }
      />

      {/* Problemas típicos: tarjeta que monta sobre el hero */}
      <section aria-label="Lo que suele fallar" className={shared.statsBand}>
        <div className={shared.inner}>
          <div className={shared.statsCard}>
            <div className={shared.tileRow}>
              {PROBLEMAS.map((p) => (
                <div key={p.title} className={shared.tile}>
                  <span className={`${shared.iconTile} ${shared.iconTileSm}`}>
                    <PublicIcon name={p.icon} />
                  </span>
                  <div>
                    <h3 className={shared.tileTitle}>{p.title}</h3>
                    <p className={shared.tileText}>{p.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Detalle de servicios */}
      <section className={shared.section} aria-label="Servicios" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Qué hacemos</p>
            <h2 className={shared.sectionTitle}>
              Cinco líneas, <span className={shared.sectionTitleAccent}>una responsabilidad</span>
            </h2>
            <p className={shared.sectionLead}>
              Cada servicio se entrega con diseño, instalación documentada y soporte. Elige por dónde empezar.
            </p>
          </header>

          <div className={shared.serviceLayout}>
            <nav className={shared.serviceNav} aria-label="Índice de servicios">
              {servicios.map((s) => (
                <a key={s.id} href={`#${s.id}`} className={shared.serviceNavLink}>
                  <PublicIcon name={s.icon} /> {s.nav}
                </a>
              ))}
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary} ${shared.serviceNavCta}`}>
                Cotizar
              </Link>
            </nav>

            <div className={shared.serviceDetail}>
              {servicios.map((s) => (
                <article
                  key={s.id}
                  id={s.id}
                  className={`${shared.serviceBlock} ${s.photo ? "" : shared.serviceBlockSolo}`}
                  data-reveal="up"
                >
                  <div>
                    <div className={shared.serviceBlockHead}>
                      <span className={shared.iconTile}>
                        <PublicIcon name={s.icon} />
                      </span>
                      <h3 className={shared.serviceBlockTitle}>{s.title}</h3>
                    </div>
                    <p className={shared.serviceBlockText}>{s.text}</p>
                    <ul className={shared.checkList}>
                      {s.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    <Link
                      href={`/contacto?servicio=${s.id}`}
                      className={shared.linkArrow}
                      data-track-conversion={`servicios_${s.id}_cta`}
                    >
                      Cotizar {s.nav.toLowerCase()} <PublicIcon name="arrowRight" size={16} />
                    </Link>
                  </div>
                  {s.photo ? (
                    <figure className={shared.serviceBlockMedia}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.photo.src} alt={s.photo.alt} loading="lazy" decoding="async" />
                    </figure>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Método con foto del CMS (banda navy) */}
      <section className={`${shared.section} ${shared.sectionNavy}`} aria-label="Del diagnóstico a la operación" data-reveal="up">
        <div className={shared.inner}>
          <div className={`${shared.split} ${shared.splitReverse}`}>
            <div className={shared.splitCopy}>
              <header className={shared.sectionHead}>
                <p className={shared.eyebrow}>Método</p>
                <h2 className={shared.sectionTitle}>
                  Del diagnóstico a la <span className={shared.sectionTitleAccent}>operación</span>
                </h2>
                <p className={shared.sectionLead}>
                  {mid?.caption || "Instalación documentada y operable — evidencia, no promesas."}
                </p>
              </header>
              <div style={{ display: "grid", gap: 14, width: "100%" }}>
                {PASOS.map((p) => (
                  <div key={p.num} className={shared.stepItemOpen}>
                    <span className={shared.stepNumOpen}>{p.num}</span>
                    <h3 className={shared.stepTitleOpen}>{p.title}</h3>
                    <p className={shared.stepTextOpen}>{p.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <figure className={`${shared.photoFrame} ${shared.ar45} ${shared.splitMedia}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={midPhoto.src} alt={midPhoto.alt} loading="lazy" decoding="async" />
              <span className={shared.photoBadge}>Proyecto real</span>
            </figure>
          </div>
        </div>
      </section>

      {/* Certificaciones y fabricantes */}
      <section className={`${shared.sectionSpacious} ${shared.sectionLight}`} aria-label="Certificaciones" data-reveal="soft">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Respaldo técnico</p>
            <h2 className={shared.sectionTitle}>
              Certificaciones y <span className={shared.sectionTitleAccent}>alianzas</span>
            </h2>
          </header>
          <LogoStrip label="Certificaciones y alianzas técnicas" items={CERTIFICACIONES} display="grid" />
        </div>
      </section>

      {/* Industrias */}
      <section className={shared.section} aria-label="Industrias" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Industrias</p>
            <h2 className={shared.sectionTitle}>
              El mismo estándar, <span className={shared.sectionTitleAccent}>tu vertical</span>
            </h2>
            <p className={shared.sectionLead}>Soluciones armadas por industria, con su riesgo típico resuelto.</p>
          </header>
          <div className={shared.industryRow} data-reveal-stagger>
            {INDUSTRIAS.map((i) => (
              <Link key={i.slug} href={`/soluciones/${i.slug}`} className={shared.industryPill} data-reveal="up">
                <span className={`${shared.iconTile} ${shared.iconTileSm}`}>
                  <PublicIcon name={i.icon} />
                </span>
                {i.name}
              </Link>
            ))}
          </div>
          <div style={{ marginTop: "clamp(28px, 4vw, 48px)" }}>
            <SeoInterlinkHub
              title="Soluciones que más cotizan"
              subtitle="CCTV, redes y soporte por industria — listo para Google y para convertir."
              currentPath="/servicios"
              maxIndustries={4}
              maxServicesPerIndustry={3}
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
                <h2 className={shared.ctaTitle}>Cotiza CCTV, redes o soporte</h2>
                <p className={shared.ctaLead}>
                  Diagnóstico corto en Puebla o CDMX. Te decimos qué instalar, qué posponer y qué presupuesto tiene sentido.
                </p>
                <div className={shared.ctaActions}>
                  <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`} data-track-conversion="servicios_footer_cta">
                    Cotiza tu proyecto <span className={shared.btnArrow}>→</span>
                  </Link>
                  <a
                    href={buildWhatsAppLeadUrl({
                      industryName: "mi empresa",
                      serviceName: "CCTV, redes o soporte",
                      path: "/servicios",
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${shared.btn} ${shared.btnSecondary}`}
                    data-track-conversion="servicios_wa"
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
                  <PublicIcon name="fileCheck" /> Propuesta con alcance cerrado, sin costos escondidos.
                </li>
                <li>
                  <PublicIcon name="shield" /> Garantía de instalación y soporte con SLA.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
