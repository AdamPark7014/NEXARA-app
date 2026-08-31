import type { MetadataRoute } from "next";
import {
  NEXARA_APPLE_TOUCH,
  NEXARA_FAVICON_192,
  NEXARA_FAVICON_512,
} from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEXARA",
    short_name: "NEXARA",
    description:
      "CCTV, redes Wi‑Fi, cómputo y soporte TI para empresas en México.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0f6ad6",
    lang: "es-MX",
    icons: [
      { src: NEXARA_FAVICON_192, sizes: "192x192", type: "image/png" },
      { src: NEXARA_FAVICON_512, sizes: "512x512", type: "image/png" },
      { src: NEXARA_APPLE_TOUCH, sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
