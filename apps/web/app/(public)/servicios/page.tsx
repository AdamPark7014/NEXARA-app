import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import styles from "./page.module.css";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";
import { SERVICIOS_IMAGES } from "./serviciosImagery";
import ExternalLinkButton from "@/components/ExternalLinkButton";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Servicios de Tecnologia Empresarial | Nexara",
  description:
    "Infraestructura, ciberseguridad, equipamiento y servicios gestionados para empresas que exigen continuidad operativa.",
  keywords: [
    "servicios TI empresariales",
    "ciberseguridad para empresas",
    "infraestructura tecnologica",
    "servicios gestionados",
    "soporte tecnologico corporativo",
    "ERP industrial Mexico",
  ],
  alternates: {
    canonical: "/servicios",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/servicios`,
    title: "Servicios de Tecnologia Empresarial | Nexara",
    description: "Servicios integrales de tecnologia para operaciones empresariales de alta demanda en Mexico.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Servicios Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Servicios de Tecnologia Empresarial | Nexara",
    description: "Arquitectura, soporte y operacion TI para escalar empresas con control.",
    images: ["/logo-nexara.png"],
  },
};

export default function ServiciosPage() {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "Nexara Servicios de Tecnologia Empresarial",
    url: `${siteUrl}/servicios`,
    areaServed: "MX",
    serviceType: "Infraestructura TI, ciberseguridad, soporte y servicios gestionados",
    provider: {
      "@type": "Organization",
      name: "NEXARA",
      url: siteUrl,
    },
  };

  const coreServices = [
    {
      title: "Infraestructura y conectividad",
      text: "Diseño e implementación de redes, energía, seguridad perimetral y plataformas de operación.",
      cover: SERVICIOS_IMAGES.offerInfrastructure,
      coverAlt: "Infraestructura de red y equipamiento en rack",
    },
    {
      title: "Equipamiento empresarial",
      text: "Suministro de hardware y periféricos con criterios de rendimiento, vida útil y costo total.",
      cover: SERVICIOS_IMAGES.offerEquipment,
      coverAlt: "Equipos de cómputo y estación de trabajo empresarial",
    },
    {
      title: "Servicios gestionados",
      text: "Monitoreo, soporte y mantenimiento continuo con acuerdos de nivel de servicio claros.",
      cover: SERVICIOS_IMAGES.offerManaged,
      coverAlt: "Equipo de trabajo coordinando servicios TI",
    },
  ];

  const workModel = [
    "Levantamiento técnico y operativo en sitio o remoto.",
    "Plan de implementación por fases con hitos de control.",
    "Ejecución con documentación y transferencia de conocimiento.",
    "Seguimiento posterior para estabilización y mejora continua.",
  ];

  const includeBlocks = [
    {
      title: "Soporte técnico corporativo",
      items: [
        "Atención especializada para operaciones multi-sucursal.",
        "Ventanas de atención y esquemas de escalamiento definidos.",
        "Tiempos de respuesta y resolución alineados a SLA.",
        "Cobertura de campo según alcance contratado.",
      ],
      cover: SERVICIOS_IMAGES.includeSupport,
      coverAlt: "Equipo colaborando en soporte y seguimiento",
    },
    {
      title: "Arrendamiento y renovación",
      items: [
        "Esquemas financieros para preservar flujo de efectivo.",
        "Renovación tecnológica sin inversiones iniciales elevadas.",
        "Mantenimiento y soporte durante vigencia del contrato.",
        "Planeación de reemplazo con base en ciclo de vida.",
      ],
      cover: SERVICIOS_IMAGES.includeLeasing,
      coverAlt: "Planificación financiera y renovación de activos",
    },
  ];

  return (
    <main
      className={`${styles.container} public-section-page ultra-corp-page ultra-corp-servicios ultra-corp-strict`}
      aria-label="Página de servicios"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />

      <header className={styles.hero} data-reveal="soft">
        <div className={styles.heroSplit}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>SERVICIOS PROFESIONALES NEXARA</p>
            <h1 className={styles.pageTitle}>Servicios Nexara</h1>
            <p className={styles.pageLead}>
              Construimos operaciones tecnológicas robustas para organizaciones que requieren continuidad,
              control y crecimiento sostenible.
            </p>
            <nav className={styles.quickNav} aria-label="Accesos rápidos">
              <a href="#ofrecemos" className={styles.quickNavLink}>
                ¿Qué ofrecemos?
              </a>
              <a href="#ejecucion" className={styles.quickNavLink}>
                ¿Cómo lo ejecutamos?
              </a>
              <a href="#beneficios" className={styles.quickNavLink}>
                Beneficios
              </a>
              <a href="#integracion" className={styles.quickNavLink}>
                ¿Dónde integrarlos?
              </a>
              <a href="#incluyen" className={styles.quickNavLink}>
                ¿Qué incluyen?
              </a>
            </nav>
          </div>
          <div className={styles.heroVisual}>
            <Image
              src={SERVICIOS_IMAGES.hero}
              alt="Espacio corporativo con enfoque en operación y tecnología"
              fill
              sizes="(max-width: 899px) 100vw, 42vw"
              className={styles.heroImg}
              priority
            />
          </div>
        </div>
      </header>

      <section id="ofrecemos" className={styles.contentSection} data-reveal="up">
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Qué ofrecemos</h2>
          <p className={styles.sectionLead}>
            Tres pilares que cubren desde la base física y lógica hasta el acompañamiento continuo.
          </p>
        </header>
        <div className={styles.offerGrid} data-reveal-stagger>
          {coreServices.map((service) => (
            <article key={service.title} className={styles.offerTile} data-reveal="up">
              <div className={styles.offerTileMedia}>
                <Image
                  src={service.cover}
                  alt={service.coverAlt}
                  fill
                  sizes="(max-width: 719px) 100vw, 33vw"
                  className={styles.offerTileImg}
                />
              </div>
              <div className={styles.offerTileBody}>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="ejecucion" className={styles.contentSection} data-reveal="up">
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Cómo lo ejecutamos</h2>
          <p className={styles.sectionLead}>
            Un método ordenado para reducir riesgos y asegurar trazabilidad en cada etapa.
          </p>
        </header>
        <div className={styles.processShell}>
          <figure className={styles.processVisual}>
            <Image
              src={SERVICIOS_IMAGES.processMethod}
              alt="Equipo revisando planificación y control de proyecto"
              fill
              sizes="(max-width: 900px) 100vw, min(920px, 90vw)"
              className={styles.processImg}
            />
          </figure>
          <div className={styles.processBlock}>
            <ol className={styles.processList}>
              {workModel.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="beneficios" className={styles.contentSection} data-reveal="up">
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Beneficios para tu operación</h2>
        </header>
        <div className={styles.splitRow}>
          <div className={styles.splitMain}>
            <ul className={styles.proseList}>
              <li>Reducción de riesgos operativos mediante diseño y control técnico.</li>
              <li>Mayor disponibilidad y estabilidad en procesos críticos del negocio.</li>
              <li>Visibilidad ejecutiva con indicadores para decisión y mejora continua.</li>
              <li>Un solo aliado para arquitectura, implementación y soporte.</li>
              <li>Escalabilidad real para acompañar crecimiento por etapas.</li>
            </ul>
          </div>
          <div className={styles.splitAside}>
            <figure className={styles.splitFigure}>
              <Image
                src={SERVICIOS_IMAGES.benefitsContext}
                alt="Equipo directivo alineando estrategia y operación"
                fill
                sizes="(max-width: 879px) 100vw, 35vw"
                className={styles.splitImg}
              />
            </figure>
            <aside className={`${styles.sideNote} ${styles.sideNoteStrong}`} aria-label="Resultado operativo esperado">
              <p className={styles.signalLabel}>Resultado esperado</p>
              <p className={styles.signalBody}>
                Equipos directivos con mejor control de tecnología, menores interrupciones y mayor capacidad
                para crecer sin fricción operativa.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section id="integracion" className={styles.contentSection} data-reveal="up">
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Dónde integrarlos</h2>
        </header>
        <div className={styles.splitRow}>
          <div className={styles.splitMain}>
            <ul className={styles.proseList}>
              <li>Centros administrativos, puntos de venta y sedes operativas distribuidas.</li>
              <li>Áreas de atención con necesidades de continuidad y respuesta inmediata.</li>
              <li>Plataformas de colaboración, seguridad y productividad corporativa.</li>
              <li>Entornos donde convergen tecnología, procesos y personal de campo.</li>
            </ul>
          </div>
          <div className={styles.splitAside}>
            <figure className={styles.splitFigure}>
              <Image
                src={SERVICIOS_IMAGES.integrationVenues}
                alt="Operaciones en sedes corporativas y entorno urbano"
                fill
                sizes="(max-width: 879px) 100vw, 35vw"
                className={styles.splitImg}
              />
            </figure>
            <aside className={styles.sideNote}>
              <h3>Integración por capas</h3>
              <p>
                Priorizamos primero la estabilidad base (red, energía, seguridad), luego incorporamos
                plataformas y automatización.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section id="incluyen" className={styles.contentSection} data-reveal="up">
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Qué incluyen nuestros servicios</h2>
        </header>
        <div className={styles.detailGrid} data-reveal-stagger>
          {includeBlocks.map((block) => (
            <article key={block.title} className={styles.detailTile} data-reveal="up">
              <div className={styles.detailTileMedia}>
                <Image
                  src={block.cover}
                  alt={block.coverAlt}
                  fill
                  sizes="(max-width: 799px) 100vw, 50vw"
                  className={styles.detailTileImg}
                />
              </div>
              <div className={styles.detailTileBody}>
                <h3>{block.title}</h3>
                <ul className={styles.proseList}>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="contacto" className={styles.finalCta} data-reveal="up">
        <h2>Listo para profesionalizar tu operación tecnológica</h2>
        <p>Conversemos y diseñemos una propuesta de servicios alineada a tu negocio.</p>
        <div className={styles.ctaActions}>
          <Link
            href="/contacto"
            data-track-conversion="services_primary_cta"
            className={styles.primaryCta}
          >
            Contactar
          </Link>
          <ExternalLinkButton
            href="https://wa.me/525536505044"
            data-track-conversion="services_whatsapp_cta"
            className={styles.secondaryCta}
          >
            WhatsApp
          </ExternalLinkButton>
        </div>
      </section>

      <div className={styles.hubShell} data-reveal="up">
        <SeoInterlinkHub
          title="Soluciones recomendadas por industria"
          subtitle="Cada industria enlaza a páginas de contexto por servicio; encaja con las líneas de infraestructura, equipamiento y soporte descritas arriba."
          currentPath="/servicios"
          maxItems={9}
        />
      </div>
    </main>
  );
}
