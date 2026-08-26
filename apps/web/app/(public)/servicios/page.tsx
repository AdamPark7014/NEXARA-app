import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import EditorialImage from "../../components/EditorialImage";
import heroStyles from "../../components/PublicPageHero.module.css";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("servicios");
}

export const dynamic = "force-dynamic";

const servicios = [
  {
    id: "cctv",
    title: "Seguridad Inteligente",
    text: "Protegemos personas, activos y operaciones mediante sistemas de videovigilancia diseñados para las necesidades reales de cada sitio.",
    points: [
      "Diseño estratégico de cobertura",
      "Cámaras IP y sistemas NVR/VMS",
      "Monitoreo y acceso remoto seguro",
      "Mantenimiento preventivo y correctivo",
      "Evidencia técnica y documentación de servicio",
    ],
  },
  {
    id: "redes",
    title: "Conectividad",
    text: "Construimos redes estables, escalables y preparadas para el crecimiento de tu empresa.",
    points: [
      "Cableado estructurado certificado",
      "Switching administrable y segmentación VLAN",
      "Redes Wi‑Fi empresariales",
      "Optimización y documentación de infraestructura",
      "Integración entre sedes y dispositivos",
    ],
  },
  {
    id: "computo",
    title: "Infraestructura TI",
    text: "Implementamos infraestructura tecnológica que garantiza continuidad operativa y un mejor desempeño de los equipos.",
    points: [
      "Estaciones de trabajo y servidores",
      "Instalación y organización de racks",
      "Sistemas de respaldo y recuperación",
      "Configuración estandarizada de equipos",
      "Optimización y administración de recursos",
    ],
  },
  {
    id: "soporte",
    title: "Soporte TI",
    text: "Acompañamos la operación de tu empresa con soporte técnico oportuno y atención especializada.",
    points: [
      "Mesa de ayuda especializada",
      "Soporte remoto y asistencia en sitio",
      "Mantenimiento preventivo y correctivo",
      "Atención bajo acuerdos de nivel de servicio (SLA)",
      "Seguimiento y documentación de incidencias",
    ],
  },
  {
    id: "software",
    title: "Plataformas a Medida",
    text: "Desarrollamos soluciones digitales adaptadas a los procesos de tu organización para mejorar la eficiencia y el control operativo.",
    points: [
      "Desarrollo de portales empresariales",
      "Automatización de procesos",
      "Integración entre plataformas",
      "Dashboards e indicadores",
      "Implementación por fases con objetivos definidos",
    ],
  },
];

export default async function ServiciosPage() {
  const visuals = await fetchPageVisuals("page_servicios");
  const mid = visuals.slots[0];
  const heroDesktop = resolvePageMediaUrl(visuals.heroDesktopUrl);
  const heroMobile = resolvePageMediaUrl(visuals.heroMobileUrl || visuals.heroDesktopUrl);

  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Servicios"
        title={
          <>
            Soluciones tecnológicas diseñadas para operar{" "}
            <span className={heroStyles.titleAccent}>desde el primer día</span>
          </>
        }
        lead="Integramos seguridad, infraestructura y tecnología empresarial con un enfoque práctico: diseñamos, implementamos, documentamos y damos seguimiento para que cada solución funcione de forma confiable a largo plazo."
        imageSrc={heroDesktop}
        imageSrcMobile={heroMobile}
        imageAlt={visuals.heroAlt}
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.serviceLayout}>
            <nav className={shared.serviceNav} aria-label="Índice de servicios">
              {servicios.map((s) => (
                <a key={s.id} href={`#${s.id}`} className={shared.serviceNavLink}>
                  {s.title}
                </a>
              ))}
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary} ${shared.serviceNavCta}`}>
                Cotiza tu proyecto <span className={shared.btnArrow} aria-hidden>→</span>
              </Link>
            </nav>

            <div className={shared.serviceDetail} data-reveal-stagger>
              {servicios.slice(0, 3).map((s) => (
                <article key={s.id} id={s.id} className={shared.serviceBlock} data-reveal="up">
                  <h2 className={shared.serviceBlockTitle}>{s.title}</h2>
                  <p className={shared.serviceBlockText}>{s.text}</p>
                  <ul className={shared.checkList}>
                    {s.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {mid?.desktopUrl ? (
        <section className={`${shared.sectionTight} ${shared.sectionDivider}`} data-reveal="up" aria-label="Campo">
          <div className={shared.inner}>
            <EditorialImage
              desktopUrl={mid.desktopUrl}
              mobileUrl={mid.mobileUrl}
              alt={mid.alt}
              caption={
                mid.caption ||
                "Documentamos, instalamos y dejamos operable — con evidencia, no solo con promesas."
              }
              kicker="Mitad del alcance"
              title="Del índice a la línea de servicio"
              layout={mid.layout === "bleed_cinema" || mid.layout === "bleed_landscape" ? "inset_offset" : mid.layout}
              objectPosition={mid.objectPosition}
              compose="split"
            />
          </div>
        </section>
      ) : null}

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.serviceDetail} data-reveal-stagger>
            {servicios.slice(3).map((s) => (
              <article key={s.id} id={s.id} className={shared.serviceBlock} data-reveal="up">
                <h2 className={shared.serviceBlockTitle}>{s.title}</h2>
                <p className={shared.serviceBlockText}>{s.text}</p>
                <ul className={shared.checkList}>
                  {s.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shared.sectionTight} ${shared.sectionDivider}`} data-reveal="up" aria-label="Por qué Nexara">
        <div className={shared.inner}>
          <div className={shared.sectionHead}>
            <p className={shared.eyebrow}>Una sola empresa</p>
            <h2 className={shared.sectionTitle}>
              Una sola <span className={shared.sectionTitleAccent}>responsabilidad</span>
            </h2>
            <p className={shared.sectionLead}>
              Desde la infraestructura física hasta el soporte y la evolución tecnológica, centralizamos todo el proyecto bajo un mismo equipo. Esto reduce tiempos, mejora la coordinación y garantiza una implementación consistente de principio a fin.
            </p>
          </div>
          <ul className={shared.checkList}>
            <li>Ingeniería basada en las necesidades reales de tu operación.</li>
            <li>Implementación con estándares profesionales y documentación completa.</li>
            <li>Soporte técnico especializado antes, durante y después de la entrega.</li>
            <li>Soluciones escalables preparadas para el crecimiento de tu empresa.</li>
          </ul>
        </div>
      </section>

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <SeoInterlinkHub
            title="Soluciones que más cotizan"
            subtitle="CCTV, redes y soporte por industria — enlaces listos para Google y para cerrar."
            currentPath="/servicios"
            maxIndustries={4}
            maxServicesPerIndustry={3}
          />
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
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
              <Link href="/cobertura/puebla" className={`${shared.btn} ${shared.btnSecondary}`}>
                Cobertura Puebla
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
