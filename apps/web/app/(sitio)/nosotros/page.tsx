import Link from "next/link";
import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import { foto } from "@/components/sitio/fotos";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import Aurora from "@/components/sitio/Aurora";
import Flecha from "@/components/sitio/Flecha";
import Cierre from "@/components/sitio/Cierre";
import Certificaciones from "@/components/sitio/Certificaciones";
import { EQUIPO, retrato } from "@/components/sitio/equipo";
import { ruta } from "@/components/sitio/rutas";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("nosotros");
}

export const dynamic = "force-dynamic";

const DATOS: { icono: PublicIconName; etiqueta: string; valor: string }[] = [
  { icono: "mapPin", etiqueta: "Sedes", valor: "Puebla y Ciudad de México, con cobertura nacional" },
  { icono: "shield", etiqueta: "Modelo", valor: "Diseño, instalación y soporte con un solo responsable técnico" },
  { icono: "users", etiqueta: "Equipo propio", valor: "Ingenieros, instaladores y flotilla propios, sin subcontratar la obra" },
  { icono: "layers", etiqueta: "Trayectoria", valor: "Más de 200 sitios implementados en 32 estados del país" },
];

const COMPROMISOS = [
  "Personal con DC-3 vigente y cableado con estándares certificados",
  "Propuesta con alcance cerrado y calendario visible",
  "Instalación documentada: diagramas, etiquetado y evidencia",
  "Soporte con SLA después del arranque",
];

const PRINCIPIOS = [
  {
    titulo: "Claridad",
    texto: "Alcances, tiempos, costos y riesgos se definen desde el inicio. Decisiones informadas, sin sorpresas a mitad del proyecto.",
  },
  {
    titulo: "Ingeniería basada en la realidad",
    texto: "Cada solución nace del análisis del sitio. Diseñamos pensando en la instalación, el mantenimiento y el desempeño, no solo en la teoría.",
  },
  {
    titulo: "Compromiso continuo",
    texto: "La entrega es el inicio de la relación: seguimiento, soporte y mejora para que cada instalación se mantenga estable.",
  },
];

const EN_CAMPO = [
  { ...foto("campo-levantamiento-patio", "(max-width: 734px) 100vw, 400px"), alt: "Integrante de NEXARA en el levantamiento de un patio de maniobras", tema: "Levantamiento", pie: "Recorrido del sitio antes de cotizar." },
  { ...foto("tecnico-ensamble-chasis-pc-taller", "(max-width: 734px) 100vw, 400px"), alt: "Técnico de NEXARA ensamblando un equipo en el taller", tema: "Taller", pie: "Cada equipo se arma y se prueba aquí." },
  { ...foto("tecnicos-mantenimiento-pc-colaboracion", "(max-width: 734px) 100vw, 400px"), alt: "Dos técnicos de NEXARA revisando un equipo", tema: "Revisión", pie: "Dos personas revisan cada entrega." },
];


