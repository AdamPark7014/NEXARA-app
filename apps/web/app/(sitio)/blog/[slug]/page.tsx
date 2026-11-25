import type { CSSProperties } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchNewsBySlug, normalizeNewsImageUrl, toPlainExcerpt } from "@/lib/public-news";
import { GUIAS, findGuia, type Guia } from "@/lib/guias";
import { JsonLd } from "@/lib/seo/json-ld";
import { recortarDescripcion } from "@/lib/seo/textos";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import IndiceGuia from "@/components/sitio/IndiceGuia";
import x from "@/components/sitio/profundo.module.css";
import { SENALES } from "@/components/sitio/senales";
import Directorio from "@/components/sitio/Directorio";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import SimuladorCobertura from "@/components/sitio/SimuladorCobertura";
import BarraLectura from "@/components/sitio/BarraLectura";
import { foto, fotoOg } from "@/components/sitio/fotos";

type Params = { slug: string };

export const revalidate = 300;

const siteUrl = () => (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

const absoluta = (url: string) => (url.startsWith("http") ? url : `${siteUrl()}${url.startsWith("/") ? url : `/${url}`}`);

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export async function generateMetadata(props: { params: Promise<Params> }): Promise<Metadata> {
  const params = await props.params;
  const post = await fetchNewsBySlug(params.slug);
  const guia = post ? undefined : findGuia(params.slug);
  if (!post && !guia) {
    return { title: "Artículo no encontrado", robots: { index: false, follow: false } };
  }

  const path = `/blog/${params.slug}`;
  const titulo = post?.title ?? guia!.titulo;
  const description = post ? toPlainExcerpt(post.summary, post.content, 155) : recortarDescripcion(guia!.resumen);
  const ogImage = absoluta(post ? normalizeNewsImageUrl(post.coverImageUrl) : fotoOg(guia!.foto));
  const publicada = post ? post.publishedAt || post.createdAt : guia!.publicada;

  return {
    title: { absolute: `${titulo} | NEXARA` },
    description,
    keywords: post?.tags?.length ? post.tags : guia ? [guia.tema, "NEXARA", "guía"] : undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      locale: "es_MX",
      url: `${siteUrl()}${path}`,
      siteName: "NEXARA",
      title: titulo,
      description,
      publishedTime: publicada,
      modifiedTime: post ? post.updatedAt || publicada : publicada,
      tags: post?.tags ?? (guia ? [guia.tema] : undefined),
      images: [{ url: ogImage, width: 1200, height: 630, alt: titulo }],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description,
      images: [ogImage],
    },
  };
}

