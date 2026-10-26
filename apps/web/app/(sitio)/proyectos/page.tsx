import Link from "next/link";
import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import { foto, type Foto } from "@/components/sitio/fotos";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import Aurora from "@/components/sitio/Aurora";
import Flecha from "@/components/sitio/Flecha";
import Cierre from "@/components/sitio/Cierre";
import MapaMexico from "@/components/sitio/MapaMexico";
import ListaCiudades from "@/components/sitio/ListaCiudades";
import Sincronia from "@/components/sitio/Sincronia";
import { ruta } from "@/components/sitio/rutas";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("proyectos");
}

export const dynamic = "force-dynamic";

/** Página de solución de cada industria de los casos. */
const SOLUCION_DE: Record<string, string> = {
  Retail: "retail",
  Manufactura: "manufactura",
  Hospitalidad: "hospitalidad",
  Salud: "salud",
  Educación: "educacion",
  Gobierno: "gobierno",
};

/** Referencias representativas por industria (sin nombrar al cliente), las mismas del sitio actual. */
const CASOS: { sector: string; icono: PublicIconName; titulo: string; texto: string; metrica: string; servicios: string[] }[] = [
  { sector: "Retail", icono: "store", titulo: "Modernización multisede", texto: "Videovigilancia, redes y soporte de punto de venta con un estándar repetible por sucursal.", metrica: "60 sedes", servicios: ["CCTV", "Redes", "Soporte"] },
  { sector: "Manufactura", icono: "factory", titulo: "Continuidad de planta", texto: "Redes de piso, perímetro y monitoreo para reducir paros por fallas de infraestructura.", metrica: "Menos paros", servicios: ["Redes", "CCTV", "Infraestructura"] },
  { sector: "Hospitalidad", icono: "hotel", titulo: "Wi‑Fi de alta densidad", texto: "Diseño de cobertura y cableado para habitaciones y áreas públicas sin saturar la experiencia.", metrica: "480 hab.", servicios: ["Wi‑Fi", "Cableado", "Soporte"] },
  { sector: "Salud", icono: "hospital", titulo: "Infraestructura clínica", texto: "Segmentación, respaldos y soporte prioritario para la continuidad de la atención.", metrica: "12 sitios", servicios: ["Redes", "Infraestructura", "Soporte"] },
  { sector: "Educación", icono: "school", titulo: "Campus conectado", texto: "Wi‑Fi, videovigilancia y mesa de ayuda para aulas, laboratorios y edificios administrativos.", metrica: "3 campus", servicios: ["Wi‑Fi", "CCTV", "Mesa de ayuda"] },
  { sector: "Gobierno", icono: "landmark", titulo: "Modernización por fases", texto: "Infraestructura documentada, entregables auditables y continuidad operativa.", metrica: "Por fases", servicios: ["Infraestructura", "Redes", "Documentación"] },
];

