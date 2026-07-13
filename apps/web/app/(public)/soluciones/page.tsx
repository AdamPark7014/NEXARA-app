import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";

export const metadata = {
  title: "Soluciones | Nexara",
  description: "Soluciones tecnológicas por industria diseñadas por Nexara.",
};

export const dynamic = "force-dynamic";

const industrias = [
  {
    slug: "retail",
    title: "Retail",
    desc: "POS, inventario en tiempo real, redes y CCTV inteligente para cadenas multi-sede.",
    image: "/images/hero/hero-01.png",
  },
  {
    slug: "manufactura",
    title: "Manufactura",
    desc: "IoT industrial, MES, mantenimiento predictivo y trazabilidad de producción.",
    image: "/images/hero/hero-02.png",
  },
  {
    slug: "hospitalidad",
    title: "Hospitalidad",
    desc: "Wi-Fi de alta densidad, telefonía IP, control de acceso y experiencias digitales.",
    image: "/images/hero/hero-03.png",
  },
  {
    slug: "salud",
    title: "Salud",
    desc: "Expediente clínico, telemedicina, integración HL7/FHIR y portales de paciente.",
    image: "/images/hero/hero-04.png",
  },
  {
    slug: "educacion",
    title: "Educación",
    desc: "Aulas inteligentes, plataformas LMS, control de acceso y campus conectado.",
    image: "/images/hero/hero-05.png",
  },
  {
    slug: "gobierno",
    title: "Gobierno",
    desc: "Centros de datos, ciberseguridad, gobernanza de datos y transparencia digital.",
    image: "/images/hero/hero-06.png",
  },
];

export default function SolucionesPage() {
  return (
    <main className={shared.page}>
      {/* Hero */}
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Soluciones por industria</span>
              <h1 className={shared.heroTitle}>
                Tecnología que <span className={shared.heroTitleAccent}>entiende tu sector</span>
              </h1>
              <p className={shared.heroLead}>
                No vendemos productos sueltos: armamos soluciones completas con la experiencia
                acumulada en cada industria que servimos.
              </p>
              <div className={shared.heroActions}>
                <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Habla con un experto <span className={shared.btnArrow}>→</span>
                </Link>
                <Link href="/proyectos" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Ver casos
                </Link>
              </div>
            </div>
            <div className={shared.heroImage} data-reveal="soft">
              <Image src="/images/hero/hero-08.png" alt="Soluciones por industria" width={720} height={540} priority />
              <div className={shared.heroImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      {/* Industrias */}
      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Industrias</span>
            <h2 className={shared.sectionTitle}>
              Soluciones diseñadas para <span className={shared.sectionTitleAccent}>tu industria</span>
            </h2>
            <p className={shared.sectionLead}>
              Equipos con experiencia comprobada en cada vertical.
            </p>
          </div>
          <div className={shared.grid3} data-reveal-stagger>
            {industrias.map((i) => (
              <Link
                key={i.slug}
                href={`/soluciones/${i.slug}`}
                className={`${shared.imageCard} ${styles.indCard}`}
                data-reveal="up"
              >
                <div className={shared.imageCardImg}>
                  <Image src={i.image} alt={i.title} width={640} height={400} />
                </div>
                <div className={shared.imageCardBody}>
                  <h3 className={shared.imageCardTitle}>{i.title}</h3>
                  <p className={shared.imageCardText}>{i.desc}</p>
                  <span className={styles.indCta}>
                    Ver soluciones <span aria-hidden>→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Tu industria no está aquí? <span className={shared.sectionTitleAccent}>Hablemos.</span>
            </h2>
            <p className={shared.ctaLead}>
              Atendemos proyectos a la medida en cualquier sector con base tecnológica.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Solicitar consultoría <span className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
