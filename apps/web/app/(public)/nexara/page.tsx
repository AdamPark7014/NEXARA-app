import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./home-sections.module.css";
import HomeHero from "../../components/HomeHero";
import EditorialImage from "../../components/EditorialImage";
import {
  fetchPageSection,
  fetchPageVisuals,
  DEFAULT_PROCESO,
  DEFAULT_INDUSTRIAS,
  DEFAULT_CTA,
  INDUSTRIA_SLUGS,
  type ProcesoItem,
  type CtaContent,
} from "@/lib/page-content-api";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nexara | Soluciones inteligentes para un mundo conectado",
  description:
    "Integración tecnológica en México: CCTV, redes, cómputo y soporte TI con disciplina de campo.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Nexara | Mundo conectado",
    description: "CCTV, redes, cómputo y soporte con una sola firma responsable.",
    images: [{ url: "/logo-nexara-lockup.png", width: 1200, height: 630, alt: "Nexara" }],
  },
};

export const dynamic = "force-dynamic";

const CAPABILITIES = [
  {
    id: "cctv",
    title: "Videovigilancia",
    text: "Diseño de cobertura, NVR/VMS, acceso remoto y mantenimiento con evidencia — no solo montar cámaras.",
  },
  {
    id: "redes",
    title: "Redes y Wi‑Fi",
    text: "Cableado, switching y Wi‑Fi empresarial documentado para una o varias sedes, listo para operar.",
  },
  {
    id: "computo",
    title: "Cómputo e infraestructura",
    text: "Estaciones, servidores, racks y respaldos con imagen estándar para que el día a día no dependa de parches.",
  },
  {
    id: "soporte",
    title: "Soporte TI",
    text: "Mesa de ayuda remota y visitas en sitio, con tiempos de respuesta claros después del go-live.",
  },
  {
    id: "software",
    title: "Plataformas a medida",
    text: "Portales e integraciones acotadas al flujo real: alcance cerrado, entrega por fases.",
  },
];

const METRICS = [
  { value: "1 firma", label: "Diseño, instalación y soporte bajo el mismo contrato" },
  { value: "Puebla · CDMX", label: "Base operativa con cobertura nacional" },
  { value: "< 24 h", label: "Respuesta típica en horario laboral" },
  { value: "Campo", label: "Diagnóstico en sitio antes de la propuesta" },
];

const INDUSTRIA_BLURBS: Record<string, { risk: string; text: string }> = {
  Retail: {
    risk: "Multi-sede",
    text: "CCTV por sucursal, Wi‑Fi estable y soporte de punta de venta sin reinventar cada apertura.",
  },
  Manufactura: {
    risk: "Uptime de planta",
    text: "Redes industriales, perímetro y continuidad en equipos donde una caída cuesta un turno.",
  },
  Hospitalidad: {
    risk: "Experiencia huésped",
    text: "Wi‑Fi denso, vigilancia y operación unificada por propiedad, no por “mejor esfuerzo”.",
  },
  Salud: {
    risk: "Continuidad",
    text: "Segmentación, respaldos y soporte prioritario para que la red no sea el cuello de botella clínico.",
  },
  Educación: {
    risk: "Campus",
    text: "Wi‑Fi, CCTV y mesa de ayuda pensados para aulas, laboratorios y edificios administrativos.",
  },
  Gobierno: {
    risk: "Auditoría",
    text: "Modernización por fases con documentación clara y entregables que se pueden revisar.",
  },
};

