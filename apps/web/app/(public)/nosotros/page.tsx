import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import LogoStrip from "../../components/LogoStrip";
import PublicIcon, { type PublicIconName } from "../../components/PublicIcon";
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

/** Feature flag — permitir mostrar fotos reales cuando existan oficiales. */
const SHOW_TEAM_PHOTOS = false;

const principios: { icon: PublicIconName; title: string; text: string }[] = [
  {
    icon: "target",
    title: "Claridad",
    text: "Alcances, tiempos, costos y riesgos se definen desde el inicio. Expectativas claras y decisiones informadas, sin sorpresas a mitad del proyecto.",
  },
  {
    icon: "hardhat",
    title: "Ingeniería basada en la realidad",
    text: "Cada solución nace del análisis del entorno operativo. Diseñamos pensando en la instalación, la mantenibilidad y el desempeño, no solo en la teoría.",
  },
  {
    icon: "refresh",
    title: "Compromiso continuo",
    text: "La entrega es el inicio de la relación. Seguimiento, soporte técnico y mejora continua para que cada implementación se mantenga estable y evolucione.",
  },
];

/** Datos operativos reales — mismos claims que la home. */
const OPERACION: { icon: PublicIconName; label: string; value: string }[] = [
  { icon: "mapPin", label: "Sedes", value: "Puebla · Ciudad de México, con cobertura nacional" },
  { icon: "shield", label: "Modelo", value: "Diseño, instalación y soporte bajo una sola responsabilidad técnica" },
  { icon: "clock", label: "Respuesta", value: "Típicamente en menos de 24 horas en horario laboral" },
  { icon: "search", label: "Método", value: "Diagnóstico en sitio antes de la propuesta; entrega documentada" },
];

