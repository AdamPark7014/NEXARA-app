import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("nosotros");
}

export const dynamic = "force-dynamic";

/** Feature flag — permitir mostrar fotos reales cuando existan oficiales. */
const SHOW_TEAM_PHOTOS = false;

const principios: { title: string; text: string }[] = [
  {
    title: "Claridad",
    text: "Alcances, tiempos, costos y riesgos se definen desde el inicio. Expectativas claras y decisiones informadas, sin sorpresas a mitad del proyecto.",
  },
  {
    title: "Ingeniería basada en la realidad",
    text: "Cada solución nace del análisis del entorno operativo. Diseñamos pensando en la instalación, la mantenibilidad y el desempeño, no solo en la teoría.",
  },
  {
    title: "Compromiso continuo",
    text: "La entrega es el inicio de la relación. Seguimiento, soporte técnico y mejora continua para que cada implementación se mantenga estable y evolucione.",
  },
];

/** Datos operativos reales — mismos claims que la página ya publica. */
const OPERACION: { label: string; value: string }[] = [
  { label: "Sedes", value: "Puebla · Ciudad de México, con cobertura nacional" },
  { label: "Modelo", value: "Diseño, instalación y soporte bajo una sola responsabilidad técnica" },
  { label: "Respuesta", value: "Típicamente en menos de 24 horas en horario laboral" },
  { label: "Método", value: "Diagnóstico en sitio antes de la propuesta; entrega documentada" },
];

const COMPROMISOS = [
  "Un solo responsable técnico del diagnóstico al soporte",
  "Propuesta con alcance cerrado y calendario visible",
  "Instalación documentada: diagramas, etiquetado y evidencia",
  "Soporte con SLA después del arranque",
  "Equipo propio de ingeniería e instalación, sin subcontratar la responsabilidad.",
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
    frame: "portrait",
  },
  {
    src: "/fotos/campo-levantamiento-patio.jpg",
    alt: "Levantamiento técnico en patio de maniobras",
    kicker: "Diagnóstico",
    caption: "Levantamiento en sitio antes de la propuesta",
    frame: "landscape",
  },
  {
    src: "/fotos/equipo-nexara-espalda.jpg",
    alt: "Equipo NEXARA en sitio",
    kicker: "Equipo",
    caption: "Ingeniería e instalación, el mismo equipo",
    frame: "square",
  },
] as const;

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
  const storyPhoto = storyImg?.desktopUrl
    ? { src: resolvePageMediaUrl(storyImg.desktopUrl), alt: storyImg.alt || "Equipo de campo NEXARA" }
    : { src: "/fotos/equipo-nexara-polos.jpg", alt: "Equipo de campo NEXARA" };

  const siteUrl = siteBaseUrl();

  return (
    <main className={`${shared.page} ${styles.root} home-main-flush`} aria-label="Sobre nosotros — Nexara">
      <JsonLd
        data={{
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
        }}
      />

      {/* Quién es: una frase y el oficio, sin hero ni botones. */}
      <header className={styles.opening}>
        <h1>Personas detrás de cada solución</h1>
        <p>
          Ingeniería, instalación y soporte que mantienen tu operación — Puebla y CDMX, cobertura nacional.
        </p>
        <p>
          Somos un integrador con disciplina de campo: diseñamos, instalamos y sostenemos CCTV, redes,
          cómputo y soporte para empresas que no pueden detenerse.
        </p>
      </header>

      <figure className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={storyPhoto.src} alt={storyPhoto.alt} />
      </figure>

      {/* Datos: dónde, cómo y en cuánto se responde. */}
      <section className={styles.block} aria-label="Datos operativos">
        <h2>Datos</h2>
        <dl className={styles.facts}>
          {OPERACION.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        <ul className={styles.lines} aria-label="Compromisos">
          {COMPROMISOS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {/* Principios: las tres reglas con las que se decide un proyecto. */}
      <section id="valores" className={styles.block} aria-label="Principios">
        <h2>Principios</h2>
        <p className={styles.note}>Tres compromisos que se notan en cada proyecto, del levantamiento al soporte.</p>
        <ol className={styles.principles}>
          {principios.map((item, index) => (
            <li key={item.title}>
              <span className={styles.index} aria-hidden>
                0{index + 1}
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Galería: las tres fotos de campo que la página ya muestra. */}
      <section className={styles.block} aria-label="En campo">
        <h2>El mismo equipo que diseña, instala</h2>
        <p className={styles.note}>Fotografía de proyectos reales de NEXARA, no banco de imágenes.</p>
        <p className={styles.more}>
          <Link href="/proyectos" data-track-conversion="nosotros_proyectos_link">
            Proyectos
          </Link>
        </p>
        <div className={styles.gallery}>
          {EN_CAMPO.map((item) => (
            <figure key={item.src} className={styles[item.frame]}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt={item.alt} loading="lazy" decoding="async" />
              <figcaption>
                <span>{item.kicker}</span>
                {item.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Equipo: nombres y roles que la página ya publica. Sin fotos de stock. */}
      <section id="equipo" className={styles.block} aria-label="Equipo">
        <h2>Quién hace el trabajo</h2>
        <p className={styles.note}>Ingeniería, operaciones e instalación — las personas detrás de cada entrega.</p>
        <ul className={styles.people}>
          {expertos.slice(0, 8).map((person) => (
            <li key={person.key}>
              {SHOW_TEAM_PHOTOS && person.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={person.avatarUrl} alt="" />
              ) : null}
              <div>
                <strong>{person.name}</strong>
                <span>{person.role}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Certificaciones: los logos que ya están en /public/certificaciones. */}
      <section id="certificaciones" className={styles.block} aria-label="Certificaciones">
        <h2>Certificaciones y alianzas</h2>
        <ul className={styles.logos}>
          {CERTIFICACIONES.map((item) => (
            <li key={item.src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt={item.alt} loading="lazy" decoding="async" />
            </li>
          ))}
        </ul>
      </section>

      {/* Cierre: el siguiente paso, con los dos canales que la página ya ofrece. */}
      <section className={`${styles.block} ${styles.contact}`} aria-label="Contacto">
        <h2>Contacto</h2>
        <p>Cuéntanos tu alcance y te respondemos con diagnóstico y propuesta — sin compromiso.</p>
        <p className={styles.actions}>
          <Link href="/contacto" data-track-conversion="nosotros_footer_cta">
            Contacto
          </Link>
          <a
            href={buildWhatsAppLeadUrl({
              industryName: "mi empresa",
              serviceName: "CCTV, redes o soporte",
              path: "/nosotros",
            })}
            target="_blank"
            rel="noopener noreferrer"
            data-track-conversion="nosotros_wa"
          >
            WhatsApp
          </a>
        </p>
      </section>
    </main>
  );
}
