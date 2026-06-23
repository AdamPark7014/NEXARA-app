export const revalidate = 3600;
import type { MetadataRoute } from "next";
import { getProgrammaticLandings } from "@/lib/seo/programmatic-landings";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/servicios`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${baseUrl}/soluciones`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/proyectos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.92,
    },
    {
      url: `${baseUrl}/contacto`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/qa`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/Nexara-Ingenieros`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.72,
    },
    {
      url: `${baseUrl}/legal/privacidad`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/terminos`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/cookies`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.45,
    },
    {
      url: `${baseUrl}/legal/marca`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.45,
    },
  ];

  const programmaticPages: MetadataRoute.Sitemap = getProgrammaticLandings().map(({ industry, service }) => ({
    url: `${baseUrl}/soluciones/${industry.slug}/${service.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.78,
  }));

  return [...staticPages, ...programmaticPages];
}
