import type { MetadataRoute } from "next";

/**
 * Crawl budget → páginas que generan leads.
 * Sin crawl-delay. Paneles y scrapers de IA fuera.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

  const privatePaths = [
    "/api/",
    "/_next/",
    "/console/",
    "/consola/",
    "/tickets/",
    "/contabilidad/",
    "/ventas/",
    "/crm/",
    "/ops/",
    "/erp/",
    "/studio/",
    "/web/",
    "/lab/",
    "/paneles",
    "/login",
    "/auth/",
    "/device/",
    "/qa/",
    "/cotizaciones/firmar/",
    "/*?*token=*",
    "/*?*session=*",
    "/*?*access_token=*",
  ];

  const moneyAllows = [
    "/",
    "/servicios",
    "/proyectos",
    "/contacto",
    "/nosotros",
    "/blog/",
    "/cobertura",
    "/soluciones/",
    "/Nexara-Ingenieros",
    "/legal/",
    "/images/",
  ];

  return {
    host: baseUrl,
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/servicios", "/contacto", "/soluciones/", "/proyectos", "/blog/"],
        disallow: privatePaths,
      },
      {
        userAgent: "Googlebot",
        allow: moneyAllows,
        disallow: privatePaths,
      },
      {
        userAgent: "Googlebot-Image",
        allow: ["/", "/images/", "/uploads/", "/*.jpg", "/*.jpeg", "/*.png", "/*.webp", "/*.gif"],
        disallow: ["/api/", "/console/", "/studio/", "/crm/", "/ops/", "/erp/"],
      },
      {
        userAgent: "Bingbot",
        allow: moneyAllows,
        disallow: privatePaths,
      },
      {
        userAgent: "DuckDuckBot",
        allow: moneyAllows,
        disallow: privatePaths,
      },
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "ChatGPT-User", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "anthropic-ai", disallow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
      { userAgent: "Bytespider", disallow: "/" },
      { userAgent: "PetalBot", disallow: "/" },
      { userAgent: "Amazonbot", disallow: "/" },
      { userAgent: "meta-externalagent", disallow: "/" },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
