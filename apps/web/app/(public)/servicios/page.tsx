import Link from "next/link";
import styles from "./page.module.css";

export const metadata = {
  title: "Servicios | Nexara",
  description: "Soluciones y servicios tecnológicos integrales para empresas en México.",
};

export default function ServiciosPage() {
  return (
    <main className={`${styles.container} public-section-page`} aria-label="Página de servicios">
      <header className={styles.headerBlock}>
        <h1 className={styles.pageTitle}>Servicios Nexara</h1>
        <p className={styles.pageLead}>
          Integramos equipamiento, infraestructura y servicios de TI con enfoque operativo,
          financiero y de continuidad para cada etapa de tu organización.
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
        <h2 className={styles.sectionBand}>¿Qué ofrecemos?</h2>
        <article className={styles.contentCard}>
          <div className={styles.textCol}>
            <ul className={styles.list}>
              <li>Venta de computadoras, componentes y periféricos de marcas líderes.</li>
              <li>Integración de soluciones TI: redes, seguridad, energía y cómputo.</li>
              <li>Servicios profesionales: consultoría, implementación y soporte 24/7.</li>
              <li>Proyectos a la medida con enfoque en resultados y continuidad.</li>
            </ul>
          </div>
          <aside className={styles.imageSlot} aria-label="Espacio para imagen de servicios">
            <div className={styles.imageSlotInner}>Espacio de imagen</div>
          </aside>
        </article>
      </section>

      <section id="ejecucion" className={styles.section}>
        <h2 className={styles.sectionBand}>¿Cómo lo ejecutamos?</h2>
        <article className={styles.contentCard}>
          <aside className={styles.imageSlot} aria-label="Espacio para imagen de ejecución">
            <div className={styles.imageSlotInner}>Espacio de imagen</div>
          </aside>
          <div className={styles.textCol}>
            <ul className={styles.list}>
              <li>Gestión experta por ingenieros certificados y experimentados.</li>
              <li>Metodologías ágiles para entrega en tiempo y forma.</li>
              <li>Acompañamiento de punta a punta: diagnóstico, implementación y soporte.</li>
              <li>Relación de confianza y comunicación clara con cada cliente.</li>
            </ul>
          </div>
        </article>
      </section>

      <section id="beneficios" className={styles.section}>
        <h2 className={styles.sectionBand}>¿Cuáles son los beneficios?</h2>
        <article className={styles.contentCard}>
          <div className={styles.textCol}>
            <ul className={styles.list}>
              <li>Experiencia operativa y soluciones empresariales personalizadas.</li>
              <li>Ejecución técnica con seguimiento para entregar resultados medibles.</li>
              <li>Transferencia de conocimiento y adopción efectiva de cada iniciativa.</li>
              <li>Análisis de contexto, riesgos y objetivos para priorizar iniciativas con impacto.</li>
              <li>Ejecución por fases con gestión de hitos, documentación y estándares.</li>
            </ul>
          </div>
          <aside className={styles.imageSlot} aria-label="Espacio para imagen de beneficios">
            <div className={styles.imageSlotInner}>Espacio de imagen</div>
          </aside>
        </article>
      </section>

      <section id="integracion" className={styles.section}>
        <h2 className={styles.sectionBand}>¿Dónde integrarlos?</h2>
        <article className={styles.contentCard}>
          <aside className={styles.imageSlot} aria-label="Espacio para imagen de integración">
            <div className={styles.imageSlotInner}>Espacio de imagen</div>
          </aside>
          <div className={styles.textCol}>
            <ul className={styles.list}>
              <li>Equipamiento corporativo: cómputo, servidores y periféricos alineados a operación.</li>
              <li>Infraestructura de red: diseño LAN/WAN, cableado y conectividad segura.</li>
              <li>Seguridad informática: firewalls, respaldo y protección de activos críticos.</li>
              <li>Monitoreo y soporte: continuidad, mantenimiento preventivo/correctivo y soporte técnico.</li>
            </ul>
          </div>
        </article>
      </section>

      <section id="incluyen" className={styles.section}>
        <h2 className={styles.sectionBand}>¿Qué incluyen sus servicios?</h2>
        <div className={styles.includesGrid}>
          <article className={styles.includeCard}>
            <h3>Soporte técnico</h3>
            <ul className={styles.list}>
              <li>Soporte especializado para empresas con operación multi-sucursal.</li>
              <li>Sin importar la ubicación, con atención centralizada.</li>
              <li>Respuesta menor a 4 horas en horario laboral.</li>
              <li>Cubrimos viáticos y gastos de desplazamiento según contrato.</li>
            </ul>
          </article>

          <article className={styles.includeCard}>
            <h3>Arrendamiento de equipo</h3>
            <ul className={styles.list}>
              <li>Conservas flujo de efectivo y capital de trabajo.</li>
              <li>Pagos mensuales fijos y deducibles de impuestos.</li>
              <li>Renueva tecnología sin grandes inversiones iniciales.</li>
              <li>Incluye soporte técnico y mantenimiento durante el contrato.</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="contacto" className={styles.finalCta}>
        <h2>¿Listo para impulsar tu operación?</h2>
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
