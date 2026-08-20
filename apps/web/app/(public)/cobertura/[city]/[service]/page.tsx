import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import shared from "../../../_shared/public.module.css";
import PublicPageHero from "../../../../components/PublicPageHero";
import heroStyles from "../../../../components/PublicPageHero.module.css";
import styles from "../../page.module.css";
import {
  GEO_CITIES,
  GEO_SERVICE_SLUGS,
  findGeoCity,
  isGeoServiceSlug,
} from "@/lib/seo/geo-cities";
import { findServiceLanding } from "@/lib/seo/programmatic-landings";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import { getPageKeywords, categoryFromSlug } from "@/lib/seo/keywords";
import { getSolucionHeroImage } from "../../../soluciones/solucionesLandingImagery";

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
  const description = `${service.summary} Servicio en ${placeLabel}: instalación, documentación y soporte. Agenda diagnóstico con Nexara.`;
  const ogImage = getSolucionHeroImage(service.slug);
  const category = categoryFromSlug(service.slug);
  const keywords = [
    ...getPageKeywords(category, city.name),
    `${service.name} ${city.name}`,
    `cotizar ${service.name} ${city.name}`,
    `precio ${service.name} ${city.region}`,
    `instalacion ${service.name} ${city.name}`,
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
  const heroImage = getSolucionHeroImage(service.slug);
  const contactoHref = `/contacto?city=${city.slug}&service=${service.slug}`;
  const waHref = buildWhatsAppLeadUrl({
    industryName: city.name,
    serviceName: service.name,
    path,
  });

  const relatedServices = GEO_SERVICE_SLUGS.filter((s) => s !== service.slug)
    .map((slug) => findServiceLanding(slug))
    .filter(Boolean);

  const siblingCities = GEO_CITIES.filter((c) => c.slug !== city.slug).slice(0, 6);

  const faqs = [
    {
      q: `¿Cuánto cuesta ${service.name} en ${city.name}?`,
      a: `Depende del tamaño del sitio y el alcance. En Nexara cerramos propuesta por fases con precios claros. En ${city.name} hacemos diagnóstico y te damos rango realista en la primera conversación.`,
    },
    {
      q: `¿Instalan ${service.name} en ${city.name} y alrededores?`,
      a: `Sí. Operamos en ${city.name} (${city.region}) con modelo ${city.mode === "base" ? "de base local" : city.mode === "campo" ? "de campo" : "extendido"}. Levantamos, instalamos y dejamos evidencia de entrega.`,
    },
    {
      q: `¿Incluye soporte después de instalar en ${city.name}?`,
      a: `Puedes contratar solo implementación o implementación + soporte/mesa de ayuda. Una sola firma responsable — sin pasar el problema a otro proveedor.`,
    },
    {
      q: `¿Atienden empresas multi-sede desde ${city.name}?`,
      a: `Sí. Especialmente retail y plantas: mismo estándar en cada sede, con acceso centralizado cuando aplica y SLA definidos por contrato.`,
    },
  ];

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${service.name} en ${city.name}`,
    serviceType: service.name,
    description: service.summary,
    url: `${siteUrl}${path}`,
    image: heroImage.startsWith("http") ? heroImage : `${siteUrl}${heroImage}`,
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
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Cobertura", item: `${siteUrl}/cobertura` },
      { "@type": "ListItem", position: 3, name: city.name, item: `${siteUrl}/cobertura/${city.slug}` },
      { "@type": "ListItem", position: 4, name: service.name, item: `${siteUrl}${path}` },
    ],
  };

  return (
    <main className={`${shared.page} home-main-flush`} aria-label={`${service.name} en ${city.name}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <PublicPageHero
        eyebrow={`${city.name} · ${city.region}`}
        title={
          <>
            {service.name} en{" "}
            <span className={heroStyles.titleAccent}>{city.name}</span>
          </>
        }
        lead={`${service.summary} Cobertura local en ${city.name}: instalación, evidencia y soporte.`}
        imageSrc={heroImage}
        imageAlt={`${service.name} en ${city.name} — Nexara`}
        actions={
          <div className={styles.heroActions}>
            <Link
              href={contactoHref}
              className={`${shared.btn} ${shared.btnPrimary}`}
              data-track-conversion="geo_service_hero_contact"
              data-landing-path={path}
            >
              Cotizar en {city.name} <span className={shared.btnArrow}>→</span>
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${shared.btn} ${shared.btnSecondary}`}
              data-track-conversion="geo_service_hero_wa"
            >
              WhatsApp
            </a>
          </div>
        }
      />

      <nav className={styles.breadcrumbBar} aria-label="Ruta">
        <ol className={styles.breadcrumb}>
          <li>
            <Link href="/">Inicio</Link>
          </li>
          <li>
            <Link href="/cobertura">Cobertura</Link>
          </li>
          <li>
            <Link href={`/cobertura/${city.slug}`}>{city.name}</Link>
          </li>
          <li aria-current="page">{service.name}</li>
        </ol>
      </nav>

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Entrega</p>
            <h2 className={shared.sectionTitle}>
              Qué <span className={shared.sectionTitleAccent}>incluye</span>
            </h2>
            <p className={shared.sectionLead}>{city.blurb}</p>
          </header>
          <ul className={shared.bulletList} data-reveal-stagger>
            {service.deliverables.map((item) => (
              <li key={item} data-reveal="up">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up" id="faq">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>FAQ</p>
            <h2 className={shared.sectionTitle}>
              {service.name} en <span className={shared.sectionTitleAccent}>{city.name}</span>
            </h2>
          </header>
          <div className={styles.faqList}>
            {faqs.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>{item.q}</summary>
                <p className={styles.faqAnswer}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {relatedServices.length > 0 ? (
        <section className={shared.section} data-reveal="up">
          <div className={shared.inner}>
            <header className={shared.sectionHead}>
              <p className={shared.eyebrow}>También en {city.name}</p>
              <h2 className={shared.sectionTitle}>
                Otros <span className={shared.sectionTitleAccent}>servicios</span>
              </h2>
            </header>
            <div className={shared.industryBoard} data-reveal-stagger>
              {relatedServices.map((s) =>
                s ? (
                  <Link
                    key={s.slug}
                    href={`/cobertura/${city.slug}/${s.slug}`}
                    className={shared.industryCell}
                    data-reveal="up"
                  >
                    <span className={shared.industryRisk}>{city.name}</span>
                    <h3 className={shared.industryCellTitle}>{s.name}</h3>
                    <p className={shared.industryCellText}>{s.summary}</p>
                    <span className={shared.industryCellLink}>Ver →</span>
                  </Link>
                ) : null,
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Otras ciudades</p>
            <h2 className={shared.sectionTitle}>
              {service.name} cerca de{" "}
              <span className={shared.sectionTitleAccent}>{city.name}</span>
            </h2>
          </header>
          <div className={styles.cityGrid}>
            {siblingCities.map((c) => (
              <Link
                key={c.slug}
                href={`/cobertura/${c.slug}/${service.slug}`}
                className={styles.cityCard}
              >
                <p className={styles.cityMeta}>{c.region}</p>
                <h3 className={styles.cityName}>{c.name}</h3>
                <p className={styles.cityHint}>{service.name}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>{city.name}</p>
            <h2 className={shared.ctaTitle}>
              Cotiza {service.name} en {city.name}
            </h2>
            <p className={shared.ctaLead}>
              Diagnóstico corto: alcance, fases y presupuesto con sentido — sin alcance abierto.
            </p>
            <div className={shared.ctaActions}>
              <Link
                href={contactoHref}
                className={`${shared.btn} ${shared.btnPrimary}`}
                data-track-conversion="geo_service_footer_contact"
              >
                Hablar con especialista <span className={shared.btnArrow}>→</span>
              </Link>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${shared.btn} ${shared.btnSecondary}`}
                data-track-conversion="geo_service_footer_wa"
              >
                WhatsApp inmediato
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
