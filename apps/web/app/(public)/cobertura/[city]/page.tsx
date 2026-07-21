import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import shared from "../../_shared/public.module.css";
import PublicPageHero from "../../../components/PublicPageHero";
import heroStyles from "../../../components/PublicPageHero.module.css";
import styles from "../page.module.css";
import {
  GEO_CITIES,
  GEO_MONEY_LINKS,
  findGeoCity,
} from "@/lib/seo/geo-cities";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

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
  const description = `Instalación de cámaras CCTV, redes Wi‑Fi, cómputo y soporte TI en ${city.name}, ${city.region}. ${city.blurb.slice(0, 120)} Cotiza con Nexara.`;

  return {
    title: { absolute: title },
    description,
    keywords: [
      ...city.keywords,
      `tecnologia ${city.name}`,
      `Nexara ${city.name}`,
      "CCTV Mexico",
      "soporte TI Mexico",
    ],
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "es_MX",
      url: `${siteUrl}${path}`,
      siteName: "NEXARA",
      title,
      description,
      images: [{ url: "/logo-nexara-lockup.png", width: 1200, height: 630, alt: `NEXARA en ${city.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/logo-nexara-lockup.png"],
    },
  };
}

export default function CoberturaCityPage({ params }: { params: Params }) {
  const city = findGeoCity(params.city);
  if (!city) notFound();

  const path = `/cobertura/${city.slug}`;
  const contactoHref = `/contacto?city=${city.slug}`;
  const waHref = buildWhatsAppLeadUrl({
    industryName: city.name,
    serviceName: "CCTV, redes o soporte TI",
    path,
  });

  const faqs = [
    {
      q: `¿Instalan CCTV y redes en ${city.name}?`,
      a: `Sí. Nexara atiende ${city.name} (${city.region}) con modelo ${city.mode === "base" ? "de base operativa local" : city.mode === "campo" ? "de campo cercano" : "extendido por fases"}. Levantamos sitio, instalamos y dejamos operación documentada.`,
    },
    {
      q: `¿Cuánto tarda una cotización en ${city.name}?`,
      a: `En horario laboral te damos primera respuesta rápida. Para proyectos en sitio armamos diagnóstico y rango de inversión con alcance cerrado — sin sorpresas.`,
    },
    {
      q: `¿Sirve para varias sucursales en ${city.region}?`,
      a: `Sí. Especialmente retail y multi-sede: mismo estándar de CCTV, Wi‑Fi y soporte en cada ubicación, con evidencia y acceso centralizado cuando aplica.`,
    },
  ];

  const localSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `NEXARA · ${city.name}`,
    description: `CCTV, redes, cómputo y soporte TI en ${city.name}, ${city.region}.`,
    url: `${siteUrl}${path}`,
    image: `${siteUrl}/logo-nexara-lockup.png`,
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

  const modeLabel =
    city.mode === "base" ? "Base operativa" : city.mode === "campo" ? "Campo cercano" : "Cobertura extendida";

  return (
    <main className={`${shared.page} home-main-flush`} aria-label={`Nexara en ${city.name}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <PublicPageHero
        eyebrow={`Cobertura · ${city.region}`}
        title={
          <>
            Tecnología en{" "}
            <span className={heroStyles.titleAccent}>{city.name}</span>
          </>
        }
        lead={`CCTV, redes, cómputo y soporte TI — ${modeLabel.toLowerCase()}. ${city.blurb}`}
        imageSrc="/images/hero/hero-06.png"
        imageAlt={`Servicios Nexara en ${city.name}`}
        actions={
          <div className={styles.heroActions}>
            <Link
              href={contactoHref}
              className={`${shared.btn} ${shared.btnPrimary}`}
              data-track-conversion="geo_hero_contact"
              data-landing-path={path}
            >
              Cotizar en {city.name} <span className={shared.btnArrow}>→</span>
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${shared.btn} ${shared.btnSecondary}`}
              data-track-conversion="geo_hero_whatsapp"
            >
              WhatsApp
            </a>
          </div>
        }
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>{modeLabel}</p>
            <h2 className={shared.sectionTitle}>
              Qué cotizan más en{" "}
              <span className={shared.sectionTitleAccent}>{city.name}</span>
            </h2>
            <p className={shared.sectionLead}>
              Enlaces directos a soluciones listas para indexar y convertir.
            </p>
          </header>
          <div className={shared.industryBoard} data-reveal-stagger>
            {GEO_MONEY_LINKS.map((item) => {
              const href = `/soluciones/${item.industry}/${item.service}`;
              return (
                <Link key={href} href={href} className={shared.industryCell} data-reveal="up">
                  <span className={shared.industryRisk}>{city.name}</span>
                  <h3 className={shared.industryCellTitle}>{item.label}</h3>
                  <p className={shared.industryCellText}>
                    Instalación y operación con evidencia — cobertura en {city.region}.
                  </p>
                  <span className={shared.industryCellLink}>Ver solución →</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up" id="faq">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>FAQ local</p>
            <h2 className={shared.sectionTitle}>
              Preguntas de <span className={shared.sectionTitleAccent}>{city.name}</span>
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

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>{city.name}</p>
            <h2 className={shared.ctaTitle}>Agenda diagnóstico en {city.name}</h2>
            <p className={shared.ctaLead}>
              Cuéntanos el sitio, el riesgo y la urgencia. Te devolvemos alcance, fases y presupuesto con sentido.
            </p>
            <div className={shared.ctaActions}>
              <Link
                href={contactoHref}
                className={`${shared.btn} ${shared.btnPrimary}`}
                data-track-conversion="geo_footer_contact"
              >
                Contacto <span className={shared.btnArrow}>→</span>
              </Link>
              <Link href="/cobertura" className={`${shared.btn} ${shared.btnSecondary}`}>
                Ver toda la cobertura
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
