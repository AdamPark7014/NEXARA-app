import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findIndustryLanding, getProgrammaticLandings } from "@/lib/seo/programmatic-landings";
import { INDUSTRY_HUB_SLUGS } from "@/lib/seo/industry-hubs";
import { buildWhatsAppLeadUrl, MONEY_SERVICE_SLUGS } from "@/lib/seo/money-pages";
import { GEO_CITIES } from "@/lib/seo/geo-cities";
import { JsonLd } from "@/lib/seo/json-ld";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import SubNav from "@/components/sitio/SubNav";
import Rutas, { type Ruta } from "@/components/sitio/TarjetasRuta";
import MapaMexico from "@/components/sitio/MapaMexico";
import Directorio from "@/components/sitio/Directorio";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import { foto, fotoOg } from "@/components/sitio/fotos";
import { visualIndustria, visualServicio } from "@/components/sitio/visuales";

type Params = { industry: string };

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

type Linea = { id: "cctv" | "redes" | "computo" | "soporte"; label: string; text: string };

/** Las seis industrias con página propia: riesgo típico, lo que atacamos y las tres líneas que suelen entrar. */
const INDUSTRY_HUBS: Record<
  string,
  {
    name: string;
    /** Titular del hero: la frase y su remate en gris. */
    titular: [string, string];
    risk: string;
    lead: string;
    pain: string;
    focus: string[];
    services: Linea[];
  }
