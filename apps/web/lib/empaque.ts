/**
 * Norma de empaque (web).
 *
 * Espejo de `apps/api/src/warehouse/empaque.ts`: la misma conversión y la misma
 * etiqueta, para que el formulario enseñe «3 cajas = 300 pz» antes de mandar nada y la
 * lista de movimientos diga «2 cajas · 24 pz» sin preguntarle a la API.
 */

export type Empaque = {
  id?: number;
  nombre: string;
  piezasPorUnidad: number;
  esDefaultCompra?: boolean | null;
};

function numero(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** 4 decimales, igual que `Decimal(14,4)` de la base. */
export function redondear4(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10_000) / 10_000;
}

/** Plural de andar por casa: «2 cajas», «1 caja», «3 rollos». */
export function pluralEmpaque(nombre: string, cantidad: number): string {
  const limpio = nombre.trim();
  if (!limpio) return limpio;
  if (Math.abs(cantidad - 1) < 1e-9) return limpio.toLowerCase();
  const bajo = limpio.toLowerCase();
  if (/[aeiou]$/.test(bajo)) return `${bajo}s`;
  if (/[zs]$/.test(bajo)) return `${bajo.replace(/z$/, "c")}es`;
  return `${bajo}es`;
}

/** Número sin ceros de adorno: 2, 2.5, 0.25. */
export function cantidadLegible(valor: number): string {
  const n = redondear4(valor);
  return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Lo que ve el almacenista en la lista: «2 cajas · 24 pz». Sin presentación, solo la
 * unidad base.
 */
export function etiquetaCantidad(
  movimiento: {
    quantity: number | string;
    unidadCaptura?: string | null;
    cantidadCapturada?: number | string | null;
  },
  unidadBase = "pz",
): string {
  const base = numero(movimiento.quantity) ?? 0;
  const baseTexto = `${cantidadLegible(base)} ${unidadBase}`.trim();
  const capturada = numero(movimiento.cantidadCapturada);
  const unidad = (movimiento.unidadCaptura || "").trim();
  if (!unidad || capturada == null || capturada <= 0) return baseTexto;
  return `${cantidadLegible(capturada)} ${pluralEmpaque(unidad, capturada)} · ${baseTexto}`;
}

/**
 * Vista previa mientras se teclea el movimiento: cuántas piezas son en realidad.
 * `null` cuando todavía no hay con qué convertir.
 */
export function previsualizarConversion(
  cantidadCapturada: unknown,
  empaque: Empaque | null | undefined,
  unidadBase = "pz",
): { piezas: number; texto: string } | null {
  const capturada = numero(cantidadCapturada);
  if (capturada == null || capturada <= 0) return null;
  if (!empaque) return null;
  const factor = numero(empaque.piezasPorUnidad);
  if (factor == null || factor <= 0) return null;
  const piezas = redondear4(capturada * factor);
  return {
    piezas,
    texto: `${cantidadLegible(capturada)} ${pluralEmpaque(empaque.nombre, capturada)} = ${cantidadLegible(piezas)} ${unidadBase}`,
  };
}

/** La presentación que se propone al comprar: la marcada, si no la más grande. */
export function empaqueDeCompra(empaques: readonly Empaque[]): Empaque | null {
  if (!empaques.length) return null;
  const marcado = empaques.find((e) => e.esDefaultCompra);
  if (marcado) return marcado;
  return [...empaques].sort((a, b) => Number(b.piezasPorUnidad) - Number(a.piezasPorUnidad))[0] ?? null;
}
