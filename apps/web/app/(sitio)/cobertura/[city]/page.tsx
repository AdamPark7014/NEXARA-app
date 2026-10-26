import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GEO_CITIES, GEO_MONEY_LINKS, GEO_SERVICE_SLUGS, findGeoCity } from "@/lib/seo/geo-cities";
import { findServiceLanding } from "@/lib/seo/programmatic-landings";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { JsonLd } from "@/lib/seo/json-ld";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import SubNav from "@/components/sitio/SubNav";
import Rutas, { type Ruta } from "@/components/sitio/TarjetasRuta";
import MapaMexico from "@/components/sitio/MapaMexico";
import Preguntas from "@/components/sitio/Preguntas";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import { MODO_CIUDAD, visualIndustria, visualServicio } from "@/components/sitio/visuales";

type Params = { city: string };

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const revalidate = 1800;

export function generateStaticParams() {
  return GEO_CITIES.map((c) => ({ city: c.slug }));
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const city = findGeoCity(params.city);
  if (!city) {
    return { title: "Cobertura | NEXARA", robots: { index: false, follow: false } };
  }

  const path = `/cobertura/${city.slug}`;
  const title = `CCTV, redes y soporte TI en ${city.name} | NEXARA`;
  const description = `Instalación de cámaras CCTV, redes Wi‑Fi, cómputo y soporte TI en ${city.name}, ${city.region}. ${city.blurb.slice(0, 120)} Cotiza con NEXARA.`;
  const imagen = "/fotos/mapa-cobertura-nexara.jpg";

  return {
    title: { absolute: title },
    description,
    keywords: [...city.keywords, `tecnología ${city.name}`, `Nexara ${city.name}`, "CCTV México", "soporte TI México"],
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "es_MX",
      url: `${siteUrl}${path}`,
      siteName: "NEXARA",
      title,
      description,
      images: [{ url: imagen, width: 1200, height: 630, alt: `NEXARA en ${city.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imagen],
    },
  };
}

export default function CoberturaCityPage({ params }: { params: Params }) {
  const city = findGeoCity(params.city);
  if (!city) notFound();

  const path = `/cobertura/${city.slug}`;
  const contactoHref = `/contacto?city=${city.slug}`;
  const modo = MODO_CIUDAD[city.mode];
  const waHref = buildWhatsAppLeadUrl({
    industryName: city.name,
    serviceName: "CCTV, redes o soporte TI",
    path,
  });

  const faqs = [
    {
      q: `¿Instalan CCTV y redes en ${city.name}?`,
      a: `Sí. NEXARA atiende ${city.name} (${city.region}) con un modelo ${modo.faq}. Levantamos el sitio, instalamos y dejamos la operación documentada.`,
    },
    {
      q: `¿Cuánto tarda una cotización en ${city.name}?`,
      a: `En horario laboral te damos una primera respuesta rápida. Para proyectos en sitio armamos el diagnóstico y un rango de inversión con alcance cerrado, sin sorpresas.`,
    },
    {
      q: `¿Sirve para varias sucursales en ${city.region}?`,
      a: `Sí. Sobre todo en retail y empresas con varias sedes: el mismo estándar de CCTV, Wi‑Fi y soporte en cada ubicación, con evidencia y acceso centralizado cuando aplica.`,
    },
  ];

  const servicios: Ruta[] = GEO_SERVICE_SLUGS.flatMap((slug) => {
    const svc = findServiceLanding(slug);
    return svc
      ? [{ href: `/cobertura/${city.slug}/${slug}`, titulo: svc.name, texto: svc.summary, icono: visualServicio(slug).icono }]
      : [];
  });
  servicios.push({
    href: contactoHref,
    titulo: "Otro proyecto",
    texto: `Cuéntanos qué necesitas en ${city.name} y te decimos cómo lo resolvemos.`,
    icono: "clipboard",
  });

  return (
    <main aria-label={`NEXARA en ${city.name}`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfessionalService",
          name: `NEXARA · ${city.name}`,
          description: `CCTV, redes, cómputo y soporte TI en ${city.name}, ${city.region}.`,
          url: `${siteUrl}${path}`,
          image: `${siteUrl}/logo-nexara-lockup.png`,
          logo: `${siteUrl}/icon-192.png`,
          telephone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "+52-222-696-0350",
          areaServed: {
            "@type": "City",
            name: city.name,
            containedInPlace: { "@type": "AdministrativeArea", name: city.region },
          },
          address: {
            "@type": "PostalAddress",
            addressLocality: city.name,
            addressRegion: city.region,
            addressCountry: "MX",
          },
          priceRange: "$$",
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
            { "@type": "ListItem", position: 3, name: city.name, item: `${siteUrl}${path}` },
          ],
        }}
      />

      <HeroInterior
        id="ciudad-titulo"
        migas={[
          { href: "/", label: "Inicio" },
          { href: "/proyectos#cobertura", label: "Cobertura" },
          { label: city.name },
        ]}
        antetitulo={
          <>
            <PublicIcon name="mapPin" size={18} /> {modo.etiqueta} · {city.region}
          </>
        }
        titulo={
          <>
            Tecnología <span className={s.tenue}>en {city.name}.</span>
          </>
        }
        lead={city.blurb}
        acciones={
          <>
            <Link
              href={contactoHref}
              className={`${s.boton} ${s.botonPrimario}`}
              data-track-conversion="geo_hero_contact"
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
              data-track-conversion="geo_hero_whatsapp"
            >
              Hablar por WhatsApp
              <Flecha />
            </a>
          </>
        }
        tipoVisual="mapa"
        visual={<MapaMexico destacar={city.name} acercar />}
      />

      <SubNav
        titulo={city.name}
        secciones={[
          { id: "servicios", label: "Servicios" },
          { id: "como", label: "Cómo trabajamos" },
          { id: "soluciones", label: "Soluciones" },
          { id: "preguntas", label: "Preguntas" },
        ]}
        cta={{ href: contactoHref, label: "Cotizar" }}
      />

      {/* Servicios en la ciudad */}
      <section id="servicios" className={`${s.seccion} ${s.seccionAlt} ${p.ancla}`} aria-labelledby="servicios-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Servicios locales</p>
              <h2 id="servicios-titulo" className={s.titulo}>
                Cotiza por servicio <span className={s.tenue}>en {city.name}.</span>
              </h2>
            </div>
            <p className={s.lead}>Cada servicio tiene su página con lo que incluye y las preguntas antes de cotizar.</p>
          </div>
          <Rutas rutas={servicios} ir="Ver servicio" />
        </div>
      </section>

      {/* Cómo se atiende la ciudad */}
      <section id="como" className={`${s.seccion} ${p.ancla}`} aria-labelledby="como-titulo">
        <div className={s.contenedor}>
          <div data-aparecer>
            <p className={s.antetitulo}>Cómo trabajamos aquí</p>
            <h2 id="como-titulo" className={s.titulo}>
              {modo.etiqueta}. <span className={s.tenue}>El mismo estándar de campo.</span>
            </h2>
          </div>
          <ul className={p.datos}>
            {[
              { icono: "mapPin" as const, etiqueta: "Región", valor: city.region },
              { icono: "hardhat" as const, etiqueta: "En sitio", valor: modo.enSitio },
              { icono: "layers" as const, etiqueta: "Qué instalamos", valor: "CCTV, redes, cómputo y soporte" },
              { icono: "building" as const, etiqueta: "Varias sedes", valor: "El mismo estándar en cada una" },
            ].map((d) => (
              <li key={d.etiqueta} className={p.dato} data-aparecer>
                <PublicIcon name={d.icono} size={22} className={p.datoIcono} />
                <p className={p.datoEtiqueta}>{d.etiqueta}</p>
                <p className={p.datoValor}>{d.valor}</p>
              </li>
            ))}
          </ul>
          <nav className={i.fichas} aria-label="Otras ciudades con cobertura" data-aparecer>
            {GEO_CITIES.map((c) => (
              <Link
                key={c.slug}
                href={`/cobertura/${c.slug}`}
                className={`${i.ficha} ${c.slug === city.slug ? i.fichaActual : ""}`}
                aria-current={c.slug === city.slug ? "page" : undefined}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* Soluciones por industria */}
      <section id="soluciones" className={`${s.seccion} ${s.seccionAlt} ${p.ancla}`} aria-labelledby="soluciones-titulo">
        <div className={s.contenedor}>
          <div className={s.cabeza} data-aparecer>
            <div>
              <p className={s.antetitulo}>Por industria</p>
              <h2 id="soluciones-titulo" className={s.titulo}>
                Soluciones <span className={s.tenue}>armadas por industria.</span>
              </h2>
            </div>
            <p className={s.lead}>El servicio con el riesgo de tu industria ya considerado, con cobertura en {city.region}.</p>
          </div>
          <Rutas
            columnas={4}
            ir="Ver solución"
            rutas={GEO_MONEY_LINKS.map((item) => ({
              href: `/soluciones/${item.industry}/${item.service}`,
              titulo: item.label,
              texto: `Instalación y operación con evidencia en ${city.region}.`,
              icono: visualIndustria(item.industry).icono,
            }))}
          />
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className={`${s.seccion} ${p.ancla}`} aria-labelledby="preguntas-titulo">
        <div className={`${s.contenedor} ${s.faq}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Preguntas frecuentes</p>
            <h2 id="preguntas-titulo" className={s.titulo}>
              Preguntas <span className={s.tenue}>de {city.name}.</span>
            </h2>
            <p className={s.lead}>¿Tienes otra duda? Escríbenos y te contesta una persona del equipo.</p>
          </div>
          <div data-aparecer>
            <Preguntas preguntas={faqs.map((f) => ({ p: f.q, r: f.a }))} />
          </div>
        </div>
      </section>

      <Cierre
        titulo={
          <>
            Agenda un diagnóstico <span className={s.tenue}>en {city.name}.</span>
          </>
        }
        texto="Cuéntanos el sitio, el riesgo y la urgencia. Te devolvemos alcance, fases y un presupuesto con sentido."
        primario={{ href: contactoHref, label: "Agendar diagnóstico" }}
        origen={path}
        whatsapp={waHref}
        medicion={{ primario: "geo_footer_contact", whatsapp: "geo_footer_whatsapp", ruta: path }}
      />
    </main>
  );
}
