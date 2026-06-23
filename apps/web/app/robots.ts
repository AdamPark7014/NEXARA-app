import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx";
  
  return {
    host: baseUrl,
    rules: [
      {
        userAgent: "*",
        allow: "/",
        crawlDelay: 2,
        disallow: [
          "/api/",
          "/_next/",
          "/console/",
          "/consola/",
          "/tickets/",
          "/contabilidad/",
          "/ventas/",
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
          "/soluciones",
          "/proyectos",
          "/contacto",
          "/cobertura",
          "/Nexara-Ingenieros",
          "/legal/",
        ],
        disallow: ["/console/", "/tickets/", "/ventas/", "/contabilidad/", "/web/"],
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
