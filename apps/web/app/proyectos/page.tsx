import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export const metadata = {
  title: "Nexara | Proyectos",
  description:
    "Casos recientes de Nexara con imágenes y resultados destacados para retail, industria y servicios.",
};

const projects = [
  {
    slug: "retail-wifi6",
    title: "Refresh de red y WiFi 6 para 120 tiendas retail",
    sector: "Retail omnicanal",
    summary:
      "Modernizamos la conectividad de una cadena nacional, habilitando experiencias sin fricción en piso de venta y cajas autónomas.",
    mainImage: "/soluciones/rect-a.jpg",
    impact: "99.95% de disponibilidad y 35% menos tickets de red",
    services: ["Diseño LAN/WAN", "SD-WAN", "Soporte NOC"],
    tags: ["WiFi 6", "SD-WAN", "Zero Trust", "Observabilidad"],
    highlights: [
      "Cobertura WiFi 6 optimizada para inventarios en tiempo real",
      "Backbone SD-WAN con priorización de apps críticas",
      "Visibilidad unificada con alertamiento proactivo 24/7",
      "Plan de cambio nocturno sin afectar operación",
    ],
    gallery: [
      "/servicios/rect-1.jpg",
      "/servicios/rect-2.jpg",
      "/servicios/square-1.jpg",
      "/servicios/square-2.jpg",
      "/soluciones/rect-a.jpg",
      "/soluciones/rect-b.jpg",
      "/soluciones/square-a.jpg",
      "/soluciones/square-b.jpg",
    ],
  },
  {
    slug: "nube-hibrida",
    title: "Migración a nube híbrida para aseguradora",
    sector: "Servicios financieros",
    summary:
      "Extendimos el datacenter a la nube con landing zones seguras y automatizadas, acelerando el time-to-market de nuevos productos.",
    mainImage: "/soluciones/rect-b.jpg",
    impact: "Lanzamientos 3x más rápidos y 28% menos costo operativo",
    services: ["Cloud landing zone", "Infra as Code", "Monitoreo"],
    tags: ["Azure", "Kubernetes", "GitOps", "FinOps"],
    highlights: [
      "Plantillas IaC repetibles con controles de seguridad",
      "Plataforma de microservicios con CI/CD y observabilidad",
      "Canal seguro sitio-nube con alta disponibilidad",
      "Gobernanza de costos y alertas preventivas",
    ],
    gallery: [
      "/servicios/square-1.jpg",
      "/servicios/square-2.jpg",
      "/soluciones/rect-a.jpg",
      "/soluciones/rect-b.jpg",
      "/soluciones/square-a.jpg",
      "/soluciones/square-b.jpg",
      "/servicios/rect-1.jpg",
      "/servicios/rect-2.jpg",
    ],
  },
  {
    slug: "datacenter-modular",
    title: "Centro de datos modular para fintech",
    sector: "Fintech & pagos",
    summary:
      "Diseñamos e implementamos un core de misión crítica con redundancia completa y monitoreo continuo orientado a SLA.",
    mainImage: "/servicios/rect-1.jpg",
    impact: "SLA 99.98% y soporte con respuesta <4h",
    services: ["Cómputo y energía", "Virtualización", "Soporte 24/7"],
    tags: ["VMware", "DRP", "Alta disponibilidad", "SLA"],
    highlights: [
      "Arquitectura modular con crecimiento por demanda",
      "Segmentación y hardening para zonas de pago",
      "Plan de recuperación probado con simulacros trimestrales",
      "Mesa de ayuda con métricas y reportes ejecutivos",
    ],
    gallery: [
      "/soluciones/rect-b.jpg",
      "/soluciones/rect-a.jpg",
      "/soluciones/square-a.jpg",
      "/soluciones/square-b.jpg",
      "/servicios/rect-1.jpg",
      "/servicios/rect-2.jpg",
      "/servicios/square-1.jpg",
      "/servicios/square-2.jpg",
    ],
  },
];

export default function ProjectsPage() {
  return (
    <main className={styles.container}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Portafolio vivo</p>
        <div className={styles.heroHeader}>
          <div>
            <h1 className={styles.heroTitle}>Proyectos recientes</h1>
            <p className={styles.heroSubtitle}>
              Casos reales con resultados medibles. Usa esta vista para mostrar a tus
              clientes cómo trabajamos, qué entregamos y el impacto conseguido.
            </p>
            <div className={styles.heroActions}>
              <Link href="/contacto" className={styles.primaryCta}>Hablar con un asesor</Link>
              <Link href="/nexara" className={styles.secondaryCta}>Ver credenciales</Link>
            </div>
          </div>
          <div className={styles.heroStats}>
            <div>
              <span className={styles.statValue}>300+</span>
              <span className={styles.statLabel}>proyectos entregados</span>
            </div>
            <div>
              <span className={styles.statValue}>95%</span>
              <span className={styles.statLabel}>SLA cumplido</span>
            </div>
            <div>
              <span className={styles.statValue}>8+</span>
              <span className={styles.statLabel}>años integrando TI</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.projectsSection}>
        {projects.map((project) => (
          <article key={project.slug} className={styles.projectCard}>
            <header className={styles.projectHeader}>
              <div>
                <p className={styles.badge}>{project.sector}</p>
                <h2 className={styles.projectTitle}>{project.title}</h2>
                <p className={styles.projectSubtitle}>{project.summary}</p>
                <div className={styles.metaRow}>
                  <div>
                    <p className={styles.metaLabel}>Impacto</p>
                    <p className={styles.metaValue}>{project.impact}</p>
                  </div>
                  <div>
                    <p className={styles.metaLabel}>Servicios</p>
                    <p className={styles.metaValue}>{project.services.join(" • ")}</p>
                  </div>
                </div>
              </div>
              <div className={styles.tagRow}>
                {project.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>
            </header>

            <div className={styles.mediaGrid}>
              <div className={styles.mainImage}>
                <Image
                  src={project.mainImage}
                  alt={`Proyecto ${project.title}`}
                  fill
                  sizes="(max-width: 900px) 100vw, 55vw"
                  className={styles.image}
                  priority
                />
              </div>
              <div className={styles.gallery}>
                {project.gallery.map((image, index) => (
                  <div key={`${project.slug}-gallery-${index}`} className={styles.galleryItem}>
                    <Image
                      src={image}
                      alt={`${project.title} imagen ${index + 1}`}
                      fill
                      sizes="(max-width: 900px) 50vw, 18vw"
                      className={styles.image}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.detailRow}>
              <ul className={styles.highlights}>
                {project.highlights.map((item) => (
                  <li key={`${project.slug}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.ctaStrip}>
        <div>
          <p className={styles.kicker}>¿Quieres un caso similar?</p>
          <h3>Agendemos una sesión de 20 minutos</h3>
          <p className={styles.ctaText}>
            Te mostramos los entregables, tableros y metodología que usamos para lograr
            estos resultados.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/contacto" className={styles.primaryCta}>Agenda ahora</Link>
          <Link
            href="https://wa.me/525536505044"
            className={styles.secondaryCta}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </Link>
        </div>
      </section>
    </main>
  );
}
