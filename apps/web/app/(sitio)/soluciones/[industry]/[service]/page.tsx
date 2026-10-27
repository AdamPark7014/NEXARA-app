import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findIndustryLanding, findServiceLanding, getProgrammaticLandings } from "@/lib/seo/programmatic-landings";
import { isIndustryHubSlug } from "@/lib/seo/industry-hubs";
import { getPageKeywords, categoryFromSlug } from "@/lib/seo/keywords";
import { recortarDescripcion, tituloConRemate } from "@/lib/seo/textos";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { GEO_CITIES, isGeoServiceSlug } from "@/lib/seo/geo-cities";
import { JsonLd } from "@/lib/seo/json-ld";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import SubNav from "@/components/sitio/SubNav";
import Rutas from "@/components/sitio/TarjetasRuta";
import Preguntas from "@/components/sitio/Preguntas";
import ArteServicio from "@/components/sitio/ArteServicio";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import { foto, fotoOg } from "@/components/sitio/fotos";
import { NOMBRE_LINEA, fotoSolucion, visualIndustria, visualServicio } from "@/components/sitio/visuales";

type Params = {
  industry: string;
  service: string;
};

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const revalidate = 1800;

export function generateStaticParams() {
  return getProgrammaticLandings().map(({ industry, service }) => ({
    industry: industry.slug,
    service: service.slug,
  }));
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const industry = findIndustryLanding(params.industry);
  const service = findServiceLanding(params.service);

  if (!industry || !service) {
    return {
      title: "Soluciones empresariales | Nexara",
      robots: { index: false, follow: false },
    };
  }

  const path = `/soluciones/${industry.slug}/${service.slug}`;
  const title = tituloConRemate(`${service.name} para ${industry.name}`, "en Puebla y CDMX");
  const description = recortarDescripcion(
    `${service.summary} Para ${industry.name.toLowerCase()}, con instalación y soporte en Puebla, CDMX y todo México.`,
  );
  const ogImage = fotoOg(fotoSolucion(industry.slug, service.slug));

  const category = categoryFromSlug(service.slug);
  const pageKeywords = getPageKeywords(category, "Puebla");

  return {
    title: { absolute: title },
    description,
    keywords: [
      ...pageKeywords,
      `${service.name} para ${industry.name}`,
      `${service.name} Puebla`,
      `${service.name} CDMX`,
      `${service.name} México`,
      `cotizar ${service.name}`,
      `precio ${service.name} Puebla`,
      `soluciones TI para ${industry.name}`,
      "Nexara",
    ],
    alternates: { canonical: path },
    // Explícito: el layout trae la metadata de Studio «soluciones», que es noindex para el índice /soluciones.
    robots: { index: true, follow: true },
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

function buildFaqs(industryName: string, serviceName: string) {
  return [
    {
      q: `¿Cuánto cuesta ${serviceName} para ${industryName}?`,
      a: `Depende del tamaño del sitio, el alcance y el SLA. En NEXARA armamos una propuesta por fases con precios claros, sin alcance abierto. Agenda un diagnóstico y te damos un rango realista en la primera llamada.`,
    },
    {
      q: `¿Instalan ${serviceName} en Puebla y CDMX?`,
      a: `Sí. Operamos con base en Puebla y Ciudad de México, con cobertura a toda la República según urgencia y contrato. Levantamos el sitio, instalamos y dejamos la operación documentada.`,
    },
    {
      q: `¿Cuánto tarda la implementación de ${serviceName}?`,
      a: `Los proyectos típicos van de días a pocas semanas, según la complejidad. Cerramos alcance, calendario y entregables antes de iniciar, para que tu operación de ${industryName} no quede a medias.`,
    },
    {
      q: `¿Incluyen soporte después de instalar?`,
      a: `Sí. NEXARA no solo instala: dejamos soporte, mantenimiento y mesa de ayuda bajo el mismo contrato cuando lo necesitas. Una sola firma responsable.`,
    },
  ];
}

export default function ProgrammaticLandingPage({ params }: { params: Params }) {
  const industry = findIndustryLanding(params.industry);
  const service = findServiceLanding(params.service);

  if (!industry || !service) {
    notFound();
  }

  const landingPath = `/soluciones/${industry.slug}/${service.slug}`;
  const heroFoto = fotoSolucion(industry.slug, service.slug);
  const visual = visualServicio(service.slug);
  const contactoHref = `/contacto?industry=${industry.slug}&service=${service.slug}`;
  const waHref = buildWhatsAppLeadUrl({
    industryName: industry.name,
    serviceName: service.name,
    path: landingPath,
  });
  const faqs = buildFaqs(industry.name, service.name);
  const industriaHref = isIndustryHubSlug(industry.slug) ? `/soluciones/${industry.slug}` : "/servicios#industrias";
  const industriaMin = industry.name.toLowerCase();

  // Tres de la misma industria con otro servicio y tres del mismo servicio en otra industria: con los seis primeros
  // salían casi todas del mismo servicio, con el mismo título y el mismo texto.
  const combinaciones = getProgrammaticLandings().filter(
    (item) => !(item.industry.slug === industry.slug && item.service.slug === service.slug),
  );
  const mismaIndustria = combinaciones.filter((item) => item.industry.slug === industry.slug);
  const mismoServicio = combinaciones.filter((item) => item.service.slug === service.slug);
  const related = [...mismaIndustria.slice(0, 6 - Math.min(3, mismoServicio.length)), ...mismoServicio].slice(0, 6);

  const heroAbs = `${siteUrl}${fotoOg(heroFoto)}`;

  return (
    <main aria-label={`Solución ${service.name} para ${industry.name}`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          name: `${service.name} para ${industry.name}`,
          serviceType: service.name,
          description: service.summary,
          areaServed: [
            { "@type": "City", name: "Puebla" },
            { "@type": "City", name: "Ciudad de México" },
            { "@type": "Country", name: "México" },
          ],
          url: `${siteUrl}${landingPath}`,
          image: heroAbs,
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
          audience: { "@type": "BusinessAudience", audienceType: industry.name },
          offers: {
            "@type": "Offer",
            url: `${siteUrl}${contactoHref}`,
            availability: "https://schema.org/InStock",
            priceCurrency: "MXN",
            description: `Cotización de ${service.name} para ${industry.name}: diagnóstico sin compromiso.`,
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
            { "@type": "ListItem", position: 2, name: "Servicios", item: `${siteUrl}/servicios` },
            { "@type": "ListItem", position: 3, name: industry.name, item: `${siteUrl}${industriaHref}` },
            { "@type": "ListItem", position: 4, name: `${service.name} · ${industry.name}`, item: `${siteUrl}${landingPath}` },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />

      <HeroInterior
        id="solucion-titulo"
        tituloLargo
        migas={[
          { href: "/", label: "Inicio" },
          { href: "/servicios", label: "Servicios" },
          { href: industriaHref, label: industry.name },
          { label: service.name },
        ]}
        antetitulo={
          <>
            <PublicIcon name={visual.icono} size={18} /> {industry.name}
          </>
        }
        titulo={
          <>
            {service.name} <span className={s.tenue}>para {industriaMin}.</span>
          </>
        }
        lead={service.summary}
        acciones={
          <>
            <Link
              href={contactoHref}
              className={`${s.boton} ${s.botonPrimario}`}
              data-track-conversion="landing_hero_contact"
              data-landing-path={landingPath}
            >
              Cotizar ahora
              <Flecha />
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${s.boton} ${s.botonSecundario}`}
              data-track-conversion="landing_hero_whatsapp"
              data-landing-path={landingPath}
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
              {...foto(heroFoto, "(max-width: 1260px) 100vw, 1200px")}
              alt={`${service.name} para ${industriaMin}, instalado por NEXARA`}
              fetchPriority="high"
              decoding="async"
            />
            <span className={s.chip} style={{ left: 20, bottom: 20 }}>
              <PublicIcon name="mapPin" size={14} /> Puebla, CDMX y todo el país
            </span>
          </>
        }
      />

      <SubNav
        titulo={service.name}
        secciones={[
          { id: "reto", label: "El reto" },
          { id: "entregamos", label: "Qué entregamos" },
          { id: "preguntas", label: "Preguntas" },
        ]}
        cta={{ href: contactoHref, label: "Cotizar" }}
      />

      {/* El reto de la industria y lo que buscamos */}
      <section id="reto" className={`${s.seccion} ${s.seccionAlt} ${p.ancla}`} aria-labelledby="reto-titulo">
        <div className={`${s.contenedor} ${i.dos}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>El reto</p>
            <h2 id="reto-titulo" className={s.titulo}>
              Qué buscamos <span className={s.tenue}>en {industriaMin}.</span>
            </h2>
            <p className={s.lead}>{industry.painPoint}</p>
          </div>
          <div className={i.tarjeta} data-aparecer>
            <span className={i.tarjetaEtiqueta}>
              <PublicIcon name="target" size={16} /> Resultados
            </span>
            <h3 className={i.tarjetaTitulo}>Lo que debe cambiar en tu operación</h3>
            <ul className={p.lista}>
              {industry.outcomes.map((o) => (
                <li key={o}>
                  <PublicIcon name="check" size={18} />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Qué entregamos */}
      <section id="entregamos" className={`${s.seccion} ${p.ancla}`} aria-labelledby="entregamos-titulo">
        <div className={s.contenedor}>
          <article className={p.servicio} data-aparecer>
            <div>
              <span className={p.servicioIcono}>
                <PublicIcon name={visual.icono} size={22} />
              </span>
              <p className={s.antetitulo}>Implementación</p>
              <h2 id="entregamos-titulo" className={p.servicioTitulo}>
                Qué entregamos
              </h2>
              <p className={p.servicioTexto}>
                Cerramos el alcance antes de empezar y lo entregamos probado, documentado y listo para operar en tu
                {industry.slug === "gobierno" ? " dependencia" : " operación"}.
              </p>
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
              Antes <span className={s.tenue}>de cotizar.</span>
            </h2>
            <p className={s.lead}>¿Tienes otra duda? Escríbenos y te contesta una persona del equipo.</p>
          </div>
          <div data-aparecer>
            <Preguntas preguntas={faqs.map((f) => ({ p: f.q, r: f.a }))} />
          </div>
        </div>
      </section>

      {related.length > 0 ? (
        <section className={s.seccion} aria-labelledby="relacionadas-titulo">
          <div className={s.contenedor}>
            <div className={s.cabeza} data-aparecer>
              <div>
                <p className={s.antetitulo}>Relacionadas</p>
                <h2 id="relacionadas-titulo" className={s.titulo}>
                  Otras soluciones <span className={s.tenue}>cercanas.</span>
                </h2>
              </div>
              <p className={s.lead}>La misma industria con otro servicio, o el mismo servicio en otra industria.</p>
            </div>
            <Rutas
              ir="Ver solución"
              rutas={related.map((item) =>
                // El mismo servicio en otra industria se titula con la industria y su reto, no con el servicio repetido.
                item.service.slug === service.slug
                  ? {
                      href: `/soluciones/${item.industry.slug}/${item.service.slug}`,
                      etiqueta: item.service.name,
                      titulo: item.industry.name,
                      texto: item.industry.painPoint,
                      icono: visualIndustria(item.industry.slug).icono,
                    }
                  : {
                      href: `/soluciones/${item.industry.slug}/${item.service.slug}`,
                      etiqueta: item.industry.name,
                      titulo: item.service.name,
                      texto: item.service.summary,
                      icono: visualServicio(item.service.slug).icono,
                    },
              )}
            />
            {isGeoServiceSlug(service.slug) ? (
              <nav className={i.fichas} aria-label={`${service.name} por ciudad`} data-aparecer>
                <span className={i.fichasTitulo}>{service.name} en</span>
                {GEO_CITIES.map((c) => (
                  <Link key={c.slug} href={`/cobertura/${c.slug}/${service.slug}`} className={i.ficha}>
                    <span className={i.oculto}>{service.name} en </span>
                    {c.name}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </section>
      ) : null}

      <Cierre
        titulo={
          <>
            Cotiza {service.name} <span className={s.tenue}>para {industriaMin}.</span>
          </>
        }
        texto="Diagnóstico corto: te decimos qué instalar, qué posponer y qué presupuesto tiene sentido, en Puebla, CDMX o donde operes."
        primario={{ href: contactoHref, label: "Cotiza tu proyecto" }}
        origen={landingPath}
        whatsapp={waHref}
        medicion={{ primario: "landing_primary_cta", whatsapp: "landing_whatsapp_cta", ruta: landingPath }}
      />
    </main>
  );
}
