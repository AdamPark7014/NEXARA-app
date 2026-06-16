import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import styles from "./page.module.css";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";

export const dynamic = "force-dynamic";

type NewsPost = {
  id: number;
  slug: string;
  title: string;
  summary?: string | null;
  content: string;
  coverImageUrl?: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED";
  publishedAt?: string | null;
  createdAt: string;
};

function normalizeNewsImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) return "/images/hero/hero-06.png";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  const origin = getApiAssetOrigin();
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/news/image/")) return `${origin}${imageUrl}`;
    return imageUrl;
  }
  return `${origin}/news/image/${imageUrl}`;
}

function toPlainExcerpt(text?: string | null, fallback = ""): string {
  const raw = (text || fallback).replace(/\s+/g, " ").trim();
  if (!raw) return "Contenido disponible en actualización.";
  if (raw.length <= 220) return raw;
  return `${raw.slice(0, 217)}...`;
}

async function fetchBlogPosts(): Promise<NewsPost[]> {
  try {
    const res = await fetch(buildApiUrl("news?limit=12"), {
      cache: "no-store",
    });
    if (!res.ok) return [];

    const payload = (await res.json()) as
      | NewsPost[]
      | { data?: NewsPost[] }
      | { items?: NewsPost[] };

    const rows = Array.isArray(payload)
      ? payload
      : "data" in payload && Array.isArray(payload.data)
        ? payload.data
        : "items" in payload && Array.isArray(payload.items)
          ? payload.items
          : [];

    return rows.filter((post) => post.status === "PUBLISHED");
  } catch {
    return [];
  }
}

export default async function BlogPage() {
  const posts = await fetchBlogPosts();
  const [featured, ...rest] = posts;

  return (
    <main className={shared.page}>
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={styles.heroCompact}>
            <span className={shared.heroEyebrow}>Blog Nexara</span>
            <h1 className={shared.heroTitle}>
              Noticias y análisis para <span className={shared.heroTitleAccent}>decisiones reales</span>
            </h1>
            <p className={shared.heroLead}>
              Publicaciones creadas desde Studio y publicadas automáticamente en esta sección.
              Aquí concentramos tendencias, guías prácticas y resultados de campo.
            </p>
            <div className={shared.heroActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Hablar con un asesor
                <span aria-hidden className={shared.btnArrow}>→</span>
              </Link>
              <Link href="/proyectos" className={`${shared.btn} ${shared.btnSecondary}`}>
                Ver proyectos
                <span aria-hidden className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {featured && (
        <section className={`${shared.section} ${shared.sectionDivider}`}>
          <div className={shared.inner}>
            <div className={shared.sectionHead} data-reveal="soft">
              <span className={shared.eyebrow}>Destacado</span>
              <h2 className={shared.sectionTitle}>
                {featured.title}
              </h2>
              <p className={shared.sectionLead}>
                {toPlainExcerpt(featured.summary, featured.content)}
              </p>
            </div>

            <article className={styles.featuredCard} data-reveal="up">
              <div className={styles.featuredMedia}>
                <Image
                  src={normalizeNewsImageUrl(featured.coverImageUrl)}
                  alt={featured.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className={styles.featuredImage}
                  unoptimized
                />
              </div>
              <div className={styles.featuredBody}>
                <div className={styles.featuredMeta}>
                  <span>{new Date(featured.publishedAt || featured.createdAt).toLocaleDateString("es-MX")}</span>
                  <span>Publicación</span>
                </div>
                <h3 className={styles.featuredTitle}>{featured.title}</h3>
                <p className={styles.featuredSummary}>{toPlainExcerpt(featured.summary, featured.content)}</p>
                {featured.tags?.length ? (
                  <div className={styles.tagsRow}>
                    {featured.tags.slice(0, 6).map((tag) => (
                      <span key={`${featured.id}-${tag}`} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      )}

      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Archivo</span>
            <h2 className={shared.sectionTitle}>
              Más contenido del <span className={shared.sectionTitleAccent}>blog</span>
            </h2>
            <p className={shared.sectionLead}>
              Contenido inyectado desde el módulo de noticias, listo para SEO y lectura pública.
            </p>
          </div>

          {posts.length > 0 ? (
            <div className={styles.blogGrid} data-reveal-stagger>
              {(featured ? rest : posts).map((post) => (
                <article key={post.id} className={shared.imageCard} data-reveal="up">
                  <div className={shared.imageCardImg}>
                    <Image
                      src={normalizeNewsImageUrl(post.coverImageUrl)}
                      alt={post.title}
                      width={720}
                      height={430}
                      unoptimized
                    />
                    <span className={styles.publishedDate}>
                      {new Date(post.publishedAt || post.createdAt).toLocaleDateString("es-MX")}
                    </span>
                  </div>
                  <div className={shared.imageCardBody}>
                    <h3 className={shared.imageCardTitle}>{post.title}</h3>
                    <p className={shared.imageCardText}>{toPlainExcerpt(post.summary, post.content)}</p>
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
              <h3>Aun no hay noticias publicadas</h3>
              <p>
                Corre el seeder de noticias o publica desde Studio para que aparezcan aqui.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
