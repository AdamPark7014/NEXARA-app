import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findIndustryLanding,
  findServiceLanding,
  getProgrammaticLandings,
} from "@/lib/seo/programmatic-landings";

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
  const title = `${service.name} para ${industry.name} en Mexico | Nexara`;
  const description = `${service.summary} Enfoque para ${industry.name.toLowerCase()} con resultados en continuidad, control y eficiencia operativa.`;

  return {
    title,
    description,
    keywords: [
      `${service.name} para ${industry.name}`,
      `${service.name} en Mexico`,
      `soluciones TI para ${industry.name}`,
      "transformacion digital empresarial",
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
      images: [{ url: "/logo-nexara.png", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/logo-nexara.png"],
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
        name: "Soluciones",
        item: `${siteUrl}/soluciones`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: industry.name,
        item: `${siteUrl}/soluciones/${industry.slug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: service.name,
        item: `${siteUrl}${landingPath}`,
      },
    ],
  };

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 20px", display: "grid", gap: 24 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <header style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, letterSpacing: 1.2, fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>
          Solucion especializada
        </p>
        <h1 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 48px)", lineHeight: 1.08, color: "#0f172a" }}>
          {service.name} para {industry.name}
        </h1>
        <p style={{ margin: 0, fontSize: 18, color: "#334155", maxWidth: 920 }}>
          {industry.painPoint} {service.summary}
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        {industry.outcomes.map((outcome) => (
          <article key={outcome} style={{ border: "1px solid #cbd5e1", borderRadius: 14, padding: 16, background: "#f8fafc" }}>
            <h2 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>{outcome}</h2>
          </article>
        ))}
      </section>

      <section style={{ border: "1px solid #cbd5e1", borderRadius: 14, padding: 18, background: "#ffffff" }}>
        <h2 style={{ marginTop: 0, marginBottom: 10, color: "#0f172a" }}>Que implementamos</h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#334155", display: "grid", gap: 8 }}>
          {service.deliverables.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section style={{ border: "1px solid #1d4ed8", background: "#eff6ff", borderRadius: 14, padding: 18, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, color: "#1e3a8a" }}>Solicita una propuesta para {industry.name}</h2>
        <p style={{ margin: 0, color: "#1e3a8a" }}>
          Te enviamos una ruta de implementacion por fases y objetivos medibles para tu operacion.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link
            href={`/contacto?industry=${industry.slug}&service=${service.slug}`}
            data-track-conversion="landing_primary_cta"
            data-landing-path={landingPath}
            style={{
              background: "#1d4ed8",
              color: "#fff",
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            Hablar con un especialista
          </Link>
          <Link
            href="/servicios"
            data-track-conversion="landing_secondary_cta"
            data-landing-path={landingPath}
            style={{
              border: "1px solid #1d4ed8",
              color: "#1d4ed8",
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            Ver todos los servicios
          </Link>
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, color: "#0f172a" }}>Rutas relacionadas</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
          {related.map((item) => {
            const href = `/soluciones/${item.industry.slug}/${item.service.slug}`;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  textDecoration: "none",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: "#0f172a",
                  background: "#fff",
                }}
              >
                <strong style={{ display: "block", marginBottom: 2 }}>{item.service.name}</strong>
                <span style={{ color: "#64748b" }}>{item.industry.name}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
