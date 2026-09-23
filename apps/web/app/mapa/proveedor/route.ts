import { NextResponse } from "next/server";

/**
 * Decide qué proveedor de mapa embebido usar en el sitio público.
 *
 * Google Maps Embed API exige que la clave tenga habilitada esa API; si no,
 * responde 403 y el iframe queda gris. Aquí se prueba desde el servidor (con
 * caché) y, si Google rechaza la clave, se usa OpenStreetMap, que no necesita
 * clave y permite ser embebido.
 */
export const revalidate = 3600;

const NEXARA_LAT = 19.073803;
const NEXARA_LNG = -98.277838;
const PLACE_QUERY = "Explanada Puebla, Santiago Momoxpan, Puebla";

type MapProviderInfo = {
  provider: "google" | "osm";
  src: string;
  link: string;
};

const osmSrc = () => {
  const d = 0.006;
  const bbox = [NEXARA_LNG - d, NEXARA_LAT - d * 0.6, NEXARA_LNG + d, NEXARA_LAT + d * 0.6]
    .map((n) => n.toFixed(6))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${NEXARA_LAT},${NEXARA_LNG}`;
};

const googleSrc = (key: string) =>
  `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(PLACE_QUERY)}&zoom=16&language=es`;

const MAPS_LINK = "https://maps.app.goo.gl/uJBZyNeAApgAri536";

export async function GET() {
  const key = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
  let info: MapProviderInfo = { provider: "osm", src: osmSrc(), link: MAPS_LINK };

  if (key) {
    try {
      const res = await fetch(googleSrc(key), {
        method: "GET",
        headers: { Referer: process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx/" },
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        info = { provider: "google", src: googleSrc(key), link: MAPS_LINK };
      }
    } catch {
      /* sin red: OSM */
    }
  }

  return NextResponse.json(info, {
    headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
