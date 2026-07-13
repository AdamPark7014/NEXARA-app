import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nosotros | Nexara — Equipo de integración tecnológica",
  description:
    "Quiénes somos: equipo de campo e ingeniería en Puebla y CDMX. Cercanos, claros y responsables de la continuidad operativa de cada cliente.",
  alternates: { canonical: "/nosotros" },
  openGraph: {
    type: "website",
    url: `${siteUrl}/nosotros`,
    title: "Nosotros | Nexara",
    description: "Personas detrás de la tecnología que sostiene tu operación.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Equipo Nexara" }],
  },
};

export const dynamic = "force-dynamic";

const principios = [
  {
    title: "Claridad",
    text: "Alcance, tiempos y riesgos en voz alta. Preferimos una conversación incómoda a una sorpresa en factura.",
  },
  {
    title: "Campo primero",
    text: "Diseñamos lo que se puede instalar y operar. La propuesta sale del sitio, no solo del PowerPoint.",
  },
  {
    title: "Continuidad",
    text: "Después de la entrega seguimos: soporte, ajustes y evidencia. Un proyecto vivo, no un ticket cerrado.",
  },
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

    const data = (await response.json()) as PublicTeamUser[];
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
  const expertos = await fetchPublicExperts();

  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${siteUrl}/nosotros`,
    name: "Nosotros · Nexara",
    mainEntity: {
      "@type": "Organization",
      name: "NEXARA",
      url: siteUrl,
      logo: `${siteUrl}/logo-nexara.png`,
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
            <span className={heroStyles.titleAccent}>cada entrega</span>
          </>
        }
        lead="Ingeniería y campo desde Puebla y CDMX. Diseñamos, instalamos y acompañamos — sin desaparecer después del go-live."
        imageSrc="/images/hero/hero-05.png"
        imageAlt="Equipo Nexara en campo"
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <div className={styles.storySplit}>
            <div className={styles.storyBlock}>
              <p className={shared.eyebrow}>Quiénes somos</p>
              <h2 className={styles.storyTitle}>
                Operamos donde la tecnología{" "}
                <span className={shared.sectionTitleAccent}>tiene que funcionar</span>
              </h2>
            </div>
            <div>
              <p className={styles.storyLead}>
                Cerramos el hueco entre la propuesta y el lunes en el sitio: instalación con evidencia, soporte humano y criterio técnico.
              </p>
              <p className={styles.storyLeadSecondary}>
                Base en Puebla y CDMX, cobertura nacional. CCTV, redes y cómputo bajo una sola responsabilidad — no una cadena de proveedores que se echan la pelota.
              </p>
            </div>
          </div>
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
    </main>
  );
}