> = {
  retail: {
    name: "Retail",
    titular: ["El mismo estándar", "en cada sucursal."],
    risk: "Multisede y merma",
    lead: "Sucursales con el mismo estándar de CCTV, Wi‑Fi y soporte, sin reinventar cada apertura.",
    pain: "Cada tienda improvisada es un riesgo distinto: merma, caídas del punto de venta y Wi‑Fi saturado los fines de semana.",
    focus: [
      "CCTV por sucursal con acceso centralizado",
      "Wi‑Fi y cableado documentados",
      "Soporte de punto de venta con tiempos claros",
      "Imagen y estándar repetible entre sedes",
    ],
    services: [
      { id: "cctv", label: "Videovigilancia", text: "Cobertura de piso de ventas, almacén y accesos, con evidencias." },
      { id: "redes", label: "Redes y Wi‑Fi", text: "Enlace estable para el punto de venta, los inventarios y el personal." },
      { id: "soporte", label: "Soporte TI", text: "Mesa de ayuda remota y visitas cuando la caja no puede esperar." },
    ],
  },
  manufactura: {
    name: "Manufactura",
    titular: ["Redes y perímetro", "a la altura de la planta."],
    risk: "Paros de planta",
    lead: "Redes de piso, perímetro y continuidad donde una caída cuesta un turno completo.",
    pain: "La planta no tolera redes de oficina: ruido, polvo, turnos y equipos críticos exigen otro diseño.",
    focus: [
      "Redes industriales y segmentación",
      "Perímetro y videovigilancia de patio y almacén",
      "Racks y respaldos para los sistemas de planta",
      "Soporte con ventanas de mantenimiento reales",
    ],
    services: [
      { id: "redes", label: "Conectividad de planta", text: "Switching, VLAN y enlaces pensados para operar 24/7." },
      { id: "cctv", label: "Perímetro y patio", text: "Cobertura de accesos, almacenes y zonas de riesgo." },
      { id: "computo", label: "Infraestructura", text: "Racks, energía y respaldos para los sistemas críticos." },
    ],
  },
  hospitalidad: {
    name: "Hospitalidad",
    titular: ["Wi‑Fi y vigilancia", "que el huésped no nota."],
    risk: "Densidad y reputación",
    lead: "Wi‑Fi denso, CCTV y operación unificada por propiedad: el huésped no perdona una red saturada.",
    pain: "Alta densidad de dispositivos, áreas públicas y habitaciones: un mal diseño se siente como un mal hotel.",
    focus: [
      "Diseño de radiofrecuencia y cobertura por zona",
      "CCTV en lobby, estacionamiento y áreas de servicio",
      "Operación unificada por propiedad",
      "Soporte en ventanas que no afecten la ocupación",
    ],
    services: [
      { id: "redes", label: "Wi‑Fi de alta densidad", text: "Cobertura para habitaciones, lobby y áreas de eventos." },
      { id: "cctv", label: "Videovigilancia", text: "Accesos, estacionamiento y zonas de operación." },
      { id: "soporte", label: "Soporte", text: "Respuesta remota primero; visita cuando la ocupación lo permite." },
    ],
  },
  salud: {
    name: "Salud",
    titular: ["Tecnología que no", "interrumpe la atención."],
    risk: "Continuidad clínica",
    lead: "Segmentación, respaldos y soporte prioritario para que la red no sea el cuello de botella clínico.",
    pain: "Consultorios y clínicas dependen de conectividad segmentada, equipo estable y respuesta rápida ante fallas.",
    focus: [
      "Redes clínicas separadas de las administrativas",
      "Respaldos y continuidad de los sistemas",
      "CCTV en accesos y zonas comunes",
      "Soporte prioritario en horario de atención",
    ],
    services: [
      { id: "redes", label: "Conectividad segmentada", text: "Separación clara de los flujos clínicos y administrativos." },
      { id: "computo", label: "Respaldos e infraestructura", text: "Estaciones, servidores y respaldos acordados." },
      { id: "soporte", label: "Soporte prioritario", text: "Tiempos de respuesta alineados a la ventana clínica." },
    ],
  },
  educacion: {
    name: "Educación",
    titular: ["Un campus seguro", "y conectado."],
    risk: "Campus completo",
    lead: "Wi‑Fi, CCTV y mesa de ayuda para aulas, laboratorios y edificios administrativos.",
    pain: "El campus mezcla densidad de alumnos, seguridad perimetral y soporte continuo durante el ciclo escolar.",
    focus: [
      "Wi‑Fi de campus y aulas",
      "CCTV en accesos y espacios comunes",
      "Mesa de ayuda para personal y laboratorios",
      "El mismo estándar entre edificios",
    ],
    services: [
      { id: "redes", label: "Wi‑Fi de campus", text: "Cobertura para aulas, plazas y edificios administrativos." },
      { id: "cctv", label: "Seguridad del campus", text: "Accesos, pasillos y estacionamientos con evidencia." },
      { id: "soporte", label: "Mesa de ayuda", text: "Atención a incidentes de aula y del personal." },
    ],
  },
  gobierno: {
    name: "Gobierno",
    titular: ["Modernización por fases,", "con evidencia auditable."],
    risk: "Fases y auditoría",
    lead: "Modernización por etapas con documentación auditable y entregables que se pueden defender.",
    pain: "Los proyectos públicos exigen alcance claro, evidencia de entrega y continuidad, no cajas negras técnicas.",
    focus: [
      "Implementación por fases",
      "Documentación y evidencias de entrega",
      "CCTV, redes y cómputo con un estándar repetible",
      "Soporte alineado a los SLA institucionales",
    ],
    services: [
      { id: "redes", label: "Infraestructura de red", text: "Cableado, switching y enlaces documentados." },
      { id: "cctv", label: "Videovigilancia", text: "Cobertura perimetral y de instalaciones, con registro." },
      { id: "soporte", label: "Soporte y continuidad", text: "Mesa de ayuda y visitas con tiempos acordados." },
    ],
  },
};

const ICONO_LINEA: Record<Linea["id"], PublicIconName> = {
  cctv: "camera",
  redes: "wifi",
  computo: "server",
  soporte: "headset",
};

/** Para las industrias que aún no tienen soluciones por servicio: las cinco líneas de /servicios. */
const LINEAS_SERVICIOS: Ruta[] = [
  { href: "/servicios#cctv", titulo: "Videovigilancia", texto: "Cámaras IP, grabación y monitoreo.", icono: "camera" },
  { href: "/servicios#redes", titulo: "Redes y Wi‑Fi", texto: "Cableado certificado y Wi‑Fi estable.", icono: "wifi" },
  { href: "/servicios#computo", titulo: "Infraestructura y cómputo", texto: "Racks, servidores y respaldos.", icono: "server" },
  { href: "/servicios#soporte", titulo: "Soporte y gestión TI", texto: "Mesa de ayuda con SLA, remota y en sitio.", icono: "headset" },
];

