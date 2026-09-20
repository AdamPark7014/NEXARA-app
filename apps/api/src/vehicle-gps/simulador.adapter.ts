/**
 * Proveedor «simulador»: mueve los vehículos por Puebla para que el mapa se
 * pueda ver, revisar y aprobar antes de que exista un solo rastreador montado.
 *
 * Todo lo que sale de aquí está marcado `demo: true`, y la pantalla lo rotula
 * «Datos de demostración». No se mezcla con datos reales: en cuanto el
 * proveedor sea `hikvision`, este adaptador deja de usarse.
 */

import { quitarRepetidos, type ProveedorGps, type PuntoGps } from './posiciones.js';

/** Centro de Puebla. Las rutas de demostración giran alrededor de aquí. */
export const CENTRO_DEMO = { lat: 19.0414, lng: -98.2063 };

/** Un punto cada 2 minutos: suficiente para dibujar un recorrido creíble. */
export const PASO_DEMO_MS = 2 * 60_000;

/** Cuánto recorrido inventa hacia atrás cuando no hay nada guardado. */
export const HISTORIA_DEMO_MS = 3 * 3_600_000;

/**
 * Número estable a partir de un texto: el mismo vehículo sale siempre por la
 * misma calle, corrida tras corrida. Sin esto la demo parpadea.
 */
export function semilla(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 100_000) / 100_000;
}

/**
 * Posición de un vehículo en un instante: una órbita lenta alrededor del
 * centro, con radio y fase propios. No pretende ser tráfico real, solo algo
 * que se mueva de forma coherente en el mapa y en el replay del día.
 */
export function posicionDemo(dispositivoId: string, at: Date): PuntoGps {
  const s = semilla(dispositivoId);
  const radio = 0.012 + s * 0.03;
  const velocidadAngular = (2 * Math.PI) / (55 * 60_000 + s * 40 * 60_000);
  const angulo = s * 2 * Math.PI + at.getTime() * velocidadAngular;

  const lat = CENTRO_DEMO.lat + radio * Math.sin(angulo);
  const lng = CENTRO_DEMO.lng + radio * Math.cos(angulo) * 1.05;

  // El rumbo es la tangente de la órbita; la velocidad, el arco por hora.
  const rumbo = Math.round(((90 - (angulo * 180) / Math.PI) % 360 + 360) % 360);
  const kmPorRadian = radio * 111;
  const velocidadKmh = Math.round(kmPorRadian * velocidadAngular * 3_600_000 * 100) / 100;

  return {
    dispositivoId,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    velocidadKmh: Math.min(80, Math.abs(velocidadKmh) * 60),
    rumbo,
    at,
  };
}

export class SimuladorGpsProvider implements ProveedorGps {
  readonly nombre = 'simulador';
  readonly demo = true;
  readonly configurado = true;

  constructor(private readonly ahora: () => Date = () => new Date()) {}

  /**
   * Rellena desde `desde` hasta ahora, paso a paso. Si no hay nada guardado
   * inventa las últimas horas para que el replay del día tenga qué mostrar.
   */
  async puntosRecientes(dispositivos: string[], desde: Date | null): Promise<PuntoGps[]> {
    const fin = this.ahora().getTime();
    const inicio = desde ? desde.getTime() + PASO_DEMO_MS : fin - HISTORIA_DEMO_MS;
    if (dispositivos.length === 0 || inicio > fin) return [];

    const puntos: PuntoGps[] = [];
    for (const dispositivoId of dispositivos) {
      for (let t = inicio; t <= fin; t += PASO_DEMO_MS) {
        // Se cuadra el instante al paso para que dos corridas seguidas generen
        // exactamente la misma llave y la ingesta sea idempotente de verdad.
        const cuadrado = Math.floor(t / PASO_DEMO_MS) * PASO_DEMO_MS;
        puntos.push(posicionDemo(dispositivoId, new Date(cuadrado)));
      }
    }
    return quitarRepetidos(puntos);
  }
}
