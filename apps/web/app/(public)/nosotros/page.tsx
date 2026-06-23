import Link from "next/link";
import type { Metadata } from "next";
import baseStyles from "../nexara/page.module.css";
import styles from "./page.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nosotros | Nexara — Personas detrás de la tecnología",
  description:
    "Conoce al equipo de Nexara: nuestra historia, misión, visión, valores y las personas que acompañan cada proyecto. Cercanos, claros y comprometidos con tu operación.",
  keywords: [
    "sobre Nexara",
    "equipo Nexara",
    "mision Nexara",
    "vision Nexara",
    "valores Nexara",
    "empresa de tecnologia en Mexico",
  ],
  alternates: {
    canonical: "/nosotros",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/nosotros`,
    title: "Nosotros | Nexara — Personas detrás de la tecnología",
    description:
      "Somos un equipo cercano de ingeniería e integración TI. Conoce nuestra misión, visión, valores y a las personas que hacen posible cada proyecto.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Equipo Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nosotros | Nexara",
    description: "Cercanos, claros y comprometidos. Conoce al equipo Nexara.",
    images: ["/logo-nexara.png"],
  },
};

const valores = [
  {
    n: 1,
    title: "INNOVACIÓN",
    text: "Probamos, aprendemos y elegimos la tecnología que de verdad mueve la aguja en tu operación, sin enamorarnos de modas.",
  },
  {
    n: 2,
    title: "TRANSPARENCIA",
    text: "Te decimos lo que vemos: alcance, tiempos, riesgos y costos. Sin letras chiquitas, sin sorpresas, sin promesas vacías.",
  },
  {
    n: 3,
    title: "COMPROMISO",
    text: "Cuando algo se complica, estamos. Acompañamos cada entrega hasta que opera estable y tú duermes tranquilo.",
  },
  {
    n: 4,
    title: "INTEGRIDAD",
    text: "Cuidamos tu información, tu gente y tu negocio como si fueran nuestros. Hacemos lo correcto, también cuando nadie mira.",
  },
];

const expertosFallback = [
  { name: "Ing. Alejandro Gonzales Bustamante", role: "Ingeniero de Sistemas" },
  { name: "Ing. Carolina Juarez Alvarez", role: "Ingeniera encargada de soporte" },
  { name: "Ing. Karen Elizalde Sarmiento", role: "Encargado de Ventas" },
  { name: "Ing. David Morales Zenon", role: "IDC/Instalador" },
  { name: "Ing. Julio Cesar Rivera Vazquez", role: "IDC/Instalador" },
  { name: "Ing. Israel Ramos Lima", role: "IDC/Instalador" },
  { name: "Lic. Karen Elizalde Sarmiento", role: "Dirección Administrativa & Comercial" },
  { name: "Ing. Luis Joel Aguilar", role: "Coordinador de Operaciones" },
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
        "Equipo de integración tecnológica en México: cercanos, claros y comprometidos con la continuidad operativa de cada cliente.",
    },
  };

  return (
    <main className={`${baseStyles.brochurePage} home-main-flush`} aria-label="Sobre nosotros — Nexara">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />
      <div className={baseStyles.brochureBg} aria-hidden />
      <div className={baseStyles.brochureInner}>
        {/* Hero amigable */}
        <section className={styles.friendlyHero} aria-label="Hola, somos Nexara" data-reveal="up">
          <span className={styles.friendlyBadge}>
            <span className={styles.friendlyBadgeDot} aria-hidden />
            Hola, mucho gusto
          </span>
          <h1 className={styles.friendlyTitle}>
            Somos <em className={styles.friendlyTitleAccent}>Nexara</em>, las personas detrás de tu tecnología
          </h1>
          <p className={styles.friendlyLead}>
            Más que proveedores, queremos ser tu equipo de confianza. Combinamos ingeniería,
            cercanía humana y disciplina de campo para que tu operación no se detenga y tu
            tecnología trabaje para ti, no al revés.
          </p>
          <div className={styles.friendlyActions}>
            <Link
              href="/contacto"
              data-track-conversion="nosotros_hero_primary_cta"
              className={baseStyles.primaryCta}
            >
              Platiquemos
              <span aria-hidden className={baseStyles.ctaArrow}>→</span>
            </Link>
            <Link
              href="/proyectos"
              data-track-conversion="nosotros_hero_projects_cta"
              className={baseStyles.secondaryCta}
            >
              Ver lo que hemos hecho
            </Link>
          </div>

          <div className={styles.friendlyStats} data-reveal-stagger>
            <div className={styles.friendlyStat} data-reveal="up">
              <span className={styles.friendlyStatValue}>+10</span>
              <span className={styles.friendlyStatLabel}>años acompañando</span>
            </div>
            <div className={styles.friendlyStat} data-reveal="up">
              <span className={styles.friendlyStatValue}>24/7</span>
              <span className={styles.friendlyStatLabel}>monitoreo y soporte</span>
            </div>
            <div className={styles.friendlyStat} data-reveal="up">
              <span className={styles.friendlyStatValue}>100%</span>
              <span className={styles.friendlyStatLabel}>compromiso humano</span>
            </div>
          </div>
        </section>

        {/* Misión y Visión */}
        <section id="fundamentos" className={baseStyles.section} data-reveal="up">
          <h2 className={baseStyles.sectionH2Center}>Lo que nos mueve</h2>
          <div className={baseStyles.mvGrid} data-reveal-stagger>
            <article className={baseStyles.mvCard} data-reveal="up">
              <h3 className={baseStyles.mvTitle}>MISIÓN</h3>
              <p className={baseStyles.bodyText}>
                Acompañar a cada cliente con soluciones de TI confiables y sostenibles, hechas a la
                medida de su realidad operativa, para que opere con continuidad, seguridad y
                resultados medibles, sintiendo siempre que tiene un equipo aliado, no un
                proveedor más.
              </p>
            </article>
            <article className={baseStyles.mvCard} data-reveal="up">
              <h3 className={baseStyles.mvTitle}>VISIÓN</h3>
              <p className={baseStyles.bodyText}>
                Ser el aliado tecnológico de cabecera para organizaciones en México y la región,
                reconocidos por nuestra cercanía, ejecución impecable y por mejorar, año con año,
                la vida operativa de quienes confían en nosotros.
              </p>
            </article>
          </div>
        </section>

        {/* Valores */}
        <section id="valores" className={baseStyles.section} data-reveal="up">
          <h2 className={baseStyles.sectionH2Center}>Cómo nos comportamos</h2>
          <div className={baseStyles.valoresGrid} data-reveal-stagger>
            {valores.map((v) => (
              <article key={v.n} className={baseStyles.valorCard} data-reveal="up">
                <div className={baseStyles.valorHead}>
                  <div className={baseStyles.valorDiamond}>
                    <span>{v.n}</span>
                  </div>
                  <h3 className={baseStyles.valorTitle}>{v.title}</h3>
                </div>
                <p className={baseStyles.bodyText}>{v.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Equipo */}
        <section id="expertos" className={baseStyles.section} data-reveal="up">
          <div className={baseStyles.sectionHead}>
            <span className={baseStyles.headDiamond} aria-hidden />
            <div className={baseStyles.sectionHeadText}>
              <h2 className={baseStyles.sectionH2}>Las personas del equipo</h2>
              <span className={baseStyles.headRule} />
            </div>
          </div>
          <p className={baseStyles.bodyText} style={{ marginBottom: 24, maxWidth: "68ch" }}>
            Detrás de cada proyecto hay personas reales: ingenieros de campo, especialistas de
            soporte, coordinadores y gente de oficina que se conocen, se apoyan y se hacen cargo.
            Estos son algunos rostros del equipo:
          </p>
          <div className={baseStyles.expertosRow} data-reveal-stagger>
            {expertos.map((ex) => (
              <article key={ex.key} className={baseStyles.expertCard} data-reveal="up">
                <div className={baseStyles.expertPhoto}>
                  {ex.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ex.avatarUrl}
                      alt={`Foto de ${ex.name}`}
                      className={baseStyles.expertPhotoImage}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className={baseStyles.expertPhotoFallback} aria-hidden>
                      {getInitials(ex.name)}
                    </span>
                  )}
                </div>
                <p className={baseStyles.expertName}>{ex.name}</p>
                <p className={baseStyles.expertRole}>{ex.role}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Cierre cálido */}
        <section className={styles.warmClose} data-reveal="up" aria-label="Trabajemos juntos">
          <h2 className={styles.warmCloseTitle}>¿Nos tomamos un café (virtual o presencial)?</h2>
          <p className={styles.warmCloseText}>
            Cuéntanos qué necesitas y juntos vemos el mejor camino. Sin compromiso, sin venta
            agresiva, sólo una conversación honesta entre personas que entienden tu negocio.
          </p>
          <div className={styles.warmCloseActions}>
            <Link
              href="/contacto"
              data-track-conversion="nosotros_close_primary_cta"
              className={baseStyles.primaryCta}
            >
              Hablemos
              <span aria-hidden className={baseStyles.ctaArrow}>→</span>
            </Link>
            <Link
              href="/servicios"
              data-track-conversion="nosotros_close_services_cta"
              className={baseStyles.secondaryCta}
            >
              Ver nuestros servicios
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
