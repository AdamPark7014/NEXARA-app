import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import styles from "./page.module.css";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nexara | Sobre Nosotros",
  description: "Conoce Nexara: mision, vision, principios de trabajo y cobertura para proyectos tecnologicos empresariales en Mexico.",
  keywords: [
    "sobre Nexara",
    "empresa de tecnologia en Mexico",
    "integracion tecnologica empresarial",
    "equipo de ingenieria TI",
    "consultoria tecnologica",
  ],
  alternates: {
    canonical: "/nexara",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/nexara`,
    title: "Nexara | Sobre Nosotros",
    description: "Equipo de integracion tecnologica orientado a continuidad operativa y resultados medibles.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexara | Sobre Nosotros",
    description: "Experiencia de campo, ejecucion y acompanamiento para operaciones empresariales.",
    images: ["/logo-nexara.png"],
  },
};

export default function NexaraPage() {
  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${siteUrl}/nexara`,
    name: "Sobre Nexara",
    mainEntity: {
      "@type": "Organization",
      name: "NEXARA",
      url: siteUrl,
      logo: `${siteUrl}/logo-nexara.png`,
      description: "Empresa de integracion tecnologica enfocada en continuidad operativa y resultados empresariales.",
    },
  };

  const principles = [
    {
      title: "Ingeniería aplicable",
      text: "Diseñamos soluciones que se pueden operar y sostener en campo, no solo en presentación.",
    },
    {
      title: "Gobierno operativo",
      text: "Aterrizamos procesos, responsables y métricas para mantener continuidad y control.",
    },
    {
      title: "Acompañamiento real",
      text: "Nos mantenemos cerca del equipo del cliente durante implementación, adopción y evolución.",
    },
  ];

  const timeline = [
    {
      stage: "Diagnóstico",
      description: "Evaluamos brechas de infraestructura, seguridad, operación y soporte con visión ejecutiva.",
    },
    {
      stage: "Arquitectura",
      description: "Definimos una hoja de ruta técnica y financiera por fases, prioridades y riesgos.",
    },
    {
      stage: "Implementación",
      description: "Ejecutamos con estándares, documentación y transferencia de conocimiento.",
    },
    {
      stage: "Continuidad",
      description: "Aseguramos monitoreo, mejora continua y soporte con SLA acordados.",
    },
  ];

  return (
    <main className={`${styles.container} public-section-page ultra-corp-page ultra-corp-nexara ultra-corp-strict`} aria-label="Página sobre Nexara">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.kicker}>NEXARA INGENIEROS</p>
          <h1 className={styles.pageTitle}>Convertimos infraestructura en ventaja operativa</h1>
          <p className={styles.pageLead}>
            Somos un equipo de integración tecnológica que conecta estrategia, ejecución y
            continuidad para organizaciones que no pueden detener su operación.
          </p>
          <div className={styles.heroActions}>
            <Link href="/contacto" data-track-conversion="about_primary_cta" className={styles.primaryCta}>Hablar con un especialista</Link>
            <Link href="/proyectos" data-track-conversion="about_projects_cta" className={styles.secondaryCta}>Ver casos publicados</Link>
          </div>
        </div>

        <aside className={styles.heroPanel} aria-label="Indicadores institucionales">
          <div className={styles.statCard}>
            <strong>+300</strong>
            <span>implementaciones completadas</span>
          </div>
          <div className={styles.statCard}>
            <strong>24/7</strong>
            <span>modelo de soporte especializado</span>
          </div>
          <div className={styles.statCard}>
            <strong>Nacional</strong>
            <span>cobertura operativa en México</span>
          </div>
        </aside>
      </header>

      <nav className={styles.quickNav} aria-label="Accesos rápidos">
        <a href="#quienes" className={styles.quickNavLink}>Quiénes somos</a>
        <a href="#fundamentos" className={styles.quickNavLink}>Fundamentos</a>
        <a href="#metodo" className={styles.quickNavLink}>Método</a>
        <a href="#cobertura" className={styles.quickNavLink}>Cobertura</a>
      </nav>

      <section id="quienes" className={styles.section}>
        <h2 className={styles.sectionTitle}>Quiénes somos</h2>
        <article className={styles.identityCard}>
          <Image
            src="/logo-nexara.png"
            alt="Logo Nexara"
            width={110}
            height={110}
            className={styles.identityLogo}
          />
          <div className={styles.identityContent}>
            <h3>Integración orientada a resultados</h3>
            <p>
              En Nexara alineamos tecnología, procesos y personas para resolver problemas reales de
              operación. Combinamos experiencia de campo, disciplina de ejecución y una cultura de
              servicio que privilegia la continuidad del negocio.
            </p>
          </div>
        </article>
      </section>

      <section id="fundamentos" className={styles.section}>
        <h2 className={styles.sectionTitle}>Misión, visión y principios</h2>
        <div className={styles.fundamentalsGrid}>
          <article className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Misión</h3>
            <p>
              Integrar soluciones TI confiables y sostenibles para que cada cliente opere con
              continuidad, seguridad y eficiencia medible.
            </p>
          </article>

          <article className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Visión</h3>
            <p>
              Ser el aliado tecnológico de referencia para organizaciones que requieren un nivel
              profesional alto, ejecución impecable y mejora continua.
            </p>
          </article>

          <article className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Principios de trabajo</h3>
            <ul className={styles.valuesList}>
              {principles.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}:</strong> {item.text}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section id="metodo" className={styles.section}>
        <h2 className={styles.sectionTitle}>Cómo trabajamos</h2>
        <div className={styles.methodGrid}>
          {timeline.map((item, index) => (
            <article key={item.stage} className={styles.methodCard}>
              <span className={styles.methodIndex}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.stage}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="cobertura" className={styles.section}>
        <h2 className={styles.sectionTitle}>Cobertura nacional</h2>
        <div className={styles.mapCard}>
          <Image
            src="/mapa-operaciones.png"
            alt="Mapa de cobertura de Nexara en México"
            width={1200}
            height={700}
            className={styles.mapImage}
            priority
          />
          <p className={styles.mapCaption}>
            Operamos proyectos con equipos propios y red de soporte para despliegues en múltiples
            estados del país.
          </p>
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2>Listos para impulsar tu siguiente etapa tecnológica</h2>
        <p>Conversemos y definamos la solución ideal para tu empresa.</p>
        <div className={styles.heroCtas}>
          <Link href="/contacto" data-track-conversion="about_footer_contact" className={styles.primaryCta}>Contactar</Link>
          <Link href="https://wa.me/525536505044" data-track-conversion="about_footer_whatsapp" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">WhatsApp</Link>
        </div>
      </section>

      <SeoInterlinkHub title="Casos de uso y soluciones relacionadas" currentPath="/nexara" maxItems={8} />
    </main>
  );
}

