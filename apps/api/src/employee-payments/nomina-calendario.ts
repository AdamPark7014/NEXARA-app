/**
 * Calendario de nómina de una empresa: cuándo cierra cada periodo.
 *
 * El sistema guardaba periodos como fechas libres y no conocía la quincena; Christian paga quincenal
 * («1QNA/2QNA»). La cadencia vive en la configuración de cada empresa (`SystemSetting`
 * `payroll.schedule`, JSON `{"frecuencia":"quincenal"}`); sin ella no se avisa nada.
 *
 * Todo trabaja con días calendario `AAAA-MM-DD` (los de México que ya calcula `common/time/workday`),
 * sin horas ni zonas: por eso es puro y fácil de probar.
 *
 *  · quincenal: 1–15 (corte el 15) y 16–fin de mes (corte el último día)
 *  · mensual:   1–fin de mes
 *  · semanal:   de un día de corte al siguiente (por omisión viernes; `diaSemanaCorte` 0=domingo…6=sábado)
 */
export type FrecuenciaNomina = 'quincenal' | 'semanal' | 'mensual';

export type ConfigNomina = { frecuencia: FrecuenciaNomina; diaSemanaCorte: number };

export type PeriodoNomina = {
  desde: string;
  hasta: string;
  /** Último día del periodo: cuando «cierra». */
  corte: string;
  etiqueta: string;
};

export const NOMINA_SETTING_KEY = 'payroll.schedule';

const FRECUENCIAS: FrecuenciaNomina[] = ['quincenal', 'semanal', 'mensual'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIA_MS = 86_400_000;

/** Valor guardado → configuración sana, o `null` si no hay cadencia definida (no se avisa nada). */
export function parsearConfigNomina(raw: string | null | undefined): ConfigNomina | null {
  if (raw == null || String(raw).trim() === '') return null;
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const frecuencia = String(o['frecuencia'] ?? '').trim().toLowerCase() as FrecuenciaNomina;
  if (!FRECUENCIAS.includes(frecuencia)) return null;
  const dia = Number(o['diaSemanaCorte']);
  return { frecuencia, diaSemanaCorte: Number.isInteger(dia) && dia >= 0 && dia <= 6 ? dia : 5 };
}

type Ymd = { y: number; m: number; d: number };

function leer(iso: string): Ymd {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Fecha inválida: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
const dia = ({ y, m, d }: Ymd): number => Date.UTC(y, m - 1, d);
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
const ultimoDia = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, '0');
const fecha = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Días entre dos fechas (`b` − `a`). */
export function diasEntre(a: string, b: string): number {
  return Math.round((dia(leer(b)) - dia(leer(a))) / DIA_MS);
}

const dmy = (s: string) => {
  const { y, m, d } = leer(s);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};

function periodoQuincenal(y: number, m: number, segunda: boolean): PeriodoNomina {
  const fin = ultimoDia(y, m);
  const desde = segunda ? 16 : 1;
  const hasta = segunda ? fin : 15;
  return {
    desde: fecha(y, m, desde),
    hasta: fecha(y, m, hasta),
    corte: fecha(y, m, hasta),
    etiqueta: `${segunda ? '2.ª' : '1.ª'} quincena de ${MESES[m - 1]} de ${y} (${desde}–${hasta})`,
  };
}

function periodoMensual(y: number, m: number): PeriodoNomina {
  const fin = ultimoDia(y, m);
  return { desde: fecha(y, m, 1), hasta: fecha(y, m, fin), corte: fecha(y, m, fin), etiqueta: `${MESES[m - 1]} de ${y}` };
}

function periodoSemanal(corte: string): PeriodoNomina {
  const desde = iso(dia(leer(corte)) - 6 * DIA_MS);
  return { desde, hasta: corte, corte, etiqueta: `semana del ${dmy(desde)} al ${dmy(corte)}` };
}

/** El último periodo cuyo corte ya llegó (o es hoy). */
export function periodoQueCierra(hoy: string, cfg: ConfigNomina): PeriodoNomina {
  const { y, m, d } = leer(hoy);
  if (cfg.frecuencia === 'quincenal') {
    const fin = ultimoDia(y, m);
    if (d === fin) return periodoQuincenal(y, m, true);
    if (d >= 15) return periodoQuincenal(y, m, false);
    return m === 1 ? periodoQuincenal(y - 1, 12, true) : periodoQuincenal(y, m - 1, true);
  }
  if (cfg.frecuencia === 'mensual') {
    if (d === ultimoDia(y, m)) return periodoMensual(y, m);
    return m === 1 ? periodoMensual(y - 1, 12) : periodoMensual(y, m - 1);
  }
  const dow = new Date(dia({ y, m, d })).getUTCDay();
  const atras = (dow - cfg.diaSemanaCorte + 7) % 7;
  return periodoSemanal(iso(dia({ y, m, d }) - atras * DIA_MS));
}

/** El siguiente corte (hoy cuenta) y los días que faltan. */
export function proximoCorte(hoy: string, cfg: ConfigNomina): { periodo: PeriodoNomina; dias: number } {
  const { y, m, d } = leer(hoy);
  let periodo: PeriodoNomina;
  if (cfg.frecuencia === 'quincenal') {
    periodo = periodoQuincenal(y, m, d > 15);
  } else if (cfg.frecuencia === 'mensual') {
    periodo = periodoMensual(y, m);
  } else {
    const dow = new Date(dia({ y, m, d })).getUTCDay();
    const faltan = (cfg.diaSemanaCorte - dow + 7) % 7;
    periodo = periodoSemanal(iso(dia({ y, m, d }) + faltan * DIA_MS));
  }
  return { periodo, dias: diasEntre(hoy, periodo.corte) };
}

/**
 * El periodo que cerró hace poco (a partir del día siguiente al corte y hasta `ventanaDias` después),
 * para avisar «tu pre-nómina está lista». `null` si no cerró ninguno en esa ventana.
 */
export function periodoRecienCerrado(hoy: string, cfg: ConfigNomina, ventanaDias = 3): PeriodoNomina | null {
  const p = periodoQueCierra(hoy, cfg);
  const desdeElCorte = diasEntre(p.corte, hoy);
  return desdeElCorte >= 1 && desdeElCorte <= ventanaDias ? p : null;
}
