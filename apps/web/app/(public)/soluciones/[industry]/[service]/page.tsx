import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findIndustryLanding,
  findServiceLanding,
  getProgrammaticLandings,
} from "@/lib/seo/programmatic-landings";
import { getPageKeywords, categoryFromSlug } from "@/lib/seo/keywords";
import { getSolucionHeroImage } from "../../solucionesLandingImagery";
import shared from "../../../_shared/public.module.css";
import PublicPageHero from "../../../../components/PublicPageHero";
import heroStyles from "../../../../components/PublicPageHero.module.css";
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
    alternates: { canonical: path },
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
    .slice(0, 6);

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
      { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Soluciones", item: `${siteUrl}/soluciones` },
      {
        "@type": "ListItem",
        position: 3,
        name: industry.name,
        item: `${siteUrl}/soluciones/${industry.slug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: `${service.name} · ${industry.name}`,
        item: `${siteUrl}${landingPath}`,
      },
    ],
  };

  return (
    <main
      className={`${shared.page} home-main-flush`}
      aria-label={`Solución ${service.name} para ${industry.name}`}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <PublicPageHero
        eyebrow={`${industry.name} · ${service.name}`}
        title={
          <>
            {service.name} para{" "}
            <span className={heroStyles.titleAccent}>{industry.name}</span>
          </>
        }
        lead={`${industry.painPoint} ${service.summary}`}
        imageSrc={heroImage}
        imageAlt={`${service.name} — referencia visual`}
      />

      <nav className={styles.breadcrumbBar} aria-label="Ruta de navegación">
        <ol className={styles.breadcrumb}>
          <li>
            <Link href="/">Inicio</Link>
          </li>
          <li>
            <Link href="/soluciones">Soluciones</Link>
          </li>
          <li>
            <Link href={`/soluciones/${industry.slug}`}>{industry.name}</Link>
          </li>
          <li aria-current="page">{service.name}</li>
        </ol>
      </nav>

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Resultados</p>
            <h2 className={shared.sectionTitle}>
              Qué buscamos en{" "}
              <span className={shared.sectionTitleAccent}>{industry.name}</span>
            </h2>
          </header>
          <div className={shared.principleGrid} data-reveal-stagger>
            {industry.outcomes.map((outcome) => (
              <div key={outcome} className={shared.principleItem} data-reveal="up">
                <h3 className={shared.principleTitle}>{outcome}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Implementación</p>
            <h2 className={shared.sectionTitle}>
              Qué <span className={shared.sectionTitleAccent}>entregamos</span>
            </h2>
            <p className={shared.sectionLead}>{service.summary}</p>
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

      {related.length > 0 ? (
        <section className={shared.section} data-reveal="up">
          <div className={shared.inner}>
            <header className={shared.sectionHead}>
              <p className={shared.eyebrow}>Relacionadas</p>
              <h2 className={shared.sectionTitle}>
                Otras rutas <span className={shared.sectionTitleAccent}>cercanas</span>
              </h2>
            </header>
            <div className={shared.industryBoard} data-reveal-stagger>
              {related.map((item) => {
                const href = `/soluciones/${item.industry.slug}/${item.service.slug}`;
                return (
                  <Link key={href} href={href} className={shared.industryCell} data-reveal="up">
                    <span className={shared.industryRisk}>{item.industry.name}</span>
                    <h3 className={shared.industryCellTitle}>{item.service.name}</h3>
                    <p className={shared.industryCellText}>{item.service.summary}</p>
                    <span className={shared.industryCellLink}>Ver detalle →</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>Propuesta</p>
            <h2 className={shared.ctaTitle}>Para {industry.name}</h2>
            <p className={shared.ctaLead}>
              Te armamos una ruta por fases con objetivos medibles para tu operación.
            </p>
            <div className={shared.ctaActions}>
              <Link
                href={`/contacto?industry=${industry.slug}&service=${service.slug}`}
                data-track-conversion="landing_primary_cta"
                data-landing-path={landingPath}
                className={`${shared.btn} ${shared.btnPrimary}`}
              >
                Hablar con un especialista <span className={shared.btnArrow}>→</span>
              </Link>
              <Link
                href={`/soluciones/${industry.slug}`}
                className={`${shared.btn} ${shared.btnSecondary}`}
              >
                Volver a {industry.name}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
