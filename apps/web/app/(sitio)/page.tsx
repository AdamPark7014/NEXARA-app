import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import Link from "next/link";
import { foto } from "@/components/sitio/fotos";
import s from "@/components/sitio/sitio.module.css";
import { ruta } from "@/components/sitio/rutas";
import Aurora from "@/components/sitio/Aurora";
import Tablero from "@/components/sitio/Tablero";
import Marcas from "@/components/sitio/Marcas";
import Cifra from "@/components/sitio/Cifra";
import Flecha from "@/components/sitio/Flecha";
import Industrias, { type Industria } from "@/components/sitio/Industrias";
import Galeria, { type FotoGaleria } from "@/components/sitio/Galeria";
import MapaInteractivo from "@/components/sitio/MapaInteractivo";
import Preguntas, { type Pregunta } from "@/components/sitio/Preguntas";
import { GraficaEntregas, TicketSoporte } from "@/components/sitio/MiniInterfaces";
import PublicIcon from "@/app/components/PublicIcon";
import pn from "@/components/sitio/portada.module.css";
import Baldosa from "@/components/sitio/Baldosa";
import EquipoGrupo from "@/components/sitio/EquipoGrupo";
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

/** Servicios en baldosas grandes: foto a sangre o mini interfaz, dos acciones. */
function Mosaico() {
  const tam = "(max-width: 734px) 100vw, 50vw";
  const ancho = "(max-width: 1720px) 100vw, 1720px";
  return (
    <section aria-label="Servicios" className={pn.mosaico}>
      <Baldosa
        ancha
        nombre="Videovigilancia."
        texto="Cobertura pensada por zona de riesgo y evidencia cuando se necesita."
        foto={{ ...foto("muro-video-nexara", ancho), alt: "Centro de monitoreo con muro de video instalado por NEXARA", posicion: "center 2%" }}
        acciones={[
          { href: ruta("/servicios#cctv"), label: "Ver más", principal: true },
          { href: ruta("/contacto?servicio=cctv"), label: "Cotizar", medicion: "home_baldosa_cctv" },
        ]}
      />
      <Baldosa
        nombre="Redes y Wi‑Fi."
        texto="Cableado certificado y Wi‑Fi que aguanta la hora pico."
        foto={{ ...foto("campo-enlace-antena-ciudad", tam), alt: "Radioenlace de NEXARA sobre la ciudad", posicion: "center 70%" }}
        acciones={[
          { href: ruta("/servicios#redes"), label: "Ver más", principal: true },
          { href: ruta("/contacto?servicio=redes"), label: "Cotizar", medicion: "home_baldosa_redes" },
        ]}
      />
      <Baldosa
        oscura
        nombre="Infraestructura."
        texto="Racks, servidores y respaldos listos para operar."
        foto={{ ...foto("rack-nexara-led", tam), alt: "Rack de servidores y switching instalado por NEXARA", posicion: "center 62%" }}
        acciones={[
          { href: ruta("/servicios#computo"), label: "Ver más", principal: true },
          { href: ruta("/contacto?servicio=computo"), label: "Cotizar", medicion: "home_baldosa_computo" },
        ]}
      />
      <Baldosa
        nombre="Soporte TI."
        texto="Mesa de ayuda con SLA, remota y en sitio."
        arte={<TicketSoporte />}
        acciones={[
          { href: ruta("/servicios#soporte"), label: "Ver más", principal: true },
          { href: ruta("/contacto?servicio=soporte"), label: "Cotizar", medicion: "home_baldosa_soporte" },
        ]}
      />
      <Baldosa
        nombre="Plataformas."
        texto="Portales, automatización e indicadores, por fases."
        arte={<GraficaEntregas />}
        acciones={[
          { href: ruta("/servicios#software"), label: "Ver más", principal: true },
          { href: ruta("/contacto?servicio=software"), label: "Cotizar", medicion: "home_baldosa_software" },
        ]}
      />
      <Baldosa
        ancha
        nombre="Un solo equipo."
        texto="Las mismas personas diseñan, instalan y te atienden después."
        pie={<EquipoGrupo />}
        acciones={[
          { href: ruta("/nosotros#equipo"), label: "Conoce al equipo", principal: true },
          { href: ruta("/proyectos"), label: "Ver proyectos" },
        ]}
      />
    </section>
  );
}

/** Portada: hero centrado con el tablero como producto, baldosas de servicio, cifras, cobertura y cierre. */
export default async function Inicio() {
  const cta = (await fetchPageSection<CtaContent>("home_cta")) ?? DEFAULT_CTA;
  const whatsapp = buildWhatsAppLeadUrl({ industryName: "tu empresa", serviceName: "CCTV, redes o soporte TI", path: "/" });

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

      <section className={pn.hero} aria-labelledby="hero-titulo">
        <Aurora />
        <div className={s.contenedor}>
          <h1 id="hero-titulo" className={pn.titulo}>
            <span>Seguridad que ve.</span>
            <span className={s.degradado}>Y responde.</span>
          </h1>
          <p className={pn.sub}>Videovigilancia, redes, cómputo y soporte TI para empresas, con un solo equipo responsable.</p>
          <div className={pn.acciones}>
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
          <Tablero />
        </div>
      </section>

      <Marcas />

      <Mosaico />

      <section className={s.seccion} aria-label="NEXARA en cifras">
        <div className={s.contenedor}>
          <ul className={pn.cifras}>
            {CIFRAS.map((c) => (
              <li key={c.texto} data-aparecer>
                <Cifra valor={c.valor} className={pn.cifra} />
                <p className={pn.cifraTexto}>{c.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="cobertura-titulo">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
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

      <section className={s.seccion} aria-labelledby="industrias-titulo">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
            <h2 id="industrias-titulo" className={s.titulo}>
              Hecho a la medida <span className={s.tenue}>de tu industria.</span>
            </h2>
          </header>
          <div data-aparecer>
            <Industrias industrias={INDUSTRIAS} />
          </div>
        </div>
      </section>

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="detras-titulo">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
            <h2 id="detras-titulo" className={s.titulo}>
              Trabajo real. <span className={s.tenue}>Ninguna foto es de banco.</span>
            </h2>
          </header>
        </div>
        <div data-aparecer>
          <Galeria fotos={DETRAS} enlace={{ href: "/proyectos", label: "Ver proyectos" }} />
        </div>
      </section>

      <section className={s.seccion} aria-labelledby="faq-titulo">
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

      <section className={s.final} aria-labelledby="final-titulo">
        <div className={s.contenedor}>
          <div className={s.finalTarjeta} data-aparecer>
            <Aurora />
            <h2 id="final-titulo" className={s.titulo}>
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
        </div>
      </section>
    </main>
  );
}
