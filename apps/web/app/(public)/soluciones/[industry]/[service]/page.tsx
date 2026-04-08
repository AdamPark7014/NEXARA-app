import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findIndustryLanding,
  findServiceLanding,
  getProgrammaticLandings,
} from "@/lib/seo/programmatic-landings";
import { getPageKeywords, categoryFromSlug } from "@/lib/seo/keywords";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";
import { getSolucionHeroImage } from "../../solucionesLandingImagery";
import styles from "./page.module.css";

type Params = {
  industry: string;
  service: string;
};

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

export const revalidate = 3600;

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
  const title = `${service.name} en Puebla y Mexico | Nexara`;
  const description = `${service.summary} Servicio profesional en Puebla, CDMX y toda la Republica Mexicana. Nexara — tecnologia confiable para tu empresa.`;
  const ogImage = getSolucionHeroImage(service.slug);

  const category = categoryFromSlug(service.slug);
  const pageKeywords = getPageKeywords(category, "Puebla");

  return {
    title,
    description,
    keywords: [
      ...pageKeywords,
      `${service.name} para ${industry.name}`,
      `${service.name} Puebla`,
      `${service.name} CDMX`,
      `${service.name} Mexico`,
      `soluciones TI para ${industry.name}`,
      "Nexara",
    ],
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      url: `${siteUrl}${path}`,
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

export default function ProgrammaticLandingPage({ params }: { params: Params }) {
  const industry = findIndustryLanding(params.industry);
  const service = findServiceLanding(params.service);

  if (!industry || !service) {
    notFound();
  }

  const landingPath = `/soluciones/${industry.slug}/${service.slug}`;
  const heroImage = getSolucionHeroImage(service.slug);

  const related = getProgrammaticLandings()
    .filter((item) => item.industry.slug === industry.slug || item.service.slug === service.slug)
    .filter((item) => !(item.industry.slug === industry.slug && item.service.slug === service.slug))
    .slice(0, 8);

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${service.name} para ${industry.name}`,
    serviceType: service.name,
    areaServed: "MX",
    url: `${siteUrl}${landingPath}`,
    image: heroImage,
    provider: {
      "@type": "Organization",
      name: "NEXARA",
      url: siteUrl,
    },
    audience: {
      "@type": "BusinessAudience",
      audienceType: industry.name,
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Servicios",
        item: `${siteUrl}/servicios`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${service.name} para ${industry.name}`,
        item: `${siteUrl}${landingPath}`,
      },
    ],
  };

  return (
    <main
      className={`${styles.container} public-section-page ultra-corp-page ultra-corp-soluciones ultra-corp-strict`}
      aria-label={`Solución ${service.name} para ${industry.name}`}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <nav aria-label="Ruta de navegación">
        <ol className={styles.breadcrumb}>
          <li>
            <Link href="/">Inicio</Link>
          </li>
          <li>
            <Link href="/servicios">Servicios</Link>
          </li>
          <li aria-current="page">
            {service.name} · {industry.name}
          </li>
        </ol>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroSplit}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Solución especializada</p>
            <h1 className={styles.pageTitle}>
              {service.name} para {industry.name}
            </h1>
            <p className={styles.pageLead}>
              {industry.painPoint} {service.summary}
            </p>
          </div>
          <div className={styles.heroVisual}>
            <Image
              src={heroImage}
              alt={`${service.name} — referencia visual`}
              fill
              className={styles.heroImg}
              sizes="(max-width: 900px) 100vw, 42vw"
              priority
            />
          </div>
        </div>
      </header>

      <section className={styles.outcomeGrid} aria-label="Resultados esperados">
        {industry.outcomes.map((outcome) => (
          <article key={outcome} className={styles.outcomeTile}>
            <h2>{outcome}</h2>
          </article>
        ))}
      </section>

      <section className={styles.detailShell} aria-labelledby="implement-heading">
        <div className={styles.sectionHead}>
          <h2 id="implement-heading" className={styles.sectionTitle}>
            Qué implementamos
          </h2>
        </div>
        <ul className={styles.proseList}>
          {service.deliverables.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.ctaBand} aria-label="Contacto comercial">
        <h2>Solicita una propuesta para {industry.name}</h2>
        <p>
          Te enviamos una ruta de implementación por fases y objetivos medibles para tu operación.
        </p>
        <div className={styles.ctaRow}>
          <Link
            href={`/contacto?industry=${industry.slug}&service=${service.slug}`}
            data-track-conversion="landing_primary_cta"
            data-landing-path={landingPath}
            className={styles.ctaPrimary}
          >
            Hablar con un especialista
          </Link>
          <Link
            href="/servicios"
            data-track-conversion="landing_secondary_cta"
            data-landing-path={landingPath}
            className={styles.ctaSecondary}
          >
            Ver todos los servicios
          </Link>
        </div>
      </section>

      {related.length > 0 ? (
        <section className={styles.relatedSection} aria-labelledby="related-heading">
          <div className={styles.sectionHead}>
            <h2 id="related-heading" className={styles.sectionTitle}>
              Rutas relacionadas
            </h2>
            <p className={styles.pageLead}>Otras combinaciones sector + servicio que suelen consultarse junto a esta.</p>
          </div>
          <div className={styles.relatedGrid}>
            {related.map((item) => {
              const href = `/soluciones/${item.industry.slug}/${item.service.slug}`;
              const img = getSolucionHeroImage(item.service.slug);
              return (
                <Link key={href} href={href} className={styles.relatedTile}>
                  <div className={styles.relatedTileMedia}>
                    <Image
                      src={img}
                      alt=""
                      fill
                      className={styles.relatedTileImg}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                  <div className={styles.relatedTileBody}>
                    <strong>{item.service.name}</strong>
                    <span>{item.industry.name}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={styles.hubShell} aria-label="Más soluciones por industria">
        <SeoInterlinkHub
          title="Soluciones recomendadas por industria"
          subtitle="Cada columna agrupa enlaces de contexto; el conjunto cubre distintas combinaciones sector + servicio."
          currentPath={landingPath}
          maxItems={12}
          maxIndustries={6}
          maxServicesPerIndustry={3}
        />
      </section>
    </main>
  );
}
