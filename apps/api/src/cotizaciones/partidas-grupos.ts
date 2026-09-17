/**
 * Agrupación de partidas de la «Propuesta técnica»: Equipos / Materiales / Mano de obra.
 *
 * La propuesta modelo lista 24 conceptos seguidos —cámaras, tornillos y servicios de instalación en
 * la misma columna— y el cliente no puede ver cuánto es equipo y cuánto es trabajo. El contrato pide
 * los tres grupos con su subtotal; además, saber si hay mano de obra es lo que decide los términos
 * (solo suministro vs suministro e instalación), así que el grupo no es adorno.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */

export const GRUPOS = ['EQUIPOS', 'MATERIALES', 'MANO_DE_OBRA'] as const;
export type GrupoPartida = (typeof GRUPOS)[number];

export const ETIQUETA_GRUPO: Record<GrupoPartida, string> = {
  EQUIPOS: 'Equipos',
  MATERIALES: 'Materiales',
  MANO_DE_OBRA: 'Mano de obra',
};

export type PartidaAgrupable = {
  /** Grupo explícito (lo que eligió quien cotiza). Manda sobre cualquier heurística. */
  grupo?: string | null;
  category?: string | null;
  name?: string | null;
  description?: string | null;
  unit?: string | null;
  qty?: number | null;
  unitPrice?: number | null;
  laborHours?: number | null;
  laborRate?: number | null;
  lineTotal?: number | null;
};

function sinAcentos(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const RE_MANO_DE_OBRA =
  /(mano de obra|instalacion|instalacio|reinstalacion|desinstalacion|desmontaje|puesta a punto|puesta en marcha|configuracion|programacion|capacitacion|diagnostico|levantamiento|servicio de|habilitacion|reubicacion|mantenimiento|supervision|flete|viatico)/;

const RE_MATERIAL =
  /(material|insumo|consumible|cable|bobina|grapa|taquete|tornillo|canaliz|tuberia|tubo|conector|jack|adaptador|balun|transceptor|caja de|caja derivacion|abrazadera|cinta|ducto|manguera|silicon|pija|cople|herraje|kit de \d+|etiqueta)/;

/** Grupo de una partida: lo elegido por quien cotiza, o deducido de la unidad y el texto. */
export function grupoDePartida(partida: PartidaAgrupable): GrupoPartida {
  const explicito = String(partida.grupo ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if ((GRUPOS as readonly string[]).includes(explicito)) return explicito as GrupoPartida;

  const unidad = sinAcentos(partida.unit);
  const texto = `${sinAcentos(partida.category)} ${sinAcentos(partida.name)} ${sinAcentos(partida.description)}`;

  if (Number(partida.laborHours) > 0 && Number(partida.laborRate) > 0) return 'MANO_DE_OBRA';
  // La unidad manda sobre el texto: «insumos materiales para puesta a punto de CCTV» son insumos,
  // aunque la frase mencione la puesta a punto.
  if (/servicio|jornada|hora|hh/.test(unidad)) return 'MANO_DE_OBRA';
  if (/insumo|material|lote|rollo|metro|ml\b/.test(unidad)) return 'MATERIALES';
  if (RE_MANO_DE_OBRA.test(texto)) return 'MANO_DE_OBRA';
  if (RE_MATERIAL.test(texto)) return 'MATERIALES';
  return 'EQUIPOS';
}

/** Importe de la partida: el `lineTotal` guardado o, si falta, cantidad × precio + mano de obra. */
export function importeDePartida(partida: PartidaAgrupable): number {
  const guardado = Number(partida.lineTotal);
  if (Number.isFinite(guardado) && guardado !== 0) return guardado;
  const producto = (Number(partida.qty) || 0) * (Number(partida.unitPrice) || 0);
  const obra = (Number(partida.laborHours) || 0) * (Number(partida.laborRate) || 0);
  return producto + obra;
}

export type GrupoConPartidas<T extends PartidaAgrupable> = {
  grupo: GrupoPartida;
  etiqueta: string;
  partidas: T[];
  subtotal: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Partidas en los tres grupos, en orden Equipos → Materiales → Mano de obra, sin grupos vacíos. */
export function agruparPartidas<T extends PartidaAgrupable>(partidas: T[]): Array<GrupoConPartidas<T>> {
  return GRUPOS.map((grupo) => {
    const propias = (partidas || []).filter((p) => grupoDePartida(p) === grupo);
    return {
      grupo,
      etiqueta: ETIQUETA_GRUPO[grupo],
      partidas: propias,
      subtotal: round2(propias.reduce((acc, p) => acc + importeDePartida(p), 0)),
    };
  }).filter((g) => g.partidas.length > 0);
}

/** Subtotal por grupo (siempre los tres, para KPIs y para la web). */
export function totalesPorGrupo(partidas: PartidaAgrupable[]): Record<GrupoPartida, number> {
  const out: Record<GrupoPartida, number> = { EQUIPOS: 0, MATERIALES: 0, MANO_DE_OBRA: 0 };
  for (const partida of partidas || []) {
    out[grupoDePartida(partida)] += importeDePartida(partida);
  }
  return { EQUIPOS: round2(out.EQUIPOS), MATERIALES: round2(out.MATERIALES), MANO_DE_OBRA: round2(out.MANO_DE_OBRA) };
}

/**
 * ¿La cotización cobra instalación?
 *
 * Es la pregunta que decide los términos: si hay una sola partida de mano de obra, la propuesta no
 * puede decir «solo suministro».
 */
export function incluyeInstalacion(partidas: PartidaAgrupable[]): boolean {
  return (partidas || []).some((p) => grupoDePartida(p) === 'MANO_DE_OBRA');
}
