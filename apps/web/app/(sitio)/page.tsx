import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import Link from "next/link";
import s from "@/components/sitio/sitio.module.css";
import { ruta } from "@/components/sitio/rutas";
import Aurora from "@/components/sitio/Aurora";
import Tablero from "@/components/sitio/Tablero";
import Marcas from "@/components/sitio/Marcas";
import Cifra from "@/components/sitio/Cifra";
import Flecha from "@/components/sitio/Flecha";
import Metodo, { type PasoMetodo } from "@/components/sitio/Metodo";
import Industrias, { type Industria } from "@/components/sitio/Industrias";
import Galeria, { type FotoGaleria } from "@/components/sitio/Galeria";
import MapaMexico from "@/components/sitio/MapaMexico";
import Ecosistema from "@/components/sitio/Ecosistema";
import { GlifoAnios, GlifoEstados, GlifoRespuesta, GlifoSitios } from "@/components/sitio/Glifos";
import Preguntas, { type Pregunta } from "@/components/sitio/Preguntas";
import { GraficaEntregas, TicketSoporte, TopologiaRed } from "@/components/sitio/MiniInterfaces";
import PublicIcon from "@/app/components/PublicIcon";
import {
  fetchPageSection,
  DEFAULT_CTA,
  DEFAULT_PROCESO,
  type CtaContent,
  type ProcesoItem,
} from "@/lib/page-content-api";
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

const FOTOS_METODO = [
  { src: "/fotos/campo-enlace-antena-ciudad.jpg", alt: "Técnico de NEXARA revisando un enlace en azotea" },
  { src: "/fotos/campo-instalacion-rack.jpg", alt: "Técnicos de NEXARA instalando un rack" },
  { ...w("sala-monitoreo-videowall-nexara"), alt: "Sala de monitoreo con video wall instalada por NEXARA" },
];

/** Servicios para los datos estructurados de la portada (anclas de /servicios). */
const SERVICIOS_SEO: [string, string][] = [
  ["cctv", "Videovigilancia inteligente"],
  ["redes", "Redes y Wi‑Fi empresarial"],
  ["computo", "Infraestructura y cómputo"],
  ["soporte", "Soporte y gestión TI"],
  ["software", "Plataformas a la medida"],
];

/** Lo que respalda a NEXARA, dicho en frases (sin tarjetas de una palabra). */
const VIRTUDES = [
  { valor: "10+", texto: "años instalando y sosteniendo tecnología en campo.", Glifo: GlifoAnios },
  { valor: "200+", texto: "sitios implementados para empresas de todo el país.", Glifo: GlifoSitios },
  { valor: "32", texto: "estados donde ya hemos trabajado, con base en Puebla y CDMX.", Glifo: GlifoEstados },
  { valor: "Un día hábil", texto: "es lo que tarda, por lo general, nuestra primera respuesta.", Glifo: GlifoRespuesta },
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
    r: "Sí. Recorremos el sitio, levantamos riesgos y priorizamos lo que realmente mueve tu operación. En Puebla, la Ciudad de México y el centro del país vamos en persona.",
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
    p: "¿Cuánto tardan en responder?",
    r: "Nuestra primera respuesta suele llegar en menos de un día hábil. En una llamada breve te decimos qué instalar, qué posponer y un presupuesto realista.",
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
  { src: "/fotos/campo-instalacion-ap-altura.jpg", alt: "Técnico de NEXARA instalando un punto de acceso en altura", tema: "Instalación", pie: "Trabajo en altura con equipo de seguridad." },
  { src: "/fotos/monitoreo-videowall.jpg", alt: "Video wall de videovigilancia instalado por NEXARA", tema: "Video wall", pie: "Muros de video listos para operar el primer día." },
  { src: "/fotos/control-acceso-torniquetes.jpg", alt: "Torniquetes de control de acceso instalados por NEXARA", tema: "Control de acceso", pie: "Torniquetes con reconocimiento facial en operación." },
  { ...w("tecnico-nexara-entrega-equipo-sitio"), alt: "Técnico de NEXARA entregando equipo en sitio", tema: "Entrega", pie: "El equipo llega a sitio listo para instalar." },
  { ...w("descarga-equipo-camioneta-nexara"), alt: "Descarga de equipo de la camioneta de NEXARA", tema: "Logística", pie: "Flotilla propia, del almacén al sitio." },
  { ...w("equipo-taller-ensamble-pc-nexara"), alt: "Ensamble de equipo en el taller de NEXARA", tema: "Taller", pie: "Cada equipo se arma y se prueba antes de salir." },
  { src: "/fotos/equipo-nexara-polos.jpg", alt: "Integrantes del equipo NEXARA", tema: "Equipo", pie: "Las mismas personas instalan y dan soporte." },
];

