import Image from "next/image";
import styles from "./page.module.css";
import { getApiAssetOrigin } from "@/lib/api-base";

export type CatalogShowcaseProject = {
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
  createdAt: string;
};

function normalizeProjectImageUrl(imageUrl?: string | null): string {
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
}

type CatalogShowcaseProps = {
  projects: CatalogShowcaseProject[];
};

export default function CatalogShowcase({ projects }: CatalogShowcaseProps) {
  return (
    <section
      id="casos-publicados"
      className={styles.casosSection}
      aria-labelledby="casos-publicados-heading"
    >
      <div className={styles.casosSectionHead}>
        <p className={styles.casosKicker}>PORTAFOLIO VIVO</p>
        <div className={styles.casosTitleRow}>
          <div>
            <h2 id="casos-publicados-heading" className={styles.casosTitle}>
              Casos publicados recientemente
            </h2>
            <p className={styles.casosLead}>
              Proyectos del portafolio con contexto, impacto y material visual. Para el catálogo PDF
              completo usa el botón superior.
            </p>
          </div>
        </div>
      </div>

      {!projects.length ? (
        <p className={styles.casosEmpty}>Aún no hay proyectos publicados en el catálogo.</p>
      ) : (
        <div className={styles.casosList}>
          {projects.map((project, index) => {
            const reverse = index % 2 === 1;
            const highlights =
              project.highlights.length > 0
                ? project.highlights.slice(0, 4)
                : [
                    project.summary || "Proyecto enfocado en continuidad y eficiencia operativa.",
                    "Implementación alineada a objetivos del negocio.",
                    "Seguimiento técnico con métricas de desempeño.",
                  ];

            return (
              <article
                key={project.id}
                id={project.slug || String(project.id)}
                className={`${styles.caseCard} ${reverse ? styles.caseCardReverse : ""}`}
              >
                <div className={styles.caseContent}>
                  <p className={styles.caseSector}>{project.sector || "Proyecto"}</p>
                  <h3 className={styles.caseTitle}>{project.title}</h3>
                  <p className={styles.caseSummary}>
                    {project.summary || "Caso publicado en el portafolio Nexara."}
                  </p>

                  <div className={styles.caseMetaWrap}>
                    <div className={styles.caseMeta}>
                      <div className={styles.caseMetaItem}>
                        <span>Impacto</span>
                        <strong>{project.impact || "Resultados medibles en operación"}</strong>
                      </div>
                      <div className={styles.caseMetaItem}>
                        <span>Servicios</span>
                        <strong>
                          {project.services.length
                            ? project.services.slice(0, 3).join(" • ")
                            : "Integración TI • Implementación • Soporte"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {project.tags.length > 0 && (
                    <div className={styles.caseTags}>
                      {project.tags.slice(0, 5).map((tag) => (
                        <span key={`${project.id}-${tag}`} className={styles.caseTag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <ul className={styles.caseHighlights}>
                    {highlights.map((item, i) => (
                      <li key={`${project.id}-hl-${i}`}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className={styles.caseVisual}>
                  <figure className={styles.caseMainPhoto}>
                    <Image
                      src={normalizeProjectImageUrl(project.mainImage)}
                      alt={`Proyecto ${project.title}`}
                      fill
                      sizes="(max-width: 900px) 100vw, 42vw"
                      className={styles.casePhoto}
                      unoptimized
                    />
                    <figcaption className={styles.caseMainBadge}>
                      <span className={styles.caseMainBadgeDot} aria-hidden />
                      Imagen principal
                    </figcaption>
                    {project.gallery.length > 0 && (
                      <span className={styles.caseGalleryCount} aria-hidden>
                        {project.gallery.length + 1} imágenes
                      </span>
                    )}
                  </figure>
                  {project.gallery.length === 0 ? (
                    <div className={styles.caseThumbsPlaceholder}>Sin galería adicional</div>
                  ) : (
                    <div
                      className={styles.caseThumbs}
                      role="list"
                      aria-label={`Galería del proyecto ${project.title}`}
                    >
                      {project.gallery.slice(0, 8).map((image, i) => (
                        <div
                          key={`${project.id}-g-${i}`}
                          className={styles.caseThumb}
                          role="listitem"
                        >
                          <Image
                            src={normalizeProjectImageUrl(image)}
                            alt={`${project.title} — imagen ${i + 2}`}
                            fill
                            sizes="(max-width: 600px) 33vw, (max-width: 900px) 22vw, 11vw"
                            className={styles.casePhoto}
                            unoptimized
                          />
                          <span className={styles.caseThumbIndex} aria-hidden>
                            {String(i + 2).padStart(2, "0")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
