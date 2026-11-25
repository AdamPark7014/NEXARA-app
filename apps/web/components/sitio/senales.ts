import type { PublicIconName } from "@/app/components/PublicIcon";

/** Hexágono de punta arriba, como el del emblema (viewBox 0 0 52 56). */
export const HEXAGONO = "M26 1.5 49 14.8v26.4L26 54.5 3 41.2V14.8z";

export type Senal = {
  /** Ancla de la sección en /servicios. */
  id: "cctv" | "redes" | "computo" | "soporte" | "software";
  nombre: string;
  icono: PublicIconName;
  /** Color del logotipo que identifica al servicio en todo el sitio. */
  color: string;
};

/**
 * Los cinco servicios y su señal: el mismo icono y el mismo color en los nodos del hero, en las baldosas de la
 * portada y donde haga falta reconocerlos. El orden es el del sitio.
 */
export const SENALES: Senal[] = [
  { id: "cctv", nombre: "Videovigilancia", icono: "camera", color: "var(--senal-cian)" },
  { id: "redes", nombre: "Redes y Wi‑Fi", icono: "wifi", color: "var(--senal-teal)" },
  { id: "computo", nombre: "Infraestructura", icono: "server", color: "var(--senal-ambar)" },
  { id: "soporte", nombre: "Soporte TI", icono: "headset", color: "var(--senal-magenta)" },
  { id: "software", nombre: "Plataformas", icono: "code", color: "var(--senal-coral)" },
];

export const senal = (id: Senal["id"]): Senal => SENALES.find((s) => s.id === id) as Senal;
