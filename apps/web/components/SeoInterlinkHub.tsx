import Link from "next/link";
import {
  getProgrammaticLandings,
  INDUSTRY_LANDINGS,
  findServiceLanding,
} from "@/lib/seo/programmatic-landings";
import { isIndustryHubSlug } from "@/lib/seo/industry-hubs";
import { MONEY_SERVICE_SLUGS } from "@/lib/seo/money-pages";
import { GEO_CITIES, findGeoCity } from "@/lib/seo/geo-cities";
import styles from "./SeoInterlinkHub.module.css";

const GEO_HUB_CITIES = ["puebla", "cdmx", "cholula", "queretaro", "monterrey"] as const;
const GEO_HUB_SERVICES = ["camaras-cctv", "redes-y-conectividad", "soporte-ti-pyme"] as const;

type SeoInterlinkHubProps = {
  title?: string;
  subtitle?: string;
  currentPath?: string;
  maxItems?: number;
  maxIndustries?: number;
  maxServicesPerIndustry?: number;
  /** Fila de enlaces ciudad×servicio (intención local). */
  showGeo?: boolean;
};

function moneyRank(serviceSlug: string): number {
  const idx = (MONEY_SERVICE_SLUGS as readonly string[]).indexOf(serviceSlug);
  return idx === -1 ? 99 : idx;
}

export default function SeoInterlinkHub({
  title = "Rutas recomendadas",
  subtitle,
  currentPath,
  maxItems,
  maxIndustries = 6,
  maxServicesPerIndustry = 3,
  showGeo = true,
}: SeoInterlinkHubProps) {
  const flat = getProgrammaticLandings()
    .map(({ industry, service }) => ({
      href: `/soluciones/${industry.slug}/${service.slug}`,
      industry,
      service,
    }))
    .sort((a, b) => moneyRank(a.service.slug) - moneyRank(b.service.slug));

  const filtered = flat.filter((item) => item.href !== currentPath);

  const byIndustry = new Map<
    string,
    {
      industry: (typeof filtered)[number]["industry"];
      items: typeof filtered;
    }
  >();

  for (const item of filtered) {
    const key = item.industry.slug;
    const prev = byIndustry.get(key);
    if (!prev) {
      byIndustry.set(key, { industry: item.industry, items: [item] });
    } else {
      prev.items.push(item);
    }
  }

  const order = INDUSTRY_LANDINGS.map((i) => i.slug);

  let columns = order
    .map((slug) => {
      const group = byIndustry.get(slug);
      if (!group) return null;
      const links = group.items.slice(0, maxServicesPerIndustry);
      return {
        industry: group.industry,
        links,
      };
    })
    .filter((col): col is NonNullable<typeof col> => col !== null)
    .slice(0, maxIndustries);

  if (typeof maxItems === "number" && maxItems > 0) {
    let remaining = maxItems;
    columns = columns
      .map((col) => {
        const take = Math.min(col.links.length, remaining);
        remaining -= take;
        return { ...col, links: col.links.slice(0, take) };
      })
      .filter((col) => col.links.length > 0);
  }

  const geoLinks =
    showGeo
      ? GEO_HUB_CITIES.flatMap((citySlug) => {
          const city = findGeoCity(citySlug) || GEO_CITIES.find((c) => c.slug === citySlug);
          if (!city) return [];
          return GEO_HUB_SERVICES.map((serviceSlug) => {
            const service = findServiceLanding(serviceSlug);
            if (!service) return null;
            const href = `/cobertura/${city.slug}/${service.slug}`;
            if (href === currentPath) return null;
            return {
              href,
              label: `${service.name} ${city.name}`,
            };
          }).filter((x): x is { href: string; label: string } => x !== null);
        }).slice(0, 12)
      : [];

  if (columns.length === 0 && geoLinks.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-label="Enlaces relacionados SEO">
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>

      {geoLinks.length > 0 ? (
        <div className={styles.geoStrip} aria-label="Cobertura local">
          <h3 className={styles.columnTitle}>Por ciudad</h3>
          <ul className={styles.geoList}>
            {geoLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.geoChip}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {columns.length > 0 ? (
        <div className={styles.columns}>
          {columns.map(({ industry, links }) => (
            <div key={industry.slug} className={styles.column}>
              <h3 className={styles.columnTitle}>
                <Link
                  href={
                    isIndustryHubSlug(industry.slug)
                      ? `/soluciones/${industry.slug}`
                      : links[0]?.href || "/servicios"
                  }
                  className={styles.columnTitleLink}
                >
                  {industry.name}
                </Link>
              </h3>
              <ul className={styles.linkList}>
                {links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={styles.textLink}>
                      {item.service.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <p className={styles.footerCta}>
        <Link href="/contacto" className={styles.ctaLink}>
          Cotizar con un especialista →
        </Link>
        {" · "}
        <Link href="/cobertura/puebla/camaras-cctv" className={styles.ctaLink}>
          CCTV Puebla
        </Link>
        {" · "}
        <Link href="/cobertura/cdmx/camaras-cctv" className={styles.ctaLink}>
          CCTV CDMX
        </Link>
        {" · "}
        <Link href="/cobertura" className={styles.ctaLink}>
          Toda la cobertura
        </Link>
      </p>
    </section>
  );
}
