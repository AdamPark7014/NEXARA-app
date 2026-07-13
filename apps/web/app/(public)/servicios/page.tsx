import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";

export const metadata = {
  title: "Servicios | Nexara",
  description: "Catálogo de servicios tecnológicos de Nexara: Software, Cloud, Ciberseguridad, Data & IA, Conectividad y Transformación.",
};

/** Evita ISR de 1 año que dejaba el front viejo tras deploys. */
export const dynamic = "force-dynamic";

/* ── Iconos ─────────────────────────────────────────────── */
const IconCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);
const IconCloud = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.5 19A4.5 4.5 0 0 0 16 10.27 7 7 0 1 0 3 14.5h13a3.5 3.5 0 0 1 1.5 4.5z" />
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconBrain = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58A2.5 2.5 0 0 1 4.5 6.5a2.5 2.5 0 0 1 5-1.96V2z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-.42-4.78 2.5 2.5 0 0 0-5-1.96V2z" />
  </svg>
);
const IconNetwork = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="6" height="6" rx="1" /><rect x="16" y="2" width="6" height="6" rx="1" />
    <rect x="9" y="16" width="6" height="6" rx="1" /><path d="M5 8v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M12 13v3" />
  </svg>
);
const IconCompass = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

const servicios = [
  {
    id: "software",
    icon: <IconCode />,
    title: "Desarrollo de Software",
    text: "Aplicaciones web y móviles a medida, integraciones API y plataformas internas.",
    image: "/images/hero/hero-01.png",
  },
  {
    id: "cloud",
    icon: <IconCloud />,
    title: "Cloud & Infraestructura",
    text: "Migración, arquitectura multi-cloud y optimización de costos en AWS/Azure/GCP.",
    image: "/images/hero/hero-03.png",
  },
  {
    id: "ciberseguridad",
    icon: <IconShield />,
    title: "Ciberseguridad",
    text: "Pentesting, hardening, SOC y cumplimiento normativo (ISO 27001, PCI-DSS).",
    image: "/images/hero/hero-04.png",
  },
  {
    id: "data-ai",
    icon: <IconBrain />,
    title: "Data & IA",
    text: "Pipelines de datos, dashboards ejecutivos y modelos de IA aplicados al negocio.",
    image: "/images/hero/hero-05.png",
  },
  {
    id: "conectividad",
    icon: <IconNetwork />,
    title: "Conectividad y Redes",
    text: "Diseño LAN/WAN, fibra óptica, redes inalámbricas y telefonía IP empresarial.",
    image: "/images/hero/hero-06.png",
  },
  {
    id: "transformacion",
    icon: <IconCompass />,
    title: "Transformación Digital",
    text: "Diagnóstico, hoja de ruta y ejecución de proyectos de modernización end-to-end.",
    image: "/images/hero/hero-07.png",
  },
];

const proceso = [
  { num: "01", title: "Descubrimiento", text: "Entrevistas, levantamiento y diagnóstico técnico." },
  { num: "02", title: "Propuesta", text: "Alcance, plan, equipo y presupuesto cerrado." },
  { num: "03", title: "Ejecución", text: "Sprints quincenales con demos y entregables claros." },
  { num: "04", title: "Operación", text: "Soporte, mejora continua y SLA medibles." },
];

export default function ServiciosPage() {
  return (
    <main className={shared.page}>
      {/* Hero */}
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Servicios</span>
              <h1 className={shared.heroTitle}>
                Tecnología que <span className={shared.heroTitleAccent}>opera el día a día</span>
              </h1>
              <p className={shared.heroLead}>
                Seis capacidades integradas para diseñar, implementar y operar la tecnología que
                sostiene tu negocio. Una sola firma, responsabilidad punta a punta.
              </p>
              <div className={shared.heroActions}>
                <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Solicitar propuesta <span className={shared.btnArrow}>→</span>
                </Link>
                <Link href="/proyectos" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Ver proyectos
                </Link>
              </div>
            </div>
            <div className={shared.heroImage} data-reveal="soft">
              <Image src="/images/hero/hero-08.png" alt="Equipo Nexara en sala de control" width={720} height={540} priority />
              <div className={shared.heroImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      {/* Servicios principales */}
      <section id="servicios-principales" className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Capacidades</span>
            <h2 className={shared.sectionTitle}>
              Todo lo que <span className={shared.sectionTitleAccent}>tu operación necesita</span>
            </h2>
            <p className={shared.sectionLead}>
              Equipos especializados con experiencia comprobada en cada disciplina.
            </p>
          </div>
          <div className={`${shared.grid3} ${styles.servGrid}`} data-reveal-stagger>
            {servicios.map((s) => (
              <article id={s.id} key={s.id} className={shared.imageCard} data-reveal="up">
                <div className={shared.imageCardImg}>
                  <Image src={s.image} alt={s.title} width={640} height={400} />
                </div>
                <div className={shared.imageCardBody}>
                  <div className={styles.servIconRow}>
                    <span className={shared.cardIcon}>{s.icon}</span>
                  </div>
                  <h3 className={shared.imageCardTitle}>{s.title}</h3>
                  <p className={shared.imageCardText}>{s.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Proceso */}
      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Proceso</span>
            <h2 className={shared.sectionTitle}>
              Cuatro pasos, <span className={shared.sectionTitleAccent}>resultados medibles</span>
            </h2>
            <p className={shared.sectionLead}>
              Un método ordenado que reduce sorpresas y acelera la entrega de valor.
            </p>
          </div>
          <div className={shared.grid4} data-reveal-stagger>
            {proceso.map((p) => (
              <div key={p.num} className={`${shared.card} ${styles.procesoCard}`} data-reveal="up">
                <span className={styles.procesoNum}>{p.num}</span>
                <h3 className={shared.cardTitle}>{p.title}</h3>
                <p className={shared.cardText}>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className={shared.section} id="contacto">
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Necesitas un <span className={shared.sectionTitleAccent}>diagnóstico rápido</span>?
            </h2>
            <p className={shared.ctaLead}>
              30 minutos con un especialista. Sin costo, sin compromiso. Te llevamos una propuesta
              clara y aterrizada a tu realidad.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Agendar reunión <span className={shared.btnArrow}>→</span>
              </Link>
              <Link href="/nosotros" className={`${shared.btn} ${shared.btnSecondary}`}>
                Conoce al equipo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
