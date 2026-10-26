import Link from "next/link";
import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import { foto } from "@/components/sitio/fotos";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import ip from "@/components/sitio/interior.module.css";
import TarjetasRuta from "@/components/sitio/TarjetasRuta";
import SimuladorCobertura from "@/components/sitio/SimuladorCobertura";
import { GUIAS } from "@/lib/guias";
import Aurora from "@/components/sitio/Aurora";
import Flecha from "@/components/sitio/Flecha";
import SubNav from "@/components/sitio/SubNav";
import Cierre from "@/components/sitio/Cierre";
import Certificaciones from "@/components/sitio/Certificaciones";
import Metodo, { type PasoMetodo } from "@/components/sitio/Metodo";
import { GraficaEntregas, TicketSoporte, TopologiaRed } from "@/components/sitio/MiniInterfaces";
import { ruta } from "@/components/sitio/rutas";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("servicios");
}

export const dynamic = "force-dynamic";

/** Lo que vemos en casi todos los sitios y cómo lo resolvemos. */
const PROBLEMAS: { titulo: string; texto: string; solucion: string }[] = [
  {
    titulo: "Cámaras que no sirven cuando se necesitan",
    texto: "Mal ubicadas, sin cubrir el riesgo, con grabación que falla justo el día del incidente.",
    solucion: "Cobertura diseñada por zona de riesgo y grabación verificada.",
  },
  {
    titulo: "Wi‑Fi que se cae en horas pico",
    texto: "Instalado por «mejor esfuerzo», sin diseño de cobertura ni redes separadas.",
    solucion: "Diseño de cobertura, segmentación y switching administrable.",
  },
  {
    titulo: "Racks y cableado sin estándar",
    texto: "Nadie sabe qué va a dónde; cada cambio es una apuesta.",
    solucion: "Cableado certificado, etiquetado y una memoria técnica.",
  },
  {
    titulo: "Soporte sin tiempos ni historial",
    texto: "Llamadas que nadie registra y fallas que vuelven a pasar.",
    solucion: "Mesa de ayuda con SLA y cada incidencia documentada.",
  },
];

type Servicio = {
  id: string;
  icono: PublicIconName;
  nav: string;
  titulo: string;
  texto: string;
  puntos: string[];
  arte: React.ReactNode;
  /** Servicio de las soluciones por industria (`/soluciones/<industria>/<servicio>`). */
  solucion: string;
};

/** Industrias con página propia y soluciones por servicio. */
const INDUSTRIAS_SOLUCION = [
  { slug: "retail", nombre: "Retail" },
  { slug: "manufactura", nombre: "Manufactura" },
  { slug: "salud", nombre: "Salud" },
  { slug: "gobierno", nombre: "Gobierno" },
];

/** Lo que se entrega al cerrar cualquier proyecto. */
const ENTREGABLES: { icono: PublicIconName; titulo: string; texto: string }[] = [
  { icono: "fileCheck", titulo: "Memoria técnica", texto: "Planos, diagramas de red y etiquetado que coincide con lo instalado." },
  { icono: "camera", titulo: "Evidencia fotográfica", texto: "El antes y el después de cada punto, por si hace falta demostrarlo." },
  { icono: "server", titulo: "Configuraciones respaldadas", texto: "Copia de switches, grabadores y equipos de red, lista para restaurar." },
  { icono: "check", titulo: "Pruebas documentadas", texto: "Certificación del cableado y verificación de grabación y respaldos." },
  { icono: "users", titulo: "Capacitación", texto: "Tu equipo aprende a operar lo básico sin depender de nadie." },
  { icono: "shield", titulo: "Garantía y RMA", texto: "Garantía del fabricante con el trámite de reemplazo a nuestro cargo." },
];

