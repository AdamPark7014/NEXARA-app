/**
 * Fotos del sitio en webp por tamaño (las genera `scripts/fotos-sitio.py` en public/fotos/v). El navegador
 * baja la variante que necesita en vez del JPG original de 1–1.6 MP.
 */

/** Ancho real de cada JPG original: las variantes nunca son más grandes que él. */
const ORIGINAL: Record<string, number> = {
  "campo-enlace-antena-ciudad": 1600,
  "campo-instalacion-ap-altura": 720,
  "campo-instalacion-rack": 1280,
  "campo-levantamiento-patio": 1086,
  "campo-mastil-antenas": 1200,
  "control-acceso-terminal-facial": 1066,
  "control-acceso-torniquetes": 1600,
  "equipo-nexara-espalda": 1600,
  "equipo-nexara-polos": 1554,
  "monitoreo-pantallas-cctv": 1600,
  "monitoreo-sala-videowall": 1066,
  "monitoreo-videowall": 1200,
  "rack-servidores-led": 1023,
};

const ANCHOS = [480, 960, 1440];

/**
 * Fotos en webp en dos anchos (`<nombre>-1200.webp` y `-1920.webp`): las del taller y del equipo que ya llegaron
 * así, y las reescaladas con Real-ESRGAN para baldosas anchas (`muro-video-nexara`, `rack-nexara-led`).
 */
const PARES = new Set([
  "cableado-interno-pc-guantes-taller",
  "descarga-equipo-camioneta-nexara",
  "equipo-taller-ensamble-pc-nexara",
  "equipo-tecnico-nexara-uniforme",
  "muro-video-nexara",
  "rack-nexara-led",
  "sala-monitoreo-videowall-nexara",
  "tecnico-ensamble-chasis-pc-taller",
  "tecnico-nexara-entrega-equipo-sitio",
  "tecnicos-mantenimiento-pc-colaboracion",
]);

export type Foto = { src: string; srcSet?: string; sizes?: string };

/** Versión para Open Graph y datos estructurados: JPG original o, en las fotos que solo existen en webp, la de 1200. */
export function fotoOg(nombre: string): string {
  return PARES.has(nombre) ? `/fotos/${nombre}-1200.webp` : `/fotos/${nombre}.jpg`;
}

/** `src` + `srcSet` + `sizes` de una foto de public/fotos (por su nombre sin extensión). */
export function foto(nombre: string, sizes = "(max-width: 734px) 100vw, 50vw"): Foto {
  if (PARES.has(nombre)) {
    return {
      src: `/fotos/${nombre}-1200.webp`,
      srcSet: `/fotos/${nombre}-1200.webp 1200w, /fotos/${nombre}-1920.webp 1920w`,
      sizes,
    };
  }
  const original = ORIGINAL[nombre];
  if (!original) return { src: `/fotos/${nombre}.jpg`, sizes };
  const variantes = ANCHOS.map((w) => ({ archivo: w, real: Math.min(w, original) })).filter(
    (v, i, todas) => todas.findIndex((o) => o.real === v.real) === i,
  );
  return {
    src: `/fotos/v/${nombre}-${variantes[Math.min(1, variantes.length - 1)].archivo}.webp`,
    srcSet: variantes.map((v) => `/fotos/v/${nombre}-${v.archivo}.webp ${v.real}w`).join(", "),
    sizes,
  };
}