export function generateStaticParams() {
  return INDUSTRY_HUB_SLUGS.map((industry) => ({ industry }));
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const hub = INDUSTRY_HUBS[params.industry];
  if (!hub) {
    return { title: "Soluciones | Nexara", robots: { index: false, follow: false } };
  }
  const path = `/soluciones/${params.industry}`;
  const title = `${hub.name}: CCTV, redes y soporte TI en México | NEXARA`;
  const description = `${hub.lead} Cotiza soluciones NEXARA para ${hub.name.toLowerCase()} en Puebla, CDMX y todo México.`;
  const imagen = fotoOg(visualIndustria(params.industry).foto ?? "campo-instalacion-rack");
  return {
    title: { absolute: title },
    description,
    keywords: [
      `${hub.name} CCTV`,
      `redes ${hub.name}`,
      `soporte TI ${hub.name}`,
      `tecnología ${hub.name} México`,
      "Nexara",
    ],
    alternates: { canonical: path },
    // Explícito: el layout trae la metadata de Studio «soluciones», que es noindex para el índice /soluciones
    // (redirige a /servicios) y antes se heredaba aquí.
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "es_MX",
      url: `${siteUrl}${path}`,
      siteName: "NEXARA",
      title,
      description,
      images: [{ url: imagen, width: 1200, height: 630, alt: hub.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imagen],
    },
  };
}