/** Dos formas de trabajar con NEXARA. */
const MODALIDADES: { icono: PublicIconName; titulo: string; texto: string; puntos: string[] }[] = [
  {
    icono: "clipboard",
    titulo: "Proyecto llave en mano",
    texto: "Para instalar o renovar: alcance cerrado y precio por fases antes de empezar.",
    puntos: ["Diagnóstico en sitio", "Propuesta por fases", "Instalación con evidencia", "Entrega documentada"],
  },
  {
    icono: "refresh",
    titulo: "Soporte continuo",
    texto: "Para lo que ya opera: mesa de ayuda con SLA y mantenimiento programado.",
    puntos: ["Atención remota y en sitio", "Tiempos por prioridad", "Mantenimiento preventivo", "Reporte mensual"],
  },
];

const SERVICIOS: Servicio[] = [
  {
    id: "cctv",
    icono: "camera",
    nav: "Videovigilancia",
    titulo: "Videovigilancia inteligente",
    texto:
      "CCTV diseñado para tu riesgo real: cobertura pensada por zona, grabación confiable y acceso remoto seguro. Evidencia cuando se necesita, no sorpresas.",
    puntos: [
      "Diseño estratégico de cobertura",
      "Cámaras IP y sistemas NVR/VMS",
      "Monitoreo y acceso remoto seguro",
      "Mantenimiento preventivo y correctivo",
      "Evidencia técnica y documentación del servicio",
    ],
    arte: (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...foto("monitoreo-pantallas-cctv", "(max-width: 1068px) 100vw, 620px")} alt="Monitores de videovigilancia en un centro de monitoreo de NEXARA" loading="lazy" decoding="async" />
        <span className={s.chip} style={{ top: 20, left: 20 }}>
          <i /> CAM 12 · En vivo
        </span>
      </>
    ),
    solucion: "camaras-cctv",
  },
  {
    id: "redes",
    icono: "wifi",
    nav: "Redes y Wi‑Fi",
    titulo: "Redes empresariales y Wi‑Fi",
    texto:
      "Cableado estructurado certificado, switching administrable y Wi‑Fi de alta densidad. Redes estables, segmentadas y documentadas para operar y crecer.",
    puntos: [
      "Cableado estructurado certificado",
      "Switching administrable y segmentación por VLAN",
      "Redes Wi‑Fi empresariales",
      "Enlaces entre sedes y radioenlaces",
      "Documentación y optimización de la red",
    ],
    arte: <TopologiaRed />,
    solucion: "redes-y-conectividad",
  },
  {
    id: "computo",
    icono: "server",
    nav: "Infraestructura",
    titulo: "Infraestructura y cómputo",
    texto:
      "Racks, servidores, respaldos y estaciones de trabajo estandarizadas. Hardware y software alineados a cómo trabaja tu equipo, listos desde el primer día.",
    puntos: [
      "Estaciones de trabajo y servidores",
      "Instalación y organización de racks",
      "Sistemas de respaldo y recuperación",
      "Configuración estandarizada de equipos",
      "Administración y optimización de recursos",
    ],
    arte: (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...foto("rack-servidores-led", "(max-width: 1068px) 100vw, 620px")} alt="Rack de servidores y switching instalado por NEXARA" loading="lazy" decoding="async" style={{ objectPosition: "center 35%" }} />
        <span className={`${s.chip} ${s.chipOk}`} style={{ left: 20, bottom: 20 }}>
          <i /> Respaldo nocturno completado
        </span>
      </>
    ),
    solucion: "infraestructura-ti",
  },
  {
    id: "soporte",
    icono: "headset",
    nav: "Soporte TI",
    titulo: "Soporte y gestión TI",
    texto:
      "Mesa de ayuda con acuerdos de nivel de servicio, atención remota y visitas en sitio. Cuando algo falla hay una persona, un plan y un tiempo comprometido.",
    puntos: [
      "Mesa de ayuda especializada",
      "Soporte remoto y asistencia en sitio",
      "Mantenimiento preventivo y correctivo",
      "Atención bajo SLA",
      "Seguimiento y documentación de incidencias",
    ],
    arte: <TicketSoporte />,
    solucion: "soporte-ti-pyme",
  },
  {
    id: "software",
    icono: "code",
    nav: "Plataformas",
    titulo: "Plataformas a la medida",
    texto:
      "Portales, automatización e indicadores construidos por fases, con objetivos medibles y sin depender de terceros para cada cambio.",
    puntos: [
      "Portales empresariales",
      "Automatización de procesos",
      "Integración entre plataformas",
      "Tableros e indicadores",
      "Implementación por fases con objetivos definidos",
    ],
    arte: <GraficaEntregas />,
    solucion: "automatizacion-de-procesos",
  },
];

