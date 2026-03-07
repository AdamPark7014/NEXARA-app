import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export const metadata = {
  title: "Nexara | Sobre nosotros",
  description: "Conoce Nexara: quiénes somos, misión, visión y valores",
};

export default function NexaraPage() {
  return (
    <>
    <main className={`${styles.container} public-section-page`} aria-label="Página sobre Nexara">
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Nexara</h1>
          <p className={styles.heroSubtitle}>
            Integramos tecnología, equipamiento y servicios IT a la medida para que
            tu operación crezca con continuidad. Combinamos experiencia técnica,
            ejecución ágil y acompañamiento cercano en cada etapa.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/contacto" className={styles.primaryCta}>Contactar asesor</Link>
            <Link href="/servicios" className={styles.secondaryCta}>Ver servicios</Link>
          </div>
        </div>

        {/* Highlights / quick facts */}
        <div className={styles.highlightsStrip}>
          <div className={styles.highlightBadge}>Integración end‑to‑end</div>
          <div className={styles.highlightBadge}>Ingenieros certificados</div>
          <div className={styles.highlightBadge}>Entrega ágil</div>
          <div className={styles.highlightBadge}>Soporte cercano</div>
        </div>
      </section>

      <nav className={styles.quickNav} aria-label="Accesos rápidos">
        <a href="#nosotros" className={styles.quickNavLink}>Nosotros</a>
        <a href="#diferenciadores" className={styles.quickNavLink}>Diferenciadores</a>
        <a href="#metodologia" className={styles.quickNavLink}>Metodología</a>
        <a href="#metricas" className={styles.quickNavLink}>Métricas</a>
        <a href="#cobertura" className={styles.quickNavLink}>Cobertura</a>
        <a href="#valores" className={styles.quickNavLink}>Valores</a>
      </nav>

      {/* Sobre Nexara */}
      <section id="nosotros" className={styles.section}>
        <h2 className={styles.sectionTitle}>Sobre Nexara</h2>
        <p className={styles.lead}>
          Combinamos experiencia técnica y enfoque de servicio para resolver
          necesidades reales: desde equipamiento confiable hasta integración TI
          end-to-end con soporte oportuno.
        </p>
        <div className={styles.gridCols2}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Qué hacemos</h3>
            <ul className={styles.list}>
              <li>Venta de computadoras, componentes y periféricos de marcas líderes</li>
              <li>Integración de soluciones TI: redes, seguridad, energía y cómputo</li>
              <li>Servicios profesionales: consultoría, implementación y soporte 24/7</li>
              <li>Proyectos a la medida con enfoque en resultados y continuidad</li>
            </ul>
          </div>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Cómo lo hacemos</h3>
            <ul className={styles.list}>
              <li>Gestión experta por ingenieros certificados y experimentados</li>
              <li>Metodologías ágiles para entregar en tiempo y forma</li>
              <li>Acompañamiento de punta a punta: diagnóstico, implementación y soporte</li>
              <li>Relación de confianza y comunicación clara con cada cliente</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Misión y Visión */}
      <section className={styles.section}>
        <div className={styles.gridCols2}>
          <div className={styles.cardAccent}>
            <h3 className={styles.cardTitle}>Misión</h3>
            <p>
              Nexara es una empresa conformada por ingenieros profesionales con
              capacidad de brindar al cliente un excelente servicio de calidad al
              integrar soluciones TI.
            </p>
          </div>
          <div className={styles.cardAccent}>
            <h3 className={styles.cardTitle}>Visión</h3>
            <p>
              Ser una empresa líder en el mercado nacional, brindando servicios e
              imagen de calidad y profesionalismo, reconocida por su cumplimiento
              y orientación a resultados.
            </p>
          </div>
        </div>
      </section>

      {/* Diferenciadores */}
      <section id="diferenciadores" className={styles.section}>
        <h2 className={styles.sectionTitle}>Nuestros diferenciadores</h2>
        <div className={styles.badgesGrid}>
          <div className={styles.badgeSolid}>Respuesta menor a 4h</div>
          <div className={styles.badgeSolid}>Proyectos end‑to‑end</div>
          <div className={styles.badgeSolid}>Ingenieros certificados</div>
          <div className={styles.badgeSolid}>Soporte 24/7</div>
          <div className={styles.badgeSolid}>Cobertura nacional</div>
          <div className={styles.badgeSolid}>Garantía y reemplazo</div>
        </div>
      </section>

      {/* Metodología */}
      <section id="metodologia" className={styles.section}>
        <h2 className={styles.sectionTitle}>Cómo trabajamos</h2>
        <div className={styles.methodGrid}>
          <div className={styles.methodStep}>
            <div className={styles.methodIndex}>1</div>
            <div>
              <h3 className={styles.cardTitle}>Diagnóstico</h3>
              <p>Evaluamos tu operación y necesidades para definir objetivos claros.</p>
            </div>
          </div>
          <div className={styles.methodStep}>
            <div className={styles.methodIndex}>2</div>
            <div>
              <h3 className={styles.cardTitle}>Diseño</h3>
              <p>Proponemos arquitectura y equipamiento óptimo, alineado a tu presupuesto.</p>
            </div>
          </div>
          <div className={styles.methodStep}>
            <div className={styles.methodIndex}>3</div>
            <div>
              <h3 className={styles.cardTitle}>Implementación</h3>
              <p>Ejecutamos con metodologías ágiles, minimizando riesgos y tiempos muertos.</p>
            </div>
          </div>
          <div className={styles.methodStep}>
            <div className={styles.methodIndex}>4</div>
            <div>
              <h3 className={styles.cardTitle}>Soporte</h3>
              <p>Acompañamiento continuo, monitoreo y mejora para asegurar continuidad.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Métricas y SLA */}
      <section id="metricas" className={styles.section}>
        <h2 className={styles.sectionTitle}>Números que nos respaldan</h2>
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <h3>8+</h3>
            <p className={styles.metricLabel}>años de experiencia</p>
          </div>
          <div className={styles.metricCard}>
            <h3>300+</h3>
            <p className={styles.metricLabel}>proyectos entregados</p>
          </div>
          <div className={styles.metricCard}>
            <h3>95%</h3>
            <p className={styles.metricLabel}>SLA cumplido</p>
          </div>
          <div className={styles.metricCard}>
            <h3>&lt;4h</h3>
            <p className={styles.metricLabel}>tiempo promedio de respuesta</p>
          </div>
        </div>
        <p className={styles.slaNote}>SLA de soporte disponible 24/7 para clientes con contrato activo.</p>
      </section>

      {/* Cobertura operativa */}
      <section id="cobertura" className={styles.section}>
        <h2 className={styles.sectionTitle}>Cobertura en México</h2>
        <p className={styles.lead}>Zonas donde operamos y atendemos proyectos.</p>
        <div className={styles.mapCard}>
          {/* Coloca tu imagen en apps/web/public/mapa-operaciones.png */}
          <Image
            src="/mapa-operaciones.png"
            alt="Mapa de cobertura de Nexara en México"
            width={1200}
            height={700}
            className={styles.mapImage}
            priority
          />
          <div className={styles.mapLegend}>
            <span className={styles.legendBadge}>Cobertura principal</span>
            <span className={styles.legendBadgeSecondary}>Proyectos por demanda</span>
          </div>
        </div>
      </section>

      {/* Valores */}
      <section id="valores" className={styles.section}>
        <h2 className={styles.sectionTitle}>Valores</h2>
        <div className={styles.valuesGrid}>
          <article className={styles.valueCard}>
            <h3>Profesionalismo</h3>
            <p>Mejora continua y liderazgo para alcanzar resultados óptimos.</p>
          </article>
          <article className={styles.valueCard}>
            <h3>Proactividad</h3>
            <p>Respuestas rápidas y efectivas para cumplir objetivos y metas.</p>
          </article>
          <article className={styles.valueCard}>
            <h3>Espíritu de servicio</h3>
            <p>Trabajo en equipo y excelente ambiente para reflejar grandes resultados.</p>
          </article>
          <article className={styles.valueCard}>
            <h3>Eficiencia</h3>
            <p>Tareas con diligencia y seriedad para garantizar un servicio sobresaliente.</p>
          </article>
        </div>
      </section>

      {/* Trust: marcas y certificaciones (se muestran en inicio) */}

      {/* CTA final */}
      <section className={styles.finalCta}>
        <h2>¿Listos para impulsar tu proyecto?</h2>
        <p>Conversemos y definamos la solución ideal para tu empresa.</p>
        <div className={styles.heroCtas}>
          <Link href="/contacto" className={styles.primaryCta}>Contactar</Link>
          <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">WhatsApp</Link>
        </div>
      </section>
    </main>
    </>
  );
}
