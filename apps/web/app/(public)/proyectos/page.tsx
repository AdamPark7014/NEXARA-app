import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";
import { buildApiUrl, getApiBase } from "@/lib/api-base";

export const metadata = {
  title: "Proyectos | Nexara",
  description:
    "Casos de éxito de Nexara con resultados medibles en retail, industria y servicios.",
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
  showInCatalog: boolean;
  createdAt: string;
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
  const catalogProjects = projects.filter((project) => project.showInCatalog);
  const shuffledCatalogProjects = [...catalogProjects];

  for (let index = shuffledCatalogProjects.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledCatalogProjects[index], shuffledCatalogProjects[swapIndex]] = [
      shuffledCatalogProjects[swapIndex],
      shuffledCatalogProjects[index],
    ];
  }

  const renderProjectCard = (project: Project, prioritizeImage = false) => (
    <article key={project.slug} id={project.slug} className={styles.projectCard}>
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
            priority={prioritizeImage}
          />
        </div>
        <div className={styles.gallery} role="list" aria-label={`Galeria de ${project.title}`}>
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
  );

  return (
    <main className={`${styles.container} public-section-page`} aria-label="Página de proyectos">
      <section className={styles.hero}>
        <p className={styles.kicker}>Portafolio vivo</p>
        <div className={styles.heroHeader}>
          <div>
            <h1 className={styles.heroTitle}>Nuestros proyectos</h1>
            <p className={styles.heroSubtitle}>
              Casos reales con resultados medibles que muestran alcance,
              ejecución y valor entregado en operación.
            </p>
            <div className={styles.heroActions}>
              <Link href="/contacto" className={styles.primaryCta}>Solicitar sesión</Link>
              <Link href="/nexara" className={styles.secondaryCta}>Ver credenciales</Link>
              <a
                href={`${API_URL}/projects/catalog-pdf/download`}
                className={styles.secondaryCta}
                target="_blank"
                rel="noopener noreferrer"
              >
                Descargar CV empresarial
              </a>
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
        <a href="#casos" className={styles.quickNavLink}>Nuestros proyectos</a>
        <a href="#por-que" className={styles.quickNavLink}>Por qué elegirnos</a>
        <a href="#cta" className={styles.quickNavLink}>Agendar sesión</a>
      </nav>

      <section className={styles.socialStrip} aria-label="Redes sociales Nexara">
        <p className={styles.kicker}>Redes oficiales</p>
        <div className={styles.socialButtons}>
          <a className={styles.socialButton} data-network="facebook" href="https://www.facebook.com/nexara.mexico/" target="_blank" rel="noopener noreferrer">Facebook</a>
          <a className={styles.socialButton} data-network="instagram" href="https://www.instagram.com/nexara_mx/" target="_blank" rel="noopener noreferrer">Instagram</a>
          <a className={styles.socialButton} data-network="tiktok" href="https://www.tiktok.com/@nexara_mx?_r=1&_t=ZS-948WJNIEdeu" target="_blank" rel="noopener noreferrer">TikTok</a>
          <a className={styles.socialButton} data-network="linkedin" href="https://www.linkedin.com/in/nexara-mx-413717359/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </section>

      {(shuffledCatalogProjects.length > 0 || !projects.length) && (
        <section id="casos" className={styles.projectsSection} aria-label="Casos de éxito publicados">
          {!!shuffledCatalogProjects.length && (
            <div>
              <p className={styles.kicker}>Seleccion curada</p>
              <h2 className={styles.projectTitle}>Nuestros proyectos</h2>
              <p className={styles.projectSubtitle}>
                Proyectos destacados del catalogo, presentados de forma dinamica.
              </p>
            </div>
          )}
          {shuffledCatalogProjects.map((project, index) => renderProjectCard(project, index === 0))}
          {!projects.length && (
            <div className={styles.projectCard}>
              <h2 className={styles.projectTitle}>Sin proyectos publicados</h2>
              <p className={styles.projectSubtitle}>
                Agrega proyectos desde el panel web para mostrar resultados aquí.
              </p>
            </div>
          )}
          {!!projects.length && !shuffledCatalogProjects.length && (
            <div className={styles.projectCard}>
              <h2 className={styles.projectTitle}>Sin proyectos en catalogo</h2>
              <p className={styles.projectSubtitle}>
                Marca proyectos como visibles en catalogo desde el panel web para mostrarlos aqui.
              </p>
            </div>
          )}
        </section>
      )}

      <section id="por-que" className={styles.whyUsSection} aria-label="Razones para elegirnos">
        <div>
          <p className={styles.kicker}>Valor diferencial</p>
          <h3 className={styles.whyUsTitle}>¿Por qué elegirnos?</h3>
          <p className={styles.ctaText}>
            Combinamos experiencia operativa, ejecución técnica y seguimiento para entregar resultados medibles.
          </p>
        </div>
        <div className={styles.whyUsGrid}>
          <div className={styles.whyUsItem}><strong>8+ años</strong><span>de experiencia en TI empresarial</span></div>
          <div className={styles.whyUsItem}><strong>500+ clientes</strong><span>atendidos en distintos sectores</span></div>
          <div className={styles.whyUsItem}><strong>300+ proyectos</strong><span>implementados de punta a punta</span></div>
          <div className={styles.whyUsItem}><strong>95% SLA</strong><span>de cumplimiento en servicio</span></div>
        </div>
      </section>

      <section id="cta" className={styles.ctaStrip}>
        <div>
          <p className={styles.kicker}>¿Quieres un caso similar?</p>
          <h3>Agendemos una sesión de 20 minutos</h3>
          <p className={styles.ctaText}>
            Revisamos tu contexto y te mostramos una ruta clara para replicar
            resultados en tu operación.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/contacto" className={styles.primaryCta}>Agendar ahora</Link>
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