const PASOS: PasoMetodo[] = [
  {
    num: "01",
    titulo: "Diagnóstico",
    texto: "Recorremos el sitio, levantamos riesgos y priorizamos lo que mueve la operación.",
    foto: { ...foto("campo-enlace-antena-ciudad", "(max-width: 1068px) 100vw, 680px"), alt: "Técnico de NEXARA revisando un enlace en azotea" },
  },
  {
    num: "02",
    titulo: "Implementación",
    texto: "Alcance cerrado, calendario visible e instalación con evidencia fotográfica.",
    foto: { ...foto("campo-instalacion-rack", "(max-width: 1068px) 100vw, 680px"), alt: "Técnicos de NEXARA instalando un rack" },
  },
  {
    num: "03",
    titulo: "Operación",
    texto: "Soporte, monitoreo y mejoras. Seguimos cuando el proyecto ya está en producción.",
    foto: {
      src: "/fotos/sala-monitoreo-videowall-nexara-1200.webp",
      srcSet: "/fotos/sala-monitoreo-videowall-nexara-1200.webp 1200w, /fotos/sala-monitoreo-videowall-nexara-1920.webp 1920w",
      alt: "Sala de monitoreo con video wall instalada por NEXARA",
    },
  },
];


const INDUSTRIAS: { slug: string; nombre: string; icono: PublicIconName }[] = [
  { slug: "retail", nombre: "Retail", icono: "store" },
  { slug: "manufactura", nombre: "Manufactura", icono: "factory" },
  { slug: "hospitalidad", nombre: "Hospitalidad", icono: "hotel" },
  { slug: "salud", nombre: "Salud", icono: "hospital" },
  { slug: "educacion", nombre: "Educación", icono: "school" },
  { slug: "gobierno", nombre: "Gobierno", icono: "landmark" },
];

