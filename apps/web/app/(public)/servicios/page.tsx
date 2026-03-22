import Link from "next/link";
import type { Metadata } from "next";
import styles from "./page.module.css";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Servicios de Tecnologia Empresarial | Nexara",
  description: "Infraestructura, ciberseguridad, equipamiento y servicios gestionados para empresas que exigen continuidad operativa.",
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
  const coreServices = [
    {
      title: "Infraestructura y conectividad",
      text: "Diseño e implementación de redes, energía, seguridad perimetral y plataformas de operación.",
    },
    {
      title: "Equipamiento empresarial",
      text: "Suministro de hardware y periféricos con criterios de rendimiento, vida útil y costo total.",
    },
    {
      title: "Servicios gestionados",
      text: "Monitoreo, soporte y mantenimiento continuo con acuerdos de nivel de servicio claros.",
    },
  ];

  const workModel = [
    "Levantamiento técnico y operativo en sitio o remoto.",
    "Plan de implementación por fases con hitos de control.",
    "Ejecución con documentación y transferencia de conocimiento.",
    "Seguimiento posterior para estabilización y mejora continua.",
  ];

  const includeCards = [
    {
      title: "Soporte técnico corporativo",
      items: [
        "Atención especializada para operaciones multi-sucursal.",
        "Ventanas de atención y esquemas de escalamiento definidos.",
        "Tiempos de respuesta y resolución alineados a SLA.",
        "Cobertura de campo según alcance contratado.",
      ],
    },
    {
      title: "Arrendamiento y renovación",
      items: [
        "Esquemas financieros para preservar flujo de efectivo.",
        "Renovación tecnológica sin inversiones iniciales elevadas.",
        "Mantenimiento y soporte durante vigencia del contrato.",
        "Planeacion de reemplazo con base en ciclo de vida.",
      ],
    },
  ];

  return (
    <main className={`${styles.container} public-section-page ultra-corp-page ultra-corp-servicios ultra-corp-strict`} aria-label="Página de servicios">
      <header className={styles.headerBlock}>
        <p className={styles.kicker}>SERVICIOS PROFESIONALES NEXARA</p>
        <h1 className={styles.pageTitle}>Servicios Nexara</h1>
        <p className={styles.pageLead}>
          Construimos operaciones tecnológicas robustas para organizaciones que requieren
          continuidad, control y crecimiento sostenible.
        </p>
      </header>

      <nav className={styles.quickNav} aria-label="Accesos rápidos">
        <a href="#ofrecemos" className={styles.quickNavLink}>¿Qué ofrecemos?</a>
        <a href="#ejecucion" className={styles.quickNavLink}>¿Cómo lo ejecutamos?</a>
        <a href="#beneficios" className={styles.quickNavLink}>Beneficios</a>
        <a href="#integracion" className={styles.quickNavLink}>¿Dónde integrarlos?</a>
        <a href="#incluyen" className={styles.quickNavLink}>¿Qué incluyen?</a>
      </nav>

      <section id="ofrecemos" className={styles.section}>
        <h2 className={styles.sectionBand}>Qué ofrecemos</h2>
        <div className={styles.serviceCards}>
          {coreServices.map((service) => (
            <article key={service.title} className={styles.serviceCard}>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="ejecucion" className={styles.section}>
        <h2 className={styles.sectionBand}>Cómo lo ejecutamos</h2>
        <article className={styles.executionCard}>
          <ol className={styles.executionList}>
            {workModel.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </article>
      </section>

      <section id="beneficios" className={styles.section}>
        <h2 className={styles.sectionBand}>Beneficios para tu operación</h2>
        <article className={styles.contentCard}>
          <div className={styles.textCol}>
            <ul className={styles.list}>
              <li>Reducción de riesgos operativos mediante diseño y control técnico.</li>
              <li>Mayor disponibilidad y estabilidad en procesos críticos del negocio.</li>
              <li>Visibilidad ejecutiva con indicadores para decisión y mejora continua.</li>
              <li>Un solo aliado para arquitectura, implementación y soporte.</li>
              <li>Escalabilidad real para acompañar crecimiento por etapas.</li>
            </ul>
          </div>
          <aside className={styles.signalPanel} aria-label="Resultado operativo esperado">
            <p className={styles.signalTitle}>Resultado esperado</p>
            <p className={styles.signalText}>
              Equipos directivos con mejor control de tecnología, menores interrupciones y mayor
              capacidad para crecer sin fricción operativa.
            </p>
          </aside>
        </article>
      </section>

      <section id="integracion" className={styles.section}>
        <h2 className={styles.sectionBand}>Dónde integrarlos</h2>
        <article className={styles.contentCard}>
          <div className={styles.textCol}>
            <ul className={styles.list}>
              <li>Centros administrativos, puntos de venta y sedes operativas distribuidas.</li>
              <li>Areas de atención con necesidades de continuidad y respuesta inmediata.</li>
              <li>Plataformas de colaboración, seguridad y productividad corporativa.</li>
              <li>Entornos donde convergen tecnología, procesos y personal de campo.</li>
            </ul>
          </div>
          <aside className={styles.integrationNote}>
            <h3>Integración por capas</h3>
            <p>
              Priorizamos primero la estabilidad base (red, energía, seguridad), luego
              incorporamos plataformas y automatización.
            </p>
          </aside>
        </article>
      </section>

      <section id="incluyen" className={styles.section}>
        <h2 className={styles.sectionBand}>Qué incluyen nuestros servicios</h2>
        <div className={styles.includesGrid}>
          {includeCards.map((card) => (
            <article key={card.title} className={styles.includeCard}>
              <h3>{card.title}</h3>
              <ul className={styles.list}>
                {card.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="contacto" className={styles.finalCta}>
        <h2>Listo para profesionalizar tu operación tecnológica</h2>
        <p>Conversemos y diseñemos una propuesta de servicios alineada a tu negocio.</p>
        <div className={styles.ctaActions}>
          <Link href="/contacto" className={styles.primaryCta}>Contactar</Link>
          <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </Link>
        </div>
      </section>
    </main>
  );
}

