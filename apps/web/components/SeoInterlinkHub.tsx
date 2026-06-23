import Link from "next/link";
import { getProgrammaticLandings, INDUSTRY_LANDINGS } from "@/lib/seo/programmatic-landings";
import styles from "./SeoInterlinkHub.module.css";

type SeoInterlinkHubProps = {
  title?: string;
  subtitle?: string;
  currentPath?: string;
  maxItems?: number;
  maxIndustries?: number;
  maxServicesPerIndustry?: number;
};

export default function SeoInterlinkHub({
  title = "Rutas recomendadas",
  subtitle,
  currentPath,
  maxItems,
  maxIndustries = 6,
  maxServicesPerIndustry = 3,
}: SeoInterlinkHubProps) {
  const flat = getProgrammaticLandings().map(({ industry, service }) => ({
    href: `/soluciones/${industry.slug}/${service.slug}`,
    industry,
    service,
  }));

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
      const items = group.items;
      const n = items.length;
      const cap = maxServicesPerIndustry;
      let links: typeof items;
      if (n === 0) {
        links = [];
      } else if (n <= cap) {
        links = items;
      } else {
        const idx = Math.max(0, order.indexOf(slug));
        const start = (idx * 3) % n;
        links = [...items.slice(start), ...items.slice(0, start)].slice(0, cap);
      }
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
            <h3 className={styles.columnTitle}>{industry.name}</h3>
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
    </section>
  );
}
