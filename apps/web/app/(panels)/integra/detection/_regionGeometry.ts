/**
 * Geometría de las regiones de detección.
 *
 * Una región es un array plano de vértices en 0..1 —igual que la guarda el
 * servidor (`NormalizedRegion`) y el mismo espacio en el que el equipo manda
 * los `TargetRect`—, así que un polígono dibujado aquí significa lo mismo
 * tanto si el cuadro se ve a 320 px en el muro como a pantalla completa.
 *
 * Funciones puras a propósito: el editor solo traduce píxeles a 0..1 y llama
 * aquí. Lo que se puede probar sin montar un SVG, se prueba sin montar un SVG.
 */

import {
  clamp01,
  MAX_POINTS,
  MAX_REGIONS,
  MIN_POINTS,
  type DetectionPoint,
  type DetectionRegion,
} from "./_tuningApi";

/**
 * Región nueva: un rectángulo centrado, algo más pequeño que el cuadro.
 *
 * No arranca cubriendo el fotograma entero a propósito — eso es justo la
 * configuración a ciegas que esta pantalla viene a corregir. Cada región nueva
 * se coloca un poco desplazada de la anterior para que no queden apiladas.
 */
export function newRegion(existing: DetectionRegion[]): DetectionRegion {
  const step = existing.length % MAX_REGIONS;
  const dx = 0.06 * step;
  const dy = 0.05 * step;
  const x0 = clamp01(0.22 + dx);
  const y0 = clamp01(0.22 + dy);
  const x1 = clamp01(0.68 + dx);
  const y1 = clamp01(0.72 + dy);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** ¿Cabe otra región? El equipo tiene cuatro ranuras. */
export function canAddRegion(regions: DetectionRegion[], max = MAX_REGIONS): boolean {
  return regions.length < max;
}

export function movePoint(
  region: DetectionRegion,
  index: number,
  next: DetectionPoint,
): DetectionRegion {
  if (index < 0 || index >= region.length) return region;
  const points = region.slice();
  points[index] = { x: clamp01(next.x), y: clamp01(next.y) };
  return points;
}

/**
 * Vértice nuevo en el punto medio del lado que arranca en `index`.
 *
 * Insertar en el medio de un lado es la forma en que se afina un polígono en
 * cualquier VMS: se agarra el lado y se dobla. Añadir al final produciría
 * figuras cruzadas.
 */
export function addPointAfter(region: DetectionRegion, index: number): DetectionRegion {
  if (region.length >= MAX_POINTS) return region;
  if (index < 0 || index >= region.length) return region;
  const a = region[index];
  const b = region[(index + 1) % region.length];
  const points = region.slice();
  points.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return points;
}

/** Quita un vértice, salvo que dejara de ser un polígono. */
export function removePoint(region: DetectionRegion, index: number): DetectionRegion {
  if (region.length <= MIN_POINTS) return region;
  if (index < 0 || index >= region.length) return region;
  const points = region.slice();
  points.splice(index, 1);
  return points;
}

/**
 * `points` de un `<polygon>` en el sistema del viewBox.
 *
 * El viewBox es `0 0 (100·proporción) 100`, no `0 0 100 100`: así el SVG no
 * tiene que deformarse para cubrir un cuadro 16:9 y un círculo se dibuja
 * redondo en vez de ovalado. `scaleX` es esa proporción (ancho ÷ alto).
 */
export function polygonPoints(region: DetectionRegion, scaleX = 1): string {
  return region
    .map((p) => `${(p.x * 100 * scaleX).toFixed(2)},${(p.y * 100).toFixed(2)}`)
    .join(" ");
}

/** Centro geométrico: donde se ancla la etiqueta de la región. */
export function centroid(region: DetectionRegion): DetectionPoint {
  if (region.length === 0) return { x: 0.5, y: 0.5 };
  let sx = 0;
  let sy = 0;
  for (const p of region) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / region.length, y: sy / region.length };
}

/**
 * Superficie del polígono como fracción del fotograma (fórmula del cordón).
 *
 * Se enseña porque responde a la pregunta que nadie estaba haciendo: una
 * región que cubre el 98 % del cuadro no es una región, es el cuadro entero
 * con pasos extra — y es lo que hay hoy en producción.
 */
export function areaFraction(region: DetectionRegion): number {
  if (region.length < MIN_POINTS) return 0;
  let acc = 0;
  for (let i = 0; i < region.length; i++) {
    const a = region[i];
    const b = region[(i + 1) % region.length];
    acc += a.x * b.y - b.x * a.y;
  }
  return Math.abs(acc) / 2;
}

/** Píxeles del cuadro a 0..1, con los bordes recortados. */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): DetectionPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}
