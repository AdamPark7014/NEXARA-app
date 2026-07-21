import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import {
  fetchPublishedNews,
  normalizeNewsImageUrl,
  toPlainExcerpt,
} from "@/lib/public-news";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("blog");
}

export const revalidate = 300;

export default async function BlogPage() {
  const posts = await fetchPublishedNews(24);
  const [featured, ...rest] = posts;

  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Blog"
        title={
          <>
            Notas de campo y{" "}
            <span className={heroStyles.titleAccent}>criterio técnico</span>
          </>
        }
        lead="Guías prácticas, tendencias y resultados de operación — publicadas desde Studio."
        imageSrc="/images/hero/hero-04.png"
        imageAlt="Equipo Nexara"
      />

      {featured ? (
        <section className={shared.section} data-reveal="up">
          <div className={shared.inner}>
            <header className={shared.sectionHead}>
              <p className={shared.eyebrow}>Destacado</p>
              <h2 className={shared.sectionTitle}>
                <Link href={`/blog/${featured.slug}`} className={styles.titleLink}>
                  {featured.title}
                </Link>
              </h2>
              <p className={shared.sectionLead}>
                {toPlainExcerpt(featured.summary, featured.content)}
              </p>
            </header>
            <article className={styles.featuredRow} data-reveal="up">
              <Link href={`/blog/${featured.slug}`} className={styles.featuredMedia}>
                <Image
                  src={normalizeNewsImageUrl(featured.coverImageUrl)}
                  alt={featured.title}
                  fill
                  sizes="(max-width: 900px) 100vw, 48vw"
                  className={styles.featuredImage}
                  unoptimized
                  priority
                />
              </Link>
              <div className={styles.featuredBody}>
                <p className={styles.featuredMeta}>
                  {new Date(featured.publishedAt || featured.createdAt).toLocaleDateString("es-MX")}
                </p>
                {featured.tags?.length ? (
                  <div className={styles.tagsRow}>
                    {featured.tags.slice(0, 5).map((tag) => (
                      <span key={`${featured.id}-${tag}`} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className={styles.featuredSummary}>
                  {toPlainExcerpt(featured.summary, featured.content)}
                </p>
                <Link href={`/blog/${featured.slug}`} className={styles.readMore}>
                  Leer artículo →
                </Link>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className={`${shared.section} ${featured ? shared.sectionDivider : ""}`} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Archivo</p>
            <h2 className={shared.sectionTitle}>
              {posts.length ? (
                <>
                  Más <span className={shared.sectionTitleAccent}>publicaciones</span>
                </>
              ) : (
                <>
                  Pronto habrá <span className={shared.sectionTitleAccent}>contenido aquí</span>
                </>
              )}
            </h2>
            <p className={shared.sectionLead}>
              {posts.length
                ? "Listado desde el módulo de noticias de Studio."
                : "Mientras tanto, revisa capacidades o escribe a contacto."}
            </p>
          </header>

          {posts.length > 0 ? (
            <div className={shared.capList} data-reveal-stagger>
              {(featured ? rest : posts).map((post, i) => (
                <article key={post.id} className={styles.postRow} data-reveal="up">
                  <span className={shared.capNum}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className={styles.postDate}>
                      {new Date(post.publishedAt || post.createdAt).toLocaleDateString("es-MX")}
                    </p>
                    <h3 className={shared.capTitle}>
                      <Link href={`/blog/${post.slug}`} className={styles.titleLink}>
                        {post.title}
                      </Link>
                    </h3>
                    <p className={shared.capText}>{toPlainExcerpt(post.summary, post.content)}</p>
                    {post.tags?.length ? (
                      <div className={styles.tagsRow}>
                        {post.tags.slice(0, 4).map((tag) => (
                          <span key={`${post.id}-${tag}`} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>
                Aún no hay noticias publicadas. Explora{" "}
                <Link href="/servicios">servicios</Link> o{" "}
                <Link href="/contacto">contáctanos</Link>.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
