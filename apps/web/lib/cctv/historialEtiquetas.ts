/**
 * Textos legibles del historial del editor CCTV (últimas acciones en el panel derecho).
 */
import type { Plano } from "./plano";

export type PasoHistorial = { etiqueta: string; /** Índice en `pasado` al que se vuelve al hacer clic. */ indicePasado: number };

function nombreCamara(c: { nombre?: string | null; numero?: number }, i: number): string {
  if (c.nombre?.trim()) return c.nombre.trim();
  return `Cámara ${c.numero ?? i + 1}`;
}

function idsDe<T extends { id: string }>(lista: readonly T[] | null | undefined): Set<string> {
  return new Set((lista ?? []).map((x) => x.id));
}

function porId<T extends { id: string }>(lista: readonly T[] | null | undefined): Map<string, T> {
  return new Map((lista ?? []).map((x) => [x.id, x]));
}

/** Compara dos planos y arma una frase corta en español de México. */
export function etiquetaDeCambio(antes: Plano, despues: Plano, fusion?: string | null): string {
  if (fusion === "digitalizar-ia") return "Digitalicé el plano con IA";

  const murosNuevos = despues.muros.filter((m) => !idsDe(antes.muros).has(m.id)).length;
  if (murosNuevos >= 5 && despues.camaras.length >= antes.camaras.length) {
    return "Digitalicé el plano con IA";
  }

  const camAntes = porId(antes.camaras);
  const camDesp = porId(despues.camaras);
  for (const c of despues.camaras) {
    if (!camAntes.has(c.id)) return `Agregué ${nombreCamara(c, c.numero - 1)}`;
  }
  for (const c of antes.camaras) {
    if (!camDesp.has(c.id)) return `Quité ${nombreCamara(c, c.numero - 1)}`;
  }

  const k = despues.escala.metrosPorPx;
  for (const c of despues.camaras) {
    const prev = camAntes.get(c.id);
    if (!prev) continue;
    const dx = (c.pos.x - prev.pos.x) * k;
    const dy = (c.pos.y - prev.pos.y) * k;
    const dist = Math.hypot(dx, dy);
    if (dist >= 0.05 && Math.abs(c.rumboDeg - prev.rumboDeg) < 0.5) {
      return `Moví ${nombreCamara(c, c.numero - 1)} ${dist.toFixed(1)} m`;
    }
    if (Math.abs(c.rumboDeg - prev.rumboDeg) >= 0.5 && dist < 0.05) {
      return `Giré ${nombreCamara(c, c.numero - 1)} a ${Math.round(c.rumboDeg)}°`;
    }
  }

  const eqAntes = idsDe(antes.equipos);
  for (const e of despues.equipos ?? []) {
    if (!eqAntes.has(e.id)) return `Agregué ${e.nombre?.trim() || e.modelo || "equipo"}`;
  }
  for (const e of antes.equipos ?? []) {
    if (!idsDe(despues.equipos).has(e.id)) return `Quité ${e.nombre?.trim() || e.modelo || "equipo"}`;
  }

  if (despues.muros.length > antes.muros.length) return "Agregué un muro";
  if (despues.muros.length < antes.muros.length) return "Quité un muro";
  if ((despues.personas?.length ?? 0) > (antes.personas?.length ?? 0)) return "Agregué una persona";
  if ((despues.personas?.length ?? 0) < (antes.personas?.length ?? 0)) return "Quité una persona";

  return "Cambié el diseño";
}

/**
 * Últimas `limite` acciones. `pasado` va del más viejo al más reciente;
 * cada entrada es el plano *antes* del siguiente cambio. El más reciente va primero.
 */
export function ultimosPasos(
  pasado: readonly Plano[],
  actual: Plano,
  limite = 8,
  etiquetasGuardadas?: readonly (string | null | undefined)[],
): PasoHistorial[] {
  const pasos: PasoHistorial[] = [];
  const cadena = [...pasado, actual];
  for (let i = cadena.length - 1; i >= 1 && pasos.length < limite; i--) {
    const indicePasado = i - 1;
    const guardada = etiquetasGuardadas?.[indicePasado];
    const etiqueta = guardada?.trim() || etiquetaDeCambio(cadena[i - 1], cadena[i]);
    pasos.push({ etiqueta, indicePasado });
  }
  return pasos;
}
