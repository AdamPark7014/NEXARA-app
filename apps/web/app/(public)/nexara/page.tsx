import Link from "next/link";
import type { Metadata } from "next";
import baseStyles from "./page.module.css";
import styles from "./home-sections.module.css";
import CertificationsCarousel from "../../components/CertificationsCarousel";
import BrandsCarousel from "../../components/BrandsCarousel";
import HomeHero from "../../components/HomeHero";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nexara | Tecnología que sostiene tu operación",
  description:
    "Nexara: integración tecnológica, ingeniería y servicios de extremo a extremo para empresas en México. Continuidad operativa, ejecución impecable y resultados medibles.",
  keywords: [
    "Nexara",
    "empresa de tecnologia en Mexico",
    "integracion tecnologica empresarial",
    "consultoria tecnologica",
    "servicios TI Mexico",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Nexara | Tecnología que sostiene tu operación",
    description:
      "Equipo de integración tecnológica orientado a continuidad operativa y resultados medibles.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexara | Tecnología que sostiene tu operación",
    description:
      "Experiencia de campo, ejecución y acompañamiento para operaciones empresariales.",
    images: ["/logo-nexara.png"],
  },
};

// ────────────────────────────────────────────────────────────────
// Datos de las secciones (TODO: migrar a /studio/* para edición
// completa desde el panel — siguiente fase del refactor).
// ────────────────────────────────────────────────────────────────

const trustItems = [
  { value: "+10 años", label: "acompañando empresas en México" },
  { value: "24/7", label: "monitoreo y respuesta operativa" },
  { value: "ISO + ITIL", label: "estándares de servicio y seguridad" },
  { value: "Multi-sede", label: "cobertura nacional con personal propio" },
];

const pilares = [
  {
    title: "Ingeniería con criterio",
    text: "Elegimos tecnología por su impacto operativo real, no por moda. Cada decisión está respaldada por arquitectura, riesgo y costo total.",
  },
  {
    title: "Continuidad operativa",
    text: "Diseñamos para que tu negocio no se detenga: alta disponibilidad, monitoreo 24/7 y planes de contingencia probados, no documentos en un cajón.",
  },
  {
    title: "Cercanía humana",
    text: "Un equipo asignado, no un call center. Hablas siempre con quien conoce tu operación y responde con claridad, sin letras chiquitas.",
  },
  {
    title: "Resultados medibles",
    text: "Cada proyecto entrega KPIs reales: uptime, ahorro, tiempo de respuesta y eficiencia. Lo que no se mide, no lo entregamos.",
  },
];

const servicios = [
  {
    badge: "Software",
    title: "Desarrollo a medida",
    text: "Plataformas web, móviles y APIs robustas para procesos críticos. Arquitectura limpia, código mantenible y ciclos cortos de entrega.",
    href: "/servicios#software",
  },
  {
    badge: "Cloud",
    title: "Infraestructura en la nube",
    text: "Migración, optimización y operación de cargas en AWS, Azure y GCP. Costos bajo control y escalabilidad real cuando la necesitas.",
    href: "/servicios#cloud",
  },
  {
    badge: "Ciberseguridad",
    title: "Defensa empresarial",
    text: "Hardening, EDR, gestión de identidades y respuesta a incidentes. Protegemos la operación sin frenar a la gente.",
    href: "/servicios#ciberseguridad",
  },
  {
    badge: "Data & IA",
    title: "Datos que deciden",
    text: "BI, analítica avanzada e IA aplicada a tu operación. Visibilidad, predicción y automatización donde realmente mueve la aguja.",
    href: "/servicios#data-ai",
  },
  {
    badge: "Conectividad",
    title: "Redes y telecomunicaciones",
    text: "Diseño, instalación y mantenimiento de redes, enlaces, CCTV y videovigilancia profesional con monitoreo central.",
    href: "/servicios#conectividad",
  },
  {
    badge: "Transformación",
    title: "Acompañamiento estratégico",
    text: "Roadmaps tecnológicos, optimización de procesos y gobierno de TI. De la estrategia a la operación, con métricas claras.",
    href: "/servicios#transformacion",
  },
];

