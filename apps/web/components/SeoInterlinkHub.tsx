import Link from "next/link";
import { getProgrammaticLandings, INDUSTRY_LANDINGS } from "@/lib/seo/programmatic-landings";
import { MONEY_SERVICE_SLUGS } from "@/lib/seo/money-pages";
import styles from "./SeoInterlinkHub.module.css";

type SeoInterlinkHubProps = {
  title?: string;
  subtitle?: string;
  currentPath?: string;
  maxItems?: number;
  maxIndustries?: number;
  maxServicesPerIndustry?: number;
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

  if (columns.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-label="Enlaces relacionados SEO">
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>

      <div className={styles.columns}>
        {columns.map(({ industry, links }) => (
          <div key={industry.slug} className={styles.column}>
            <h3 className={styles.columnTitle}>
              <Link href={`/soluciones/${industry.slug}`} className={styles.columnTitleLink}>
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

      <p className={styles.footerCta}>
        <Link href="/contacto" className={styles.ctaLink}>
          Cotizar con un especialista →
        </Link>
        {" · "}
        <Link href="/cobertura/puebla" className={styles.ctaLink}>
          Cobertura Puebla
        </Link>
        {" · "}
        <Link href="/cobertura/cdmx" className={styles.ctaLink}>
          CDMX
        </Link>
      </p>
    </section>
  );
}
