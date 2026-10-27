import type { PublicIconName } from "@/app/components/PublicIcon";
import type { GeoCity } from "@/lib/seo/geo-cities";

/**
 * Foto real, ícono y mini interfaz de cada servicio e industria de las páginas de soluciones y cobertura. Las fotos
 * del hero son horizontales y de 1200 px o más, porque se recortan a 21:9.
 */

export type Arte = "red" | "soporte" | "grafica";

type VisualServicio = {
  /** Foto del hero (horizontal). */
  foto: string;
  icono: PublicIconName;
  /** Sección de /servicios que le corresponde. */
  ancla: "cctv" | "redes" | "computo" | "soporte" | "software";
  /** Mini interfaz del bloque «Qué entregamos»; sin ella va `fotoBloque`. */
  arte?: Arte;
  fotoBloque?: string;
};

const SERVICIOS: Record<string, VisualServicio> = {
  "erp-industrial": { foto: "sala-monitoreo-videowall-nexara", icono: "layers", ancla: "software", arte: "grafica" },
  "camaras-cctv": { foto: "muro-video-ancho", icono: "camera", ancla: "cctv", fotoBloque: "monitoreo-sala-videowall" },
  "equipo-de-computo": { foto: "cableado-interno-pc-guantes-taller", icono: "monitor", ancla: "computo", fotoBloque: "tecnico-ensamble-chasis-pc-taller" },
  "redes-y-conectividad": { foto: "campo-enlace-antena-ciudad", icono: "wifi", ancla: "redes", arte: "red" },
  "soporte-ti-pyme": { foto: "tecnico-nexara-entrega-equipo-sitio", icono: "headset", ancla: "soporte", arte: "soporte" },
  "ciberseguridad-empresas": { foto: "control-acceso-torniquetes", icono: "lock", ancla: "redes", arte: "red" },
  "infraestructura-ti": { foto: "campo-instalacion-rack", icono: "server", ancla: "computo", arte: "red" },
  "mesa-de-ayuda-ti": { foto: "equipo-tecnico-nexara-uniforme", icono: "headset", ancla: "soporte", arte: "soporte" },
  "automatizacion-de-procesos": { foto: "sala-monitoreo-videowall-nexara", icono: "code", ancla: "software", arte: "grafica" },
  "servicios-gestionados-ti": { foto: "sala-monitoreo-videowall-nexara", icono: "refresh", ancla: "soporte", arte: "soporte" },
};

/** Cómo se nombra cada sección de /servicios en el enlace «Ver … en Servicios». */
export const NOMBRE_LINEA: Record<VisualServicio["ancla"], string> = {
  cctv: "videovigilancia",
  redes: "redes y Wi‑Fi",
  computo: "infraestructura y cómputo",
  soporte: "soporte TI",
  software: "plataformas a la medida",
};

export function visualServicio(slug: string): VisualServicio {
  return SERVICIOS[slug] ?? { foto: "campo-instalacion-rack", icono: "layers", ancla: "cctv", arte: "red" };
}

type VisualIndustria = { icono: PublicIconName; foto?: string };

const INDUSTRIAS: Record<string, VisualIndustria> = {
  retail: { icono: "store", foto: "muro-video-ancho" },
  manufactura: { icono: "factory", foto: "campo-enlace-antena-ciudad" },
  hospitalidad: { icono: "hotel", foto: "tecnico-nexara-entrega-equipo-sitio" },
  salud: { icono: "hospital", foto: "campo-instalacion-rack" },
  educacion: { icono: "school", foto: "control-acceso-torniquetes" },
  gobierno: { icono: "landmark", foto: "sala-monitoreo-videowall-nexara" },
  "seguridad-electronica": { icono: "shield" },
  "pymes-y-startups": { icono: "building" },
  // La camioneta descargando equipo dice «distribución» mejor que la foto del servicio.
  logistica: { icono: "network", foto: "descarga-equipo-camioneta-nexara" },
  servicios: { icono: "users" },
};

export function visualIndustria(slug: string): VisualIndustria {
  return INDUSTRIAS[slug] ?? { icono: "building" };
}

/** Cómo se atiende cada ciudad según su distancia a la base (Puebla y CDMX). */
export const MODO_CIUDAD: Record<GeoCity["mode"], { etiqueta: string; enSitio: string; faq: string }> = {
  base: { etiqueta: "Base operativa", enSitio: "Cuadrillas propias desde la base", faq: "de base operativa local" },
  campo: { etiqueta: "Campo cercano", enSitio: "Visitas programadas desde Puebla o CDMX", faq: "de campo cercano" },
  extendida: { etiqueta: "Cobertura extendida", enSitio: "Proyecto por fases con viaje programado", faq: "extendido por fases" },
};

/** Foto del hero de una solución servicio × industria: la de la industria cuando la tiene propia, si no la del servicio. */
export function fotoSolucion(industria: string, servicio: string): string {
  return industria === "logistica" ? INDUSTRIAS.logistica.foto! : visualServicio(servicio).foto;
}