const resolveIndustriaSlug = (label: string) =>
  INDUSTRIA_SLUGS[label] || label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default async function NexaraPage() {
  const [procesoData, industriasData, ctaData, visuals] = await Promise.all([
    fetchPageSection<{ items: ProcesoItem[] }>("home_proceso"),
    fetchPageSection<{ items: string[] }>("home_industrias"),
    fetchPageSection<CtaContent>("home_cta"),
    fetchPageVisuals("page_home"),
  ]);

  const proceso = (procesoData?.items ?? DEFAULT_PROCESO).slice(0, 3);
  const industrias = (industriasData?.items ?? DEFAULT_INDUSTRIAS).slice(0, 4);
  const cta = ctaData ?? DEFAULT_CTA;
  const slotCaps = visuals.slots.find((s) => s.id === "home_band_capabilities");
  const slotInd = visuals.slots.find((s) => s.id === "home_band_industrias");

  return (
    <main className={`${shared.page} home-main-flush`} aria-label="Nexara — Inicio">
      <HomeHero />

      <div className={styles.homeBody}>
        <section className={shared.section} aria-label="Capacidades" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${styles.headSplit}`}>
              <div>
                <p className={shared.eyebrow}>Capacidades</p>
                <h2 className={shared.sectionTitle}>
                  Lo que instalamos y <span className={shared.sectionTitleAccent}>sostenemos</span>
                </h2>
              </div>
              <p className={`${shared.sectionLead} ${styles.headLead}`}>
                Cinco líneas con entregable concreto. Una sola firma responsable del diseño, la instalación y el soporte.
              </p>
            </header>
            <div className={shared.capList} data-reveal-stagger>
              {CAPABILITIES.map((cap, i) => (
                <Link
                  key={cap.id}
                  href={`/servicios#${cap.id}`}
                  className={shared.capRow}
                  data-reveal="up"
                >
                  <span className={shared.capNum}>0{i + 1}</span>
                  <div>
                    <h3 className={shared.capTitle}>{cap.title}</h3>
                    <p className={shared.capText}>{cap.text}</p>
                  </div>
                  <span className={shared.capGo} aria-hidden>
                    →
                  </span>
                </Link>
              ))}
            </div>
            <p className={styles.sectionMore}>
              <Link href="/servicios">Detalle por línea →</Link>
            </p>
          </div>
        </section>

        {slotCaps?.desktopUrl ? (
          <div className={`${shared.sectionImageBandBleed} ${styles.visualBridge}`}>
            <EditorialImage
              desktopUrl={slotCaps.desktopUrl}
              mobileUrl={slotCaps.mobileUrl}
              alt={slotCaps.alt}
              caption={slotCaps.caption || "Campo y entrega — entre el diseño y el soporte."}
              kicker="En sitio"
              title={slotCaps.caption ? undefined : "Donde la propuesta se vuelve instalación"}
              layout={slotCaps.layout}
              objectPosition={slotCaps.objectPosition}
              compose="caption-bar"
            />
          </div>
        ) : null}

        <section id="proceso" className={`${shared.section} ${styles.band}`} data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${styles.headSplit}`}>
              <div>
                <p className={shared.eyebrow}>Método</p>
                <h2 className={shared.sectionTitle}>
                  De diagnóstico a <span className={shared.sectionTitleAccent}>operación</span>
                </h2>
              </div>
              <p className={`${shared.sectionLead} ${styles.headLead}`}>
                Tres fases con alcance cerrado. Sabes qué se instala, cuándo y quién responde después.
              </p>
            </header>
            <div className={shared.timeline} data-reveal-stagger>
              {proceso.map((p) => (
                <div key={p.title} className={shared.timelineStep} data-reveal="up">
                  <span className={shared.timelineDot} aria-hidden />
                  <span className={shared.timelineNum}>{p.num}</span>
                  <h3 className={shared.timelineTitle}>{p.title}</h3>
                  <p className={shared.timelineText}>{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={shared.sectionTight} aria-label="Cifras operativas" data-reveal="soft">
          <div className={shared.inner}>
            <div className={shared.metricsStrip}>
              {METRICS.map((m) => (
                <div key={m.value} className={shared.metric}>
                  <span className={shared.metricValue}>{m.value}</span>
                  <span className={shared.metricLabel}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {slotInd?.desktopUrl ? (
          <div className={`${shared.sectionImageBandBleed} ${styles.visualBridge}`}>
            <EditorialImage
              desktopUrl={slotInd.desktopUrl}
              mobileUrl={slotInd.mobileUrl}
              alt={slotInd.alt}
              caption={slotInd.caption || "Cada industria con su riesgo; cada sitio con su alcance."}
              kicker="Sectores"
              title={slotInd.caption ? undefined : "Antes de hablar de verticales"}
              layout={slotInd.layout}
              objectPosition={slotInd.objectPosition}
              compose="caption-bar"
            />
          </div>
        ) : null}

        <section className={shared.section} aria-label="Industrias" data-reveal="up">
          <div className={shared.inner}>
            <header className={`${shared.sectionHead} ${styles.headSplit}`}>
              <div>
                <p className={shared.eyebrow}>Sectores</p>
                <h2 className={shared.sectionTitle}>
                  Verticales con <span className={shared.sectionTitleAccent}>riesgo real</span>
                </h2>
              </div>
              <p className={`${shared.sectionLead} ${styles.headLead}`}>
                No vendemos el mismo paquete a todos. Cada industria tiene su propio fallo típico; armamos alrededor de eso.
              </p>
            </header>
            <div className={shared.industryBoard} data-reveal-stagger>
              {industrias.map((ind) => {
                const label = typeof ind === "string" ? ind : String(ind);
                const blurb = INDUSTRIA_BLURBS[label];
                return (
                  <Link
                    key={label}
                    href={`/soluciones/${resolveIndustriaSlug(label)}`}
                    className={shared.industryCell}
                    data-reveal="up"
                  >
                    {blurb?.risk ? (
                      <span className={shared.industryRisk}>{blurb.risk}</span>
                    ) : null}
                    <h3 className={shared.industryCellTitle}>{label}</h3>
                    <p className={shared.industryCellText}>
                      {blurb?.text || "Solución a la medida de tu operación."}
                    </p>
                    <span className={shared.industryCellLink}>Ver solución →</span>
                  </Link>
                );
              })}
            </div>
            <p className={styles.sectionMore}>
              <Link href="/soluciones">Todas las industrias →</Link>
            </p>
          </div>
        </section>

        <section className={`${shared.section} ${styles.ctaSection}`} aria-label="Empecemos" data-reveal="up">
          <div className={shared.inner}>
            <div className={shared.ctaBand}>
              <p className={shared.ctaEyebrow}>{cta.eyebrow}</p>
              <h2 className={shared.ctaTitle}>
                {cta.title} <span className={shared.sectionTitleAccent}>{cta.titleAccent}</span>
              </h2>
              <p className={shared.ctaLead}>{cta.text}</p>
              <div className={shared.ctaActions}>
                <Link
                  href={cta.primaryHref}
                  className={`${shared.btn} ${shared.btnPrimary}`}
                  data-track-conversion="home_cta_primary"
                >
                  {cta.primaryLabel} <span className={shared.btnArrow} aria-hidden>→</span>
                </Link>
                <Link
                  href={cta.secondaryHref}
                  className={`${shared.btn} ${shared.btnSecondary}`}
                  data-track-conversion="home_cta_secondary"
                >
                  {cta.secondaryLabel}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
