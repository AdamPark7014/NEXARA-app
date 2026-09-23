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
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("servicios");
}

export const dynamic = "force-dynamic";

// Verticales (de Soluciones) — fusionadas aquí para una vista unificada
const industrias = [
  { slug: "retail", title: "Retail", risk: "Multi-sede + merma", text: "Aperturas y operaciones con CCTV por sucursal, Wi‑Fi estable y soporte de punta de venta. Mismo estándar en cada tienda, sin reinventar el cableado cada vez." },
  { slug: "manufactura", title: "Manufactura", risk: "Downtime de planta", text: "Redes de piso, perímetro y continuidad en equipos críticos. Cuando una caída detiene un turno, el diseño no puede ser “genérico de oficina”." },
  { slug: "hospitalidad", title: "Hospitalidad", risk: "Densidad + reputación", text: "Wi‑Fi de alta densidad, CCTV y operación unificada por propiedad. El huésped no distingue “red saturada” de “mal hotel”." },
  { slug: "salud", title: "Salud", risk: "Continuidad clínica", text: "Segmentación, respaldos y soporte prioritario. La red y el cómputo tienen que sostener flujos clínicos, no solo el Wi‑Fi de la sala de espera." },
  { slug: "educacion", title: "Educación", risk: "Campus completo", text: "Wi‑Fi, CCTV y mesa de ayuda para aulas, labs y edificios administrativos. Cobertura que escala con el período escolar, no con el hotspot improvisado." },
  { slug: "gobierno", title: "Gobierno", risk: "Fases + auditoría", text: "Modernización por etapas con documentación auditable. Entregables claros, sin cajas negras técnicas ni alcance que no se pueda defender." },
];

const servicios = [
  {
    id: "cctv",
    title: "Seguridad Inteligente",
    text: "CCTV diseñado para tu riesgo.",
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
    text: "Redes estables y documentadas.",
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
    text: "Racks, servidores y respaldos estandarizados.",
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
    text: "Mesa de ayuda con SLA.",
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
    text: "Portales y apps por fases.",
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
      />

      {/* Verticales (Soluciones) — fusionadas; sin usar la imagen de apertura verdosa */}
      <section id="verticales" className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Verticales</p>
            <h2 className={shared.sectionTitle}>
              Qué falla en tu sector — y <span className={shared.sectionTitleAccent}>cómo lo atacamos</span>
            </h2>
            <p className={shared.sectionLead}>
              Entra al detalle de la industria más cercana a tu sitio. Si no encaja, igual podemos armar el alcance.
            </p>
          </header>
          <div className={shared.industryBoard} data-reveal-stagger>
            {industrias.map((i) => (
              <Link
                key={i.slug}
                href={`/soluciones/${i.slug}`}
                className={shared.industryCell}
                data-reveal="up"
              >
                <span className={shared.industryRisk}>{i.risk}</span>
                <h2 className={shared.industryCellTitle}>{i.title}</h2>
                <p className={shared.industryCellText}>{i.text}</p>
                <span className={shared.industryCellLink}>Ver detalle →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

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

      {/* Se elimina un split adicional para evitar repetición; se conserva el visual central (mid). */}

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
