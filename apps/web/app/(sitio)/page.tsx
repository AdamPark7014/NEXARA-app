import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import Link from "next/link";
import { foto } from "@/components/sitio/fotos";
import s from "@/components/sitio/sitio.module.css";
import { ruta } from "@/components/sitio/rutas";
import Marcas from "@/components/sitio/Marcas";
import Flecha from "@/components/sitio/Flecha";
import Industrias, { type Industria } from "@/components/sitio/Industrias";
import Galeria, { type FotoGaleria } from "@/components/sitio/Galeria";
import MapaInteractivo from "@/components/sitio/MapaInteractivo";
import Preguntas, { type Pregunta } from "@/components/sitio/Preguntas";
import PublicIcon from "@/app/components/PublicIcon";
import pn from "@/components/sitio/portada.module.css";
import { fetchPageSection, DEFAULT_CTA, type CtaContent } from "@/lib/page-content-api";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("home");
}

export const dynamic = "force-dynamic";

/** Fotos en webp con dos anchos (1200 y 1920) de /public/fotos. */
const w = (nombre: string) => ({
  src: `/fotos/${nombre}-1200.webp`,
  srcSet: `/fotos/${nombre}-1200.webp 1200w, /fotos/${nombre}-1920.webp 1920w`,
});

/** Servicios para los datos estructurados de la portada (anclas de /servicios). */
const SERVICIOS_SEO: [string, string][] = [
  ["cctv", "Videovigilancia inteligente"],
  ["redes", "Redes y Wi‑Fi empresarial"],
  ["computo", "Infraestructura y cómputo"],
  ["soporte", "Soporte y gestión TI"],
  ["software", "Plataformas a la medida"],
];

const CIFRAS = [
  { valor: "10+", texto: "años instalando y sosteniendo tecnología" },
  { valor: "200+", texto: "sitios implementados en el país" },
  { valor: "32", texto: "estados con proyectos" },
  { valor: "1", texto: "día hábil para la primera respuesta" },
];

const INDUSTRIAS: Industria[] = [
  {
    slug: "retail",
    nombre: "Retail",
    icono: "store",
    riesgo: "Muchas sucursales, un mismo estándar",
    texto: "Cada apertura sale con la misma videovigilancia, la misma red y el mismo soporte, sin reinventar nada.",
    incluye: ["Videovigilancia por sucursal con acceso remoto", "Wi‑Fi de clientes separado del de caja", "Soporte al punto de venta", "Un mismo estándar en cada apertura"],
  },
  {
    slug: "manufactura",
    nombre: "Manufactura",
    icono: "factory",
    riesgo: "Cuando una caída cuesta un turno",
    texto: "Redes industriales, perímetro y continuidad en los equipos que no pueden parar.",
    incluye: ["Redes industriales y enlaces entre naves", "Perímetro y control de acceso", "Respaldo eléctrico y de datos", "Soporte prioritario por turno"],
  },
  {
    slug: "hospitalidad",
    nombre: "Hospitalidad",
    icono: "hotel",
    riesgo: "La experiencia del huésped",
    texto: "Wi‑Fi para muchas personas a la vez, vigilancia discreta y una operación unificada por propiedad.",
    incluye: ["Wi‑Fi de alta densidad", "Videovigilancia de áreas comunes", "Control de acceso a áreas de servicio", "Operación unificada por propiedad"],
  },
  {
    slug: "salud",
    nombre: "Salud",
    icono: "hospital",
    riesgo: "Continuidad clínica",
    texto: "Segmentación, respaldos y soporte prioritario para que la red nunca detenga la atención.",
    incluye: ["Red segmentada para equipo clínico", "Respaldos y continuidad", "Videovigilancia y control de acceso", "Mesa de ayuda prioritaria"],
  },
  {
    slug: "educacion",
    nombre: "Educación",
    icono: "school",
    riesgo: "Campus seguros y conectados",
    texto: "Wi‑Fi, videovigilancia y mesa de ayuda pensados para aulas, laboratorios y oficinas.",
    incluye: ["Wi‑Fi para aulas y laboratorios", "Videovigilancia de accesos y patios", "Control de acceso al campus", "Mesa de ayuda para docentes"],
  },
  {
    slug: "gobierno",
    nombre: "Gobierno",
    icono: "landmark",
    riesgo: "Entregables que se pueden auditar",
    texto: "Modernización por fases, con la documentación de cada etapa lista para revisión.",
    incluye: ["Modernización por fases", "Memoria técnica de cada entrega", "Videovigilancia y monitoreo", "Entregables auditables"],
  },
];

