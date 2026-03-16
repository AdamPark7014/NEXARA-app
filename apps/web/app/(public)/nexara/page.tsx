import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export const metadata = {
  title: "Nexara | Sobre nosotros",
  description: "Conoce Nexara: quiénes somos, misión, visión, valores y cobertura en México",
};

export default function NexaraPage() {
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
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.kicker}>NEXARA INGENIEROS</p>
          <h1 className={styles.pageTitle}>Convertimos infraestructura en ventaja operativa</h1>
          <p className={styles.pageLead}>
            Somos un equipo de integración tecnológica que conecta estrategia, ejecución y
            continuidad para organizaciones que no pueden detener su operación.
          </p>
          <div className={styles.heroActions}>
            <Link href="/contacto" className={styles.primaryCta}>Hablar con un especialista</Link>
            <Link href="/proyectos" className={styles.secondaryCta}>Ver casos publicados</Link>
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
          <Link href="/contacto" className={styles.primaryCta}>Contactar</Link>
          <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">WhatsApp</Link>
        </div>
      </section>
    </main>
  );
}