const COMPROMISOS = [
  "Un solo responsable técnico del diagnóstico al soporte",
  "Propuesta con alcance cerrado y calendario visible",
  "Instalación documentada: diagramas, etiquetado y evidencia",
  "Soporte con SLA después del arranque",
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

/** Fotografías reales del equipo en campo (en /public/fotos). */
const EN_CAMPO = [
  {
    src: "/fotos/campo-instalacion-ap-altura.jpg",
    alt: "Técnico de NEXARA instalando un punto de acceso en altura",
    kicker: "Instalación",
    caption: "Punto de acceso exterior en campus",
    tall: true,
  },
  {
    src: "/fotos/campo-levantamiento-patio.jpg",
    alt: "Levantamiento técnico en patio de maniobras",
    kicker: "Diagnóstico",
    caption: "Levantamiento en sitio antes de la propuesta",
    tall: false,
  },
  {
    src: "/fotos/equipo-nexara-espalda.jpg",
    alt: "Equipo NEXARA en sitio",
    kicker: "Equipo",
    caption: "Ingeniería e instalación, el mismo equipo",
    tall: false,
  },
];

const expertosFallback = [
  { name: "Ing. Alejandro Gonzales Bustamante", role: "Ingeniero de Sistemas" },
  { name: "Ing. Carolina Juarez Alvarez", role: "Ingeniera de soporte" },
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
  const fallback = () =>
    expertosFallback.map((expert, index) => ({
      key: `fallback-${index}`,
      name: expert.name,
      role: expert.role,
    }));
  try {
    const response = await fetch(buildApiUrl("users/public-team?limit=12"), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return fallback();

    const raw = (await response.json()) as PublicTeamUser[];
    // Cuentas internas/de prueba no pertenecen al equipo público.
    const data = Array.isArray(raw)
      ? raw.filter((u) => !/revisor\s*google\s*play|reviewer|cuenta\s*de\s*prueba/i.test(u.nombre || ""))
      : raw;
    if (!Array.isArray(data) || data.length === 0) return fallback();

    return data.map((user, index) => ({
      key: String(user.id ?? `expert-${index}`),
      name: user.nombre || "NEXARA",
      role: user.role?.nombre || "Especialista",
      avatarUrl: resolveUserAvatarUrl(user.avatarUrl),
    }));
  } catch {
    return fallback();
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
  const storyPhoto = storyImg?.desktopUrl
    ? { src: resolvePageMediaUrl(storyImg.desktopUrl), alt: storyImg.alt || "Equipo de campo NEXARA" }
    : { src: "/fotos/equipo-nexara-polos.jpg", alt: "Equipo de campo NEXARA" };

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
        lead="Ingeniería, instalación y soporte que mantienen tu operación — Puebla y CDMX, cobertura nacional."
        imageSrc={heroDesktop}
        imageSrcMobile={heroMobile}
        imageAlt={visuals.heroAlt}
        actions={
          <>
            <Link href="/contacto" className={heroStyles.ctaPrimary} data-track-conversion="nosotros_hero_cta">
              Cotiza tu proyecto <span className={heroStyles.ctaArrow} aria-hidden>→</span>
            </Link>
            <Link href="/proyectos" className={heroStyles.ctaSecondary}>
              Ver casos de campo
            </Link>
          </>
        }
      />

      {/* Datos operativos: tarjeta que monta sobre el hero */}
      <section aria-label="Datos operativos" className={shared.statsBand}>
        <div className={shared.inner}>
          <div className={shared.statsCard}>
            <div className={shared.tileRow}>
              {OPERACION.map((f) => (
                <div key={f.label} className={shared.tile}>
                  <span className={`${shared.iconTile} ${shared.iconTileSm}`}>
                    <PublicIcon name={f.icon} />
                  </span>
                  <div>
                    <h3 className={shared.tileTitle}>{f.label}</h3>
                    <p className={shared.tileText}>{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quiénes somos */}
      <section className={shared.section} aria-label="Quiénes somos" data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.split}>
            <figure className={`${shared.photoFrame} ${shared.ar43} ${shared.splitMedia}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={storyPhoto.src} alt={storyPhoto.alt} loading="lazy" decoding="async" />
              <span className={shared.photoBadge}>Equipo NEXARA</span>
            </figure>
            <div className={shared.splitCopy}>
              <header className={shared.sectionHead}>
                <p className={shared.eyebrow}>Quiénes somos</p>
                <h2 className={shared.sectionTitle}>
                  Donde la tecnología{" "}
                  <span className={shared.sectionTitleAccent}>se convierte en resultados</span>
                </h2>
                <p className={shared.sectionLead}>
                  Somos un integrador con disciplina de campo: diseñamos, instalamos y sostenemos CCTV,
                  redes, cómputo y soporte para empresas que no pueden detenerse.
                </p>
              </header>
              <ul className={`${shared.checkList} ${shared.checkListSingle}`}>
                {COMPROMISOS.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className={shared.splitActions}>
                <Link href="/servicios" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Ver servicios <span className={shared.btnArrow} aria-hidden>→</span>
                </Link>
                <Link href="/proyectos" className={`${shared.btn} ${shared.btnSecondary}`} data-track-conversion="nosotros_proyectos_link">
                  Casos de campo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Principios */}
      <section id="valores" className={`${shared.sectionSpacious} ${shared.sectionLight}`} aria-label="Principios" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Principios</p>
            <h2 className={shared.sectionTitle}>
              Cómo nos <span className={shared.sectionTitleAccent}>comportamos</span>
            </h2>
            <p className={shared.sectionLead}>Tres compromisos que se notan en cada proyecto, del levantamiento al soporte.</p>
          </header>
          <div className={shared.principleGrid} data-reveal-stagger>
            {principios.map((v, i) => (
              <article key={v.title} className={shared.principleItem} data-reveal="up">
                <span className={shared.stepNumOpen}>0{i + 1}</span>
                <h3 className={shared.principleTitle}>{v.title}</h3>
                <p className={shared.principleText}>{v.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* En campo (banda navy con fotos reales) */}
      <section className={`${shared.section} ${shared.sectionNavy}`} aria-label="En campo" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>En campo</p>
            <h2 className={shared.sectionTitle}>
              El mismo equipo que diseña, <span className={shared.sectionTitleAccent}>instala</span>
            </h2>
            <p className={shared.sectionLead}>Fotografía de proyectos reales de NEXARA, no banco de imágenes.</p>
          </header>
          <div className={shared.mosaic}>
            {EN_CAMPO.map((e) => (
              <figure key={e.src} className={`${shared.photoFrame} ${e.tall ? shared.mosaicTall : shared.mosaicWide}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.src} alt={e.alt} loading="lazy" decoding="async" />
                <figcaption className={shared.photoCaption}>
                  <span className={shared.photoCaptionKicker}>{e.kicker}</span>
                  {e.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Equipo */}
      <section id="equipo" className={shared.section} aria-label="Equipo" data-reveal="up">
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Equipo</p>
            <h2 className={shared.sectionTitle}>
              Quién hace <span className={shared.sectionTitleAccent}>el trabajo</span>
            </h2>
            <p className={shared.sectionLead}>
              Ingeniería, operaciones e instalación — las personas detrás de cada entrega.
            </p>
          </header>
          <div className={shared.teamGrid} data-reveal-stagger>
            {expertos.slice(0, 8).map((ex) => (
              <article key={ex.key} className={shared.teamCard} data-reveal="up">
                <div className={shared.teamPhoto}>
                  {SHOW_TEAM_PHOTOS && ex.avatarUrl ? (
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
        </div>
      </section>

      {/* Certificaciones */}
      <section
        id="certificaciones"
        className={shared.section}
        aria-label="Certificaciones"
        data-reveal="soft"
      >
        <div className={shared.inner}>
          <header className={`${shared.sectionHead} ${shared.sectionHeadCenter}`}>
            <p className={shared.eyebrow}>Respaldo técnico</p>
            <h2 className={shared.sectionTitle}>
              Certificaciones y <span className={shared.sectionTitleAccent}>alianzas</span>
            </h2>
          </header>
          <LogoStrip label="Certificaciones y alianzas técnicas" items={CERTIFICACIONES} display="grid" />
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <div className={shared.ctaBandGrid}>
              <div>
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
              <ul className={shared.ctaFacts}>
                <li>
                  <PublicIcon name="users" /> Equipo propio de ingeniería e instalación, sin subcontratar la responsabilidad.
                </li>
                <li>
                  <PublicIcon name="clock" /> Primera respuesta típica en menos de 24 horas hábiles.
                </li>
                <li>
                  <PublicIcon name="fileCheck" /> Entrega documentada y soporte con SLA.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
