import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchNewsBySlug, normalizeNewsImageUrl, toPlainExcerpt } from "@/lib/public-news";
import { JsonLd } from "@/lib/seo/json-ld";
import s from "@/components/sitio/sitio.module.css";
import i from "@/components/sitio/interior.module.css";
import Migas from "@/components/sitio/Migas";
import Directorio from "@/components/sitio/Directorio";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import { foto } from "@/components/sitio/fotos";

type Params = { slug: string };

export const revalidate = 300;

const siteUrl = () => (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

const absoluta = (url: string) => (url.startsWith("http") ? url : `${siteUrl()}${url.startsWith("/") ? url : `/${url}`}`);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const post = await fetchNewsBySlug(params.slug);
  if (!post) {
    return { title: "Artículo no encontrado", robots: { index: false, follow: false } };
  }

  const path = `/blog/${post.slug}`;
  const description = toPlainExcerpt(post.summary, post.content, 155);
  const ogImage = absoluta(normalizeNewsImageUrl(post.coverImageUrl));

  return {
    title: { absolute: `${post.title} | NEXARA` },
    description,
    keywords: post.tags?.length ? post.tags : undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      locale: "es_MX",
      url: `${siteUrl()}${path}`,
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

  const publicada = post.publishedAt || post.createdAt;
  const cover = normalizeNewsImageUrl(post.coverImageUrl);
  const imagen = post.coverImageUrl ? { src: cover } : foto("monitoreo-pantallas-cctv", "(max-width: 1100px) 100vw, 1040px");

  return (
    <main aria-label={post.title}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description: toPlainExcerpt(post.summary, post.content, 160),
          image: absoluta(cover),
          datePublished: publicada,
          dateModified: post.updatedAt || publicada,
          author: { "@type": "Organization", name: "NEXARA", url: siteUrl() },
          publisher: {
            "@type": "Organization",
            name: "NEXARA",
            logo: { "@type": "ImageObject", url: `${siteUrl()}/logo-nexara-lockup.png` },
          },
          mainEntityOfPage: `${siteUrl()}/blog/${post.slug}`,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl() },
            { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl()}/blog` },
            { "@type": "ListItem", position: 3, name: post.title, item: `${siteUrl()}/blog/${post.slug}` },
          ],
        }}
      />

      <article aria-labelledby="nota-titulo">
        <header className={i.articulo}>
          <Migas alinear="izq" migas={[{ href: "/", label: "Inicio" }, { href: "/blog", label: "Blog" }, { label: post.title }]} />
          <p className={i.fecha}>
            <time dateTime={publicada}>
              {new Date(publicada).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
            </time>
          </p>
          <h1 id="nota-titulo" className={i.articuloTitulo}>
            {post.title}
          </h1>
          {post.summary ? <p className={i.articuloLead}>{post.summary}</p> : null}
          {post.tags?.length ? (
            <div className={i.etiquetas}>
              {post.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          ) : null}
        </header>

        <figure className={i.articuloPortada}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...imagen} alt="" fetchPriority="high" decoding="async" />
        </figure>

        <div className={i.articulo} style={{ paddingTop: 0 }}>
          <div className={i.cuerpo}>{post.content}</div>
          <footer className={i.articuloPie}>
            <Link href="/blog" className={i.volver}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1L4 5l4 4" />
              </svg>
              Todas las notas
            </Link>
            <Link href="/contacto" className={s.enlace} data-track-conversion="blog_articulo_cta">
              Cotiza tu proyecto
              <Flecha />
            </Link>
          </footer>
        </div>
      </article>

      <Directorio actual={`/blog/${post.slug}`} titulo="Soluciones relacionadas" industrias={4} porIndustria={2} />

      <Cierre
        titulo={
          <>
            ¿Te pasa algo parecido? <span className={s.tenue}>Lo revisamos contigo.</span>
          </>
        }
        texto="Diagnóstico corto en Puebla o CDMX. Te decimos qué instalar, qué posponer y qué presupuesto tiene sentido."
        origen={`/blog/${post.slug}`}
      />
    </main>
  );
}
