import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";

export const metadata = {
  title: "Nexara Ingenieros | Nexara",
  description: "División de ingeniería en sitio: instalación, integración y mantenimiento de infraestructura tecnológica.",
};

const capacidades = [
  {
    title: "Instalación",
    desc: "Cableado estructurado, fibra óptica, racks, energía y enfriamiento.",
    image: "/images/hero/hero-04.png",
  },
  {
    title: "Integración",
    desc: "Puesta en marcha, configuración y handover documentado.",
    image: "/images/hero/hero-05.png",
  },
  {
    title: "Mantenimiento",
    desc: "Preventivo, correctivo y mantenimiento predictivo con SLA.",
    image: "/images/hero/hero-06.png",
  },
];

const certificaciones = [
  "Certificación CommScope/Belden",
  "Avalado por Cisco / Fortinet",
  "Personal con DC3 vigente",
  "Cumplimiento NOM-001-SEDE",
];

export default function NexaraIngenierosPage() {
  return (
    <main className={shared.page}>
      {/* Hero */}
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Nexara Ingenieros</span>
              <h1 className={shared.heroTitle}>
                Ingeniería de campo <span className={shared.heroTitleAccent}>con responsabilidad</span>
              </h1>
              <p className={shared.heroLead}>
                Nuestra división técnica especializada en infraestructura tecnológica. Diseñamos,
                instalamos y mantenemos lo que sostiene tu operación.
              </p>
              <div className={shared.heroActions}>
                <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Solicitar visita técnica <span className={shared.btnArrow}>→</span>
                </Link>
                <Link href="/cobertura" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Ver cobertura
                </Link>
              </div>
            </div>
            <div className={shared.heroImage} data-reveal="soft">
              <Image src="/images/hero/hero-03.png" alt="Ingenieros Nexara en sitio" width={720} height={540} priority />
              <div className={shared.heroImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      {/* Capacidades */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Capacidades</span>
            <h2 className={shared.sectionTitle}>
              Del diseño a la <span className={shared.sectionTitleAccent}>operación</span>
            </h2>
            <p className={shared.sectionLead}>
              Tres líneas de servicio que cubren el ciclo de vida de tu infraestructura.
            </p>
          </div>
          <div className={shared.grid3} data-reveal-stagger>
            {capacidades.map((c) => (
              <article key={c.title} className={shared.imageCard} data-reveal="up">
                <div className={shared.imageCardImg}>
                  <Image src={c.image} alt={c.title} width={640} height={400} />
                </div>
                <div className={shared.imageCardBody}>
                  <h3 className={shared.imageCardTitle}>{c.title}</h3>
                  <p className={shared.imageCardText}>{c.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Certificaciones */}
      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.splitGrid}>
            <div className={shared.splitImage} data-reveal="soft">
              <Image src="/images/hero/hero-07.png" alt="Certificaciones Nexara" width={720} height={540} />
            </div>
            <div className={shared.splitBody} data-reveal="up">
              <span className={shared.eyebrow}>Certificaciones</span>
              <h3>Trabajo certificado, garantía formal</h3>
              <p>
                Todo nuestro personal cuenta con acreditaciones vigentes y nuestras instalaciones
                cumplen con normas mexicanas e internacionales aplicables.
              </p>
              <ul className={shared.bulletList}>
                {certificaciones.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Listo para <span className={shared.sectionTitleAccent}>arrancar tu obra</span>?
            </h2>
            <p className={shared.ctaLead}>
              Levantamiento sin costo. Te dejamos plano, BoQ y propuesta económica en 5 días hábiles.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Agendar levantamiento <span className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