export default function PropuestaServicios() {
  const whatsapp = buildWhatsAppLeadUrl({ industryName: "mi empresa", serviceName: "CCTV, redes o soporte", path: "/servicios" });

  return (
    <main aria-label="Servicios de NEXARA">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Servicios NEXARA",
          url: `${siteBaseUrl()}/servicios`,
          description: "Videovigilancia, redes Wi‑Fi, cómputo, infraestructura y soporte TI bajo el mismo contrato.",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: SERVICIOS.map((sv, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: { "@type": "Service", name: sv.titulo, description: sv.texto, url: `${siteBaseUrl()}/servicios#${sv.id}` },
            })),
          },
        }}
      />
      <section className={p.hero} aria-labelledby="servicios-hero">
        <Aurora />
        <div className={`${s.contenedor} ${s.centro}`}>
          <p className={s.antetitulo}>Servicios</p>
          <h1 id="servicios-hero" className={p.heroTitulo}>
            Tecnología que opera <span className={s.degradado}>desde el primer día.</span>
          </h1>
          <p className={p.heroLead}>Diseñamos, instalamos, documentamos y damos soporte, para que todo funcione a la primera.</p>
          <div className={s.acciones}>
            <Link href={ruta("/contacto")} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="servicios_hero_cta">
              Cotiza tu proyecto
              <Flecha />
            </Link>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${s.boton} ${s.botonSecundario}`}>
              Hablar con un especialista
              <Flecha />
            </a>
          </div>
        </div>
      </section>

      <SubNav titulo="Servicios" secciones={SERVICIOS.map((sv) => ({ id: sv.id, label: sv.nav }))} cta={{ href: "/contacto", label: "Cotizar" }} />

      {/* Lo que suele fallar */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="fallas-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Antes de empezar</p>
              <h2 id="fallas-titulo" className={s.titulo}>
                Lo que vemos <span className={s.tenue}>en casi todos los sitios.</span>
              </h2>
            </div>
            <p className={s.lead}>Y cómo lo dejamos resuelto, con un responsable y por escrito.</p>
          </div>
          <ul className={p.problemas}>
            {PROBLEMAS.map((pr) => (
              <li key={pr.titulo} className={p.problema} data-aparecer>
                <span className={p.problemaEtiqueta}>
                  <PublicIcon name="alert" size={16} /> Lo que suele fallar
                </span>
                <h3 className={p.problemaTitulo}>{pr.titulo}</h3>
                <p className={p.problemaTexto}>{pr.texto}</p>
                <div className={p.solucion}>
                  <span className={p.solucionEtiqueta}>
                    <PublicIcon name="check" size={16} /> Con NEXARA
                  </span>
                  <p className={p.solucionTexto}>{pr.solucion}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Los cinco servicios */}
      <section className={s.seccion} aria-label="Servicios en detalle">
        <div className={s.contenedor}>
          {SERVICIOS.map((sv, i) => (
            <article key={sv.id} id={sv.id} className={`${p.servicio} ${p.ancla} ${i % 2 ? p.servicioInverso : ""}`} data-aparecer>
              <div>
                <span className={p.servicioIcono}>
                  <PublicIcon name={sv.icono} size={22} />
                </span>
                <p className={s.antetitulo}>{sv.nav}</p>
                <h2 className={p.servicioTitulo}>{sv.titulo}</h2>
                <p className={p.servicioTexto}>{sv.texto}</p>
                <ul className={p.lista}>
                  {sv.puntos.map((pt) => (
                    <li key={pt}>
                      <PublicIcon name="check" size={18} />
                      {pt}
                    </li>
                  ))}
                </ul>
                <p className={p.servicioEnlace}>
                  <Link href={ruta(`/contacto?servicio=${sv.id}`)} className={s.enlace} data-track-conversion={`servicios_${sv.id}_cta`}>
                    {/* Solo la inicial en minúscula: «Wi‑Fi» y «TI» conservan sus mayúsculas. */}
                    Cotizar {sv.nav.charAt(0).toLowerCase() + sv.nav.slice(1)}
                    <Flecha />
                  </Link>
                </p>
                <p className={ip.porIndustria}>
                  Por industria:{" "}
                  {INDUSTRIAS_SOLUCION.map((ind, n) => (
                    <span key={ind.slug}>
                      {n ? " · " : ""}
                      <Link href={`/soluciones/${ind.slug}/${sv.solucion}`}>{ind.nombre}</Link>
                    </span>
                  ))}
                </p>
              </div>
              <div className={p.servicioArte}>{sv.arte}</div>
            </article>
          ))}
        </div>
      </section>

      {/* Simulador de cobertura */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="simulador-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Pruébalo</p>
              <h2 id="simulador-titulo" className={s.titulo}>
                Diseña la cobertura <span className={s.tenue}>de una tienda.</span>
              </h2>
            </div>
            <p className={s.lead}>Mueve y gira las cámaras. Así pensamos cada proyecto: primero las zonas de riesgo, después cuántas cámaras.</p>
          </div>
          <SimuladorCobertura />
        </div>
      </section>

      {/* Lo que se entrega */}
      <section className={s.seccion} aria-labelledby="entregas-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Al entregar</p>
              <h2 id="entregas-titulo" className={s.titulo}>
                Lo que recibes <span className={s.tenue}>en cada proyecto.</span>
              </h2>
            </div>
            <p className={s.lead}>
              Seis entregables, por escrito en la propuesta.{" "}
              <Link href="/blog/que-debe-incluir-memoria-tecnica" className={s.enlace}>
                Qué debe traer una memoria técnica
                <Flecha />
              </Link>
            </p>
          </div>
          <ul className={ip.entregables}>
            {ENTREGABLES.map((e) => (
              <li key={e.titulo} className={ip.entregable} data-aparecer>
                <span className={ip.rutaIcono}>
                  <PublicIcon name={e.icono} size={20} />
                </span>
                <h3 className={ip.rutaTitulo}>{e.titulo}</h3>
                <p className={ip.rutaTexto}>{e.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Método */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-label="Método">
        <div className={s.contenedor}>
          <Metodo
            antetitulo="Método"
            titulo={
              <>
                Del diagnóstico <span className={s.tenue}>a la operación.</span>
              </>
            }
            lead="Instalación documentada y operable: evidencia, no promesas."
            pasos={PASOS}
          />
        </div>
      </section>

      {/* Cómo se contrata */}
      <section className={s.seccion} aria-labelledby="modalidades-titulo">
        <div className={s.contenedor}>
          <div className={s.centro} data-aparecer>
            <p className={s.antetitulo}>Cómo trabajamos contigo</p>
            <h2 id="modalidades-titulo" className={s.titulo}>
              Un proyecto, <span className={s.tenue}>o soporte que sigue.</span>
            </h2>
          </div>
          <div className={ip.modalidades}>
            {MODALIDADES.map((m) => (
              <article key={m.titulo} className={ip.tarjeta} data-aparecer>
                <span className={ip.rutaIcono}>
                  <PublicIcon name={m.icono} size={20} />
                </span>
                <h3 className={ip.tarjetaTitulo}>{m.titulo}</h3>
                <p className={ip.rutaTexto}>{m.texto}</p>
                <ul className={p.lista}>
                  {m.puntos.map((pt) => (
                    <li key={pt}>
                      <PublicIcon name="check" size={18} />
                      {pt}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Certificaciones gris />

      {/* Industrias */}
      <section id="industrias" className={`${s.seccion} ${p.ancla}`} aria-labelledby="industrias-servicios">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
            <p className={s.antetitulo}>Industrias</p>
            <h2 id="industrias-servicios" className={s.titulo}>
              El mismo estándar, <span className={s.tenue}>en tu industria.</span>
            </h2>
            <p className={s.lead}>Soluciones armadas por industria, con su riesgo típico resuelto.</p>
          </header>
          <nav className={p.pildoras} aria-label="Industrias" data-aparecer>
            {INDUSTRIAS.map((ind) => (
              <Link key={ind.slug} href={`/soluciones/${ind.slug}`} className={p.pildora}>
                <span className={p.pildoraIcono}>
                  <PublicIcon name={ind.icono} size={20} />
                </span>
                {ind.nombre}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* Guías del blog */}
      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="guias-servicios">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Guías</p>
              <h2 id="guias-servicios" className={s.titulo}>
                Antes de cotizar, <span className={s.tenue}>lo que conviene saber.</span>
              </h2>
            </div>
            <p className={s.lead}>
              <Link href="/blog" className={s.enlace}>
                Todas las guías
                <Flecha />
              </Link>
            </p>
          </div>
          <TarjetasRuta
            ir="Leer la guía"
            rutas={GUIAS.filter((g) => g.slug !== "que-debe-incluir-memoria-tecnica").map((g) => ({
              href: `/blog/${g.slug}`,
              etiqueta: `${g.tema} · ${g.lectura} min`,
              titulo: g.titulo,
            }))}
          />
        </div>
      </section>

      <Cierre
        titulo={
          <>
            Cotiza videovigilancia, <span className={s.tenue}>redes o soporte.</span>
          </>
        }
        texto="Diagnóstico corto en Puebla o CDMX. Te decimos qué instalar, qué posponer y qué presupuesto tiene sentido."
        origen="/servicios"
      />
    </main>
  );
}