export default function IndustryHubPage({ params }: { params: Params }) {
  const hub = INDUSTRY_HUBS[params.industry];
  if (!hub) notFound();

  const visual = visualIndustria(params.industry);
  const seoIndustry = findIndustryLanding(params.industry);
  const relacionadas = getProgrammaticLandings()
    .filter((item) => item.industry.slug === params.industry)
    .sort((a, b) => {
      const ai = (MONEY_SERVICE_SLUGS as readonly string[]).indexOf(a.service.slug);
      const bi = (MONEY_SERVICE_SLUGS as readonly string[]).indexOf(b.service.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, 8);

  const hubPath = `/soluciones/${params.industry}`;
  const contactoHref = `/contacto?industry=${params.industry}`;
  const waHref = buildWhatsAppLeadUrl({
    industryName: hub.name,
    serviceName: "soluciones tecnológicas",
    path: hubPath,
  });

  const secciones = [
    { id: "riesgo", label: "El riesgo" },
    { id: "alcance", label: "Alcance" },
    { id: "soluciones", label: "Soluciones" },
    { id: "cobertura", label: "Cobertura" },
  ];

  return (
    <main aria-label={`Soluciones ${hub.name}`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${hub.name} | NEXARA`,
          url: `${siteUrl}${hubPath}`,
          description: hub.lead,
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
              { "@type": "ListItem", position: 2, name: "Industrias", item: `${siteUrl}/servicios#industrias` },
              { "@type": "ListItem", position: 3, name: hub.name, item: `${siteUrl}${hubPath}` },
            ],
          },
        }}
      />

      <HeroInterior
        id={`industria-${params.industry}`}
        migas={[
          { href: "/", label: "Inicio" },
          { href: "/servicios#industrias", label: "Industrias" },
          { label: hub.name },
        ]}
        antetitulo={
          <>
            <PublicIcon name={visual.icono} size={18} /> {hub.name}
          </>
        }
        titulo={
          <>
            {hub.titular[0]} <span className={s.tenue}>{hub.titular[1]}</span>
          </>
        }
        lead={hub.lead}
        acciones={
          <>
            <Link href={contactoHref} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="industry_hub_hero_cta">
              Cotizar proyecto
              <Flecha />
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${s.boton} ${s.botonSecundario}`}
              data-track-conversion="industry_hub_whatsapp"
            >
              Hablar por WhatsApp
              <Flecha />
            </a>
          </>
        }
        visual={
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...foto(visual.foto ?? "campo-instalacion-rack", "(max-width: 1260px) 100vw, 1200px")}
              alt={`Instalación de NEXARA para ${hub.name.toLowerCase()}`}
              fetchPriority="high"
              decoding="async"
            />
            <span className={s.chip} style={{ left: 20, bottom: 20 }}>
              <PublicIcon name="check" size={14} /> Instalación de NEXARA
            </span>
          </>
        }
      />

      <SubNav titulo={hub.name} secciones={secciones} cta={{ href: contactoHref, label: "Cotizar" }} />

      {/* El riesgo y lo que dejamos resuelto */}
      <section id="riesgo" className={`${s.seccion} ${s.seccionAlt} ${p.ancla}`} aria-labelledby="riesgo-titulo">
        <div className={s.contenedor}>
          <div className={i.dos}>
            <div data-aparecer>
              <p className={s.antetitulo}>El riesgo</p>
              <h2 id="riesgo-titulo" className={s.titulo}>
                {hub.risk}. <span className={s.tenue}>Lo que suele fallar.</span>
              </h2>
              <p className={s.lead}>{hub.pain}</p>
            </div>
            <div className={i.tarjeta} data-aparecer>
              <span className={i.tarjetaEtiqueta}>
                <PublicIcon name="check" size={16} /> Con NEXARA
              </span>
              <h3 className={i.tarjetaTitulo}>Lo que dejamos resuelto</h3>
              <ul className={p.lista}>
                {hub.focus.map((f) => (
                  <li key={f}>
                    <PublicIcon name="check" size={18} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {seoIndustry ? (
            <ol className={p.tres}>
              {seoIndustry.outcomes.map((o, n) => (
                <li key={o} className={p.tresItem} data-aparecer>
                  <span className={p.tresNumero}>{String(n + 1).padStart(2, "0")}</span>
                  <h3 className={p.tresTitulo}>{o}</h3>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>

      {/* Las tres líneas que suelen entrar */}
      <section id="alcance" className={`${s.seccion} ${p.ancla}`} aria-labelledby="alcance-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Alcance típico</p>
              <h2 id="alcance-titulo" className={s.titulo}>
                Tres líneas, <span className={s.tenue}>un solo responsable.</span>
              </h2>
            </div>
            <p className={s.lead}>Instalamos, documentamos y damos soporte bajo el mismo contrato.</p>
          </div>
          <Rutas
            ir="Ver el servicio"
            rutas={hub.services.map((l) => ({ href: `/servicios#${l.id}`, titulo: l.label, texto: l.text, icono: ICONO_LINEA[l.id] }))}
          />
        </div>
      </section>

      {/* Soluciones servicio por servicio */}
      <section id="soluciones" className={`${s.seccion} ${s.seccionAlt} ${p.ancla}`} aria-labelledby="soluciones-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Soluciones</p>
              <h2 id="soluciones-titulo" className={s.titulo}>
                {hub.name}, <span className={s.tenue}>servicio por servicio.</span>
              </h2>
            </div>
            <p className={s.lead}>
              {relacionadas.length > 0
                ? "Cada solución trae su alcance, lo que entregamos y las preguntas antes de cotizar."
                : `Las mismas líneas de servicio, con el riesgo de ${hub.name.toLowerCase()} ya considerado.`}
            </p>
          </div>
          {relacionadas.length > 0 ? (
            <Rutas
              columnas={4}
              ir="Ver solución"
              rutas={relacionadas.map((item) => ({
                href: `/soluciones/${item.industry.slug}/${item.service.slug}`,
                titulo: item.service.name,
                texto: item.service.summary,
                icono: visualServicio(item.service.slug).icono,
              }))}
            />
          ) : (
            <Rutas columnas={4} ir="Ver el servicio" rutas={LINEAS_SERVICIOS} />
          )}
        </div>
      </section>

      {/* Cobertura */}
      <section id="cobertura" className={`${s.seccion} ${p.ancla}`} aria-labelledby="cobertura-titulo">
        <div className={`${s.contenedor} ${i.dos}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Cobertura</p>
            <h2 id="cobertura-titulo" className={s.titulo}>
              Base en Puebla y CDMX. <span className={s.tenue}>Proyectos en todo el país.</span>
            </h2>
            <p className={s.lead}>Levantamos en sitio, instalamos y damos seguimiento donde opere tu empresa.</p>
            <nav className={i.fichas} aria-label="Ciudades con cobertura">
              {GEO_CITIES.map((c) => (
                <Link key={c.slug} href={`/cobertura/${c.slug}`} className={i.ficha}>
                  {c.name}
                </Link>
              ))}
            </nav>
          </div>
          <div data-aparecer>
            <MapaMexico />
          </div>
        </div>
      </section>

      <Directorio actual={hubPath} excluirIndustria={params.industry} titulo="Otras industrias" industrias={4} porIndustria={3} />

      <Cierre
        titulo={
          <>
            Arma el alcance <span className={s.tenue}>de tu sitio.</span>
          </>
        }
        texto="Cuéntanos sedes, urgencia y el riesgo principal. Te devolvemos una ruta concreta."
        primario={{ href: contactoHref, label: "Agendar diagnóstico" }}
        origen={hubPath}
        whatsapp={waHref}
        medicion={{ primario: "industry_hub_cta", whatsapp: "industry_hub_footer_wa" }}
      />
    </main>
  );
}
