import Link from "next/link";
import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { fetchPublishedNews, normalizeNewsImageUrl, toPlainExcerpt, type PublicNewsPost } from "@/lib/public-news";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import Rutas from "@/components/sitio/TarjetasRuta";
import Directorio from "@/components/sitio/Directorio";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import { foto, type Foto } from "@/components/sitio/fotos";

export async function generateMetadata(): Promise<Metadata> {
  const base = await buildStudioPageMetadata("blog");
  return {
    ...base,
    alternates: {
      ...(typeof base.alternates === "object" ? base.alternates : {}),
      types: {
        "application/rss+xml": `${siteBaseUrl()}/feed.xml`,
      },
    },
  };
}

export const revalidate = 300;

const fecha = (post: PublicNewsPost) =>
  new Date(post.publishedAt || post.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

/** Portada de Studio o, si la nota no trae, la foto del centro de monitoreo en webp. */
const portada = (post: PublicNewsPost, sizes: string): Foto =>
  post.coverImageUrl ? { src: normalizeNewsImageUrl(post.coverImageUrl) } : foto("monitoreo-pantallas-cctv", sizes);

function Etiquetas({ tags, max }: { tags?: string[]; max: number }) {
  if (!tags?.length) return null;
  return (
    <div className={i.etiquetas}>
      {tags.slice(0, max).map((t) => (
        <span key={t}>{t}</span>
      ))}
    </div>
  );
}

export default async function BlogPage() {
  const posts = await fetchPublishedNews(24);
  const [destacada, ...resto] = posts;

  return (
    <main aria-label="Blog de NEXARA">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "Blog NEXARA",
          url: `${siteBaseUrl()}/blog`,
          description: "Noticias, guías y notas de campo sobre CCTV, redes y soporte TI.",
          blogPost: posts.slice(0, 12).map((p) => ({
            "@type": "BlogPosting",
            headline: p.title,
            url: `${siteBaseUrl()}/blog/${p.slug}`,
            datePublished: p.publishedAt || p.createdAt,
          })),
        }}
      />

      <HeroInterior
        id="blog-titulo"
        antetitulo="Blog"
        titulo={
          <>
            Notas de campo <span className={s.tenue}>y criterio técnico.</span>
          </>
        }
        lead="Guías prácticas, aprendizajes de obra y resultados de operación, escritos por el equipo que instala."
      />

      {destacada ? (
        <>
          <section className={s.seccion} aria-labelledby="destacada-titulo" style={{ paddingTop: 0 }}>
            <div className={s.contenedor}>
              <article className={i.destacada} data-aparecer>
                <Link href={`/blog/${destacada.slug}`} className={i.portada} tabIndex={-1} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img {...portada(destacada, "(max-width: 1068px) 100vw, 660px")} alt="" fetchPriority="high" decoding="async" />
                </Link>
                <div>
                  <p className={s.antetitulo}>Lo más reciente</p>
                  <p className={i.fecha}>
                    <time dateTime={destacada.publishedAt || destacada.createdAt}>{fecha(destacada)}</time>
                  </p>
                  <h2 id="destacada-titulo" className={i.destacadaTitulo}>
                    <Link href={`/blog/${destacada.slug}`}>{destacada.title}</Link>
                  </h2>
                  <p className={i.resumen}>{toPlainExcerpt(destacada.summary, destacada.content, 220)}</p>
                  <Etiquetas tags={destacada.tags} max={5} />
                  <p style={{ marginTop: 28 }}>
                    <Link href={`/blog/${destacada.slug}`} className={s.enlace}>
                      Leer la nota
                      <Flecha />
                    </Link>
                  </p>
                </div>
              </article>
            </div>
          </section>

          {resto.length > 0 ? (
            <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="archivo-titulo">
              <div className={s.contenedor}>
                <p className={s.antetitulo}>Archivo</p>
                <h2 id="archivo-titulo" className={s.titulo}>
                  Más <span className={s.tenue}>notas.</span>
                </h2>
                <ul className={i.entradas}>
                  {resto.map((post) => (
                    <li key={post.id} className={i.entrada} data-aparecer>
                      <Link href={`/blog/${post.slug}`} className={i.portada} tabIndex={-1} aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img {...portada(post, "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 380px")} alt="" loading="lazy" decoding="async" />
                      </Link>
                      <p className={i.fecha}>
                        <time dateTime={post.publishedAt || post.createdAt}>{fecha(post)}</time>
                      </p>
                      <h3 className={i.entradaTitulo}>
                        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                      </h3>
                      <p className={i.resumen}>{toPlainExcerpt(post.summary, post.content, 140)}</p>
                      <Etiquetas tags={post.tags} max={3} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className={s.seccion} aria-labelledby="pronto-titulo" style={{ paddingTop: 0 }}>
          <div className={s.contenedor}>
            <div className={i.vacio} data-aparecer>
              <span className={i.panelIcono}>
                <PublicIcon name="clipboard" size={24} />
              </span>
              <h2 id="pronto-titulo" className={i.panelTitulo}>
                Las primeras notas <span className={s.tenue}>vienen en camino.</span>
              </h2>
              <p className={i.panelTexto} style={{ marginInline: "auto", maxWidth: "46ch" }}>
                Mientras tanto, estas páginas responden lo que más nos preguntan antes de cotizar.
              </p>
            </div>
            <Rutas
              ir="Abrir"
              rutas={[
                {
                  href: "/qa",
                  titulo: "Preguntas frecuentes",
                  texto: "Tiempos, garantías, soporte y cómo se arma una cotización.",
                  icono: "search",
                },
                {
                  href: "/proyectos",
                  titulo: "Proyectos",
                  texto: "Instalaciones reales en operación, con lo que entregamos en cada una.",
                  icono: "layers",
                },
                {
                  href: "/servicios",
                  titulo: "Servicios",
                  texto: "Videovigilancia, redes, cómputo, soporte y plataformas bajo un contrato.",
                  icono: "check",
                },
              ]}
            />
          </div>
        </section>
      )}

      <Directorio
        actual="/blog"
        titulo="De la nota a la cotización"
        lead="Cuando una duda apunta a un problema real, estas soluciones cierran el ciclo."
        industrias={4}
        porIndustria={2}
      />

      <Cierre
        titulo={
          <>
            ¿Tienes un caso parecido? <span className={s.tenue}>Cuéntanos.</span>
          </>
        }
        texto="Diagnóstico corto en Puebla o CDMX. Te decimos qué instalar, qué posponer y qué presupuesto tiene sentido."
        origen="/blog"
      />
    </main>
  );
}