/** Respuestas tomadas de lo que el sitio ya promete (servicios, contacto y cobertura). */
const PREGUNTAS: Pregunta[] = [
  {
    p: "¿Hacen el diagnóstico en sitio?",
    r: "Sí, antes de cotizar. En Puebla, la Ciudad de México y el centro del país vamos en persona; en el resto del país lo programamos como primera fase del proyecto.",
  },
  {
    p: "¿Atienden fuera de Puebla y la Ciudad de México?",
    r: "Sí. Hacemos proyectos multisede en toda la República; el diagnóstico en sitio es en el centro del país y el resto se coordina proyecto por proyecto.",
  },
  {
    p: "¿Qué recibo al terminar la instalación?",
    r: "Una propuesta con alcance cerrado desde el inicio y, al entregar, la memoria técnica de lo instalado con la evidencia de cada etapa.",
  },
  {
    p: "¿Siguen dando soporte después del arranque?",
    r: "Sí. Tenemos mesa de ayuda con SLA, atención remota y en sitio, monitoreo y mejoras para cuando el proyecto ya está operando.",
  },
  {
    p: "¿Cuánto cuesta un proyecto?",
    r: "Depende del sitio y del alcance. Después del diagnóstico te damos una propuesta por fases, con el precio de cada una por escrito: sin alcance abierto ni costos escondidos.",
  },
  {
    p: "¿Con qué marcas trabajan?",
    r: "Integramos tecnología de fabricantes líderes como Hikvision, Ubiquiti, Cisco, TP‑Link, Dell, HP y Lenovo, entre otros. Elegimos el equipo según tu riesgo y tu presupuesto.",
  },
];

/*
 * Galería: trabajo de campo primero. Fuera las tomas de reparación de PC (hacían ver a NEXARA como
 * taller de cómputo) y la foto posando junto al patio de tráileres.
 */
const DETRAS: FotoGaleria[] = [
  { ...foto("campo-instalacion-ap-altura", "(max-width: 734px) 100vw, 680px"), alt: "Técnico de NEXARA instalando un punto de acceso en altura", tema: "Instalación", pie: "Trabajo en altura con equipo de seguridad." },
  { ...foto("monitoreo-videowall", "(max-width: 734px) 100vw, 680px"), alt: "Video wall de videovigilancia instalado por NEXARA", tema: "Video wall", pie: "Muros de video listos para operar el primer día." },
  { ...foto("control-acceso-torniquetes", "(max-width: 734px) 100vw, 680px"), alt: "Torniquetes de control de acceso instalados por NEXARA", tema: "Control de acceso", pie: "Torniquetes con reconocimiento facial en operación." },
  { ...w("tecnico-nexara-entrega-equipo-sitio"), alt: "Técnico de NEXARA entregando equipo en sitio", tema: "Entrega", pie: "El equipo llega a sitio listo para instalar." },
  { ...w("descarga-equipo-camioneta-nexara"), alt: "Descarga de equipo de la camioneta de NEXARA", tema: "Logística", pie: "Flotilla propia, del almacén al sitio." },
  { ...w("equipo-taller-ensamble-pc-nexara"), alt: "Ensamble de equipo en el taller de NEXARA", tema: "Taller", pie: "Cada equipo se arma y se prueba antes de salir." },
  { ...foto("equipo-nexara-polos", "(max-width: 734px) 100vw, 680px"), alt: "Integrantes del equipo NEXARA", tema: "Equipo", pie: "Las mismas personas instalan y dan soporte." },
];

/** Foto a todo el ancho: reescalada con Real-ESRGAN hasta 2560 px para que no se pixele en pantallas grandes. */
const aSangre = (nombre: string) => ({
  src: `/fotos/${nombre}-1200.webp`,
  srcSet: `/fotos/${nombre}-1200.webp 1200w, /fotos/${nombre}-1920.webp 1920w, /fotos/${nombre}-2560.webp 2560w`,
  sizes: "100vw",
});

