export type ResumenAvisosCostos = {
  avance: number | null;
  rubros: Array<{ rubro: string; etiqueta: string; cotizado: number | null; real: number }>;
  directo: { cotizado: number | null; real: number };
  indirecto: { cotizado: number | null; real: number | null };
};

/** Umbrales estrictos: 90 % y 70 % exactos todavía no disparan el aviso. */
export function umbralesCostos(r: ResumenAvisosCostos) {
  const avisos: Array<{ clave: string; texto: string; sobrecosto: boolean }> = [];
  if (r.avance != null && Number.isFinite(r.avance) && r.avance >= 0 && r.avance < 70) {
    for (const rubro of r.rubros) {
      if (rubro.cotizado != null && Number.isFinite(rubro.cotizado) && rubro.cotizado > 0 &&
          Number.isFinite(rubro.real) && Math.round(rubro.real * 100) * 10 > Math.round(rubro.cotizado * 100) * 9) {
        avisos.push({ clave: `rubro:${rubro.rubro}:90`, texto: `${rubro.etiqueta}: consumido más del 90 % con avance de ${r.avance} %.`, sobrecosto: false });
      }
    }
  }
  const cotizado = r.directo.cotizado == null ? null : r.directo.cotizado + (r.indirecto.cotizado ?? 0);
  const real = r.directo.real + (r.indirecto.real ?? 0);
  if (cotizado != null && Number.isFinite(cotizado) && cotizado >= 0 && Number.isFinite(real) && Math.round(real * 100) > Math.round(cotizado * 100)) {
    avisos.push({ clave: 'total:100', texto: `Sobrecosto total: $${real.toFixed(2)} reales contra $${cotizado.toFixed(2)} cotizados.`, sobrecosto: true });
  }
  return avisos;
}