function Estructurados({ slug, titulo, resumen, imagen, publicada, modificada }: { slug: string; titulo: string; resumen: string; imagen: string; publicada: string; modificada: string }) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: titulo,
          description: resumen,
          image: imagen,
          datePublished: publicada,
          dateModified: modificada,
          author: { "@type": "Organization", name: "NEXARA", url: siteUrl() },
          publisher: {
            "@type": "Organization",
            name: "NEXARA",
            logo: { "@type": "ImageObject", url: `${siteUrl()}/logo-nexara-lockup.png` },
          },
          mainEntityOfPage: `${siteUrl()}/blog/${slug}`,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl() },
            { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl()}/blog` },
            { "@type": "ListItem", position: 3, name: titulo, item: `${siteUrl()}/blog/${slug}` },
          ],
        }}
      />
    </>
  );
}

function Pie() {
  return (
    <footer className={i.articuloPie}>
      <Link href="/blog" className={i.volver}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1L4 5l4 4" />
        </svg>
        Todo el blog
      </Link>
      <Link href="/contacto" className={s.enlace} data-track-conversion="blog_articulo_cta">
        Cotiza tu proyecto
        <Flecha />
      </Link>
    </footer>
  );
}

function OtrasGuias({ actual }: { actual?: string }) {
  const otras = GUIAS.filter((g) => g.slug !== actual).slice(0, 3);
  return (
    <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="otras-guias">
      <div className={s.contenedor}>
        <p className={s.antetitulo}>Sigue leyendo</p>
        <h2 id="otras-guias" className={s.titulo}>
          Más guías <span className={s.tenue}>del equipo.</span>
        </h2>
        <ul className={x.notas}>
          {otras.map((g, n) => (
            <li key={g.slug} className={`${x.nota} ${x.notaTercio}`} data-aparecer data-luz="" data-inclina="4" style={{ "--c": SENALES[n % 5].color } as CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img {...foto(g.foto, "(max-width: 900px) 100vw, 400px")} alt="" loading="lazy" decoding="async" />
              <div className={x.notaTexto}>
                <p className={x.notaEtiqueta}>
                  {g.tema} · {g.lectura} min
                </p>
                <h3>
                  <Link href={`/blog/${g.slug}`}>{g.titulo}</Link>
                </h3>
                <p>
                  <span>{g.resumen}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function GuiaPagina({ guia }: { guia: Guia }) {
  return (
    <main aria-label={guia.titulo}>
      <Estructurados
        slug={guia.slug}
        titulo={guia.titulo}
        resumen={guia.resumen}
        imagen={absoluta(fotoOg(guia.foto))}
        publicada={guia.publicada}
        modificada={guia.publicada}
      />
      <BarraLectura articulo="nota" />
      <article id="nota" aria-labelledby="nota-titulo">
        <HeroInterior
          id="nota-titulo"
          tituloLargo
          migas={[{ href: "/", label: "Inicio" }, { href: "/blog", label: "Blog" }, { label: guia.titulo }]}
          antetitulo={
            <>
              {guia.tema} · {guia.lectura} min · <time dateTime={guia.publicada}>{fechaLarga(guia.publicada)}</time>
            </>
          }
          titulo={guia.titulo}
          lead={guia.resumen}
          visual={
            // eslint-disable-next-line @next/next/no-img-element
            <img {...foto(guia.foto, "(max-width: 1260px) 100vw, 1200px")} alt="" fetchPriority="high" decoding="async" />
          }
        />

        <div className={x.lectura}>
        <IndiceGuia secciones={guia.secciones.map((sc, n) => ({ id: `parte-${n + 1}`, titulo: sc.titulo }))} />
        <div className={i.articulo} style={{ paddingTop: 0 }}>
          <div className={i.prosa}>
            {guia.secciones.map((sc, n) => (
              <section key={sc.titulo} id={`parte-${n + 1}`}>
                <h2>{sc.titulo}</h2>
                {sc.parrafos.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
                {sc.puntos ? (
                  <ul>
                    {sc.puntos.map((pt) => (
                      <li key={pt}>
                        <PublicIcon name="check" size={18} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          <aside className={i.siguiente} aria-label="Siguiente paso">
            <p>
              ¿Lo quieres resuelto en tu sitio?
              <span>Lo revisamos en un diagnóstico y te decimos qué conviene.</span>
            </p>
            <Link href={guia.solucion.href} className={`${s.boton} ${s.botonSecundario}`}>
              {guia.solucion.label}
              <Flecha />
            </Link>
          </aside>
          <Pie />
        </div>
        </div>
      </article>

      {guia.interactivo === "cctv" ? (
        <section className={s.seccion} aria-labelledby="pruebalo-titulo" style={{ paddingTop: 0 }}>
          <div className={s.contenedor}>
            <p className={s.antetitulo}>Pruébalo</p>
            <h2 id="pruebalo-titulo" className={s.titulo}>
              Mueve las cámaras <span className={s.tenue}>y mira qué queda a ciegas.</span>
            </h2>
            <SimuladorCobertura />
          </div>
        </section>
      ) : null}

      <OtrasGuias actual={guia.slug} />

      <Cierre
        titulo={
          <>
            ¿Te pasa algo parecido? <span className={s.tenue}>Lo revisamos contigo.</span>
          </>
        }
        texto="Diagnóstico corto en Puebla o CDMX. Te decimos qué instalar, qué posponer y qué presupuesto tiene sentido."
        origen={`/blog/${guia.slug}`}
      />
    </main>
  );
}

export default async function BlogPostPage(props: { params: Promise<Params> }) {
  const params = await props.params;
  const post = await fetchNewsBySlug(params.slug);
  if (!post) {
    const guia = findGuia(params.slug);
    if (!guia) notFound();
    return <GuiaPagina guia={guia} />;
  }

  const publicada = post.publishedAt || post.createdAt;
  const cover = normalizeNewsImageUrl(post.coverImageUrl);
  const imagen = post.coverImageUrl ? { src: cover } : foto("muro-video-ancho", "(max-width: 1100px) 100vw, 1040px");

  return (
    <main aria-label={post.title}>
      <Estructurados
        slug={post.slug}
        titulo={post.title}
        resumen={toPlainExcerpt(post.summary, post.content, 160)}
        imagen={absoluta(cover)}
        publicada={publicada}
        modificada={post.updatedAt || publicada}
      />

      <BarraLectura articulo="nota" />
      <article id="nota" aria-labelledby="nota-titulo">
        <HeroInterior
          id="nota-titulo"
          tituloLargo
          migas={[{ href: "/", label: "Inicio" }, { href: "/blog", label: "Blog" }, { label: post.title }]}
          antetitulo={<time dateTime={publicada}>{fechaLarga(publicada)}</time>}
          titulo={post.title}
          lead={post.summary ?? ""}
          acciones={
            post.tags?.length ? (
              <div className={i.etiquetas}>
                {post.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            ) : undefined
          }
          visual={
            // eslint-disable-next-line @next/next/no-img-element
            <img {...imagen} alt="" fetchPriority="high" decoding="async" />
          }
        />

        <div className={i.articulo} style={{ paddingTop: 0 }}>
          <div className={i.cuerpo}>{post.content}</div>
          <Pie />
        </div>
      </article>

      <OtrasGuias />

      <Directorio actual={`/blog/${post.slug}`} titulo="Soluciones relacionadas" />

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
