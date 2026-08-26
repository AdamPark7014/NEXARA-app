import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import EditorialImage from "../../components/EditorialImage";
import LogoStrip from "../../components/LogoStrip";
import heroStyles from "../../components/PublicPageHero.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("nosotros");
}

export const dynamic = "force-dynamic";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

const principios = [
  {
    title: "Claridad",
    text: "Construimos confianza mediante una comunicación transparente. Alcances, tiempos, costos y riesgos se definen desde el inicio para mantener expectativas claras y decisiones informadas.",
  },
  {
    title: "Ingeniería basada en la realidad",
    text: "Cada solución nace del análisis del entorno operativo. Diseñamos pensando en la implementación, la mantenibilidad y el desempeño, no únicamente en la teoría.",
  },
  {
    title: "Compromiso continuo",
    text: "La entrega es el inicio de una relación, no el final del proyecto. Brindamos seguimiento, soporte técnico y mejora continua para garantizar la estabilidad y evolución de cada implementación.",
  },
];

/** Datos operativos reales — mismos claims que la home. */
const OPERACION = [
  { label: "Sedes", value: "Puebla · Ciudad de México, con cobertura nacional" },
  { label: "Modelo", value: "Diseño, instalación y soporte bajo una sola responsabilidad técnica" },
  { label: "Respuesta", value: "Típicamente en menos de 24 horas en horario laboral" },
  { label: "Método", value: "Diagnóstico en sitio antes de la propuesta; entrega documentada" },
];

/** Certificaciones y alianzas técnicas — assets reales en /public/certificaciones. */
const CERTIFICACIONES = [
  { src: "/certificaciones/certificaciones-01.png", alt: "Linksys" },
  { src: "/certificaciones/certificaciones-02.png", alt: "Belden" },
  { src: "/certificaciones/certificaciones-03.png", alt: "Intellinet" },
  { src: "/certificaciones/certificaciones-04.png", alt: "Lenovo SEG Silver Partner" },
  { src: "/certificaciones/certificaciones-04.1.png.webp", alt: "Lenovo SEG Authorized Solutions" },
  { src: "/certificaciones/certificaciones-05.png.jpeg", alt: "Grandstream" },
  { src: "/certificaciones/certificaciones-06.png", alt: "HikVision" },
  { src: "/certificaciones/certificaciones-07.png", alt: "Sophos" },
  { src: "/certificaciones/certificaciones-08.png", alt: "Mimosa" },
  { src: "/certificaciones/certificaciones-09.png.jpeg", alt: "Dell Technologies Authorized Partner" },
];

const expertosFallback = [
  { name: "Ing. Alejandro Gonzales Bustamante", role: "Ingeniero de Sistemas" },
  { name: "Ing. Carolina Juarez Alvarez", role: "Ingeniera de soporte" },
  { name: "Lic. Karen Elizalde Sarmiento", role: "Dirección Administrativa & Comercial" },
  { name: "Ing. Luis Joel Aguilar", role: "Coordinador de Operaciones" },
  { name: "Ing. David Morales Zenon", role: "IDC / Instalador" },
  { name: "Ing. Julio Cesar Rivera Vazquez", role: "IDC / Instalador" },
  { name: "Ing. Israel Ramos Lima", role: "IDC / Instalador" },
];

type PublicTeamUser = {
  id: number;
  nombre: string;
  avatarUrl?: string | null;
  role?: { nombre?: string | null } | null;
};

type ExpertCard = {
  key: string;
  name: string;
  role: string;
  avatarUrl?: string;
};

const getInitials = (name: string) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return (parts.map((p) => p.charAt(0).toUpperCase()).join("") || "NX").slice(0, 2);
};

