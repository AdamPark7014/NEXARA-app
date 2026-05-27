import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import styles from "./page.module.css";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";
import CertificationsCarousel from "../../components/CertificationsCarousel";
import BrandsCarousel from "../../components/BrandsCarousel";
import { buildApiUrl } from "@/lib/api-base";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Nexara | Sobre Nosotros",
  description: "Conoce Nexara: mision, vision, principios de trabajo y cobertura para proyectos tecnologicos empresariales en Mexico.",
  keywords: [
    "sobre Nexara",
    "empresa de tecnologia en Mexico",
    "integracion tecnologica empresarial",
    "equipo de ingenieria TI",
    "consultoria tecnologica",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Nexara | Sobre Nosotros",
    description: "Equipo de integracion tecnologica orientado a continuidad operativa y resultados medibles.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexara | Sobre Nosotros",
    description: "Experiencia de campo, ejecucion y acompanamiento para operaciones empresariales.",
    images: ["/logo-nexara.png"],
  },
};

const valores = [
  {
    n: 1,
    title: "INNOVACIÓN",
    text: "Exploramos y adoptamos tecnología con criterio de negocio para que cada solución aporte ventaja real y sostenible.",
  },
  {
    n: 2,
    title: "TRANSPARENCIA",
    text: "Comunicamos alcances, riesgos y tiempos con claridad para que la toma de decisión sea informada y conjunta.",
  },
  {
    n: 3,
    title: "COMPROMISO",
    text: "Cumplimos lo acordado y respondemos ante imprevistos con disciplina de ejecución y foco en la continuidad operativa.",
  },
  {
    n: 4,
    title: "INTEGRIDAD",
    text: "Actuamos con ética profesional en cada proyecto, priorizando el interés del cliente y la seguridad de su operación.",
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

export default async function NexaraPage() {
  const expertos = await fetchPublicExperts();
  const quienesSomosCopy =
    "NEXARA es una empresa de integración de TI, equipamiento y servicios de extremo a extremo. " +
    "Alineamos tecnología, procesos y personas para resolver problemas reales de operación: " +
    "combinamos experiencia de campo, disciplina de ejecución y una cultura de servicio que " +
    "privilegia la continuidad del negocio y resultados medibles.";

  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${siteUrl}/nexara`,
    name: "Sobre Nexara",
    mainEntity: {
      "@type": "Organization",
      name: "NEXARA",
      url: siteUrl,
      logo: `${siteUrl}/logo-nexara.png`,
      description: "Empresa de integracion tecnologica enfocada en continuidad operativa y resultados empresariales.",
    },
  };

  const timeline = [
    {
      stage: "Diagnóstico",
      description: "Evaluamos brechas de infraestructura, seguridad, operación y soporte con visión ejecutiva.",
    },
    {
      stage: "Arquitectura",
      description: "Definimos una hoja de ruta técnica y financiera por fases, prioridades y riesgos.",
    },
    {
      stage: "Implementación",
      description: "Ejecutamos con estándares, documentación y transferencia de conocimiento.",
    },
    {
      stage: "Continuidad",
      description: "Aseguramos monitoreo, mejora continua y soporte con SLA acordados.",
    },
  ];

  return (
    <main className={styles.brochurePage} aria-label="Página sobre Nexara">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />
      <div className={styles.brochureBg} aria-hidden />
      <div className={styles.brochureInner}>
        <section className={styles.heroMedia} aria-label="Hero nosotros" data-reveal="soft">
          <Image
            src="/images/hero_inicio.jpg"
            alt=""
            fill
            priority
            quality={100}
            sizes="100vw"
            className={styles.heroMediaDesktop}
          />
          <Image
            src="/images/hero_inicio_movil.jpg"
            alt=""
            fill
            priority
            quality={100}
            sizes="100vw"
            className={styles.heroMediaMobile}
          />
          <div className={styles.heroMediaOverlay} aria-hidden />

          <article className={styles.heroMediaCard} aria-label="¿Quiénes somos?" data-reveal="up">
            <div className={styles.heroMediaCardBody}>
              <div className={styles.heroMediaCardLogo} aria-hidden="true">
                <Image src="/logo-nexara.png" alt="" width={84} height={84} />
              </div>
              <p className={styles.heroMediaCardKicker}>¿QUIÉNES SOMOS?</p>
              <h2 className={styles.heroMediaCardTitle}>Tecnología integrada con enfoque operativo</h2>
              <p className={styles.heroMediaCardText}>{quienesSomosCopy}</p>
            </div>
          </article>
        </section>

        <header className={styles.hero} data-reveal="soft" data-nx-grain>
          <div className={styles.heroAura} aria-hidden />
          <div className={styles.heroContent}>
            <span data-nx-eyebrow>Nexara Ingenieros</span>
            <h1 className={styles.pageTitle}>
              Convertimos infraestructura en{" "}
              <em className={styles.pageTitleAccent}>ventaja operativa</em>
            </h1>
            <p className={styles.pageLead}>
              Somos un equipo de integración tecnológica que conecta estrategia, ejecución y
              continuidad para organizaciones que no pueden detener su operación.
            </p>
            <div className={styles.heroActions}>
              <Link href="/contacto" data-track-conversion="about_primary_cta" className={styles.primaryCta}>
                Hablar con un especialista
                <span aria-hidden className={styles.ctaArrow}>→</span>
              </Link>
              <Link href="/proyectos" data-track-conversion="about_projects_cta" className={styles.secondaryCta}>
                Ver casos publicados
              </Link>
            </div>
          </div>

          <aside className={styles.heroPanel} aria-label="Indicadores institucionales" data-reveal-stagger>
            <div className={styles.statCard} data-reveal="up">
              <strong>+300</strong>
              <span>implementaciones completadas</span>
            </div>
            <div className={styles.statCard} data-reveal="up">
              <strong>24/7</strong>
              <span>modelo de soporte especializado</span>
            </div>
            <div className={styles.statCard} data-reveal="up">
              <strong>Nacional</strong>
              <span>cobertura operativa en México</span>
            </div>
          </aside>
        </header>

        <nav className={styles.quickNav} aria-label="Accesos rápidos">
          <a href="#fundamentos" className={styles.quickNavLink}>
            Misión y visión
          </a>
          <a href="#valores" className={styles.quickNavLink}>
            Valores
          </a>
          <a href="#expertos" className={styles.quickNavLink}>
            Expertos
          </a>
          <a href="#metodo" className={styles.quickNavLink}>
            Método
          </a>
        </nav>

        <section id="fundamentos" className={styles.section} data-reveal="up">
          <div className={styles.mvGrid} data-reveal-stagger>
            <article className={styles.mvCard} data-reveal="up">
              <h3 className={styles.mvTitle}>MISIÓN</h3>
              <p className={styles.bodyText}>
                Integrar soluciones TI confiables y sostenibles para que cada cliente opere con
                continuidad, seguridad y eficiencia medible.
              </p>
            </article>
            <article className={styles.mvCard} data-reveal="up">
              <h3 className={styles.mvTitle}>VISIÓN</h3>
              <p className={styles.bodyText}>
                Ser el aliado tecnológico de referencia para organizaciones que requieren un nivel
                profesional alto, ejecución impecable y mejora continua.
              </p>
            </article>
          </div>
        </section>

        <section id="valores" className={styles.section} data-reveal="up">
          <h2 className={styles.sectionH2Center}>VALORES</h2>
          <div className={styles.valoresGrid} data-reveal-stagger>
            {valores.map((v) => (
              <article key={v.n} className={styles.valorCard} data-reveal="up">
                <div className={styles.valorHead}>
                  <div className={styles.valorDiamond}>
                    <span>{v.n}</span>
                  </div>
                  <h3 className={styles.valorTitle}>{v.title}</h3>
                </div>
                <p className={styles.bodyText}>{v.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="expertos" className={styles.section} data-reveal="up">
          <div className={styles.sectionHead}>
            <span className={styles.headDiamond} aria-hidden />
            <div className={styles.sectionHeadText}>
              <h2 className={styles.sectionH2}>NUESTROS EXPERTOS</h2>
              <span className={styles.headRule} />
            </div>
          </div>
          <div className={styles.expertosRow} data-reveal-stagger>
            {expertos.map((ex) => (
              <article key={ex.key} className={styles.expertCard} data-reveal="up">
                <div className={styles.expertPhoto}>
                  {ex.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ex.avatarUrl}
                      alt={`Foto de ${ex.name}`}
                      className={styles.expertPhotoImage}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className={styles.expertPhotoFallback} aria-hidden>
                      {getInitials(ex.name)}
                    </span>
                  )}
                </div>
                <p className={styles.expertName}>{ex.name}</p>
                <p className={styles.expertRole}>{ex.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="metodo" className={styles.section} data-reveal="up">
          <div className={styles.sectionHead}>
            <span className={styles.headDiamond} aria-hidden />
            <div className={styles.sectionHeadText}>
              <h2 className={styles.sectionH2}>CÓMO TRABAJAMOS</h2>
              <span className={styles.headRule} />
            </div>
          </div>
          <div className={styles.methodGrid} data-reveal-stagger>
            {timeline.map((item, index) => (
              <article key={item.stage} className={styles.methodCard} data-reveal="up">
                <span className={styles.methodIndex}>{String(index + 1).padStart(2, "0")}</span>
                <h3 className={styles.methodStage}>{item.stage}</h3>
                <p className={styles.bodyTextMuted}>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <div className={styles.seoHubShell} data-reveal="up">
          <SeoInterlinkHub title="Casos de uso y soluciones relacionadas" currentPath="/nexara" maxItems={8} />
        </div>

        {/* Marcas líderes (movido desde Cobertura/Inicio) */}
        <div className={styles.marcasLideres} data-reveal="up">
          <CertificationsCarousel />
          <BrandsCarousel />
        </div>
      </div>
    </main>
  );
}
