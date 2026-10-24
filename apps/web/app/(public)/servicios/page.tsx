import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import PublicIcon, { type PublicIconName } from "../../components/PublicIcon";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("servicios");
}

export const dynamic = "force-dynamic";

type Servicio = {
  id: string;
  icon: PublicIconName;
  nav: string;
  title: string;
  text: string;
  points: string[];
  photo?: { src: string; alt: string; srcSet?: string; sizes?: string };
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
    photo: {
      src: "/fotos/tecnico-ensamble-chasis-pc-taller-1920.webp",
      srcSet:
        "/fotos/tecnico-ensamble-chasis-pc-taller-1200.webp 1200w, /fotos/tecnico-ensamble-chasis-pc-taller-1920.webp 1920w",
      sizes: "(max-width: 1100px) 100vw, 520px",
      alt: "Técnico ensamblando y cableando un chasis de PC en el taller",
    },
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
    photo: {
      src: "/fotos/tecnicos-mantenimiento-pc-colaboracion-1920.webp",
      srcSet:
        "/fotos/tecnicos-mantenimiento-pc-colaboracion-1200.webp 1200w, /fotos/tecnicos-mantenimiento-pc-colaboracion-1920.webp 1920w",
      sizes: "(max-width: 1100px) 100vw, 520px",
      alt: "Dos técnicos de NEXARA colaborando en el mantenimiento de un equipo de cómputo",
    },
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

export default async function ServiciosPage() {
  const visuals = await fetchPageVisuals("page_servicios");
  const heroDesktop = resolvePageMediaUrl(visuals.heroDesktopUrl);
  const heroMobile = resolvePageMediaUrl(visuals.heroMobileUrl || visuals.heroDesktopUrl);

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
                      <img
                        src={s.photo.src}
                        {...(s.photo.srcSet ? { srcSet: s.photo.srcSet } : {})}
                        {...(s.photo.sizes ? { sizes: s.photo.sizes } : {})}
                        alt={s.photo.alt}
                        loading="lazy"
                        decoding="async"
                      />
                    </figure>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
