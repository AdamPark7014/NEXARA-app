import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import shared from "../../_shared/public.module.css";
import styles from "../page.module.css";
import {
  fetchNewsBySlug,
  normalizeNewsImageUrl,
  toPlainExcerpt,
} from "@/lib/public-news";

type Params = { slug: string };

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const post = await fetchNewsBySlug(params.slug);
  if (!post) {
    return { title: "Artículo no encontrado", robots: { index: false, follow: false } };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(
    /\/+$/,
    "",
  );
  const path = `/blog/${post.slug}`;
  const description = toPlainExcerpt(post.summary, post.content, 155);
  const cover = normalizeNewsImageUrl(post.coverImageUrl);
  const ogImage = cover.startsWith("http") ? cover : `${siteUrl}${cover.startsWith("/") ? cover : `/${cover}`}`;

  return {
    title: { absolute: `${post.title} | NEXARA` },
    description,
    keywords: post.tags?.length ? post.tags : undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      locale: "es_MX",
      url: `${siteUrl}${path}`,
      siteName: "NEXARA",
      title: post.title,
      description,
      publishedTime: post.publishedAt || post.createdAt,
      modifiedTime: post.updatedAt || post.publishedAt || post.createdAt,
      tags: post.tags,
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const post = await fetchNewsBySlug(params.slug);
  if (!post) notFound();

  const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(
    /\/+$/,
    "",
  );
  const cover = normalizeNewsImageUrl(post.coverImageUrl);
  const published = post.publishedAt || post.createdAt;

  const articleJson = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: toPlainExcerpt(post.summary, post.content, 160),
    image: cover.startsWith("http") ? cover : `${siteUrl}${cover}`,
    datePublished: published,
    dateModified: post.updatedAt || published,
    author: { "@type": "Organization", name: "NEXARA", url: siteUrl },
    publisher: {
      "@type": "Organization",
      name: "NEXARA",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo-nexara-lockup.png` },
    },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
  };

  return (
    <main className={`${shared.page} home-main-flush`} aria-label={post.title}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJson) }}
      />

      <article className={shared.section} data-reveal="up">
        <div className={`${shared.inner} ${styles.articleInner}`}>
          <p className={styles.articleBreadcrumb}>
            <Link href="/blog">Blog</Link>
            <span aria-hidden> / </span>
            <span>{post.title}</span>
          </p>

          <header className={styles.articleHeader}>
            <p className={styles.featuredMeta}>
              {new Date(published).toLocaleDateString("es-MX", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className={styles.articleTitle}>{post.title}</h1>
            {post.summary ? (
              <p className={styles.articleLead}>{post.summary}</p>
            ) : null}
            {post.tags?.length ? (
              <div className={styles.tagsRow}>
                {post.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </header>

          <div className={styles.articleCover}>
            <Image
              src={cover}
              alt={post.title}
              fill
              priority
              sizes="(max-width: 900px) 100vw, 920px"
              className={styles.featuredImage}
              unoptimized
            />
          </div>

          <div className={styles.articleBody}>{post.content}</div>

          <footer className={styles.articleFooter}>
            <Link href="/blog" className={styles.articleBack}>
              ← Volver al blog
            </Link>
            <Link href="/contacto" className={styles.articleCta}>
              Hablar con Nexara →
            </Link>
          </footer>
        </div>
      </article>
    </main>
  );
}
