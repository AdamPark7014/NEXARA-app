import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

  return {
    host: baseUrl,
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
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
          "/login",
          "/auth/",
          "/device/",
          "/qa/",
          "/cotizaciones/firmar/",
          "/*?*token=*",
          "/*?*session=*",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: [
          "/",
          "/servicios",
          "/soluciones/",
          "/proyectos",
          "/contacto",
          "/nosotros",
          "/blog",
          "/blog/",
          "/cobertura",
          "/Nexara-Ingenieros",
          "/legal/",
        ],
        disallow: [
          "/console/",
          "/consola/",
          "/tickets/",
          "/ventas/",
          "/crm/",
          "/ops/",
          "/erp/",
          "/studio/",
          "/contabilidad/",
          "/web/",
          "/api/",
          "/qa/",
          "/login",
          "/auth/",
        ],
      },
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "ChatGPT-User",
        disallow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