const proceso = [
  {
    title: "Diagnóstico",
    text: "Entendemos tu operación, tus dolores y tus objetivos antes de proponer nada.",
  },
  {
    title: "Diseño",
    text: "Proponemos arquitectura, alcance, tiempos y costos claros. Sin sorpresas.",
  },
  {
    title: "Implementación",
    text: "Ejecutamos con disciplina de campo, hitos visibles y entregas tempranas.",
  },
  {
    title: "Acompañamiento",
    text: "Soporte, monitoreo y mejora continua. Estamos cuando algo se complica.",
  },
];

const industrias = [
  { label: "Retail" },
  { label: "Manufactura" },
  { label: "Hospitalidad" },
  { label: "Salud" },
  { label: "Educación" },
  { label: "Gobierno" },
];

const metricas = [
  { value: "+10", label: "Años de experiencia" },
  { value: "+200", label: "Proyectos entregados" },
  { value: "99.9%", label: "Uptime promedio" },
  { value: "24/7", label: "Soporte continuo" },
];

// ────────────────────────────────────────────────────────────────
// Iconos en SVG inline (reemplazan dependencias externas).
// ────────────────────────────────────────────────────────────────

const IconShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const IconClock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IconAward = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="9" r="6" />
    <path d="M8.5 14L7 22l5-3 5 3-1.5-8" />
  </svg>
);
const IconMap = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15M15 6v15" />
  </svg>
);
const IconBrain = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4 4 4 0 0 0 4-4V8a4 4 0 0 0-4-4z" />
    <path d="M8 8a3 3 0 0 1-3 3M8 16a3 3 0 0 0-3-3M16 8a3 3 0 0 0 3 3M16 16a3 3 0 0 1 3-3" />
  </svg>
);
const IconHeart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);
const IconTrend = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M17 7h4v4" />
  </svg>
);
const IconCode = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);
const IconCloud = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 18a4 4 0 0 0 0-8 6 6 0 0 0-11.6-1.5A4.5 4.5 0 0 0 6.5 18z" />
  </svg>
);
const IconNetwork = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="3" width="6" height="6" rx="1" />
    <rect x="9" y="15" width="6" height="6" rx="1" />
    <path d="M6 9v3h12V9M12 12v3" />
  </svg>
);
const IconChart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="20" x2="4" y2="10" />
    <line x1="10" y1="20" x2="10" y2="4" />
    <line x1="16" y1="20" x2="16" y2="13" />
    <line x1="22" y1="20" x2="2" y2="20" />
  </svg>
);
const IconCompass = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" />
  </svg>
);
const IconStore = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l1-5h16l1 5M4 9v11h16V9M9 22V12h6v10" />
  </svg>
);
const IconFactory = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21V10l5 3V10l6 3V8l6 3v10z" />
    <path d="M7 17h2M11 17h2M15 17h2" />
  </svg>
);
const IconHotel = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21V3h18v18M3 12h18M7 7h3M7 15h3M14 7h3M14 15h3" />
  </svg>
);
const IconHospital = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 21V5h14v16M9 11h6M12 8v6" />
  </svg>
);
const IconBook = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h12a4 4 0 0 1 4 4v12M4 4v16h12a4 4 0 0 1 4 0M4 4a4 4 0 0 0 4 4h8" />
  </svg>
);
const IconBuilding = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21V5l9-3 9 3v16" />
    <path d="M8 21v-7h8v7M9 9h.01M13 9h.01M9 13h.01M13 13h.01" />
  </svg>
);

const industriaIcons: Record<string, JSX.Element> = {
  Retail: IconStore,
  Manufactura: IconFactory,
  Hospitalidad: IconHotel,
  Salud: IconHospital,
  Educación: IconBook,
  Gobierno: IconBuilding,
};

