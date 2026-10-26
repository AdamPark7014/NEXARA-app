/**
 * Huecos del recorrido de una jornada: tramos sin ningún punto de GPS.
 *
 * Adam (23-10-2026): la línea de tiempo tiene que decir claramente «Sin ubicación de 08:20 a 13:12»
 * en vez de saltar de un punto a otro como si nada. El GPS de jornada toma un punto cada 30 min;
 * un tramo de más de {@link UMBRAL_HUECO_MIN} min sin punto (la cadencia más un margen, porque el
 * teléfono puede tardar unos minutos en despertar) es un hueco.
 *
 * Sin React: se prueba en `recorrido-huecos.spec.ts`.
 */

/** 30 min de cadencia + 10 de margen. */
export const UMBRAL_HUECO_MIN = 40;

export type HuecoRecorrido = {
  /** Último momento con ubicación conocida (o la entrada). */
  desde: string;
  /** Siguiente punto (o la salida); null = sigue sin ubicación ahora mismo. */
  hasta: string | null;
  minutos: number;
};

const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * @param puntos horas ISO de los puntos del día (en cualquier orden).
 * @param entrada hora de la entrada; sin ella se empieza en el primer punto.
 * @param salida hora de la salida; los puntos posteriores no cuentan.
 * @param enJornada sin salida y con la jornada abierta: el tramo final llega hasta `ahora`.
 */
export function huecosDelRecorrido(params: {
  puntos: Array<string | null | undefined>;
  entrada?: string | null;
  salida?: string | null;
  enJornada?: boolean;
  ahora?: number;
  umbralMin?: number;
}): HuecoRecorrido[] {
  const umbral = (params.umbralMin ?? UMBRAL_HUECO_MIN) * 60_000;
  const ahora = params.ahora ?? Date.now();
  const entrada = ms(params.entrada);
  const salida = ms(params.salida);

  const tiempos = params.puntos
    .map((p) => ms(p))
    .filter((t): t is number => t != null)
    // Un minuto de tolerancia antes de la entrada (reloj del teléfono); nada después de la salida.
    .filter((t) => (entrada == null || t >= entrada - 60_000) && (salida == null || t <= salida))
    .sort((a, b) => a - b);

  const inicio = entrada ?? tiempos[0];
  if (inicio == null) return [];
  const marcas = [inicio, ...tiempos.filter((t) => t > inicio)];

  const out: HuecoRecorrido[] = [];
  const agregar = (a: number, b: number | null, fin: number) => {
    if (fin - a <= umbral) return;
    out.push({
      desde: new Date(a).toISOString(),
      hasta: b == null ? null : new Date(b).toISOString(),
      minutos: Math.round((fin - a) / 60_000),
    });
  };

  for (let i = 1; i < marcas.length; i += 1) agregar(marcas[i - 1]!, marcas[i]!, marcas[i]!);

  const ultimo = marcas[marcas.length - 1]!;
  if (salida != null) {
    if (salida > ultimo) agregar(ultimo, salida, salida);
  } else if (params.enJornada && ahora > ultimo) {
    agregar(ultimo, null, ahora);
  }
  return out;
}
