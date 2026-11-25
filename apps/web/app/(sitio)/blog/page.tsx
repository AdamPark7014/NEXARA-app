import type { CSSProperties } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { fetchPublishedNews, normalizeNewsImageUrl, toPlainExcerpt, type PublicNewsPost } from "@/lib/public-news";
import { GUIAS, type Guia } from "@/lib/guias";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import s from "@/components/sitio/sitio.module.css";
import x from "@/components/sitio/profundo.module.css";
import { SENALES } from "@/components/sitio/senales";
import HeroInterior from "@/components/sitio/HeroInterior";
import Directorio from "@/components/sitio/Directorio";
import Cierre from "@/components/sitio/Cierre";
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

/** Nota de Studio o guía permanente, con lo que necesita una tarjeta. */
type Entrada = {
  clave: string;
  href: string;
  titulo: string;
  resumen: string;
  fecha: string;
  etiqueta: string;
  imagen: (sizes: string) => Foto;
  tags?: string[];
};

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const deNota = (post: PublicNewsPost): Entrada => ({
  clave: `nota-${post.id}`,
  href: `/blog/${post.slug}`,
  titulo: post.title,
  resumen: toPlainExcerpt(post.summary, post.content, 200),
  fecha: post.publishedAt || post.createdAt,
  etiqueta: post.tags?.[0] ?? "Nota",
  imagen: (sizes) => (post.coverImageUrl ? { src: normalizeNewsImageUrl(post.coverImageUrl) } : foto("muro-video-ancho", sizes)),
  tags: post.tags,
});

const deGuia = (g: Guia): Entrada => ({
  clave: `guia-${g.slug}`,
  href: `/blog/${g.slug}`,
  titulo: g.titulo,
  resumen: g.resumen,
  fecha: g.publicada,
  etiqueta: `${g.tema} · ${g.lectura} min`,
  imagen: (sizes) => foto(g.foto, sizes),
});

/** Lo más reciente, montado en el corte entre la noche y la página. */
function Destacada({ e, antetitulo }: { e: Entrada; antetitulo: string }) {
  return (
    <article className={x.estelar} data-luz="">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...e.imagen("(max-width: 1260px) 100vw, 1200px")} alt="" fetchPriority="high" decoding="async" />
      <div className={x.estelarTexto} style={{ "--c": "var(--senal-cian)" } as CSSProperties}>
        <p className={x.notaEtiqueta}>
          {antetitulo} · {e.etiqueta}
        </p>
        <h2>
          <Link href={e.href}>{e.titulo}</Link>
        </h2>
        <p>{e.resumen}</p>
      </div>
    </article>
  );
}

function Rejilla({ entradas }: { entradas: Entrada[] }) {
  return (
    <ul className={x.notas}>
      {entradas.map((e, n) => (
        <li key={e.clave} className={x.nota} data-aparecer data-luz="" data-inclina="4" style={{ "--c": SENALES[n % 5].color } as CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...e.imagen("(max-width: 900px) 100vw, 620px")} alt="" loading="lazy" decoding="async" />
          <div className={x.notaTexto}>
            <p className={x.notaEtiqueta}>{e.etiqueta}</p>
            <h3>
              <Link href={e.href}>{e.titulo}</Link>
            </h3>
            <p>
              <span>{e.resumen}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function BlogPage() {
  const posts = await fetchPublishedNews(24);
  const notas = posts.map(deNota);
  const guias = GUIAS.map(deGuia);
  const hayNotas = notas.length > 0;

  return (
    <main aria-label="Blog de NEXARA">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "Blog NEXARA",
          url: `${siteBaseUrl()}/blog`,
          description: "Guías, noticias y notas de campo sobre CCTV, redes y soporte TI.",
          blogPost: [...notas.slice(0, 12), ...guias].map((e) => ({
            "@type": "BlogPosting",
            headline: e.titulo,
            url: `${siteBaseUrl()}${e.href}`,
            datePublished: e.fecha,
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
        lead="Guías prácticas y aprendizajes de obra, escritos por el equipo que instala, para decidir mejor antes de cotizar."
        tipoVisual="libre"
        visual={hayNotas ? <Destacada e={notas[0]} antetitulo="Lo más reciente" /> : <Destacada e={guias[0]} antetitulo="Guía destacada" />}
      />

      {hayNotas && notas.length > 1 ? (
        <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="notas-titulo">
          <div className={s.contenedor}>
            <p className={s.antetitulo}>Notas</p>
            <h2 id="notas-titulo" className={s.titulo}>
              Lo que pasa <span className={s.tenue}>en campo.</span>
            </h2>
            <Rejilla entradas={notas.slice(1)} />
          </div>
        </section>
      ) : null}

      <section className={`${s.seccion} ${hayNotas && notas.length > 1 ? "" : s.seccionAlt}`} aria-labelledby="guias-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Guías</p>
              <h2 id="guias-titulo" className={s.titulo}>
                Antes de cotizar, <span className={s.tenue}>lo que conviene saber.</span>
              </h2>
            </div>
            <p className={s.lead}>Criterios que usamos en cada proyecto, explicados sin tecnicismos de más.</p>
          </div>
          <Rejilla entradas={hayNotas ? guias : guias.slice(1)} />
        </div>
      </section>

      <Directorio
        actual="/blog"
        titulo="De la guía a la cotización"
        lead="Cuando una duda apunta a un problema real, estas soluciones cierran el ciclo."
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