const servicioIcons: Record<string, JSX.Element> = {
  Software: IconCode,
  Cloud: IconCloud,
  Ciberseguridad: IconShield,
  "Data & IA": IconChart,
  Conectividad: IconNetwork,
  Transformación: IconCompass,
};

const pilarIcons = [IconBrain, IconShield, IconHeart, IconTrend];

export default function NexaraPage() {
  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    url: siteUrl,
    name: "NEXARA",
    logo: `${siteUrl}/logo-nexara.png`,
    description:
      "Empresa de integracion tecnologica enfocada en continuidad operativa y resultados empresariales.",
  };

  return (
    <main className={`${baseStyles.brochurePage} home-main-flush`} aria-label="Nexara — Inicio">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />

      {/* Hero a pantalla completa (mantiene su propio fondo #03110d) */}
      <HomeHero />

      {/* Contenedor de todas las secciones del cuerpo */}
      <div className={styles.homeWrap}>
        <div className={styles.homeBg} aria-hidden />
        <div className={styles.homeInner}>
          {/* ── 1. Trust strip ── */}
          <section className={styles.trustStrip} aria-label="Garantías Nexara" data-reveal="up">
            <div className={styles.trustItem}>
              <span className={styles.trustIcon} aria-hidden>{IconAward}</span>
              <div className={styles.trustText}>
                <span className={styles.trustValue}>{trustItems[0].value}</span>
                <span className={styles.trustLabel}>{trustItems[0].label}</span>
              </div>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon} aria-hidden>{IconClock}</span>
              <div className={styles.trustText}>
                <span className={styles.trustValue}>{trustItems[1].value}</span>
                <span className={styles.trustLabel}>{trustItems[1].label}</span>
              </div>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon} aria-hidden>{IconShield}</span>
              <div className={styles.trustText}>
                <span className={styles.trustValue}>{trustItems[2].value}</span>
                <span className={styles.trustLabel}>{trustItems[2].label}</span>
              </div>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon} aria-hidden>{IconMap}</span>
              <div className={styles.trustText}>
                <span className={styles.trustValue}>{trustItems[3].value}</span>
                <span className={styles.trustLabel}>{trustItems[3].label}</span>
              </div>
            </div>
          </section>

          {/* ── 2. Pilares ── */}
          <section aria-label="Nuestros pilares" data-reveal="up">
            <header className={`${styles.sectionHead} ${styles.sectionHeadCenter}`}>
              <p className={styles.eyebrow}>Lo que nos define</p>
              <h2 className={styles.sectionTitle}>
                Cuatro pilares <em className={styles.sectionTitleAccent}>que sostienen</em> cada proyecto
              </h2>
              <p className={styles.sectionLead}>
                No vendemos tecnología, vendemos resultados. Estos son los principios con los que
                operamos todos los días, con cada cliente y en cada entrega.
              </p>
            </header>
            <div className={styles.pilaresGrid} data-reveal-stagger>
              {pilares.map((p, i) => (
                <article key={p.title} className={styles.pilarCard} data-reveal="up">
                  <span className={styles.pilarIcon} aria-hidden>{pilarIcons[i]}</span>
                  <h3 className={styles.pilarTitle}>{p.title}</h3>
                  <p className={styles.pilarText}>{p.text}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── 3. Servicios destacados ── */}
          <section id="servicios" aria-label="Servicios destacados" data-reveal="up">
            <header className={styles.sectionHead}>
              <p className={styles.eyebrow}>Qué hacemos</p>
              <h2 className={styles.sectionTitle}>
                Servicios pensados para <em className={styles.sectionTitleAccent}>operaciones reales</em>
              </h2>
              <p className={styles.sectionLead}>
                Cobertura de extremo a extremo: desde el diseño y la implementación, hasta el
                monitoreo y la mejora continua. Sin entregar y desaparecer.
              </p>
            </header>
            <div className={styles.serviciosGrid} data-reveal-stagger>
              {servicios.map((s) => (
                <Link key={s.title} href={s.href} className={styles.servicioCard} data-reveal="up">
                  <div className={styles.servicioHead}>
                    <span className={styles.servicioIcon} aria-hidden>
                      {servicioIcons[s.badge] ?? IconCompass}
                    </span>
                    <span className={styles.servicioBadge}>{s.badge}</span>
                  </div>
                  <div>
                    <h3 className={styles.servicioTitle}>{s.title}</h3>
                    <p className={styles.servicioText} style={{ marginTop: 8 }}>{s.text}</p>
                  </div>
                  <span className={styles.servicioCta}>
                    Ver detalle <span aria-hidden>→</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── 4. Proceso ── */}
          <section id="proceso" aria-label="Cómo trabajamos" data-reveal="up">
            <header className={`${styles.sectionHead} ${styles.sectionHeadCenter}`}>
              <p className={styles.eyebrow}>Cómo trabajamos</p>
              <h2 className={styles.sectionTitle}>
                Un método <em className={styles.sectionTitleAccent}>claro y predecible</em>
              </h2>
              <p className={styles.sectionLead}>
                Cuatro fases visibles, hitos cortos y comunicación honesta en cada paso. Sabes en
                qué punto estás y qué sigue.
              </p>
            </header>
            <div className={styles.procesoGrid} data-reveal-stagger>
              {proceso.map((p, i) => (
                <div key={p.title} className={styles.procesoStep} data-reveal="up">
                  <span className={styles.procesoNumber} aria-hidden>{i + 1}</span>
                  <h3 className={styles.procesoStepTitle}>{p.title}</h3>
                  <p className={styles.procesoStepText}>{p.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── 5. Industrias ── */}
          <section aria-label="Industrias que atendemos" data-reveal="up">
            <header className={`${styles.sectionHead} ${styles.sectionHeadCenter}`}>
              <p className={styles.eyebrow}>Sectores</p>
              <h2 className={styles.sectionTitle}>
                Hablamos el idioma de tu <em className={styles.sectionTitleAccent}>industria</em>
              </h2>
              <p className={styles.sectionLead}>
                Cada sector tiene su ritmo, sus normas y sus prioridades. Adaptamos la solución a
                tu realidad operativa, no al revés.
              </p>
            </header>
            <div className={styles.industriasGrid} data-reveal-stagger>
              {industrias.map((ind) => (
                <article key={ind.label} className={styles.industriaCard} data-reveal="up">
                  <span className={styles.industriaIcon} aria-hidden>
                    {industriaIcons[ind.label] ?? IconBuilding}
                  </span>
                  <span className={styles.industriaLabel}>{ind.label}</span>
                </article>
              ))}
            </div>
          </section>

          {/* ── 6. Métricas ── */}
          <section aria-label="Métricas Nexara" data-reveal="up">
            <div className={styles.metricasShell}>
              <header className={`${styles.sectionHead} ${styles.sectionHeadCenter}`} style={{ marginBottom: 0 }}>
                <p className={styles.eyebrow}>Nuestros números</p>
                <h2 className={styles.sectionTitle}>
                  Resultados que <em className={styles.sectionTitleAccent}>se cuentan</em>
                </h2>
              </header>
              <div className={styles.metricasGrid} data-reveal-stagger>
                {metricas.map((m) => (
                  <div key={m.label} className={styles.metrica} data-reveal="up">
                    <span className={styles.metricaValue}>{m.value}</span>
                    <span className={styles.metricaLabel}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── 7. Quiénes somos refinado ── */}
          <section aria-label="Sobre Nexara" data-reveal="up">
            <div className={styles.aboutCard}>
              <div className={styles.aboutBody}>
                <p className={styles.eyebrow}>¿Quiénes somos?</p>
                <h2 className={styles.sectionTitle}>
                  Tecnología integrada con <em className={styles.sectionTitleAccent}>enfoque operativo</em>
                </h2>
                <p className={styles.sectionLead}>
                  NEXARA es una empresa de integración de TI, equipamiento y servicios de extremo
                  a extremo. Alineamos tecnología, procesos y personas para resolver problemas
                  reales de operación: combinamos experiencia de campo, disciplina de ejecución y
                  una cultura de servicio que privilegia la continuidad del negocio y los
                  resultados medibles.
                </p>
                <div className={styles.aboutActions}>
                  <Link
                    href="/nosotros"
                    data-track-conversion="home_about_cta"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                  >
                    Conoce al equipo
                    <span aria-hidden className={styles.btnArrow}>→</span>
                  </Link>
                  <Link
                    href="/contacto"
                    data-track-conversion="home_contact_cta"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                  >
                    Hablar con un especialista
                    <span aria-hidden className={styles.btnArrow}>→</span>
                  </Link>
                </div>
              </div>
              <aside className={styles.aboutAside} aria-label="Compromisos Nexara">
                <div className={styles.aboutAsideRow}>
                  <span className={styles.aboutAsideIcon} aria-hidden>{IconShield}</span>
                  <div>
                    <h3 className={styles.aboutAsideTitle}>Seguridad por diseño</h3>
                    <p className={styles.aboutAsideText}>
                      Cada solución parte de un análisis de riesgo. Protegemos tu información y tu
                      operación desde el primer commit.
                    </p>
                  </div>
                </div>
                <div className={styles.aboutAsideRow}>
                  <span className={styles.aboutAsideIcon} aria-hidden>{IconClock}</span>
                  <div>
                    <h3 className={styles.aboutAsideTitle}>Respuesta real</h3>
                    <p className={styles.aboutAsideText}>
                      Acuerdos de servicio con SLAs claros. Te decimos qué esperar y cumplimos lo
                      acordado, no lo que se vea bien en una propuesta.
                    </p>
                  </div>
                </div>
                <div className={styles.aboutAsideRow}>
                  <span className={styles.aboutAsideIcon} aria-hidden>{IconHeart}</span>
                  <div>
                    <h3 className={styles.aboutAsideTitle}>Equipo asignado</h3>
                    <p className={styles.aboutAsideText}>
                      Personas concretas que conocen tu operación, no un genérico que rota cada
                      ticket. Continuidad humana y técnica.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          {/* ── 8. Marcas / certificaciones ── */}
          <section aria-label="Marcas y certificaciones" data-reveal="up">
            <header className={`${styles.sectionHead} ${styles.sectionHeadCenter}`}>
              <p className={styles.eyebrow}>Confianza</p>
              <h2 className={styles.sectionTitle}>
                Tecnologías <em className={styles.sectionTitleAccent}>certificadas</em> y marcas que respaldamos
              </h2>
            </header>
            <div className={styles.partnersShell}>
              <CertificationsCarousel />
              <BrandsCarousel />
            </div>
          </section>

          {/* ── 9. CTA final ── */}
          <section aria-label="Empecemos a trabajar juntos" data-reveal="up">
            <div className={styles.ctaFinal}>
              <span className={styles.ctaFinalGlow} aria-hidden />
              <p className={styles.eyebrow} style={{ justifyContent: "center", display: "inline-flex" }}>
                Listos cuando tú lo estés
              </p>
              <h2 className={styles.ctaFinalTitle}>
                Hablemos de cómo <em className={styles.sectionTitleAccent}>blindar tu operación</em>
              </h2>
              <p className={styles.ctaFinalText}>
                Una conversación honesta, sin compromiso. Te decimos qué se puede mejorar, qué
                tiene sentido invertir y qué no.
              </p>
              <div className={styles.ctaFinalActions}>
                <Link
                  href="/contacto"
                  data-track-conversion="home_cta_final_primary"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  Agendar conversación
                  <span aria-hidden className={styles.btnArrow}>→</span>
                </Link>
                <Link
                  href="/proyectos"
                  data-track-conversion="home_cta_final_secondary"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                >
                  Ver casos publicados
                  <span aria-hidden className={styles.btnArrow}>→</span>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
