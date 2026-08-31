import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import shared from "../../_shared/public.module.css";
import styles from "./page.module.css";
import PublicPageHero from "../../../components/PublicPageHero";
import heroStyles from "../../../components/PublicPageHero.module.css";
import { findIndustryLanding, getProgrammaticLandings } from "@/lib/seo/programmatic-landings";
import { INDUSTRY_HUB_SLUGS } from "@/lib/seo/industry-hubs";
import { buildWhatsAppLeadUrl, MONEY_SERVICE_SLUGS } from "@/lib/seo/money-pages";
import SeoInterlinkHub from "@/components/SeoInterlinkHub";

type Params = { industry: string };

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

/** Hub editorial de las 6 verticales públicas (+ SEO industries si aplica). */
const INDUSTRY_HUBS: Record<
  string,
  {
    name: string;
    risk: string;
    lead: string;
    pain: string;
    focus: string[];
    services: { id: string; label: string; text: string }[];
    image: string;
  }
> = {
  retail: {
    name: "Retail",
    risk: "Multi-sede + merma",
    lead: "Sucursales con el mismo estándar de CCTV, Wi‑Fi y soporte — sin reinventar cada apertura.",
    pain: "Cada tienda improvisada es un riesgo distinto: merma, caídas de POS y Wi‑Fi saturado los fines de semana.",
    focus: [
      "CCTV por sucursal con acceso centralizado",
      "Wi‑Fi y cableado documentados",
      "Soporte de punta de venta con tiempos claros",
      "Imagen y estándar repetible entre sedes",
    ],
    services: [
      { id: "cctv", label: "Videovigilancia", text: "Cobertura de piso de ventas, almacén y accesos con evidencias." },
      { id: "redes", label: "Redes y Wi‑Fi", text: "Enlace estable para POS, inventarios y personal." },
      { id: "soporte", label: "Soporte TI", text: "Mesa de ayuda remota y visitas cuando la caja no puede esperar." },
    ],
    image: "/images/hero/hero-01.png",
  },
  manufactura: {
    name: "Manufactura",
    risk: "Downtime de planta",
    lead: "Redes de piso, perímetro y continuidad donde una caída cuesta un turno completo.",
    pain: "La planta no tolera redes de oficina: ruido, polvo, turnos y equipos críticos exigen otro diseño.",
    focus: [
      "Redes industriales y segmentación",
      "Perímetro y videovigilancia de patio/almacén",
      "Racks y respaldos para sistemas de planta",
      "Soporte con ventanas de mantenimiento reales",
    ],
    services: [
      { id: "redes", label: "Conectividad de planta", text: "Switching, VLANs y enlaces pensados para operación 24/7." },
      { id: "cctv", label: "Perímetro y patio", text: "Cobertura de accesos, almacenes y zonas de riesgo." },
      { id: "computo", label: "Infraestructura", text: "Racks, energía y respaldos para sistemas críticos." },
    ],
    image: "/images/hero/hero-02.png",
  },
  hospitalidad: {
    name: "Hospitalidad",
    risk: "Densidad + reputación",
    lead: "Wi‑Fi denso, CCTV y operación unificada por propiedad — el huésped no perdona la red saturada.",
    pain: "Alta densidad de dispositivos, áreas públicas y habitaciones: un mal diseño se siente como mal hotel.",
    focus: [
      "Diseño RF y cobertura por zona",
      "CCTV en lobby, estacionamiento y back-of-house",
      "Operación unificada por propiedad",
      "Soporte en ventanas que no rompan ocupación",
    ],
    services: [
      { id: "redes", label: "Wi‑Fi de alta densidad", text: "Cobertura para habitaciones, lobby y áreas de eventos." },
      { id: "cctv", label: "Videovigilancia", text: "Accesos, estacionamiento y zonas de operación." },
      { id: "soporte", label: "Soporte", text: "Respuesta remota primero; visita cuando la ocupación lo permite." },
    ],
    image: "/images/hero/hero-03.png",
  },
  salud: {
    name: "Salud",
    risk: "Continuidad clínica",
    lead: "Segmentación, respaldos y soporte prioritario para que la red no sea el cuello de botella clínico.",
    pain: "Consultorios y clínicas dependen de conectividad segmentada, equipo estable y respuesta rápida ante fallas.",
    focus: [
      "Segmentación de redes clínicas vs administrativas",
      "Respaldos y continuidad de sistemas",
      "CCTV en accesos y zonas comunes",
      "Soporte prioritario en horario de atención",
    ],
    services: [
      { id: "redes", label: "Conectividad segmentada", text: "Separación clara de flujos clínicos y administrativos." },
      { id: "computo", label: "Respaldos e infraestructura", text: "Estaciones, servidores y respaldo acordados." },
      { id: "soporte", label: "Soporte prioritario", text: "Tiempos de respuesta alineados a la ventana clínica." },
    ],
    image: "/images/hero/hero-04.png",
  },
  educacion: {
    name: "Educación",
    risk: "Campus completo",
    lead: "Wi‑Fi, CCTV y mesa de ayuda para aulas, labs y edificios administrativos.",
    pain: "El campus mezcla densidad de alumnos, seguridad perimetral y soporte continuo durante el ciclo escolar.",
    focus: [
      "Wi‑Fi de campus y aulas",
      "CCTV en accesos y espacios comunes",
      "Mesa de ayuda para staff y laboratorios",
      "Estandarización entre edificios",
    ],
    services: [
      { id: "redes", label: "Campus Wi‑Fi", text: "Cobertura para aulas, plazas y edificios administrativos." },
      { id: "cctv", label: "Seguridad de campus", text: "Accesos, pasillos y estacionamientos con evidencia." },
      { id: "soporte", label: "Mesa de ayuda", text: "Atención a incidentes de aula y personal." },
    ],
    image: "/images/hero/hero-05.png",
  },
  gobierno: {
    name: "Gobierno",
    risk: "Fases + auditoría",
    lead: "Modernización por etapas con documentación auditable y entregables que se pueden defender.",
    pain: "Los proyectos públicos exigen alcance claro, evidencia de entrega y continuidad — no cajas negras técnicas.",
    focus: [
      "Implementación por fases",
      "Documentación y evidencias de entrega",
      "CCTV, redes y cómputo con estándar repetible",
      "Soporte alineado a SLA institucionales",
    ],
    services: [
      { id: "redes", label: "Infraestructura de red", text: "Cableado, switching y enlaces documentados." },
      { id: "cctv", label: "Videovigilancia", text: "Cobertura perimetral y de instalaciones con registro." },
      { id: "soporte", label: "Soporte y continuidad", text: "Mesa de ayuda y visitas con tiempos acordados." },
    ],
    image: "/images/hero/hero-06.png",
  },
};

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
  const description = `${hub.lead} Cotiza soluciones Nexara para ${hub.name} en Puebla, CDMX y cobertura nacional.`;
  return {
    title: { absolute: title },
    description,
    keywords: [
      `${hub.name} CCTV`,
      `redes ${hub.name}`,
      `soporte TI ${hub.name}`,
      `tecnologia ${hub.name} Mexico`,
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
      images: [{ url: hub.image, width: 1200, height: 630, alt: hub.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [hub.image],
    },
  };
}

export default function IndustryHubPage({ params }: { params: Params }) {
  const hub = INDUSTRY_HUBS[params.industry];
  if (!hub) notFound();

  const seoIndustry = findIndustryLanding(params.industry);
  const relatedLandings = getProgrammaticLandings()
    .filter((item) => item.industry.slug === params.industry)
    .sort((a, b) => {
      const ai = (MONEY_SERVICE_SLUGS as readonly string[]).indexOf(a.service.slug);
      const bi = (MONEY_SERVICE_SLUGS as readonly string[]).indexOf(b.service.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, 8);

  const outcomes = seoIndustry?.outcomes?.length ? seoIndustry.outcomes : hub.focus.slice(0, 3);
  const waHref = buildWhatsAppLeadUrl({
    industryName: hub.name,
    serviceName: "soluciones tecnológicas",
    path: `/soluciones/${params.industry}`,
  });
  const contactoHref = `/contacto?industry=${params.industry}`;
  const hubPath = `/soluciones/${params.industry}`;
  const collectionJson = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${hub.name} | NEXARA`,
    url: `${siteUrl}${hubPath}`,
    description: hub.lead,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Soluciones", item: `${siteUrl}/servicios` },
        { "@type": "ListItem", position: 3, name: hub.name, item: `${siteUrl}${hubPath}` },
      ],
    },
  };

  return (
    <main className={`${shared.page} home-main-flush`} aria-label={`Soluciones ${hub.name}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJson) }}
      />
      <PublicPageHero
        eyebrow={`Soluciones · ${hub.name}`}
        title={
          <>
            {hub.name}:{" "}
            <span className={heroStyles.titleAccent}>{hub.risk}</span>
          </>
        }
        lead={hub.lead}
        imageSrc={hub.image}
        imageAlt={`Soluciones Nexara para ${hub.name}`}
        actions={
          <div className={styles.heroActions}>
            <Link
              href={contactoHref}
              className={`${shared.btn} ${shared.btnPrimary}`}
              data-track-conversion="industry_hub_hero_cta"
            >
              Cotizar {hub.name} <span className={shared.btnArrow}>→</span>
            </Link>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${shared.btn} ${shared.btnSecondary}`}
              data-track-conversion="industry_hub_whatsapp"
            >
              WhatsApp
            </a>
          </div>
        }
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>El riesgo</p>
            <h2 className={shared.sectionTitle}>
              Qué suele fallar — y{" "}
              <span className={shared.sectionTitleAccent}>qué atacamos</span>
            </h2>
            <p className={shared.sectionLead}>{seoIndustry?.painPoint || hub.pain}</p>
          </header>
          <div className={shared.principleGrid} data-reveal-stagger>
            {outcomes.map((o) => (
              <div key={o} className={shared.principleItem} data-reveal="up">
                <h3 className={shared.principleTitle}>{o}</h3>
                <p className={shared.principleText}>
                  Parte del alcance típico para {hub.name.toLowerCase()} en campo.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Alcance típico</p>
            <h2 className={shared.sectionTitle}>
              Capacidad por <span className={shared.sectionTitleAccent}>línea</span>
            </h2>
          </header>
          <div className={shared.capList} data-reveal-stagger>
            {hub.services.map((s, i) => (
              <Link
                key={s.id}
                href={`/servicios#${s.id}`}
                className={shared.capRow}
                data-reveal="up"
              >
                <span className={shared.capNum}>0{i + 1}</span>
                <div>
                  <h3 className={shared.capTitle}>{s.label}</h3>
                  <p className={shared.capText}>{s.text}</p>
                </div>
                <span className={shared.capGo} aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
          <ul className={`${shared.bulletList} ${styles.focusList}`}>
            {hub.focus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </section>

      {relatedLandings.length > 0 ? (
        <section className={shared.section} data-reveal="up">
          <div className={shared.inner}>
            <header className={shared.sectionHead}>
              <p className={shared.eyebrow}>Combinaciones</p>
              <h2 className={shared.sectionTitle}>
                Rutas {hub.name} + <span className={shared.sectionTitleAccent}>servicio</span>
              </h2>
            </header>
            <div className={shared.industryBoard} data-reveal-stagger>
              {relatedLandings.map((item) => (
                <Link
                  key={`${item.industry.slug}-${item.service.slug}`}
                  href={`/soluciones/${item.industry.slug}/${item.service.slug}`}
                  className={shared.industryCell}
                  data-reveal="up"
                >
                  <h3 className={shared.industryCellTitle}>{item.service.name}</h3>
                  <p className={shared.industryCellText}>{item.service.summary}</p>
                  <span className={shared.industryCellLink}>Cotizar →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className={shared.section} data-reveal="up">
          <div className={shared.inner}>
            <header className={shared.sectionHead}>
              <p className={shared.eyebrow}>Siguiente paso</p>
              <h2 className={shared.sectionTitle}>
                Explora servicios y <span className={shared.sectionTitleAccent}>cobertura</span>
              </h2>
              <p className={shared.sectionLead}>
                Mientras armamos landings específicas de {hub.name}, cotiza por línea de servicio o por ciudad.
              </p>
            </header>
            <div className={shared.ctaActions} style={{ marginTop: 8 }}>
              <Link href="/servicios" className={`${shared.btn} ${shared.btnPrimary}`}>
                Ver servicios →
              </Link>
              <Link href="/cobertura/puebla" className={`${shared.btn} ${shared.btnSecondary}`}>
                Cobertura Puebla
              </Link>
            </div>
          </div>
        </section>
      )}

      <SeoInterlinkHub
        title={`Más rutas cerca de ${hub.name}`}
        subtitle="CCTV, redes y soporte con enlaces listos para indexar."
        currentPath={`/soluciones/${params.industry}`}
        maxIndustries={4}
        maxServicesPerIndustry={3}
      />

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>{hub.name}</p>
            <h2 className={shared.ctaTitle}>Arma el alcance de tu sitio</h2>
            <p className={shared.ctaLead}>
              Cuéntanos sedes, urgencia y el riesgo principal. Te devolvemos una ruta concreta.
            </p>
            <div className={shared.ctaActions}>
              <Link
                href={contactoHref}
                className={`${shared.btn} ${shared.btnPrimary}`}
                data-track-conversion="industry_hub_cta"
              >
                Cotiza tu proyecto <span className={shared.btnArrow}>→</span>
              </Link>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${shared.btn} ${shared.btnSecondary}`}
                data-track-conversion="industry_hub_footer_wa"
              >
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
