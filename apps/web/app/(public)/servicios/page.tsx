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
import LogoStrip from "../../components/LogoStrip";
// Se evitan strips/mosaicos decorativos — limpieza editorial

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("servicios");
}

export const dynamic = "force-dynamic";

// Verticales (de Soluciones) — tarjetas de uso (no texto largo)
const industrias = [
  { slug: "retail", title: "Retail", risk: "Multi-sede + merma", text: "Aperturas y operaciones con CCTV por sucursal, Wi‑Fi estable y soporte de punta de venta. Mismo estándar en cada tienda, sin reinventar el cableado cada vez." },
  { slug: "manufactura", title: "Manufactura", risk: "Downtime de planta", text: "Redes de piso, perímetro y continuidad en equipos críticos. Cuando una caída detiene un turno, el diseño no puede ser “genérico de oficina”." },
  { slug: "hospitalidad", title: "Hospitalidad", risk: "Densidad + reputación", text: "Wi‑Fi de alta densidad, CCTV y operación unificada por propiedad. El huésped no distingue “red saturada” de “mal hotel”." },
  { slug: "salud", title: "Salud", risk: "Continuidad clínica", text: "Segmentación, respaldos y soporte prioritario. La red y el cómputo tienen que sostener flujos clínicos, no solo el Wi‑Fi de la sala de espera." },
  { slug: "educacion", title: "Educación", risk: "Campus completo", text: "Wi‑Fi, CCTV y mesa de ayuda para aulas, labs y edificios administrativos. Cobertura que escala con el período escolar, no con el hotspot improvisado." },
  { slug: "gobierno", title: "Gobierno", risk: "Fases + auditoría", text: "Modernización por etapas con documentación auditable. Entregables claros, sin cajas negras técnicas ni alcance que no se pueda defender." },
];

const METRICS = [
  { value: "Campo", label: "Diagnóstico y evidencia en sitio" },
  { value: "1 firma", label: "Diseño, instalación y soporte" },
  { value: "Puebla · CDMX", label: "Base con cobertura nacional" },
  { value: "< 24 h", label: "Primera respuesta típica" },
];

