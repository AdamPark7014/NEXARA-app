import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
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

const valores = [
  {
    n: "01",
    title: "Claridad",
    text: "Alcance, tiempos y riesgos en voz alta. Preferimos una conversación incómoda a una sorpresa en factura.",
  },
  {
    n: "02",
    title: "Campo primero",
    text: "Diseñamos lo que se puede instalar y operar. La propuesta sale del sitio, no solo del PowerPoint.",
  },
  {
    n: "03",
    title: "Continuidad",
    text: "Después de la entrega seguimos: soporte, ajustes y evidencia. Un proyecto vivo, no un ticket cerrado.",
  },
  {
    n: "04",
    title: "Integridad",
    text: "Cuidamos tu información, tu gente y tu operación. Hacemos lo correcto también cuando nadie mira.",
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
    <main className={shared.page} aria-label="Sobre nosotros — Nexara">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />

      <section className={`${shared.hero} ${shared.heroNarrow}`}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Nosotros</span>
              <h1 className={shared.heroTitle}>
                Personas detrás de la tecnología que{" "}
                <span className={shared.heroTitleAccent}>sostiene tu operación</span>
              </h1>
              <p className={shared.heroLead}>
                Somos un equipo de ingeniería y campo con base en Puebla y CDMX. Integramos,
                instalamos y acompañamos — sin vender humo ni desaparecer después del go-live.
              </p>
              <div className={shared.heroActions}>
                <Link
                  href="/contacto"
                  data-track-conversion="nosotros_hero_primary_cta"
                  className={`${shared.btn} ${shared.btnPrimary}`}
                >
                  Platiquemos <span className={shared.btnArrow}>→</span>
                </Link>
                <Link
                  href="/servicios"
                  data-track-conversion="nosotros_hero_services_cta"
                  className={`${shared.btn} ${shared.btnSecondary}`}
                >
                  Ver capacidades
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={styles.storyBlock} data-reveal="soft">
            <span className={shared.eyebrow}>Historia</span>
            <h2 className={styles.storyTitle}>
              Operamos donde la tecnología{" "}
              <span className={shared.sectionTitleAccent}>tiene que funcionar</span>
            </h2>
            <p className={styles.storyLead}>
              NEXARA nació para resolver el hueco entre “la propuesta bonita” y “el lunes en el
              sitio”. Combinamos disciplina de instalación, soporte humano y criterio técnico para
              que CCTV, redes y cómputo no se conviertan en otro proveedor más en tu lista.
            </p>
            <p className={styles.storyNote}>
              Cobertura nacional con presencia directa en el centro del país. Trabajamos con
              responsables de operación, no solo con compradores.
            </p>
          </div>
        </div>
      </section>

      <section id="valores" className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Valores</span>
            <h2 className={shared.sectionTitle}>
              Cómo nos <span className={shared.sectionTitleAccent}>comportamos</span>
            </h2>
            <p className={shared.sectionLead}>Cuatro reglas simples. Las medimos en cada proyecto.</p>
          </div>
          <div className={shared.featureGrid} data-reveal-stagger>
            {valores.map((v) => (
              <div key={v.n} className={shared.featureCell} data-reveal="up">
                <span className={shared.featureNum}>{v.n}</span>
                <h3 className={shared.featureTitle}>{v.title}</h3>
                <p className={shared.featureText}>{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="equipo" className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Equipo</span>
            <h2 className={shared.sectionTitle}>
              Rostros detrás de <span className={shared.sectionTitleAccent}>cada entrega</span>
            </h2>
            <p className={shared.sectionLead}>
              Ingenieros de campo, soporte y coordinación. Personas reales con nombre y cargo.
            </p>
          </div>
          <div className={shared.teamGrid} data-reveal-stagger>
            {expertos.map((ex) => (
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
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Agendamos una <span className={shared.sectionTitleAccent}>conversación corta</span>?
            </h2>
            <p className={shared.ctaLead}>
              Sin pitch agresivo. Solo una revisión honesta de tu sitio o tu problema técnico.
            </p>
            <div className={shared.ctaActions}>
              <Link
                href="/contacto"
                data-track-conversion="nosotros_close_primary_cta"
                className={`${shared.btn} ${shared.btnPrimary}`}
              >
                Ir a contacto <span className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