export default function Nosotros() {
  return (
    <main aria-label="Nosotros">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          url: `${siteBaseUrl()}/nosotros`,
          name: "Nosotros · NEXARA",
          mainEntity: {
            "@type": "Organization",
            name: "NEXARA",
            url: siteBaseUrl(),
            logo: `${siteBaseUrl()}/logo-nexara-lockup.png`,
            description: "Integrador tecnológico en México: CCTV, redes, cómputo y soporte con disciplina de campo.",
          },
        }}
      />
      <section className={p.hero} aria-labelledby="nosotros-hero">
        <Aurora />
        <div className={`${s.contenedor} ${s.centro}`}>
          <p className={s.antetitulo}>Nosotros</p>
          <h1 id="nosotros-hero" className={p.heroTitulo}>
            Las personas detrás <span className={s.degradado}>de cada solución.</span>
          </h1>
          <p className={p.heroLead}>Ingeniería, instalación y soporte que mantienen tu operación, desde Puebla y la Ciudad de México.</p>
          <figure className={p.heroFoto}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fotos/equipo-tecnico-nexara-uniforme-1920.webp"
              srcSet="/fotos/equipo-tecnico-nexara-uniforme-1200.webp 1200w, /fotos/equipo-tecnico-nexara-uniforme-1920.webp 1920w"
              sizes="(max-width: 1280px) 100vw, 1200px"
              alt="Equipo técnico de NEXARA"
              style={{ objectPosition: "center 34%" }}
              fetchPriority="high"
            />
          </figure>
        </div>
      </section>

      {/* Datos operativos */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-label="Cómo operamos" style={{ paddingTop: "clamp(56px, 7vw, 96px)" }}>
        <div className={s.contenedor}>
          <p className={s.declaracion} data-aparecer>
            Un integrador con disciplina de campo. <span className={s.tenue}>Diseñamos, instalamos y sostenemos la tecnología de empresas que no pueden detenerse.</span>
          </p>
          <ul className={p.datos}>
            {DATOS.map((d) => (
              <li key={d.etiqueta} className={p.dato} data-aparecer>
                <span className={p.datoIcono}>
                  <PublicIcon name={d.icono} size={22} />
                </span>
                <p className={p.datoEtiqueta}>{d.etiqueta}</p>
                <p className={p.datoValor}>{d.valor}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Quiénes somos */}
      <section className={s.seccion} aria-labelledby="quienes-titulo">
        <div className={`${s.contenedor} ${p.dos}`}>
          <figure className={p.dosFoto} data-aparecer>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...foto("equipo-nexara-polos", "(max-width: 1068px) 100vw, 560px")} alt="Integrantes del equipo NEXARA" loading="lazy" decoding="async" />
          </figure>
          <div data-aparecer>
            <p className={s.antetitulo}>Quiénes somos</p>
            <h2 id="quienes-titulo" className={s.titulo}>
              Donde la tecnología <span className={s.tenue}>se vuelve resultados.</span>
            </h2>
            <ul className={p.lista}>
              {COMPROMISOS.map((c) => (
                <li key={c}>
                  <PublicIcon name="check" size={18} />
                  {c}
                </li>
              ))}
            </ul>
            <div className={s.acciones}>
              <Link href={ruta("/servicios")} className={`${s.boton} ${s.botonPrimario}`}>
                Ver servicios
                <Flecha />
              </Link>
              <Link href={ruta("/proyectos")} className={`${s.boton} ${s.botonSecundario}`}>
                Ver proyectos
                <Flecha />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Principios */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="principios-titulo">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
            <p className={s.antetitulo}>Principios</p>
            <h2 id="principios-titulo" className={s.titulo}>
              Cómo nos <span className={s.tenue}>comportamos.</span>
            </h2>
            <p className={s.lead}>Tres compromisos que se notan en cada proyecto, del levantamiento al soporte.</p>
          </header>
          <ol className={p.tres}>
            {PRINCIPIOS.map((pr, i) => (
              <li key={pr.titulo} className={p.tresItem} data-aparecer>
                <span className={p.tresNumero}>0{i + 1}</span>
                <h3 className={p.tresTitulo}>{pr.titulo}</h3>
                <p className={p.tresTexto}>{pr.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* En campo */}
      <section className={s.seccion} aria-labelledby="campo-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>En campo</p>
              <h2 id="campo-titulo" className={s.titulo}>
                El mismo equipo que diseña, <span className={s.tenue}>instala.</span>
              </h2>
            </div>
            <p className={s.lead}>Fotografía de proyectos reales de NEXARA, no de banco de imágenes.</p>
          </div>
          <div className={p.fotos}>
            {EN_CAMPO.map((f) => (
              <figure key={f.src} className={p.foto} data-aparecer>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} srcSet={f.srcSet} sizes={f.sizes} alt={f.alt} loading="lazy" decoding="async" />
                <figcaption>
                  <span className={p.fotoTema}>{f.tema}</span>
                  {f.pie}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Equipo */}
      <section id="equipo" className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="equipo-titulo">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
            <p className={s.antetitulo}>Equipo</p>
            <h2 id="equipo-titulo" className={s.titulo}>
              Quién hace <span className={s.tenue}>el trabajo.</span>
            </h2>
            <p className={s.lead}>Ingeniería, operación e instalación: las personas detrás de cada entrega.</p>
          </header>
          <ul className={p.equipo}>
            {EQUIPO.map((x) => (
              <li key={x.clave} className={p.persona} data-aparecer>
                <div className={p.retrato}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={retrato(x.clave)} alt={`${x.nombre}, ${x.rol.toLowerCase()} de NEXARA`} width={512} height={492} loading="lazy" decoding="async" />
                </div>
                <p className={p.personaNombre}>{x.nombre}</p>
                <p className={p.personaRol}>{x.rol}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Certificaciones />

      <Cierre
        titulo={
          <>
            ¿Trabajamos juntos? <span className={s.tenue}>Empecemos por tu sitio.</span>
          </>
        }
        texto="Cuéntanos tu alcance y te respondemos con un diagnóstico y una propuesta, sin compromiso."
        origen="/nosotros"
      />
    </main>
  );
}
