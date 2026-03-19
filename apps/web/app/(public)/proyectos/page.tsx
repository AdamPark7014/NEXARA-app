import Image from "next/image";
import styles from "./page.module.css";
import { buildApiUrl, getApiBase } from "@/lib/api-base";

export const metadata = {
  title: "Catálogo | Nexara",
  description:
    "Catálogo de sectores y proyectos tecnológicos de Nexara con descarga PDF dinámica.",
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
  mainImage?: string | null;
  showInCatalog: boolean;
  createdAt: string;
};

type SectorTemplate = {
  key: string;
  title: string;
  image: string;
  bullets: string[];
  group: "main" | "other";
};

const API_URL = getApiBase();

const normalizeImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return "/soluciones/rect-a.jpg";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/projects/image/")) return `${API_URL}${imageUrl}`;
    return imageUrl;
  }
  return `${API_URL}/projects/image/${imageUrl}`;
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

const sectorTemplates: SectorTemplate[] = [
  {
    key: "computo-empresarial",
    title: "Computo empresarial",
    image: "/servicios/square-1.jpg",
    bullets: [
      "Suministro y configuración de equipos listos para operación y crecimiento.",
      "Accesorios: laptops, workstations y servidores.",
    ],
    group: "main",
  },
  {
    key: "redes-conectividad",
    title: "Redes y conectividad",
    image: "/servicios/square-2.jpg",
    bullets: [
      "Diseño e implementación de redes estables, seguras y administrables.",
      "Accesorios: switches, access points y cableado.",
    ],
    group: "main",
  },
  {
    key: "videovigilancia-seguridad",
    title: "Videovigilancia y seguridad",
    image: "/servicios/square-3.jpg",
    bullets: [
      "Cobertura integral para proteger activos físicos y digitales.",
      "Accesorios: CCTV, control de acceso y monitoreo.",
    ],
    group: "main",
  },
  {
    key: "licenciamiento",
    title: "Licenciamiento",
    image: "/servicios/square-4.jpg",
    bullets: [
      "Gestión de licencias y cumplimiento para operar con software legal y actualizado.",
      "Accesorios: productividad, seguridad y colaboración.",
    ],
    group: "main",
  },
  {
    key: "gubernamental",
    title: "Gubernamental",
    image: "/soluciones/rect-a.jpg",
    bullets: [
      "Modernizamos entornos públicos con infraestructura segura, equipamiento y soporte operativo continuo.",
    ],
    group: "other",
  },
  {
    key: "educativo",
    title: "Educativo",
    image: "/soluciones/rect-b.jpg",
    bullets: [
      "Implementamos aulas y redes institucionales para aprendizaje digital con alta disponibilidad.",
    ],
    group: "other",
  },
  {
    key: "pymes",
    title: "Pymes",
    image: "/soluciones/rect-c.jpg",
    bullets: [
      "Diseñamos paquetes tecnológicos escalables para crecer sin frenar la operación.",
    ],
    group: "other",
  },
  {
    key: "salud",
    title: "Salud",
    image: "/soluciones/rect-d.jpg",
    bullets: [
      "Aseguramos continuidad y protección de información en clínicas y centros médicos.",
    ],
    group: "other",
  },
  {
    key: "industrial",
    title: "Industrial",
    image: "/soluciones/rect-e.jpg",
    bullets: [
      "Integración de TI para plantas y operaciones con foco en control, seguridad y productividad.",
    ],
    group: "other",
  },
];

export default async function ProjectsPage() {
  const projects = await getProjects();
  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const sectors = sectorTemplates.map((template, index) => {
    const project = sortedProjects[index];
    return {
      key: template.key,
      id: project ? String(project.id) : template.key,
      slug: project?.slug,
      title: template.title,
      bullets: template.bullets,
      image: template.image,
      alt: template.title,
      group: template.group,
    };
  });

  const mainSectors = sectors.filter((sector) => sector.group === "main");
  const otherSectors = sectors.filter((sector) => sector.group === "other");

  const renderSectorRow = (
    sector: (typeof sectors)[number],
    index: number,
  ) => {
    const reverse = index % 2 === 1;

    return (
      <article
        key={sector.id}
        id={sector.slug || sector.key}
        className={`${styles.sectorRow} ${reverse ? styles.rowReverse : ""}`}
      >
        <div className={styles.sectorContent}>
          <h3 className={styles.sectorTitle}>{sector.title}</h3>
          <ul className={styles.sectorBullets}>
            {sector.bullets.map((bullet, bulletIndex) => (
              <li key={`${sector.id}-${bulletIndex}`}>{bullet}</li>
            ))}
          </ul>
        </div>
        <div className={styles.sectorImageWrap}>
          <Image
            src={sector.image}
            alt={sector.alt}
            fill
            sizes="(max-width: 700px) 100vw, 210px"
            className={styles.sectorImage}
            unoptimized
          />
        </div>
      </article>
    );
  };

  return (
    <main className={`${styles.container} public-section-page ultra-corp-page ultra-corp-proyectos ultra-corp-strict`} aria-label="Catálogo de proyectos Nexara">
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>PORTAFOLIO TECNOLÓGICO</p>
          <h1 className={styles.heroTitle}>Sectores donde ya generamos impacto real</h1>
          <p className={styles.heroText}>
            Este catálogo resume líneas de solución y sectores atendidos para facilitar decisiones
            de compra e implementación con un enfoque empresarial.
          </p>
        </div>
        <a
          href={`${API_URL}/projects/catalog-pdf/download`}
          className={styles.pdfButton}
          target="_blank"
          rel="noopener noreferrer"
        >
          Descargar PDF completo
        </a>
      </header>

      <section className={styles.block} aria-labelledby="sectores-principales-title">
        <h2 id="sectores-principales-title" className={styles.blockBand}>Sectores principales</h2>
        <div className={styles.blockBody}>
          {mainSectors.map((sector, index) => renderSectorRow(sector, index))}
        </div>
      </section>

      <section className={styles.block} aria-labelledby="otros-sectores-title">
        <h2 id="otros-sectores-title" className={styles.blockBand}>Otros sectores</h2>
        <div className={styles.blockBody}>
          {otherSectors.map((sector, index) => renderSectorRow(sector, index))}
        </div>
      </section>

      <section className={styles.bottomActions}>
        <a href="/contacto" className={styles.consultButton}>
          Solicitar asesoría para mi sector
        </a>
        <a
          href={`${API_URL}/projects/catalog-pdf/download`}
          className={styles.pdfButton}
          target="_blank"
          rel="noopener noreferrer"
        >
          Descargar PDF completo de proyectos
        </a>
      </section>
    </main>
  );
}

