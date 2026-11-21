/**
 * Reglas del kilometraje de una unidad: contra el último registro, contra la distancia de la
 * actividad y contra lo que leyó la IA. Puras: la base de datos la consulta el servicio.
 *
 * Nada de esto bloquea por sospecha: solo un odómetro que retrocede es un error. Lo demás son
 * alertas para Liz, con el número y el motivo, para que ella decida.
 */
import { distanciaMetros } from '../attendance/asistencia-confiable.js';

/** Lo que una lectura (de la IA o a mano) puede quedarse atrás del último registro sin ser error. */
export const TOLERANCIA_KM_ATRAS = 2;
/** Más que esto entre la última devolución y la nueva salida = alguien la usó sin registrarla. */
export const UMBRAL_KM_SIN_REGISTRO = 15;
/** De línea recta a carretera. */
export const FACTOR_CARRETERA = 1.3;

export type RegistroKm = { km: number; at: Date | string | null; origen: string };

/** KM_MENOR: entró un km menor al último registro (autorizado por Liz, o con el interruptor apagado). */
export type TipoAlertaKm = 'KM_SIN_REGISTRO' | 'KM_DE_MAS' | 'LECTURA_CORREGIDA' | 'KM_MENOR';

export type AlertaKm = { tipo: TipoAlertaKm; km: number | null; mensaje: string; en: string };

const fmtFecha = (d: Date) =>
  d.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

const fmtKm = (n: number) => n.toLocaleString('es-MX');

const instante = (v: Date | string | null): number | null => {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** El registro más reciente; a igual hora (o sin hora), el de más km. */
export function ultimoRegistroKm(registros: ReadonlyArray<RegistroKm | null | undefined>): RegistroKm | null {
  let mejor: RegistroKm | null = null;
  for (const r of registros) {
    if (!r || !Number.isFinite(r.km) || r.km < 0) continue;
    if (!mejor) {
      mejor = r;
      continue;
    }
    const a = instante(r.at);
    const b = instante(mejor.at);
    if ((a ?? -Infinity) > (b ?? -Infinity) || ((a ?? -Infinity) === (b ?? -Infinity) && r.km > mejor.km)) mejor = r;
  }
  return mejor;
}

/**
 * Una salida contra el último kilometraje conocido de la unidad. Retroceder es error (la foto o el
 * número están mal); un salto grande es alerta de uso sin registrar.
 */
export function revisarKmContraUltimo(
  km: number,
  ultimo: RegistroKm | null,
  ahora: Date = new Date(),
): { error: string | null; alertas: AlertaKm[] } {
  if (!ultimo) return { error: null, alertas: [] };
  const cuando = instante(ultimo.at);
  const fecha = cuando != null ? `, ${fmtFecha(new Date(cuando))}` : '';
  if (km < ultimo.km - TOLERANCIA_KM_ATRAS) {
    return {
      error: `El kilometraje (${fmtKm(km)} km) es menor al último registro de la unidad (${fmtKm(ultimo.km)} km${fecha}). Revisa la foto o corrige el número.`,
      alertas: [],
    };
  }
  const diferencia = km - ultimo.km;
  if (diferencia > UMBRAL_KM_SIN_REGISTRO) {
    return {
      error: null,
      alertas: [
        {
          tipo: 'KM_SIN_REGISTRO',
          km: diferencia,
          mensaje: `${fmtKm(diferencia)} km sin registro desde el último (${fmtKm(ultimo.km)} km${fecha}).`,
          en: ahora.toISOString(),
        },
      ],
    };
  }
  return { error: null, alertas: [] };
}

type Punto = { lat: number; lng: number };

function aPunto(v: unknown): Punto | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const lat = Number(o['lat'] ?? o['latitude']);
  const lng = Number(o['lng'] ?? o['longitude']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Ida y vuelta estimada por carretera entre la oficina y el destino de la actividad. */
export function kmEsperadosIdaVuelta(origen: unknown, destino: unknown): number | null {
  const a = aPunto(origen);
  const b = aPunto(destino);
  if (!a || !b) return null;
  const metros = distanciaMetros({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });
  const km = (metros / 1000) * 2 * FACTOR_CARRETERA;
  return Math.max(1, Math.round(km));
}

/** Al devolver: ¿recorrió mucho más de lo que pide la actividad? */
export function revisarKmRecorridos(
  recorridos: number,
  esperados: number | null | undefined,
  ahora: Date = new Date(),
): AlertaKm | null {
  if (!esperados || esperados <= 0 || !Number.isFinite(recorridos)) return null;
  const tope = Math.max(esperados * 1.5, esperados + 25);
  if (recorridos <= tope) return null;
  return {
    tipo: 'KM_DE_MAS',
    km: recorridos,
    mensaje: `Recorrió ${fmtKm(recorridos)} km y la actividad pide unos ${fmtKm(esperados)} km de ida y vuelta.`,
    en: ahora.toISOString(),
  };
}

/** La persona cambió lo que leyó la IA: Liz ve las dos lecturas. */
export function alertaLecturaCorregida(
  ia: { odometroKm: number | null; combustiblePct: number | null } | null,
  confirmado: { odometroKm: number | null; combustiblePct: number | null },
  ahora: Date = new Date(),
): AlertaKm | null {
  if (!ia) return null;
  const difKm = ia.odometroKm != null && confirmado.odometroKm != null ? Math.abs(ia.odometroKm - confirmado.odometroKm) : 0;
  const difGas =
    ia.combustiblePct != null && confirmado.combustiblePct != null ? Math.abs(ia.combustiblePct - confirmado.combustiblePct) : 0;
  if (difKm <= 1 && difGas <= 12) return null;
  const partes: string[] = [];
  if (difKm > 1) partes.push(`km: la IA leyó ${fmtKm(ia.odometroKm!)}, se confirmó ${fmtKm(confirmado.odometroKm!)}`);
  if (difGas > 12) partes.push(`gasolina: la IA leyó ${ia.combustiblePct}%, se confirmó ${confirmado.combustiblePct}%`);
  return { tipo: 'LECTURA_CORREGIDA', km: confirmado.odometroKm, mensaje: `Lectura corregida a mano (${partes.join('; ')}).`, en: ahora.toISOString() };
}
