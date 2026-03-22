import Link from "next/link";
import { getProgrammaticLandings } from "@/lib/seo/programmatic-landings";

type SeoInterlinkHubProps = {
  title?: string;
  currentPath?: string;
  maxItems?: number;
};

export default function SeoInterlinkHub({
  title = "Rutas recomendadas",
  currentPath,
  maxItems = 12,
}: SeoInterlinkHubProps) {
  const links = getProgrammaticLandings()
    .map(({ industry, service }) => ({
      href: `/soluciones/${industry.slug}/${service.slug}`,
      label: `${service.name} para ${industry.name}`,
    }))
    .filter((item) => item.href !== currentPath)
    .slice(0, maxItems);

  return (
    <section aria-label="Enlaces relacionados SEO" style={{ display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 8 }}>
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              textDecoration: "none",
              color: "#0f172a",
              border: "1px solid #dbe3ef",
              borderRadius: 10,
              padding: "10px 12px",
              background: "#fff",
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
