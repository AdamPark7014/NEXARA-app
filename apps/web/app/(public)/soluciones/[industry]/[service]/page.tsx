import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findIndustryLanding,
  findServiceLanding,
  getProgrammaticLandings,
} from "@/lib/seo/programmatic-landings";
import { getPageKeywords, categoryFromSlug } from "@/lib/seo/keywords";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
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
  const title = `${service.name} para ${industry.name} en Puebla y CDMX | NEXARA`;
  const description = `Cotiza ${service.name} para ${industry.name}: ${service.summary} Instalación y soporte en Puebla, CDMX y toda México. Respuesta en horario laboral.`;
  const ogImage = getSolucionHeroImage(service.slug);

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
      `${service.name} Mexico`,
      `cotizar ${service.name}`,
      `precio ${service.name} Puebla`,
      `soluciones TI para ${industry.name}`,
      "Nexara",
    ],
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

function buildFaqs(industryName: string, serviceName: string) {
  return [
    {
      q: `¿Cuánto cuesta ${serviceName} para ${industryName}?`,
      a: `Depende del tamaño del sitio, el alcance y el SLA. En Nexara armamos una propuesta por fases con precios claros — sin alcance abierto. Agenda un diagnóstico y te damos rango realista en la primera llamada.`,
    },
    {
      q: `¿Instalan ${serviceName} en Puebla y CDMX?`,
      a: `Sí. Operamos con base en Puebla y Ciudad de México, con cobertura a toda la República según urgencia y contrato. Levantamos sitio, instalamos y dejamos operación documentada.`,
    },
    {
      q: `¿Cuánto tarda la implementación de ${serviceName}?`,
      a: `Proyectos típicos van de días a pocas semanas según complejidad. Cerramos alcance, calendario y entregables antes de iniciar — para que tu operación de ${industryName} no quede a medias.`,
    },
    {
      q: `¿Incluyen soporte después de instalar?`,
      a: `Sí. Nexara no solo instala: dejamos soporte, mantenimiento y mesa de ayuda bajo el mismo contrato cuando lo necesitas. Una sola firma responsable.`,
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
  const heroImage = getSolucionHeroImage(service.slug);
  const contactoHref = `/contacto?industry=${industry.slug}&service=${service.slug}`;
  const waHref = buildWhatsAppLeadUrl({
    industryName: industry.name,
    serviceName: service.name,
    path: landingPath,
  });
  const faqs = buildFaqs(industry.name, service.name);

  const related = getProgrammaticLandings()
    .filter((item) => item.industry.slug === industry.slug || item.service.slug === service.slug)
    .filter((item) => !(item.industry.slug === industry.slug && item.service.slug === service.slug))
    .slice(0, 6);

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${service.name} para ${industry.name}`,
    serviceType: service.name,
    description: service.summary,
    areaServed: [
      { "@type": "City", name: "Puebla" },
      { "@type": "City", name: "Ciudad de México" },
      { "@type": "Country", name: "Mexico" },
    ],
    url: `${siteUrl}${landingPath}`,
    image: heroImage.startsWith("http") ? heroImage : `${siteUrl}${heroImage}`,
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
    audience: {
      "@type": "BusinessAudience",
      audienceType: industry.name,
    },
    offers: {
      "@type": "Offer",
      url: `${siteUrl}${contactoHref}`,
      availability: "https://schema.org/InStock",
      priceCurrency: "MXN",
      description: `Cotización de ${service.name} para ${industry.name} — diagnóstico sin compromiso.`,
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

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

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
        imageAlt={`${service.name} para ${industry.name} — Nexara Puebla y CDMX`}
        actions={
          <div className={styles.heroActions}>
            <Link
              href={contactoHref}
              data-track-conversion="landing_hero_contact"
              data-landing-path={landingPath}
              className={`${shared.btn} ${shared.btnPrimary}`}
            >
              Cotizar ahora <span className={shared.btnArrow}>→</span>
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              data-track-conversion="landing_hero_whatsapp"
              data-landing-path={landingPath}
              className={`${shared.btn} ${shared.btnSecondary}`}
            >
              WhatsApp
            </a>
          </div>
        }
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

      <section className={shared.section} data-reveal="up" id="faq">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Preguntas frecuentes</p>
            <h2 className={shared.sectionTitle}>
              Antes de <span className={shared.sectionTitleAccent}>cotizar</span>
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

      {related.length > 0 ? (
        <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
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
            <p className={shared.ctaEyebrow}>Siguiente paso</p>
            <h2 className={shared.ctaTitle}>
              Cotiza {service.name} para {industry.name}
            </h2>
            <p className={shared.ctaLead}>
              Diagnóstico corto: te decimos qué instalar, qué posponer y qué presupuesto tiene sentido —
              en Puebla, CDMX o donde operes.
            </p>
            <div className={shared.ctaActions}>
              <Link
                href={contactoHref}
                data-track-conversion="landing_primary_cta"
                data-landing-path={landingPath}
                className={`${shared.btn} ${shared.btnPrimary}`}
              >
                Cotiza tu proyecto <span className={shared.btnArrow}>→</span>
              </Link>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                data-track-conversion="landing_whatsapp_cta"
                data-landing-path={landingPath}
                className={`${shared.btn} ${shared.btnSecondary}`}
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
