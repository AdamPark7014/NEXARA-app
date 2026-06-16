import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";

export const metadata = {
  title: "Cobertura | Nexara",
  description: "Operamos en todo México con presencia directa en regiones clave y partners certificados.",
};

const regiones = [
  { name: "Centro", desc: "CDMX · Estado de México · Querétaro · Puebla", base: true },
  { name: "Bajío", desc: "Guanajuato · Aguascalientes · San Luis Potosí" },
  { name: "Occidente", desc: "Jalisco · Nayarit · Colima · Michoacán" },
  { name: "Norte", desc: "Nuevo León · Coahuila · Chihuahua · Sonora" },
  { name: "Sureste", desc: "Yucatán · Quintana Roo · Veracruz · Tabasco" },
  { name: "Pacífico", desc: "Sinaloa · Baja California · Baja California Sur" },
];

const modalidades = [
  {
    title: "En sitio",
    desc: "Cuadrillas certificadas con kit completo, EPP y permisos.",
    icon: "🛠️",
  },
  {
    title: "Remoto 24/7",
    desc: "NOC propio, monitoreo proactivo y atención por canal de tu preferencia.",
    icon: "📡",
  },
  {
    title: "Híbrido",
    desc: "Combinamos campo + remoto según urgencia y SLA contratado.",
    icon: "🔄",
  },
];

export default function CoberturaPage() {
  return (
    <main className={shared.page}>
      {/* Hero */}
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Cobertura</span>
              <h1 className={shared.heroTitle}>
                Presencia en <span className={shared.heroTitleAccent}>toda la República</span>
              </h1>
              <p className={shared.heroLead}>
                Operamos directamente en seis regiones de México con personal propio y partners
                certificados. Llegamos donde tu operación lo necesita.
              </p>
              <div className={shared.heroActions}>
                <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Consultar tu zona <span className={shared.btnArrow}>→</span>
                </Link>
                <Link href="/servicios" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Ver servicios
                </Link>
              </div>
            </div>
            <div className={shared.heroImage} data-reveal="soft">
              <Image src="/images/hero/hero-06.png" alt="Cobertura nacional Nexara" width={720} height={540} priority />
              <div className={shared.heroImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      {/* Regiones */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Regiones</span>
            <h2 className={shared.sectionTitle}>
              Seis regiones, <span className={shared.sectionTitleAccent}>un solo equipo</span>
            </h2>
            <p className={shared.sectionLead}>
              Operación nacional con tiempos de respuesta locales.
            </p>
          </div>
          <div className={shared.grid3} data-reveal-stagger>
            {regiones.map((r) => (
              <div
                key={r.name}
                className={`${shared.card} ${styles.regionCard} ${r.base ? styles.regionBase : ""}`}
                data-reveal="up"
              >
                <div className={styles.regionHead}>
                  <h3 className={shared.cardTitle}>{r.name}</h3>
                  {r.base && <span className={styles.regionBadge}>Sede</span>}
                </div>
                <p className={shared.cardText}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modalidades */}
      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Modalidades</span>
            <h2 className={shared.sectionTitle}>
              Como tú <span className={shared.sectionTitleAccent}>lo necesites</span>
            </h2>
          </div>
          <div className={shared.grid3} data-reveal-stagger>
            {modalidades.map((m) => (
              <div key={m.title} className={shared.card} data-reveal="up">
                <span className={styles.modIcon}>{m.icon}</span>
                <h3 className={shared.cardTitle}>{m.title}</h3>
                <p className={shared.cardText}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Necesitas atención <span className={shared.sectionTitleAccent}>en tu ciudad</span>?
            </h2>
            <p className={shared.ctaLead}>
              Coordinamos visita o conexión remota en 24 horas hábiles.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Solicitar atención <span className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
