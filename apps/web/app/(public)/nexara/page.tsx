import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export const metadata = {
  title: "Nexara | Sobre nosotros",
  description: "Conoce Nexara: quiénes somos, misión, visión, valores y cobertura en México",
};

export default function NexaraPage() {
  return (
    <main className={`${styles.container} public-section-page`} aria-label="Página sobre Nexara">
      <header className={styles.headerBlock}>
        <h1 className={styles.pageTitle}>Sobre Nexara</h1>
        <p className={styles.pageLead}>
          Integramos tecnología, equipamiento y servicios IT a la medida para que tu operación
          crezca con continuidad.
        </p>
      </header>

      <nav className={styles.quickNav} aria-label="Accesos rápidos">
        <a href="#quienes" className={styles.quickNavLink}>Quiénes somos</a>
        <a href="#fundamentos" className={styles.quickNavLink}>Fundamentos</a>
        <a href="#por-que" className={styles.quickNavLink}>Por qué elegirnos</a>
        <a href="#cobertura" className={styles.quickNavLink}>Cobertura</a>
      </nav>

      <section id="quienes" className={styles.section}>
        <h2 className={styles.sectionTitle}>¿Quiénes somos?</h2>
        <article className={styles.identityCard}>
          <Image
            src="/logo-nexara.png"
            alt="Logo Nexara"
            width={110}
            height={110}
            className={styles.identityLogo}
          />
          <div className={styles.identityContent}>
            <h3>Nexara</h3>
            <p>
              En Nexara somos una empresa de integración tecnológica que implementa y da
              continuidad a soluciones de TI, seguridad, energía y operación conectada. Combinamos
              experiencia técnica, ejecución ágil y acompañamiento cercano para resolver necesidades
              reales de negocio.
            </p>
          </div>
        </article>
      </section>

      <section id="fundamentos" className={styles.section}>
        <h2 className={styles.sectionTitle}>Misión, visión y valores</h2>
        <div className={styles.fundamentalsGrid}>
          <article className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Misión</h3>
            <p>
              Integrar soluciones TI confiables con alto estándar técnico y servicio cercano,
              para que cada cliente opere con continuidad, seguridad y eficiencia.
            </p>
          </article>

          <article className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Visión</h3>
            <p>
              Ser una empresa líder en integración tecnológica a nivel nacional, reconocida por
              su cumplimiento, profesionalismo y orientación total a resultados.
            </p>
          </article>

          <article className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Valores</h3>
            <ul className={styles.valuesList}>
              <li>Profesionalismo y mejora continua.</li>
              <li>Proactividad y respuesta oportuna.</li>
              <li>Espíritu de servicio en cada proyecto.</li>
              <li>Eficiencia operativa con resultados medibles.</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="por-que" className={styles.section}>
        <h2 className={styles.sectionTitle}>¿Por qué elegirnos?</h2>
        <div className={styles.whyGrid}>
          <article className={styles.infoCard}>
            <ul className={styles.bullets}>
              <li>Combinamos experiencia operativa y ejecución técnica.</li>
              <li>Más de 300 proyectos implementados de punta a punta.</li>
              <li>Equipos certificados en distintos sectores empresariales.</li>
              <li>Orientación a SLA y continuidad del servicio.</li>
            </ul>
          </article>

          <aside className={styles.visualSlot} aria-label="Espacio visual de casos y operación">
            <div className={styles.visualSlotInner}>
              <span>Espacio para imagen</span>
            </div>
          </aside>
        </div>
      </section>

      <section id="cobertura" className={styles.section}>
        <h2 className={styles.sectionTitle}>Servicios Nexara en México</h2>
        <div className={styles.mapCard}>
          <Image
            src="/mapa-operaciones.png"
            alt="Mapa de cobertura de Nexara en México"
            width={1200}
            height={700}
            className={styles.mapImage}
            priority
          />
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2>¿Listos para impulsar tu proyecto?</h2>
        <p>Conversemos y definamos la solución ideal para tu empresa.</p>
        <div className={styles.heroCtas}>
          <Link href="/contacto" className={styles.primaryCta}>Contactar</Link>
          <Link href="https://wa.me/525536505044" className={styles.secondaryCta} target="_blank" rel="noopener noreferrer">WhatsApp</Link>
        </div>
      </section>
    </main>
  );
}