/** Galería de campo: instalaciones reales, sin tomas de taller repetidas. */
const GALERIA: (Foto & { w: number; h: number; alt: string; tema: string; pie: string })[] = [
  { ...foto("campo-mastil-antenas", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1200, h: 1600, alt: "Mástil con antenas de enlace inalámbrico", tema: "Redes", pie: "Mástil con antenas de enlace." },
  { ...foto("monitoreo-pantallas-cctv", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1600, h: 1200, alt: "Pantallas de videovigilancia", tema: "CCTV", pie: "Monitores de videovigilancia multicámara." },
  { ...foto("control-acceso-terminal-facial", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1066, h: 1600, alt: "Terminal de reconocimiento facial", tema: "Control de acceso", pie: "Terminal facial en acceso de oficinas." },
  { ...foto("campo-instalacion-rack", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1280, h: 958, alt: "Técnicos instalando un rack", tema: "Instalación", pie: "Montaje de rack de telecomunicaciones." },
  { ...foto("rack-servidores-led", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1023, h: 1537, alt: "Rack de servidores y switching", tema: "Infraestructura", pie: "Rack de servidores, etiquetado y documentado." },
  { ...foto("campo-enlace-antena-ciudad", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1600, h: 1200, alt: "Radioenlace sobre la ciudad", tema: "Enlaces", pie: "Radioenlace punto a punto entre sedes." },
  { ...foto("control-acceso-torniquetes", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1600, h: 1066, alt: "Torniquetes de control de acceso", tema: "Control de acceso", pie: "Torniquetes con reconocimiento facial." },
  { ...foto("monitoreo-videowall", "(max-width: 734px) 100vw, (max-width: 1068px) 50vw, 400px"), w: 1200, h: 1391, alt: "Muro de video con las cámaras de un cliente", tema: "Monitoreo", pie: "Muro de video listo para operar." },
  { src: "/fotos/tecnico-nexara-entrega-equipo-sitio-1200.webp", w: 1200, h: 800, alt: "Técnico de NEXARA entregando equipo en sitio", tema: "Logística", pie: "Entrega de equipo en sitio." },
];

const DOCUMENTACION = [
  { titulo: "Levantamiento en sitio", texto: "Recorrido, riesgos, planos y prioridades antes de cotizar. Sin propuestas a ciegas." },
  { titulo: "Memoria técnica", texto: "Diagramas, direccionamiento, etiquetado y configuraciones entregadas al cliente." },
  { titulo: "Entrega con evidencia", texto: "Pruebas, fotografías y capacitación. Después, soporte con SLA." },
];

type CasoStudio = { id: number; titulo: string; sector: string; resumen: string; imagen: string | null };

/** Casos publicados en Studio; hoy la API devuelve una lista vacía y la sección no se pinta. */
async function casosStudio(): Promise<CasoStudio[]> {
  try {
    const res = await fetch(buildApiUrl("case-studies/public?limit=12"), { cache: "no-store" });
    if (!res.ok) return [];
    const carga = (await res.json()) as unknown;
    const filas = (Array.isArray(carga) ? carga : (carga as { data?: unknown[] })?.data) ?? [];
    const origen = getApiAssetOrigin();
    return (filas as Record<string, any>[]).map((c) => {
      const img: string | null = c.imageUrl || c.cover || null;
      return {
        id: c.id,
        titulo: c.titulo,
        sector: c.vertical || "Proyecto",
        resumen: c.descripcion || c.impacto || "",
        imagen: !img ? null : /^https?:/.test(img) ? img : img.startsWith("/") ? `${origen}${img}` : `${origen}/case-studies/image/${img}`,
      };
    });
  } catch {
    return [];
  }
}

export default async function PropuestaProyectos() {
  const publicados = await casosStudio();

  return (
    <main aria-label="Proyectos">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Proyectos | NEXARA",
          url: `${siteBaseUrl()}/proyectos`,
          description: "Casos y proyectos de CCTV, redes y soporte ejecutados por NEXARA.",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: CASOS.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `${c.sector}: ${c.titulo}`,
              description: c.texto,
            })),
          },
        }}
      />
      <section className={p.hero} aria-labelledby="proyectos-hero">
        <Aurora />
        <div className={`${s.contenedor} ${s.centro}`}>
          <p className={s.antetitulo}>Proyectos</p>
          <h1 id="proyectos-hero" className={p.heroTitulo}>
            Instalaciones <span className={s.degradado}>que operan hoy.</span>
          </h1>
          <p className={p.heroLead}>Videovigilancia, redes, cómputo y soporte en sitios reales, con evidencia de cada entrega.</p>
          <div className={s.acciones}>
            <Link href={ruta("/contacto")} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="proyectos_hero_cta">
              Cotiza tu proyecto
              <Flecha />
            </Link>
            <a href="#galeria" className={`${s.boton} ${s.botonSecundario}`}>
              Ver la galería
              <Flecha />
            </a>
          </div>
          <figure className={p.heroFoto}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...foto("sala-monitoreo-videowall-nexara", "(max-width: 1260px) 100vw, 1200px")}
              alt="Sala de monitoreo con muro de video y estaciones de trabajo instalada por NEXARA, en operación"
              fetchPriority="high"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-label="Proyectos por industria">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Por industria</p>
              <h2 className={s.titulo}>
                Referencias <span className={s.tenue}>que se repiten.</span>
              </h2>
            </div>
            <p className={s.lead}>Proyectos representativos por industria, sin nombrar a los clientes.</p>
          </div>
          <ul className={p.casos}>
            {CASOS.map((c) => (
              <li key={c.sector} className={p.caso} data-aparecer>
                <div className={p.casoCabeza}>
                  <span className={p.casoSector}>
                    <PublicIcon name={c.icono} size={18} /> {c.sector}
                  </span>
                  <span className={p.casoMetrica}>{c.metrica}</span>
                </div>
                <h3 className={p.casoTitulo}>{c.titulo}</h3>
                <p className={p.casoTexto}>{c.texto}</p>
                <div className={p.chips}>
                  {c.servicios.map((sv) => (
                    <span key={sv}>{sv}</span>
                  ))}
                </div>
                {SOLUCION_DE[c.sector] ? (
                  <Link href={`/soluciones/${SOLUCION_DE[c.sector]}`} className={s.enlace} style={{ marginTop: 20, fontSize: 15 }}>
                    Ver la solución para {c.sector.toLowerCase()}
                    <Flecha />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {publicados.length ? (
        <section className={s.seccion} aria-labelledby="publicados-titulo">
          <div className={s.contenedor}>
            <header data-aparecer>
              <p className={s.antetitulo}>Casos publicados</p>
              <h2 id="publicados-titulo" className={s.titulo}>
                Casos <span className={s.tenue}>de campo.</span>
              </h2>
            </header>
            <ul className={p.casos}>
              {publicados.map((c) => (
                <li key={c.id} className={p.caso} data-aparecer>
                  {c.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imagen} alt="" loading="lazy" decoding="async" style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: 14 }} />
                  ) : null}
                  <span className={p.casoSector} style={{ marginTop: 20 }}>
                    {c.sector}
                  </span>
                  <h3 className={p.casoTitulo} style={{ marginTop: 8 }}>
                    {c.titulo}
                  </h3>
                  <p className={p.casoTexto}>{c.resumen}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section id="galeria" className={`${s.seccion} ${p.ancla}`} aria-labelledby="galeria-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Galería</p>
              <h2 id="galeria-titulo" className={s.titulo}>
                Trabajo real, <span className={s.tenue}>sin banco de imágenes.</span>
              </h2>
            </div>
            <p className={s.lead}>Fotografía de instalaciones de NEXARA en operación.</p>
          </div>
          <div className={p.mosaico}>
            {GALERIA.map((g) => (
              <figure key={g.src} data-aparecer>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.src} srcSet={g.srcSet} sizes={g.sizes} width={g.w} height={g.h} alt={g.alt} loading="lazy" decoding="async" />
                <figcaption>
                  <b>{g.tema}</b>
                  {g.pie}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="doc-titulo">
        <div className={s.contenedor}>
          <header className={s.centro} data-aparecer>
            <p className={s.antetitulo}>Documentación</p>
            <h2 id="doc-titulo" className={s.titulo}>
              Cada proyecto <span className={s.tenue}>queda por escrito.</span>
            </h2>
          </header>
          <ol className={p.tres}>
            {DOCUMENTACION.map((d, i) => (
              <li key={d.titulo} className={p.tresItem} data-aparecer>
                <span className={p.tresNumero}>0{i + 1}</span>
                <h3 className={p.tresTitulo}>{d.titulo}</h3>
                <p className={p.tresTexto}>{d.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="cobertura" className={`${s.seccion} ${p.ancla}`} aria-labelledby="cobertura-proyectos">
        <Sincronia className={`${s.contenedor} ${s.cobertura}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Cobertura</p>
            <h2 id="cobertura-proyectos" className={s.titulo}>
              Donde <span className={s.tenue}>trabajamos.</span>
            </h2>
            <p className={s.lead}>Base en Puebla y la Ciudad de México; proyectos multisede en toda la República.</p>
            <ListaCiudades />
          </div>
          <div data-aparecer>
            <MapaMexico />
          </div>
        </Sincronia>
      </section>

      <Cierre
        titulo={
          <>
            ¿Tu sitio es el siguiente? <span className={s.tenue}>Cuéntanos qué necesitas.</span>
          </>
        }
        texto="Diagnóstico en sitio en el centro del país y propuesta con alcance cerrado."
        origen="/proyectos"
      />
    </main>
  );
}
