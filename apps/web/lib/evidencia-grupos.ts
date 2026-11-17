export type CampoGrupoInput = {
  nombre: string;
  momentos: string[];
  notas?: string | null;
};

export type GrupoEvidencia = {
  base: string;
  cantidad: number;
  momentos: string[];
  notas: string;
  indices: number[];
};

const MAX_CAMPOS = 40;

/** "Cámara 1" → "Cámara"; "Grabador (NVR)" → igual; "Cámara" → "Cámara". */
export function nombreBase(nombre: string): string {
  const limpio = nombre.trim();
  const m = limpio.match(/^(.*)\s+(\d+)$/);
  return m ? m[1].trim() : limpio;
}

function notaDe(c: CampoGrupoInput): string {
  return (c.notas ?? "").toString();
}

export function mismosMomentos(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Junta consecutivos con mismo nombreBase, mismos momentos (mismo orden) y misma nota.
 * Grupo de 2+: base = nombreBase. Grupo de 1: base = nombre original trim (tal cual).
 * `individuales` (opcional): índices que no deben fusionarse con vecinos.
 */
export function agruparCampos(
  campos: CampoGrupoInput[],
  individuales?: ReadonlySet<number>,
): GrupoEvidencia[] {
  const grupos: GrupoEvidencia[] = [];
  let i = 0;
  while (i < campos.length) {
    const primero = campos[i];
    const baseCmp = nombreBase(primero.nombre);
    const notas = notaDe(primero);
    const momentos = [...primero.momentos];
    const indices = [i];
    let j = i + 1;
    const primeroIndividual = individuales?.has(i) === true;
    while (j < campos.length && !primeroIndividual && !individuales?.has(j)) {
      const c = campos[j];
      if (nombreBase(c.nombre) !== baseCmp) break;
      if (!mismosMomentos(c.momentos, momentos)) break;
      if (notaDe(c) !== notas) break;
      indices.push(j);
      j += 1;
    }
    const cantidad = indices.length;
    grupos.push({
      base: cantidad === 1 ? primero.nombre.trim() : baseCmp,
      cantidad,
      momentos,
      notas,
      indices: [...indices],
    });
    i = j;
  }
  return grupos;
}

/** Expande grupos a lista plana. cantidad 1 → nombre = base; cantidad N → "base 1".."base N". Tope 40. */
export function desagrupar(grupos: GrupoEvidencia[]): CampoGrupoInput[] {
  const out: CampoGrupoInput[] = [];
  for (const g of grupos) {
    const n = Math.max(0, Math.min(g.cantidad, MAX_CAMPOS - out.length));
    for (let k = 1; k <= n; k += 1) {
      out.push({
        nombre: g.cantidad === 1 ? g.base : `${g.base} ${k}`,
        momentos: [...g.momentos],
        notas: g.notas,
      });
    }
    if (out.length >= MAX_CAMPOS) break;
  }
  return out;
}

/** "Cámara 1–4, Grabador (NVR), Pruebas y entrega" (guión tipográfico –). */
export function resumenGrupos(grupos: GrupoEvidencia[]): string {
  return grupos
    .map((g) => (g.cantidad > 1 ? `${g.base} 1–${g.cantidad}` : g.base))
    .join(", ");
}