const fetchPublicExperts = async (): Promise<ExpertCard[]> => {
  try {
    const response = await fetch(buildApiUrl("users/public-team?limit=12"), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return expertosFallback.map((expert, index) => ({
        key: `fallback-${index}`,
        name: expert.name,
        role: expert.role,
      }));
    }

    const raw = (await response.json()) as PublicTeamUser[];
    // Cuentas internas/de prueba no pertenecen al equipo público.
    const data = Array.isArray(raw)
      ? raw.filter((u) => !/revisor\s*google\s*play|reviewer|cuenta\s*de\s*prueba/i.test(u.nombre || ""))
      : raw;
    if (!Array.isArray(data) || data.length === 0) {
      return expertosFallback.map((expert, index) => ({
        key: `fallback-${index}`,
        name: expert.name,
        role: expert.role,
      }));
    }

    return data.map((user, index) => ({
      key: String(user.id ?? `expert-${index}`),
      name: user.nombre || "NEXARA",
      role: user.role?.nombre || "Especialista",
      avatarUrl: resolveUserAvatarUrl(user.avatarUrl),
    }));
  } catch {
    return expertosFallback.map((expert, index) => ({
      key: `fallback-${index}`,
      name: expert.name,
      role: expert.role,
    }));
  }
};

export default async function NosotrosPage() {
  const [expertos, visuals] = await Promise.all([
    fetchPublicExperts(),
    fetchPageVisuals("page_nosotros"),
  ]);
  const storyImg = visuals.slots[0];
  const heroDesktop = resolvePageMediaUrl(visuals.heroDesktopUrl);
  const heroMobile = resolvePageMediaUrl(visuals.heroMobileUrl || visuals.heroDesktopUrl);

  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${siteUrl}/nosotros`,
    name: "Nosotros · Nexara",
    mainEntity: {
      "@type": "Organization",
      name: "NEXARA",
      url: siteUrl,
      logo: `${siteUrl}/logo-nexara-lockup.png`,
      description:
        "Integrador tecnológico en México: CCTV, redes, cómputo y soporte con disciplina de campo.",
    },
  };

  return (
    <main className={`${shared.page} home-main-flush`} aria-label="Sobre nosotros — Nexara">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />

      <PublicPageHero
        eyebrow="Nosotros"
        title={
          <>
            Personas detrás de{" "}
            <span className={heroStyles.titleAccent}>cada solución</span>
          </>
        }
        lead="Ingeniería, implementación y soporte con un solo compromiso: que tu tecnología funcione cuando más la necesitas. Desde nuestras sedes en Puebla y Ciudad de México, diseñamos, implementamos y respaldamos soluciones tecnológicas para empresas en todo México. Acompañamos cada proyecto desde la planeación hasta la operación, con procesos documentados, atención especializada y soporte continuo."
        imageSrc={heroDesktop}
        imageSrcMobile={heroMobile}
        imageAlt={visuals.heroAlt}
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <div className={styles.storySplit}>
            <div className={styles.storyBlock}>
              <p className={shared.eyebrow}>Quiénes somos</p>
              <h2 className={styles.storyTitle}>
                Donde la tecnología{" "}
                <span className={shared.sectionTitleAccent}>se convierte en resultados</span>
              </h2>
              <p className={styles.storyLead}>
                En NEXARA desarrollamos soluciones que fortalecen la operación de las empresas. Cada proyecto se diseña con una visión integral, priorizando la continuidad, la seguridad y el rendimiento de la infraestructura tecnológica.
              </p>
              <p className={styles.storyLeadSecondary}>
                No solo entregamos un proyecto: construimos relaciones de largo plazo respaldadas por experiencia técnica, metodologías claras y un servicio cercano.
              </p>
              <ul className={`${shared.factList} ${styles.storyFacts}`}>
                {OPERACION.map((f) => (
                  <li key={f.label} className={shared.factRow}>
                    <span className={shared.factLabel}>{f.label}</span>
                    <p className={shared.factValue}>{f.value}</p>
                  </li>
                ))}
              </ul>
            </div>
            {storyImg?.desktopUrl ? (
              <div className={styles.storyMedia}>
                <EditorialImage
                  desktopUrl={storyImg.desktopUrl}
                  mobileUrl={storyImg.mobileUrl}
                  alt={storyImg.alt}
                  caption={storyImg.caption}
                  layout={storyImg.layout}
                  objectPosition={storyImg.objectPosition}
                  compose="solo"
                  priority
                />
              </div>
            ) : null}
          </div>

          <div className={styles.storyDetailGrid} data-reveal="up">
            <p className={styles.storyLeadSecondary}>
              Transformamos necesidades tecnológicas en soluciones confiables mediante un proceso que integra consultoría, diseño, implementación y soporte especializado. Cada entrega está documentada, validada y orientada a garantizar una operación estable desde el primer día.
            </p>
            <p className={styles.storyLeadSecondary}>
              Con cobertura nacional y presencia en Puebla y Ciudad de México, integramos videovigilancia, redes empresariales, infraestructura, Wi‑Fi, cómputo y soporte TI bajo una sola responsabilidad técnica. Un solo equipo, un solo proceso y un único compromiso con la calidad de cada proyecto.
            </p>
          </div>
          <p className={styles.storyCta}>
            <Link href="/proyectos" data-track-conversion="nosotros_proyectos_link">
              Ver casos de campo →
            </Link>
          </p>
        </div>
      </section>

      <section id="valores" className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.sectionHead}>
            <p className={shared.eyebrow}>Principios</p>
            <h2 className={shared.sectionTitle}>
              Cómo nos <span className={shared.sectionTitleAccent}>comportamos</span>
            </h2>
          </div>
          <div className={shared.principleGrid} data-reveal-stagger>
            {principios.map((v) => (
              <div key={v.title} className={shared.principleItem} data-reveal="up">
                <h3 className={shared.principleTitle}>{v.title}</h3>
                <p className={shared.principleText}>{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="certificaciones"
        className={`${shared.sectionTight} ${shared.sectionDivider}`}
        aria-label="Certificaciones"
        data-reveal="soft"
      >
        <div className={shared.inner}>
          <LogoStrip
            label="Certificaciones y alianzas técnicas"
            items={CERTIFICACIONES}
            display="marquee"
            rows={1}
          />
        </div>
      </section>

      <section id="equipo" className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.sectionHead}>
            <p className={shared.eyebrow}>Equipo</p>
            <h2 className={shared.sectionTitle}>
              Quién hace <span className={shared.sectionTitleAccent}>el trabajo</span>
            </h2>
            <p className={shared.sectionLead}>
              Ingeniería, operaciones e instalación — las personas detrás de cada entrega.
            </p>
          </div>
          <div className={shared.teamGrid} data-reveal-stagger>
            {expertos.slice(0, 8).map((ex) => (
              <article key={ex.key} className={shared.teamCard} data-reveal="up">
                <div className={shared.teamPhoto}>
                  {ex.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ex.avatarUrl} alt={`Foto de ${ex.name}`} loading="lazy" decoding="async" />
                  ) : (
                    <span className={shared.teamInitials} aria-hidden>
                      {getInitials(ex.name)}
                    </span>
                  )}
                </div>
                <p className={shared.teamName}>{ex.name}</p>
                <p className={shared.teamRole}>{ex.role}</p>
              </article>
            ))}
          </div>
          <p className={styles.storyCta}>
            <Link href="/contacto" data-track-conversion="nosotros_team_cta">
              Platiquemos →
            </Link>
          </p>
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>Siguiente paso</p>
            <h2 className={shared.ctaTitle}>¿Listo para trabajar juntos?</h2>
            <p className={shared.ctaLead}>
              Cuéntanos tu alcance y te respondemos con diagnóstico y propuesta — sin compromiso.
            </p>
            <div className={shared.ctaActions}>
              <Link
                href="/contacto"
                className={`${shared.btn} ${shared.btnPrimary}`}
                data-track-conversion="nosotros_footer_cta"
              >
                Cotiza tu proyecto <span className={shared.btnArrow}>→</span>
              </Link>
              <a
                href={buildWhatsAppLeadUrl({
                  industryName: "mi empresa",
                  serviceName: "CCTV, redes o soporte",
                  path: "/nosotros",
                })}
                target="_blank"
                rel="noopener noreferrer"
                className={`${shared.btn} ${shared.btnSecondary}`}
                data-track-conversion="nosotros_wa"
              >
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