type TextoCapituloProps = {
  num: string;
  nombre: string;
  texto: string;
  /** Ancla de /servicios que explica el servicio. */
  ancla: string;
  /** Valor de `?servicio=` en Contacto y sufijo del nombre de medición. */
  servicio: string;
  medicion: string;
  className?: string;
};

/** Número, nombre, una línea y las dos ligas de cada servicio. Cada capítulo abre su propia sección bajo el h1. */
function TextoCapitulo({ num, nombre, texto, ancla, servicio, medicion, className }: TextoCapituloProps) {
  return (
    <div className={className}>
      <span className={pn.num} aria-hidden="true">
        {num}
      </span>
      <h2 className={pn.capituloNombre}>{nombre}</h2>
      <p className={pn.capituloBajada}>{texto}</p>
      <div className={pn.ligas}>
        <Link href={ruta(`/servicios#${ancla}`)} className={pn.liga}>
          Ver el servicio
        </Link>
        <Link href={ruta(`/contacto?servicio=${servicio}`)} className={pn.liga} data-track-conversion={medicion}>
          Cotizar
        </Link>
      </div>
    </div>
  );
}

/** Portada: el título, el trabajo real a sangre, un capítulo por servicio, el equipo, las industrias y el cierre. */
export default async function Inicio() {
  const cta = (await fetchPageSection<CtaContent>("home_cta")) ?? DEFAULT_CTA;
  const whatsapp = buildWhatsAppLeadUrl({ industryName: "tu empresa", serviceName: "CCTV, redes o soporte TI", path: "/" });
  const mitad = "(max-width: 900px) 100vw, 60vw";
  const tercio = "(max-width: 900px) 100vw, 34vw";

  return (
    <main aria-label="NEXARA, inicio">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "NEXARA | CCTV, redes y soporte TI en México",
          url: siteBaseUrl(),
          description: "Integramos CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas en Puebla, CDMX y cobertura nacional.",
          isPartOf: { "@type": "WebSite", name: "NEXARA", url: siteBaseUrl() },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: SERVICIOS_SEO.map((nombre, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: nombre[1],
              url: `${siteBaseUrl()}/servicios#${nombre[0]}`,
            })),
          },
        }}
      />

      <section aria-labelledby="hero-titulo">
        <div className={pn.ancho}>
          <h1 id="hero-titulo" className={pn.titulo}>
            <span>Seguridad que ve.</span> <span>Y responde.</span>
          </h1>
        </div>
        <figure className={pn.heroFoto}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...aSangre("campo-instalacion-rack")}
            alt="Dos técnicos de NEXARA con casco y chaleco fijando un rack en sitio"
            fetchPriority="high"
            decoding="async"
          />
        </figure>
        <div className={`${pn.ancho} ${pn.rejilla} ${pn.heroPie}`}>
          <p className={pn.heroTexto}>
            Videovigilancia, accesos, redes e infraestructura para empresas. Lo instala el mismo equipo que te atiende después.
          </p>
          <div className={pn.heroAcciones}>
            <Link href={ruta("/contacto")} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="home_hero_cta">
              Agendar diagnóstico
              <Flecha />
            </Link>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={`${s.boton} ${s.botonSecundario}`}
              data-track-conversion="home_hero_whatsapp"
            >
              Hablar con un especialista
              <Flecha />
            </a>
          </div>
        </div>
      </section>

      <Marcas />

      <section className={`${pn.ancho} ${pn.rejilla} ${pn.capitulo} ${pn.conRaya}`} aria-label="Videovigilancia">
        <figure className={pn.cols1a8} data-aparecer>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...foto("muro-video-ancho", mitad)}
            alt="Centro de monitoreo con muro de video instalado por NEXARA"
            loading="lazy"
            decoding="async"
            className={pn.foto}
            style={{ aspectRatio: "16 / 10" }}
          />
          <figcaption className={pn.pie}>Muro de video listo para operar el primer día.</figcaption>
        </figure>
        <TextoCapitulo
          className={pn.cols8a13}
          num="01"
          nombre="Videovigilancia"
          texto="Cobertura pensada por zona de riesgo y evidencia cuando se necesita."
          ancla="cctv"
          servicio="cctv"
          medicion="home_baldosa_cctv"
        />
      </section>

      <section className={`${pn.ancho} ${pn.rejilla} ${pn.capitulo}`} aria-label="Control de acceso">
        <TextoCapitulo
          className={pn.cols1a6}
          num="02"
          nombre="Control de acceso"
          texto="Torniquetes con reconocimiento facial y lectores por zona, en operación."
          ancla="cctv"
          servicio="acceso"
          medicion="home_baldosa_acceso"
        />
        <figure className={pn.cols6a13} data-aparecer>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...foto("control-acceso-torniquetes", mitad)}
            alt="Torniquetes con terminal facial instalados por NEXARA"
            loading="lazy"
            decoding="async"
            className={pn.foto}
            style={{ aspectRatio: "3 / 2" }}
          />
          <figcaption className={pn.pie}>Torniquetes con reconocimiento facial.</figcaption>
        </figure>
      </section>

      <section aria-label="Redes y Wi‑Fi">
        <figure className={pn.sangre} data-aparecer>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...aSangre("campo-enlace-antena-ciudad")} alt="Radioenlace de NEXARA sobre la ciudad" loading="lazy" decoding="async" />
        </figure>
        <div className={`${pn.ancho} ${pn.rejilla} ${pn.capituloFila}`}>
          <span className={`${pn.num} ${pn.cols1a4}`} aria-hidden="true">
            03
          </span>
          <h2 className={`${pn.capituloNombre} ${pn.cols4a9}`}>Redes y Wi‑Fi</h2>
          <div className={pn.cols9a13}>
            <p className={pn.capituloBajada}>Cableado certificado y Wi‑Fi que aguanta la hora pico.</p>
            <div className={pn.ligas}>
              <Link href={ruta("/servicios#redes")} className={pn.liga}>
                Ver el servicio
              </Link>
              <Link href={ruta("/contacto?servicio=redes")} className={pn.liga} data-track-conversion="home_baldosa_redes">
                Cotizar
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={`${pn.ancho} ${pn.rejilla} ${pn.capitulo}`} aria-label="Infraestructura">
        <figure className={pn.cols1a5} data-aparecer>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...foto("campo-instalacion-ap-altura", tercio)}
            alt="Técnico de NEXARA instalando un punto de acceso en altura"
            loading="lazy"
            decoding="async"
            className={pn.foto}
            style={{ aspectRatio: "3 / 4", objectPosition: "50% 40%" }}
          />
          <figcaption className={pn.pie}>Trabajo en altura con equipo de seguridad.</figcaption>
        </figure>
        <figure className={pn.cols5a9} data-aparecer>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...foto("rack-nexara-led", tercio)}
            alt="Rack de servidores y switching instalado por NEXARA"
            loading="lazy"
            decoding="async"
            className={pn.foto}
            style={{ aspectRatio: "3 / 4", objectPosition: "50% 62%" }}
          />
        </figure>
        <TextoCapitulo
          className={pn.cols9a13}
          num="04"
          nombre="Infraestructura"
          texto="Racks, servidores y respaldos listos para operar."
          ancla="computo"
          servicio="computo"
          medicion="home_baldosa_computo"
        />
      </section>

      <section className={`${pn.ancho} ${pn.rejilla} ${pn.capitulo} ${pn.sinArriba}`} aria-label="Soporte y plataformas">
        <TextoCapitulo
          className={`${pn.cols1a7} ${pn.conRayaBloque}`}
          num="05"
          nombre="Soporte TI"
          texto="Mesa de ayuda con SLA, remota y en sitio."
          ancla="soporte"
          servicio="soporte"
          medicion="home_baldosa_soporte"
        />
        <TextoCapitulo
          className={`${pn.cols7a13} ${pn.conRayaBloque}`}
          num="06"
          nombre="Plataformas"
          texto="Portales, automatización e indicadores, por fases."
          ancla="software"
          servicio="software"
          medicion="home_baldosa_software"
        />
      </section>

      <section className={pn.banda} aria-labelledby="equipo-titulo">
        <div className={`${pn.ancho} ${pn.rejilla} ${pn.capitulo}`}>
          <div className={pn.cols1a9}>
            <h2 id="equipo-titulo" className={pn.bandaTitulo}>
              Las mismas personas diseñan, instalan y te atienden después.
            </h2>
            <ul className={pn.cifras}>
              {CIFRAS.map((c) => (
                <li key={c.texto}>
                  <b>{c.valor}</b>
                  <span>{c.texto}</span>
                </li>
              ))}
            </ul>
            <div className={pn.ligas}>
              <Link href={ruta("/nosotros#equipo")} className={pn.liga}>
                Conoce al equipo
              </Link>
              <Link href={ruta("/proyectos")} className={pn.liga}>
                Ver proyectos
              </Link>
            </div>
          </div>
          <figure className={pn.cols9a13}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...foto("equipo-nexara-espalda", tercio)}
              alt="Integrantes del equipo NEXARA de espaldas, con el uniforme"
              loading="lazy"
              decoding="async"
              className={pn.foto}
              style={{ aspectRatio: "3 / 4" }}
            />
          </figure>
        </div>
      </section>

      <section className={`${pn.ancho} ${pn.capitulo}`} aria-labelledby="industrias-titulo">
        <h2 id="industrias-titulo" className={pn.subtitulo}>
          Hecho a la medida de tu industria.
        </h2>
        <Industrias industrias={INDUSTRIAS} />
      </section>

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="cobertura-titulo">
        <div className={s.contenedor}>
          <header data-aparecer>
            <h2 id="cobertura-titulo" className={s.titulo}>
              Base en Puebla y CDMX. <span className={s.tenue}>Alcance nacional.</span>
            </h2>
            <p className={s.lead}>Toca tu estado y te decimos cómo lo atendemos.</p>
          </header>
          <div data-aparecer>
            <MapaInteractivo />
          </div>
        </div>
      </section>

      <section className={s.seccion} aria-labelledby="detras-titulo">
        <div className={s.contenedor}>
          <header data-aparecer>
            <h2 id="detras-titulo" className={s.titulo}>
              Trabajo real. <span className={s.tenue}>Ninguna foto es de banco.</span>
            </h2>
          </header>
        </div>
        <div data-aparecer>
          <Galeria fotos={DETRAS} enlace={{ href: "/proyectos", label: "Ver proyectos" }} />
        </div>
      </section>

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="faq-titulo">
        <div className={`${s.contenedor} ${s.faq}`}>
          <div data-aparecer>
            <h2 id="faq-titulo" className={s.titulo}>
              Lo que todos <span className={s.tenue}>nos preguntan.</span>
            </h2>
            <p className={s.lead}>¿Tienes otra duda? Escríbenos y te contesta una persona del equipo.</p>
          </div>
          <div data-aparecer>
            <Preguntas preguntas={PREGUNTAS} />
          </div>
        </div>
      </section>

      <section className={`${pn.ancho} ${pn.rejilla} ${pn.capitulo}`} aria-labelledby="final-titulo">
        <div className={pn.cols1a8} data-aparecer>
          <h2 id="final-titulo" className={pn.cierreTitulo}>
            {cta.title} {cta.titleAccent}.
          </h2>
          <p className={s.lead}>{cta.text}</p>
          <div className={s.acciones}>
            <Link href={ruta(cta.primaryHref)} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="home_cta_primary">
              {cta.primaryLabel}
              <Flecha />
            </Link>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={`${s.boton} ${s.botonSecundario}`}
              data-track-conversion="home_cta_whatsapp"
            >
              Escríbenos por WhatsApp
              <Flecha />
            </a>
          </div>
          <ul className={s.finalGarantias}>
            <li>
              <PublicIcon name="clock" size={18} /> Primera respuesta en un día hábil
            </li>
            <li>
              <PublicIcon name="mapPin" size={18} /> Diagnóstico en sitio
            </li>
            <li>
              <PublicIcon name="fileCheck" size={18} /> Memoria técnica al entregar
            </li>
          </ul>
        </div>
        <figure className={pn.cols8a13} data-aparecer>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...w("descarga-equipo-camioneta-nexara")}
            sizes={tercio}
            alt="Técnico de NEXARA descargando cajas de equipo en sitio"
            loading="lazy"
            decoding="async"
            className={pn.foto}
            style={{ aspectRatio: "4 / 3" }}
          />
          <figcaption className={pn.pie}>Flotilla propia, del almacén al sitio. Ninguna foto es de banco.</figcaption>
        </figure>
      </section>
    </main>
  );
}
