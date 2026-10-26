import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GEO_CITIES, GEO_SERVICE_SLUGS, findGeoCity, isGeoServiceSlug } from "@/lib/seo/geo-cities";
import { findServiceLanding } from "@/lib/seo/programmatic-landings";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { getPageKeywords, categoryFromSlug } from "@/lib/seo/keywords";
import { JsonLd } from "@/lib/seo/json-ld";
import { recortarDescripcion } from "@/lib/seo/textos";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import SubNav from "@/components/sitio/SubNav";
import Rutas from "@/components/sitio/TarjetasRuta";
import MapaMexico from "@/components/sitio/MapaMexico";
import Preguntas from "@/components/sitio/Preguntas";
import ArteServicio from "@/components/sitio/ArteServicio";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import { foto, fotoOg } from "@/components/sitio/fotos";
import { MODO_CIUDAD, NOMBRE_LINEA, visualServicio } from "@/components/sitio/visuales";

type Params = { city: string; service: string };

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const revalidate = 1800;

export function generateStaticParams() {
  const params: Params[] = [];
  for (const city of GEO_CITIES) {
    for (const service of GEO_SERVICE_SLUGS) {
      params.push({ city: city.slug, service });
    }
  }
  return params;
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const city = findGeoCity(params.city);
  const service = isGeoServiceSlug(params.service) ? findServiceLanding(params.service) : undefined;
  if (!city || !service) {
    return { title: "Cobertura | NEXARA", robots: { index: false, follow: false } };
  }

  const path = `/cobertura/${city.slug}/${service.slug}`;
  const title = `${service.name} en ${city.name} | NEXARA`;
  const placeLabel = city.name === city.region ? city.name : `${city.name}, ${city.region}`;
  const description = recortarDescripcion(`${service.name} en ${placeLabel}. ${service.summary} Instalación, documentación y soporte.`);
  const ogImage = fotoOg(visualServicio(service.slug).foto);
  const category = categoryFromSlug(service.slug);
  const keywords = [
    ...getPageKeywords(category, city.name),
    `${service.name} ${city.name}`,
    `cotizar ${service.name} ${city.name}`,
    `precio ${service.name} ${city.region}`,
    `instalación ${service.name} ${city.name}`,
  ];

  return {
    title: { absolute: title },
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "es_MX",
      url: `${siteUrl}${path}`,
      siteName: "NEXARA",
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function CoberturaCityServicePage({ params }: { params: Params }) {
  const city = findGeoCity(params.city);
  const service = isGeoServiceSlug(params.service) ? findServiceLanding(params.service) : undefined;
  if (!city || !service) notFound();

  const path = `/cobertura/${city.slug}/${service.slug}`;
  const visual = visualServicio(service.slug);
  const modo = MODO_CIUDAD[city.mode];
  const contactoHref = `/contacto?city=${city.slug}&service=${service.slug}`;
  const waHref = buildWhatsAppLeadUrl({
    industryName: city.name,
    serviceName: service.name,
    path,
  });

  const relatedServices = GEO_SERVICE_SLUGS.filter((slug) => slug !== service.slug)
    .map((slug) => findServiceLanding(slug))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const faqs = [
    {
      q: `¿Cuánto cuesta ${service.name} en ${city.name}?`,
      a: `Depende del tamaño del sitio y del alcance. En NEXARA cerramos la propuesta por fases con precios claros. En ${city.name} hacemos el diagnóstico y te damos un rango realista en la primera conversación.`,
    },
    {
      q: `¿Instalan ${service.name} en ${city.name} y alrededores?`,
      a: `Sí. Operamos en ${city.name} (${city.region}) con un modelo ${modo.faq}. Levantamos, instalamos y dejamos evidencia de la entrega.`,
    },
    {
      q: `¿Incluye soporte después de instalar en ${city.name}?`,
      a: `Puedes contratar solo la implementación o la implementación con soporte y mesa de ayuda. Una sola firma responsable, sin pasar el problema a otro proveedor.`,
    },
    {
      q: `¿Atienden empresas con varias sedes desde ${city.name}?`,
      a: `Sí. Sobre todo retail y plantas: el mismo estándar en cada sede, con acceso centralizado cuando aplica y SLA definidos por contrato.`,
    },
  ];

  return (
    <main aria-label={`${service.name} en ${city.name}`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          name: `${service.name} en ${city.name}`,
          serviceType: service.name,
          description: service.summary,
          url: `${siteUrl}${path}`,
          image: `${siteUrl}${fotoOg(visual.foto)}`,
          areaServed: {
            "@type": "City",
            name: city.name,
            containedInPlace: { "@type": "AdministrativeArea", name: city.region },
          },
          provider: {
            "@type": "Organization",
            name: "NEXARA",
            url: siteUrl,
            logo: `${siteUrl}/icon-192.png`,
            telephone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "+52-222-696-0350",
            address: {
              "@type": "PostalAddress",
              streetAddress: "Explanada Puebla, Santiago Momoxpan",
              addressLocality: "Puebla",
              addressRegion: "Puebla",
              addressCountry: "MX",
            },
          },
          offers: {
            "@type": "Offer",
            url: `${siteUrl}${contactoHref}`,
            priceCurrency: "MXN",
            availability: "https://schema.org/InStock",
            description: `Cotización de ${service.name} en ${city.name}`,
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
            { "@type": "ListItem", position: 2, name: "Cobertura", item: `${siteUrl}/proyectos#cobertura` },
            { "@type": "ListItem", position: 3, name: city.name, item: `${siteUrl}/cobertura/${city.slug}` },
            { "@type": "ListItem", position: 4, name: service.name, item: `${siteUrl}${path}` },
          ],
        }}
      />

      <HeroInterior
        id="servicio-ciudad-titulo"
        tituloLargo
        migas={[
          { href: "/", label: "Inicio" },
          { href: "/proyectos#cobertura", label: "Cobertura" },
          { href: `/cobertura/${city.slug}`, label: city.name },
          { label: service.name },
        ]}
        antetitulo={
          <>
            <PublicIcon name={visual.icono} size={18} /> {city.name === city.region ? city.name : `${city.name}, ${city.region}`}
          </>
        }
        titulo={
          <>
            {service.name} <span className={s.tenue}>en {city.name}.</span>
          </>
        }
        lead={`${service.summary} Instalación, evidencia y soporte en ${city.name}.`}
        acciones={
          <>
            <Link
              href={contactoHref}
              className={`${s.boton} ${s.botonPrimario}`}
              data-track-conversion="geo_service_hero_contact"
              data-landing-path={path}
            >
              Cotizar en {city.name}
              <Flecha />
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${s.boton} ${s.botonSecundario}`}
              data-track-conversion="geo_service_hero_wa"
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
              {...foto(visual.foto, "(max-width: 1260px) 100vw, 1200px")}
              alt={`${service.name} instalado por NEXARA`}
              fetchPriority="high"
              decoding="async"
            />
            <span className={s.chip} style={{ left: 20, bottom: 20 }}>
              <PublicIcon name="mapPin" size={14} /> {modo.etiqueta}
            </span>
          </>
        }
      />

      <SubNav
        titulo={service.name}
        secciones={[
          { id: "incluye", label: "Qué incluye" },
          { id: "preguntas", label: "Preguntas" },
          { id: "ciudades", label: "Otras ciudades" },
        ]}
        cta={{ href: contactoHref, label: "Cotizar" }}
      />

      {/* Qué incluye */}
      <section id="incluye" className={`${s.seccion} ${p.ancla}`} aria-labelledby="incluye-titulo">
        <div className={s.contenedor}>
          <article className={p.servicio} data-aparecer>
            <div>
              <span className={p.servicioIcono}>
                <PublicIcon name={visual.icono} size={22} />
              </span>
              <p className={s.antetitulo}>Entrega en {city.name}</p>
              <h2 id="incluye-titulo" className={p.servicioTitulo}>
                Qué incluye
              </h2>
              <p className={p.servicioTexto}>{city.blurb}</p>
              <ul className={p.lista}>
                {service.deliverables.map((d) => (
                  <li key={d}>
                    <PublicIcon name="check" size={18} />
                    {d}
                  </li>
                ))}
              </ul>
              <p className={p.servicioEnlace}>
                <Link href={`/servicios#${visual.ancla}`} className={s.enlace}>
                  Ver {NOMBRE_LINEA[visual.ancla]} en Servicios
                  <Flecha />
                </Link>
              </p>
            </div>
            <div className={p.servicioArte}>
              <ArteServicio servicio={service.slug} alt={`${service.name} instalado por NEXARA`} />
            </div>
          </article>
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className={`${s.seccion} ${s.seccionAlt} ${p.ancla}`} aria-labelledby="preguntas-titulo">
        <div className={`${s.contenedor} ${s.faq}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Preguntas frecuentes</p>
            <h2 id="preguntas-titulo" className={s.titulo}>
              {service.name} <span className={s.tenue}>en {city.name}.</span>
            </h2>
            <p className={s.lead}>¿Tienes otra duda? Escríbenos y te contesta una persona del equipo.</p>
          </div>
          <div data-aparecer>
            <Preguntas preguntas={faqs.map((f) => ({ p: f.q, r: f.a }))} />
          </div>
        </div>
      </section>

      {/* Otros servicios en la ciudad */}
      {relatedServices.length > 0 ? (
        <section className={s.seccion} aria-labelledby="otros-titulo">
          <div className={s.contenedor}>
            <div className={s.cabeza} data-aparecer>
              <div>
                <p className={s.antetitulo}>También en {city.name}</p>
                <h2 id="otros-titulo" className={s.titulo}>
                  Otros <span className={s.tenue}>servicios.</span>
                </h2>
              </div>
            </div>
            <Rutas
              columnas={4}
              ir="Ver servicio"
              rutas={relatedServices.map((sv) => ({
                href: `/cobertura/${city.slug}/${sv.slug}`,
                titulo: sv.name,
                texto: sv.summary,
                icono: visualServicio(sv.slug).icono,
              }))}
            />
          </div>
        </section>
      ) : null}

      {/* El mismo servicio en otras ciudades */}
      <section id="ciudades" className={`${s.seccion} ${s.seccionAlt} ${p.ancla}`} aria-labelledby="ciudades-titulo">
        <div className={`${s.contenedor} ${i.dos}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Otras ciudades</p>
            <h2 id="ciudades-titulo" className={s.titulo}>
              {service.name} <span className={s.tenue}>cerca de {city.name}.</span>
            </h2>
            <p className={s.lead}>El mismo estándar de instalación y documentación en cada ciudad donde trabajamos.</p>
            <nav className={i.fichas} aria-label={`${service.name} en otras ciudades`}>
              {GEO_CITIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/cobertura/${c.slug}/${service.slug}`}
                  className={`${i.ficha} ${c.slug === city.slug ? i.fichaActual : ""}`}
                  aria-current={c.slug === city.slug ? "page" : undefined}
                >
                  {c.name}
                </Link>
              ))}
            </nav>
          </div>
          <div data-aparecer>
            <MapaMexico destacar={city.name} />
          </div>
        </div>
      </section>

      <Cierre
        titulo={
          <>
            Cotiza {service.name} <span className={s.tenue}>en {city.name}.</span>
          </>
        }
        texto="Diagnóstico corto: alcance, fases y un presupuesto con sentido, sin alcance abierto."
        primario={{ href: contactoHref, label: "Cotiza tu proyecto" }}
        origen={path}
        whatsapp={waHref}
        medicion={{ primario: "geo_service_footer_contact", whatsapp: "geo_service_footer_wa", ruta: path }}
      />
    </main>
  );
}