const PROBLEMAS = [
  "Cobertura de CCTV sin evidencia útil",
  "Wi‑Fi inestable en horas pico",
  "Racks y cableado sin estándar",
  "Tickets sin SLA ni seguimiento",
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

      {/* S1 — Problema (texto) */}
      <section className={shared.sectionTight} data-reveal="up" aria-label="Problema típico">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Problema</p>
            <h2 className={shared.sectionTitle}>
              Lo que suele <span className={shared.sectionTitleAccent}>fallar</span>
            </h2>
          </header>
          <ul className={shared.bulletList}>
            {PROBLEMAS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* S3 — Métricas (datos) */}
      <section className={shared.sectionTight} data-reveal="soft" aria-label="Cifras operativas">
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

      {/* (Se retiran strips/mosaicos — dejamos una sola banda visual honesta) */}

      {/* Secciones con imagen alternada eliminadas: evitamos collages flotantes */}

      {/* Use-cases con visual (tiles de servicio) */}
      <section className={shared.section} data-reveal="up" aria-label="Qué incluye">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Qué hacemos</p>
            <h2 className={shared.sectionTitle}>
              Qué <span className={shared.sectionTitleAccent}>incluye</span>
            </h2>
          </header>
          <div className={`${shared.grid2}`} data-reveal-stagger>
            <Link href="#cctv" className={shared.imageCard} data-reveal="up">
              <div className={shared.imageCardImg}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/hero/hero-02.png" alt="CCTV Nexara" loading="lazy" decoding="async" />
              </div>
              <div className={shared.imageCardBody}>
                <h3 className={shared.imageCardTitle}>CCTV</h3>
                <p className={shared.imageCardText}>Cobertura, VMS/NVR y evidencia confiable.</p>
              </div>
            </Link>
            <Link href="#redes" className={shared.imageCard} data-reveal="up">
              <div className={shared.imageCardImg}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/hero/hero-04.png" alt="Redes y Wi‑Fi Nexara" loading="lazy" decoding="async" />
              </div>
              <div className={shared.imageCardBody}>
                <h3 className={shared.imageCardTitle}>Redes y Wi‑Fi</h3>
                <p className={shared.imageCardText}>Cableado certificado y RF estable.</p>
              </div>
            </Link>
            <Link href="#computo" className={shared.imageCard} data-reveal="up">
              <div className={shared.imageCardImg}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/hero/hero-06.png" alt="Infraestructura TI Nexara" loading="lazy" decoding="async" />
              </div>
              <div className={shared.imageCardBody}>
                <h3 className={shared.imageCardTitle}>Infraestructura</h3>
                <p className={shared.imageCardText}>Racks, servidores y respaldos.</p>
              </div>
            </Link>
            <Link href="#soporte" className={shared.imageCard} data-reveal="up">
              <div className={shared.imageCardImg}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/hero/hero-01.png" alt="Soporte TI Nexara" loading="lazy" decoding="async" />
              </div>
              <div className={shared.imageCardBody}>
                <h3 className={shared.imageCardTitle}>Soporte TI</h3>
                <p className={shared.imageCardText}>Mesa de ayuda con SLA y visitas.</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Banda visual grande única (limpia, sin overlaps) */}
      {mid?.desktopUrl ? (
        <section className={`${shared.sectionTight} ${shared.sectionDivider}`} data-reveal="up" aria-label="Campo">
          <div className={shared.inner}>
            <EditorialImage
              desktopUrl={mid.desktopUrl}
              mobileUrl={mid.mobileUrl}
              alt={mid.alt}
              caption={
                mid.caption ||
                "Instalación documentada y operable — evidencia, no promesas."
              }
              kicker="En sitio"
              title="Del diagnóstico a la operación"
              layout="bleed_landscape"
              objectPosition={mid.objectPosition}
              compose="caption-bar"
            />
          </div>
        </section>
      ) : null}

      {/* Social proof — certificaciones / fabricantes */}
      <section className={shared.section} data-reveal="soft" aria-label="Prueba social">
        <div className={shared.inner}>
          <LogoStrip
            label="Certificaciones y fabricantes"
            items={[
              { src: "/certificaciones/certificaciones-06.png", alt: "HikVision" },
              { src: "/certificaciones/certificaciones-01.png", alt: "Linksys" },
              { src: "/certificaciones/certificaciones-09.png.jpeg", alt: "Dell Technologies" },
              { src: "/certificaciones/certificaciones-03.png", alt: "Intellinet" },
              { src: "/certificaciones/certificaciones-04.png", alt: "Lenovo SEG" },
              { src: "/certificaciones/certificaciones-05.png.jpeg", alt: "Grandstream" },
            ]}
            display="marquee"
            rows={1}
          />
        </div>
      </section>

      {/* Use-cases por industria (mosaico ligero) */}
      <section id="verticales" className={shared.section} data-reveal="up" aria-label="Industrias">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Industrias</p>
            <h2 className={shared.sectionTitle}>
              Dónde <span className={shared.sectionTitleAccent}>aplica</span>
            </h2>
          </header>
          <div className={shared.industryBoard} data-reveal-stagger>
            {industrias.slice(0, 4).map((i) => (
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

      {/* Banda breve de porqué (texto muy corto) */}
      <section className={`${shared.sectionTight} ${shared.sectionDivider}`} data-reveal="up" aria-label="Una sola firma">
        <div className={shared.inner}>
          <div className={shared.sectionHead}>
            <p className={shared.eyebrow}>Una sola empresa</p>
            <h2 className={shared.sectionTitle}>
              Una sola <span className={shared.sectionTitleAccent}>responsabilidad</span>
            </h2>
            <p className={shared.sectionLead}>Diseño, instalación y soporte bajo el mismo contrato.</p>
          </div>
        </div>
      </section>

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <SeoInterlinkHub
            title="Soluciones que más cotizan"
            subtitle="CCTV, redes y soporte por industria — listo para Google y para convertir."
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
