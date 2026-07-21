export const revalidate = 1800;
import type { MetadataRoute } from "next";
import {
  getProgrammaticLandings,
  INDUSTRY_LANDINGS,
} from "@/lib/seo/programmatic-landings";
import { sitemapPriorityForLanding } from "@/lib/seo/money-pages";
import { fetchPublishedNews } from "@/lib/public-news";
import { GEO_CITIES, getGeoServiceCombos } from "@/lib/seo/geo-cities";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
  const now = new Date();

  // Orden = señal de importancia para crawlers (home → dinero → confianza → legal)
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/servicios`, lastModified: now, changeFrequency: "daily", priority: 0.98 },
    { url: `${baseUrl}/contacto`, lastModified: now, changeFrequency: "daily", priority: 0.97 },
    { url: `${baseUrl}/proyectos`, lastModified: now, changeFrequency: "weekly", priority: 0.93 },
    { url: `${baseUrl}/cobertura`, lastModified: now, changeFrequency: "weekly", priority: 0.88 },
    { url: `${baseUrl}/nosotros`, lastModified: now, changeFrequency: "weekly", priority: 0.86 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${baseUrl}/Nexara-Ingenieros`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/legal/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/legal/terminos`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/legal/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.25 },
    { url: `${baseUrl}/legal/marca`, lastModified: now, changeFrequency: "yearly", priority: 0.25 },
  ];

  const industryHubs: MetadataRoute.Sitemap = INDUSTRY_LANDINGS.map((industry) => ({
    url: `${baseUrl}/soluciones/${industry.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: industry.slug === "retail" || industry.slug === "manufactura" || industry.slug === "seguridad-electronica"
      ? 0.9
      : 0.84,
  }));

  const geoPages: MetadataRoute.Sitemap = GEO_CITIES.map((city) => ({
    url: `${baseUrl}/cobertura/${city.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: city.mode === "base" ? 0.92 : city.mode === "campo" ? 0.86 : 0.8,
  }));

  const geoServicePages: MetadataRoute.Sitemap = getGeoServiceCombos().map(
    ({ city, serviceSlug }) => ({
      url: `${baseUrl}/cobertura/${city.slug}/${serviceSlug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority:
        city.mode === "base" && (serviceSlug === "camaras-cctv" || serviceSlug === "redes-y-conectividad")
          ? 0.95
          : city.mode === "base"
            ? 0.9
            : 0.82,
    }),
  );

  const programmaticPages: MetadataRoute.Sitemap = getProgrammaticLandings()
    .map(({ industry, service }) => ({
      url: `${baseUrl}/soluciones/${industry.slug}/${service.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: sitemapPriorityForLanding(industry.slug, service.slug),
    }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const posts = await fetchPublishedNews(200).catch(() => []);
  const blogPosts: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt || post.publishedAt || post.createdAt || now),
    changeFrequency: "weekly" as const,
    priority: 0.72,
  }));

  return [
    ...staticPages,
    ...geoServicePages.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
    ...geoPages,
    ...industryHubs,
    ...programmaticPages,
    ...blogPosts,
  ];
}
