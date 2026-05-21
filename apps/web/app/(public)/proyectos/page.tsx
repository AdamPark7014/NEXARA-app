import Image from "next/image";
import type { Metadata } from "next";
import styles from "./page.module.css";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
import CatalogShowcase from "./CatalogShowcase";
import { PROYECTOS_SECTOR_COVERS } from "./proyectosSectorCovers";
import ExternalLinkButton from "@/components/ExternalLinkButton";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "Catalogo de Proyectos | Nexara",
  description:
    "Casos y catalogo de proyectos tecnologicos implementados por Nexara para sectores empresariales y operativos.",
  keywords: [
    "casos de exito tecnologia",
    "proyectos ERP industrial",
    "portafolio de proyectos TI",
    "implementaciones empresariales",
    "catalogo tecnologico",
  ],
  alternates: {
    canonical: "/proyectos",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/proyectos`,
    title: "Catalogo de Proyectos | Nexara",
    description: "Explora sectores y proyectos recientes con impacto operativo medible.",
    images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: "Proyectos Nexara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Catalogo de Proyectos | Nexara",
    description: "Portafolio de implementaciones tecnologicas por sector.",
    images: ["/logo-nexara.png"],
  },
};

export const dynamic = "force-dynamic";

type Project = {
  id: number;
  slug: string;
  title: string;
  sector: string;
  summary: string;
  impact: string;
  services: string[];
  tags: string[];
  highlights: string[];
  gallery: string[];
  mainImage?: string | null;
  showInCatalog: boolean;
  createdAt: string;
};

type NewsPost = {
  id: number;
  title: string;
  slug: string;
  status?: string;
  summary?: string | null;
  content: string;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

type SectorTemplate = {
  key: keyof typeof PROYECTOS_SECTOR_COVERS;
  title: string;
  bullets: string[];
  group: "main" | "other";
};

const normalizeImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return "/soluciones/rect-a.jpg";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  const origin = getApiAssetOrigin();
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/projects/image/")) return `${origin}${imageUrl}`;
    return imageUrl;
  }
  return `${origin}/projects/image/${imageUrl}`;
};

const getProjects = async (): Promise<Project[]> => {
  try {
    const response = await fetch(buildApiUrl("projects"), { cache: "no-store" });
    if (!response.ok) return [];

    const raw = (await response.json()) as unknown;
    if (!Array.isArray(raw)) return [];

    return raw.map((entry) => {
      const item = (entry ?? {}) as Partial<Project>;
      return {
        id: Number(item.id) || 0,
        slug: typeof item.slug === "string" ? item.slug : "",
        title: typeof item.title === "string" ? item.title : "Proyecto sin titulo",
        sector: typeof item.sector === "string" ? item.sector : "General",
        summary: typeof item.summary === "string" ? item.summary : "",
        impact: typeof item.impact === "string" ? item.impact : "",
        services: Array.isArray(item.services)
          ? item.services.filter((value): value is string => typeof value === "string")
          : [],
        tags: Array.isArray(item.tags)
          ? item.tags.filter((value): value is string => typeof value === "string")
          : [],
        highlights: Array.isArray(item.highlights)
          ? item.highlights.filter((value): value is string => typeof value === "string")
          : [],
        gallery: Array.isArray(item.gallery)
          ? item.gallery.filter((value): value is string => typeof value === "string")
          : [],
        mainImage: typeof item.mainImage === "string" ? item.mainImage : null,
        showInCatalog: Boolean(item.showInCatalog),
        createdAt:
          typeof item.createdAt === "string" && item.createdAt.trim().length > 0
            ? item.createdAt
            : new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
};

const getNews = async (): Promise<NewsPost[]> => {
  try {
    const response = await fetch(buildApiUrl("news"), { cache: "no-store" });
    if (!response.ok) return [];
    const raw = (await response.json()) as unknown;
    const rows = Array.isArray(raw) ? raw : [];
    const normalized = rows.map((entry) => {
      const item = (entry ?? {}) as Partial<NewsPost>;
      return {
        id: Number(item.id) || 0,
        title: typeof item.title === "string" ? item.title : "Sin título",
        slug: typeof item.slug === "string" ? item.slug : "",
        status: typeof item.status === "string" ? item.status : undefined,
        summary: typeof item.summary === "string" ? item.summary : null,
        content: typeof item.content === "string" ? item.content : "",
        coverImageUrl: typeof item.coverImageUrl === "string" ? item.coverImageUrl : null,
        publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
      } as NewsPost;
    });

    return normalized
      .filter((item) => {
        const status = String((item.status ?? "")).toUpperCase();
        return !status || status === "PUBLISHED";
      })
      .sort((a, b) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime());
  } catch {
    return [];
  }
};

const sectorTemplates: SectorTemplate[] = [
  {
    key: "computo-empresarial",
    title: "Computo empresarial",
    bullets: [
      "Suministro y configuración de equipos listos para operación y crecimiento.",
      "Accesorios: laptops, workstations y servidores.",
    ],
    group: "main",
  },
  {
    key: "redes-conectividad",
    title: "Redes y conectividad",
    bullets: [
      "Diseño e implementación de redes estables, seguras y administrables.",
      "Accesorios: switches, access points y cableado.",
    ],
    group: "main",
  },
  {
    key: "videovigilancia-seguridad",
    title: "Videovigilancia y seguridad",
    bullets: [
      "Cobertura integral para proteger activos físicos y digitales.",
      "Accesorios: CCTV, control de acceso y monitoreo.",
    ],
    group: "main",
  },
  {
    key: "licenciamiento",
    title: "Licenciamiento",
    bullets: [
      "Gestión de licencias y cumplimiento para operar con software legal y actualizado.",
      "Accesorios: productividad, seguridad y colaboración.",
    ],
    group: "main",
  },
  {
    key: "gubernamental",
    title: "Gubernamental",
    bullets: [
      "Modernizamos entornos públicos con infraestructura segura, equipamiento y soporte operativo continuo.",
    ],
    group: "other",
  },
  {
    key: "educativo",
    title: "Educativo",
    bullets: [
      "Implementamos aulas y redes institucionales para aprendizaje digital con alta disponibilidad.",
    ],
    group: "other",
  },
  {
    key: "pymes",
    title: "Pymes",
    bullets: [
      "Diseñamos paquetes tecnológicos escalables para crecer sin frenar la operación.",
    ],
    group: "other",
  },
  {
    key: "salud",
    title: "Salud",
    bullets: [
      "Aseguramos continuidad y protección de información en clínicas y centros médicos.",
    ],
    group: "other",
  },
  {
    key: "industrial",
    title: "Industrial",
    bullets: [
      "Integración de TI para plantas y operaciones con foco en control, seguridad y productividad.",
    ],
    group: "other",
  },
];

export default async function ProjectsPage() {
  const projects = await getProjects();
  const news = await getNews();
  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const catalogForShowcase = sortedProjects.filter((p) => p.showInCatalog);
  const showcaseProjects = (catalogForShowcase.length ? catalogForShowcase : sortedProjects).slice(0, 6);

  const catalogSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Catalogo de proyectos Nexara",
    url: `${siteUrl}/proyectos`,
    numberOfItems: sortedProjects.length,
    itemListElement: sortedProjects.slice(0, 10).map((project, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: project.title,
      url: `${siteUrl}/proyectos#${project.slug || project.id}`,
    })),
  };

  const sectors = sectorTemplates.map((template, index) => {
    const project = sortedProjects[index];
    return {
      key: template.key,
      id: project ? String(project.id) : template.key,
      slug: project?.slug,
      title: template.title,
      bullets: template.bullets,
      image: PROYECTOS_SECTOR_COVERS[template.key],
      alt: template.title,
      group: template.group,
    };
  });

  const mainSectors = sectors.filter((sector) => sector.group === "main");
  const otherSectors = sectors.filter((sector) => sector.group === "other");
  const latestNews = news.slice(0, 3);

  const renderSectorCard = (
    sector: (typeof sectors)[number],
    variant: "main" | "other",
  ) => (
    <article
      key={sector.id}
      id={sector.slug || sector.key}
      className={variant === "main" ? styles.sectorTile : styles.sectorTileMuted}
      data-reveal="up"
    >
      <div className={styles.sectorTileMedia}>
        <Image
          src={sector.image}
          alt={sector.alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1000px) 33vw, 260px"
          className={styles.sectorTileImg}
        />
      </div>
      <div className={styles.sectorTileBody}>
        <h3 className={styles.sectorTileTitle}>{sector.title}</h3>
        <ul className={styles.sectorTileList}>
          {sector.bullets.map((bullet, bulletIndex) => (
            <li key={`${sector.id}-${bulletIndex}`}>{bullet}</li>
          ))}
        </ul>
      </div>
    </article>
  );

  return (
    <main className={`${styles.container} public-section-page ultra-corp-page ultra-corp-proyectos ultra-corp-strict`} aria-label="Catálogo de proyectos Nexara">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(catalogSchema) }}
      />
      <header className={styles.hero} data-reveal="soft" data-nx-grain>
        <div className={styles.heroAura} aria-hidden />
        <div className={styles.heroCopy}>
          <span data-nx-eyebrow>Portafolio Tecnológico</span>
          <h1 className={styles.heroTitle}>
            Sectores donde ya <em className={styles.heroTitleAccent}>generamos impacto</em>
          </h1>
          <p className={styles.heroText}>
            Arriba encontrarás casos publicados con detalle e imágenes; más abajo, líneas de solución
            y sectores atendidos para orientar compra e implementación con criterio empresarial.
          </p>
        </div>
        <ExternalLinkButton href={buildApiUrl("projects/catalog-pdf/download")} className={styles.pdfButton}>
          Descargar PDF completo
        </ExternalLinkButton>
      </header>

      <div data-reveal="up">
        <CatalogShowcase projects={showcaseProjects} />
      </div>

      <section className={styles.sectorSection} aria-labelledby="sectores-principales-title" data-reveal="up">
        <header className={styles.sectorSectionHead}>
          <h2 id="sectores-principales-title" className={styles.sectorSectionTitle}>
            Sectores principales
          </h2>
          <p className={styles.sectorSectionLead}>
            Líneas núcleo donde solemos intervenir con equipamiento, redes, videovigilancia y cumplimiento de software.
          </p>
        </header>
        <div className={styles.sectorGrid} data-reveal-stagger>
          {mainSectors.map((s) => renderSectorCard(s, "main"))}
        </div>
      </section>

      <section className={styles.sectorSection} aria-labelledby="otros-sectores-title" data-reveal="up">
        <header className={styles.sectorSectionHead}>
          <h2 id="otros-sectores-title" className={styles.sectorSectionTitle}>
            Otros sectores
          </h2>
          <p className={styles.sectorSectionLead}>
            Verticales complementarias con el mismo criterio de continuidad, seguridad y soporte operativo.
          </p>
        </header>
        <div className={styles.sectorGrid} data-reveal-stagger>
          {otherSectors.map((s) => renderSectorCard(s, "other"))}
        </div>
      </section>

      <section className={styles.bottomActions} data-reveal="up">
        <a href="/contacto" data-track-conversion="projects_consult_cta" className={styles.consultButton}>
          Solicitar asesoría para mi sector
        </a>
        <ExternalLinkButton
          href={buildApiUrl("projects/catalog-pdf/download")}
          data-track-conversion="projects_catalog_pdf"
          className={styles.pdfButton}
        >
          Descargar PDF completo de proyectos
        </ExternalLinkButton>
      </section>

      <section className={styles.newsHub} aria-labelledby="news-hub-heading" data-reveal="up">
        <div className={styles.newsHubHead}>
          <div className={styles.newsHubBrand}>
            <Image src="/logo-nexara.png" alt="Nexara" width={48} height={48} className={styles.newsHubLogo} />
            <div>
              <h2 id="news-hub-heading" className={styles.newsHubTitle}>Entérate lo que pasa en Nexara</h2>
              <p className={styles.newsHubSubtitle}>
                Actualizaciones, novedades y comunicados relevantes para operación, compras y dirección.
              </p>
            </div>
          </div>
          <a className={styles.newsHubCta} href="/contacto">Recibir novedades</a>
        </div>

        {latestNews.length ? (
          <div className={styles.newsHubGrid} data-reveal-stagger>
            {latestNews.map((item) => (
              <article key={item.id} className={styles.newsHubCard} data-reveal="up">
                <div className={styles.newsHubMeta}>
                  <span>Actualización</span>
                  <span>{new Date(item.publishedAt || item.createdAt).toLocaleDateString("es-MX")}</span>
                </div>
                <h3 className={styles.newsHubCardTitle}>{item.title}</h3>
                <p className={styles.newsHubCardSummary}>{item.summary || "Nueva actualización disponible."}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.newsHubEmpty}>
            <strong>Próximamente</strong>
            <span>Estamos preparando nuevas publicaciones.</span>
          </div>
        )}
      </section>
    </main>
  );
}

