import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";
import { buildApiUrl, getApiBase } from "@/lib/api-base";

export const metadata = {
  title: "Nexara | Proyectos",
  description:
    "Casos recientes de Nexara con imágenes y resultados destacados para retail, industria y servicios.",
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
  gallery: string[];
};

const API_URL = getApiBase();

const normalizeImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/projects/image/")) {
      return `${API_URL}${imageUrl}`;
    }
    return imageUrl;
  }
  return `${API_URL}/projects/image/${imageUrl}`;
};

const getProjects = async (): Promise<Project[]> => {
  try {
    const response = await fetch(buildApiUrl("projects"), { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()) as Project[];
  } catch {
    return [];
  }
};

export default async function ProjectsPage() {
  const projects = await getProjects();
  return (
    <main className={styles.container} aria-label="Página de proyectos">
      <section className={styles.hero}>
        <p className={styles.kicker}>Portafolio vivo</p>
        <div className={styles.heroHeader}>
          <div>
            <h1 className={styles.heroTitle}>Proyectos recientes</h1>
            <p className={styles.heroSubtitle}>
              Casos reales con resultados medibles para mostrar cómo trabajamos,
              qué entregamos y el impacto logrado.
            </p>
            <div className={styles.heroActions}>
              <Link href="/contacto" className={styles.primaryCta}>Hablar con un asesor</Link>
              <Link href="/nexara" className={styles.secondaryCta}>Ver credenciales</Link>
            </div>
          </div>
          <div className={styles.heroStats}>
            <div>
              <span className={styles.statValue}>300+</span>
              <span className={styles.statLabel}>proyectos entregados</span>
            </div>
            <div>
              <span className={styles.statValue}>95%</span>
              <span className={styles.statLabel}>SLA cumplido</span>
            </div>
            <div>
              <span className={styles.statValue}>8+</span>
              <span className={styles.statLabel}>años integrando TI</span>
            </div>
          </div>
        </div>
      </section>

      <nav className={styles.quickNav} aria-label="Accesos rápidos">
        <a href="#casos" className={styles.quickNavLink}>Casos</a>
        <a href="#cta" className={styles.quickNavLink}>Agendar sesión</a>
      </nav>

      <section id="casos" className={styles.projectsSection} aria-label="Casos de éxito publicados">
        {projects.map((project) => (
          <article key={project.slug} className={styles.projectCard}>
            <header className={styles.projectHeader}>
              <div>
                <p className={styles.badge}>{project.sector}</p>
                <h2 className={styles.projectTitle}>{project.title}</h2>
                <p className={styles.projectSubtitle}>{project.summary}</p>
                <div className={styles.metaRow}>
                  <div>
                    <p className={styles.metaLabel}>Impacto</p>
                    <p className={styles.metaValue}>{project.impact}</p>
                  </div>
                  <div>
                    <p className={styles.metaLabel}>Servicios</p>
                    <p className={styles.metaValue}>{project.services.join(" • ")}</p>
                  </div>
                </div>
              </div>
              <div className={styles.tagRow}>
                {project.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>
            </header>

            <div className={styles.mediaGrid}>
              <div className={styles.mainImage}>
                <Image
                  src={normalizeImageUrl(project.mainImage) || "/soluciones/rect-a.jpg"}
                  alt={`Proyecto ${project.title}`}
                  fill
                  sizes="(max-width: 900px) 100vw, 55vw"
                  className={styles.image}
                  priority
                />
              </div>
              <div className={styles.gallery} role="list" aria-label={`Galería de ${project.title}`}>
                {(project.gallery || []).map((image, index) => (
                  <div key={`${project.slug}-gallery-${index}`} className={styles.galleryItem} role="listitem">
                    <Image
                      src={normalizeImageUrl(image) || "/servicios/square-1.jpg"}
                      alt={`${project.title} imagen ${index + 1}`}
                      fill
                      sizes="(max-width: 900px) 50vw, 18vw"
                      className={styles.image}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.detailRow}>
              <ul className={styles.highlights}>
                {project.highlights.map((item) => (
                  <li key={`${project.slug}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
        {!projects.length && (
          <div className={styles.projectCard}>
            <h2 className={styles.projectTitle}>Sin proyectos publicados</h2>
            <p className={styles.projectSubtitle}>
              Agrega proyectos desde el panel web para mostrar resultados aqui.
            </p>
          </div>
        )}
      </section>

      <section id="cta" className={styles.ctaStrip}>
        <div>
          <p className={styles.kicker}>¿Quieres un caso similar?</p>
          <h3>Agendemos una sesión de 20 minutos</h3>
          <p className={styles.ctaText}>
            Te mostramos entregables, tableros y metodología para replicar
            resultados en tu operación.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/contacto" className={styles.primaryCta}>Agenda ahora</Link>
          <Link
            href="https://wa.me/525536505044"
            className={styles.secondaryCta}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </Link>
        </div>
      </section>
    </main>
  );
}