function Guias() {
  return (
    <div className={s.guias} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

export default async function PropuestaInicio() {
  const [procesoData, ctaData] = await Promise.all([
    fetchPageSection<{ items: ProcesoItem[] }>("home_proceso"),
    fetchPageSection<CtaContent>("home_cta"),
  ]);
  const proceso = (procesoData?.items?.length ? procesoData.items : DEFAULT_PROCESO).slice(0, 3);
  const pasos: PasoMetodo[] = proceso.map((p, i) => ({ num: p.num, titulo: p.title, texto: p.text, foto: FOTOS_METODO[i % 3] }));
  const cta = ctaData ?? DEFAULT_CTA;
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
      {/* ── Hero ── */}
      <section className={s.hero} aria-labelledby="hero-titulo">
        <Aurora />
        <div className={`${s.contenedor} ${s.heroGrid}`}>
          <div>
            <p className={s.insignia}>
              <span className={s.insigniaPunto}>+10 años</span>
              Seguridad e infraestructura TI para empresas
            </p>
            <h1 id="hero-titulo" className={s.titular}>
              <span>Seguridad que ve.</span>
              <span className={s.degradado}>Entiende. Responde.</span>
            </h1>
            <p className={s.heroLead}>
              Diseñamos, instalamos y operamos videovigilancia, redes, cómputo y soporte TI. Un solo equipo
              responsable, del diagnóstico al soporte.
            </p>
            <div className={s.acciones}>
              <Link href={ruta("/contacto")} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="home_hero_cta">
                Cotiza tu proyecto
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
            <p className={s.heroNota}>
              <span>
                <PublicIcon name="check" size={16} /> Diagnóstico en sitio
              </span>
              <span>
                <PublicIcon name="check" size={16} /> Alcance cerrado
              </span>
              <span>
                <PublicIcon name="check" size={16} /> Soporte con SLA
              </span>
            </p>
          </div>
          <Tablero />
        </div>
      </section>

      <Marcas />

      {/* ── Por qué NEXARA ── */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-label="Por qué NEXARA">
        <Guias />
        <div className={s.contenedor}>
          <p className={s.antetitulo} data-aparecer>
            Por qué NEXARA
          </p>
          <p className={s.declaracion} data-aparecer>
            Una sola firma responsable de la tecnología que protege y conecta tu operación.{" "}
            <span className={s.tenue}>Del diagnóstico al soporte, con las mismas personas.</span>
          </p>
          <ul className={s.virtudes}>
            {VIRTUDES.map(({ valor, texto, Glifo }) => (
              <li key={valor} className={s.virtud} data-aparecer>
                <div className={s.virtudArte}>
                  <Glifo />
                </div>
                <Cifra valor={valor} className={s.virtudValor} />
                <p className={s.virtudTexto}>{texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Servicios ── */}
      <section className={s.seccion} aria-labelledby="servicios-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Servicios</p>
              <h2 id="servicios-titulo" className={s.titulo}>
                Cinco especialidades.
                <br />
                <span className={s.tenue}>Un solo responsable.</span>
              </h2>
            </div>
            <p className={s.lead}>Todo lo que necesita tu operación, diseñado, instalado y sostenido por el mismo equipo.</p>
          </div>

          <div className={s.bento}>
            <Link href={ruta("/servicios#cctv")} className={`${s.tile} ${s.tileAncho}`} data-aparecer>
              <div className={s.tileTexto}>
                <span className={s.tileIcono}>
                  <PublicIcon name="camera" size={20} />
                </span>
                <h3 className={s.tileTitulo}>Videovigilancia inteligente</h3>
                <p className={s.tileCopia}>Cobertura diseñada por riesgo, cámaras IP, grabación confiable y evidencia cuando se necesita.</p>
                <span className={s.tileEnlace}>
                  Ver servicio
                  <Flecha />
                </span>
              </div>
              <div className={s.tileArte}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/fotos/monitoreo-pantallas-cctv.jpg" alt="Operador revisando cámaras de videovigilancia" loading="lazy" decoding="async" />
                <span className={s.chip} style={{ top: 20, left: 20 }}>
                  <i /> CAM 12 · En vivo
                </span>
                <span className={`${s.chip} ${s.chipOk}`} style={{ right: 20, bottom: 20 }}>
                  <i /> Grabación continua
                </span>
              </div>
            </Link>

            <Link href={ruta("/servicios#redes")} className={s.tile} data-aparecer>
              <div className={s.tileTexto}>
                <span className={s.tileIcono}>
                  <PublicIcon name="wifi" size={20} />
                </span>
                <h3 className={s.tileTitulo}>Redes y Wi‑Fi</h3>
                <p className={s.tileCopia}>Cableado certificado, switching administrable y Wi‑Fi estable.</p>
                <span className={s.tileEnlace}>
                  Ver servicio
                  <Flecha />
                </span>
              </div>
              <div className={s.tileArte} aria-hidden="true">
                <TopologiaRed />
              </div>
            </Link>

            <Link href={ruta("/servicios#computo")} className={s.tile} data-aparecer>
              <div className={s.tileTexto}>
                <span className={s.tileIcono}>
                  <PublicIcon name="server" size={20} />
                </span>
                <h3 className={s.tileTitulo}>Infraestructura y cómputo</h3>
                <p className={s.tileCopia}>Racks, servidores, respaldos y equipos listos para operar.</p>
                <span className={s.tileEnlace}>
                  Ver servicio
                  <Flecha />
                </span>
              </div>
              <div className={s.tileArte}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/fotos/rack-servidores-led.jpg" alt="Rack de servidores y switching instalado por NEXARA" loading="lazy" decoding="async" style={{ objectPosition: "center 30%" }} />
                <span className={`${s.chip} ${s.chipOk}`} style={{ left: 20, bottom: 20 }}>
                  <i /> Respaldo nocturno completado
                </span>
              </div>
            </Link>

            <Link href={ruta("/servicios#soporte")} className={s.tile} data-aparecer>
              <div className={s.tileTexto}>
                <span className={s.tileIcono}>
                  <PublicIcon name="headset" size={20} />
                </span>
                <h3 className={s.tileTitulo}>Soporte y gestión TI</h3>
                <p className={s.tileCopia}>Mesa de ayuda con SLA, remota y en sitio.</p>
                <span className={s.tileEnlace}>
                  Ver servicio
                  <Flecha />
                </span>
              </div>
              <div className={s.tileArte} aria-hidden="true">
                <TicketSoporte />
              </div>
            </Link>

            <Link href={ruta("/servicios#software")} className={s.tile} data-aparecer>
              <div className={s.tileTexto}>
                <span className={s.tileIcono}>
                  <PublicIcon name="code" size={20} />
                </span>
                <h3 className={s.tileTitulo}>Plataformas a la medida</h3>
                <p className={s.tileCopia}>Portales, automatización e indicadores, por fases.</p>
                <span className={s.tileEnlace}>
                  Ver servicio
                  <Flecha />
                </span>
              </div>
              <div className={s.tileArte} aria-hidden="true">
                <GraficaEntregas />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Integración ── */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="integra-titulo">
        <div className={`${s.contenedor} ${s.integra}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Integración</p>
            <h2 id="integra-titulo" className={s.titulo}>
              Un solo sistema. <span className={s.tenue}>Todo conectado.</span>
            </h2>
            <p className={s.lead}>
              Cámaras, red, cómputo y soporte se diseñan juntos, se documentan juntos y los atiende el mismo equipo.
            </p>
            <ul className={s.integraLista}>
              <li>
                <PublicIcon name="fileCheck" size={20} /> Memoria técnica de cada entrega
              </li>
              <li>
                <PublicIcon name="camera" size={20} /> Evidencia fotográfica de lo instalado
              </li>
              <li>
                <PublicIcon name="headset" size={20} /> Un solo contacto para todo el soporte
              </li>
            </ul>
          </div>
          <div data-aparecer>
            <Ecosistema />
          </div>
        </div>
      </section>

      {/* ── Método ── */}
      <section className={s.seccion} aria-label="Cómo trabajamos">
        <div className={s.contenedor}>
          <Metodo
            antetitulo="Cómo trabajamos"
            titulo={
              <>
                Del diagnóstico al soporte. <span className={s.tenue}>Sin sorpresas.</span>
              </>
            }
            lead="Alcance cerrado, calendario visible y evidencia de cada entrega. Seguimos contigo cuando el proyecto ya está operando."
            pasos={pasos}
          />
        </div>
      </section>

      {/* ── Equipo ── */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-label="Nuestro equipo">
        <div className={s.contenedor}>
          <figure className={s.equipo} data-aparecer>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...w("equipo-tecnico-nexara-uniforme")} sizes="(max-width: 1280px) 100vw, 1200px" alt="Equipo técnico de NEXARA" loading="lazy" decoding="async" />
          </figure>
          <div className={s.equipoPie} data-aparecer>
            <p className={s.declaracion}>
              Las personas que diseñan tu proyecto <span className={s.tenue}>son las que lo instalan y las que te atienden después.</span>
            </p>
            <Link href={ruta("/nosotros")} className={s.enlace}>
              Conoce al equipo
              <Flecha />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Industrias ── */}
      <section className={s.seccion} aria-labelledby="industrias-titulo">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
            <p className={s.antetitulo}>Industrias</p>
            <h2 id="industrias-titulo" className={s.titulo}>
              Hecho a la medida <span className={s.tenue}>de tu industria.</span>
            </h2>
            <p className={s.lead}>Cada operación tiene su riesgo típico. Armamos la solución alrededor del tuyo.</p>
          </header>
          <div data-aparecer>
            <Industrias industrias={INDUSTRIAS} />
          </div>
        </div>
      </section>

      {/* ── Trabajo real ── */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="detras-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Trabajo real</p>
              <h2 id="detras-titulo" className={s.titulo}>
                Detrás de cada proyecto.
              </h2>
            </div>
            <p className={s.lead}>Instalaciones, equipo y flotilla propios. Ninguna foto es de banco de imágenes.</p>
          </div>
        </div>
        <div data-aparecer>
          <Galeria fotos={DETRAS} enlace={{ href: "/proyectos", label: "Ver proyectos" }} />
        </div>
      </section>

      {/* ── Cobertura ── */}
      <section className={s.seccion} aria-labelledby="cobertura-titulo">
        <div className={`${s.contenedor} ${s.cobertura}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Cobertura</p>
            <h2 id="cobertura-titulo" className={s.titulo}>
              Base en Puebla y CDMX. <span className={s.tenue}>Alcance nacional.</span>
            </h2>
            <p className={s.lead}>Diagnóstico en sitio en el centro del país y proyectos multisede en toda la República.</p>
            <dl className={s.datos}>
              <div className={s.dato}>
                <dt className={s.datoEtiqueta}>Base de operación</dt>
                <dd className={s.datoValor}>Puebla y Ciudad de México</dd>
              </div>
              <div className={s.dato}>
                <dt className={s.datoEtiqueta}>Diagnóstico en sitio</dt>
                <dd className={s.datoValor}>Centro del país</dd>
              </div>
              <div className={s.dato}>
                <dt className={s.datoEtiqueta}>Proyectos multisede</dt>
                <dd className={s.datoValor}>Toda la República</dd>
              </div>
            </dl>
            <nav className={s.ciudades} aria-label="Ciudades">
              <Link href="/cobertura/puebla/camaras-cctv" className={s.ciudad}>
                Puebla
              </Link>
              <Link href="/cobertura/cdmx/camaras-cctv" className={s.ciudad}>
                Ciudad de México
              </Link>
              <Link href="/cobertura/cholula/camaras-cctv" className={s.ciudad}>
                San Andrés Cholula
              </Link>
              <Link href="/cobertura/queretaro/camaras-cctv" className={s.ciudad}>
                Querétaro
              </Link>
            </nav>
          </div>
          <div data-aparecer>
            <MapaMexico />
          </div>
        </div>
      </section>

      {/* ── Preguntas frecuentes ── */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="faq-titulo">
        <div className={`${s.contenedor} ${s.faq}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Preguntas frecuentes</p>
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

      {/* ── Cierre ── */}
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
