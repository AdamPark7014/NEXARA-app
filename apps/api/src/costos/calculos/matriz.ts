/**
 * Matriz de una partida: recursos simples y compuestos (Reglamento de la LOPSRM, arts. 190, 193, 207
 * y 209). Un recurso compuesto se arma con otros, como una cuadrilla o un sub-ensamble. Los recursos
 * «tipo porcentaje» cuestan una fracción de lo que suman los de cierto tipo en la misma matriz, como
 * la herramienta menor, que es un % de la mano de obra.
 *
 * Módulo puro. La Fase 2 lo conecta con las cotizaciones.
 */
import { redondear } from './numeros.js';

export const TIPOS_RECURSO = ['MATERIAL', 'MANO_OBRA', 'HERRAMIENTA', 'EQUIPO', 'AUXILIAR', 'FLETE', 'TRABAJO'] as const;
export type TipoRecurso = (typeof TIPOS_RECURSO)[number];

export type RenglonMatriz = {
  recursoId: string;
  /** Consumo por unidad del concepto. En un porcentaje, la fracción (0.03 = 3 %). */
  cantidad: number;
  /** Desperdicio como fracción: 0.05 hace que se consuma 5 % más. */
  desperdicio?: number;
  /** Si está, el costo unitario es lo que suman los recursos de ese tipo en esta matriz. */
  porcentajeDe?: TipoRecurso;
};

export type Recurso = {
  id: string;
  tipo: TipoRecurso;
  /** Costo por unidad de un recurso simple. Se ignora si trae renglones. */
  costo?: number;
  /** Renglones de un recurso compuesto. */
  renglones?: readonly RenglonMatriz[];
};

export type RenglonCalculado = {
  recursoId: string;
  tipo: TipoRecurso;
  cantidad: number;
  costoUnitario: number;
  importe: number;
};

export type MatrizCalculada = {
  costoDirecto: number;
  renglones: RenglonCalculado[];
  porTipo: Partial<Record<TipoRecurso, number>>;
};

function buscar(catalogo: ReadonlyMap<string, Recurso>, id: string): Recurso {
  const recurso = catalogo.get(id);
  if (!recurso) throw new Error(`Recurso desconocido: ${id}`);
  return recurso;
}

function costoDelRecurso(catalogo: ReadonlyMap<string, Recurso>, id: string, ruta: readonly string[]): number {
  if (ruta.includes(id)) throw new Error(`La matriz se contiene a sí misma: ${[...ruta, id].join(' → ')}`);
  const recurso = buscar(catalogo, id);
  if (!recurso.renglones?.length) return Number(recurso.costo) || 0;
  return costoDeRenglones(catalogo, recurso.renglones, [...ruta, id]).costoDirecto;
}

function costoDeRenglones(
  catalogo: ReadonlyMap<string, Recurso>,
  renglones: readonly RenglonMatriz[],
  ruta: readonly string[],
): MatrizCalculada {
  const calculados: RenglonCalculado[] = [];
  const porTipo: Partial<Record<TipoRecurso, number>> = {};

  // Primero los de costo propio: un porcentaje se calcula sobre lo que ellos suman.
  for (const r of renglones.filter((x) => !x.porcentajeDe)) {
    const recurso = buscar(catalogo, r.recursoId);
    const costoUnitario = costoDelRecurso(catalogo, r.recursoId, ruta);
    const cantidad = r.cantidad * (1 + (r.desperdicio ?? 0));
    const importe = cantidad * costoUnitario;
    calculados.push({ recursoId: r.recursoId, tipo: recurso.tipo, cantidad, costoUnitario, importe });
    porTipo[recurso.tipo] = (porTipo[recurso.tipo] ?? 0) + importe;
  }
  const baseDe = { ...porTipo };
  for (const r of renglones.filter((x) => x.porcentajeDe)) {
    const recurso = buscar(catalogo, r.recursoId);
    const costoUnitario = baseDe[r.porcentajeDe as TipoRecurso] ?? 0;
    const importe = r.cantidad * costoUnitario;
    calculados.push({ recursoId: r.recursoId, tipo: recurso.tipo, cantidad: r.cantidad, costoUnitario, importe });
    porTipo[recurso.tipo] = (porTipo[recurso.tipo] ?? 0) + importe;
  }
  return { costoDirecto: calculados.reduce((a, r) => a + r.importe, 0), renglones: calculados, porTipo };
}

export function calcularMatriz(
  catalogo: ReadonlyMap<string, Recurso>,
  renglones: readonly RenglonMatriz[],
): MatrizCalculada {
  const m = costoDeRenglones(catalogo, renglones, []);
  return {
    costoDirecto: redondear(m.costoDirecto),
    renglones: m.renglones.map((r) => ({
      ...r,
      cantidad: redondear(r.cantidad, 4),
      costoUnitario: redondear(r.costoUnitario, 4),
      importe: redondear(r.importe),
    })),
    porTipo: Object.fromEntries(Object.entries(m.porTipo).map(([k, v]) => [k, redondear(v as number)])),
  };
}

export type InsumoExplotado = { recursoId: string; tipo: TipoRecurso; cantidad: number; importe: number };

/**
 * Explosión de insumos: cuánto de cada recurso simple hace falta para `cantidad` unidades. Los
 * compuestos se abren hasta llegar a los simples. Los porcentajes se suman como importe.
 */
export function explosionInsumos(
  catalogo: ReadonlyMap<string, Recurso>,
  renglones: readonly RenglonMatriz[],
  cantidad: number,
): InsumoExplotado[] {
  const acumulado = new Map<string, InsumoExplotado>();
  const sumar = (recursoId: string, tipo: TipoRecurso, cant: number, importe: number) => {
    const fila = acumulado.get(recursoId) ?? { recursoId, tipo, cantidad: 0, importe: 0 };
    fila.cantidad += cant;
    fila.importe += importe;
    acumulado.set(recursoId, fila);
  };
  const abrir = (lista: readonly RenglonMatriz[], factor: number, ruta: readonly string[]) => {
    const calculada = costoDeRenglones(catalogo, lista, ruta);
    for (const r of calculada.renglones) {
      const recurso = buscar(catalogo, r.recursoId);
      const original = lista.find((x) => x.recursoId === r.recursoId);
      if (recurso.renglones?.length && !original?.porcentajeDe) {
        abrir(recurso.renglones, factor * r.cantidad, [...ruta, r.recursoId]);
      } else {
        sumar(r.recursoId, r.tipo, factor * r.cantidad, factor * r.importe);
      }
    }
  };
  abrir(renglones, cantidad, []);
  return [...acumulado.values()].map((f) => ({
    ...f,
    cantidad: redondear(f.cantidad, 4),
    importe: redondear(f.importe),
  }));
}
