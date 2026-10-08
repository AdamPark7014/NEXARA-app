/**
 * Teléfonos con la ubicación apagada o sin permiso durante la jornada.
 *
 * Adam (08-10): «que nos registre si hay algún dispositivo con la ubicación apagada». Solo se
 * guardan cambios de estado (`location_status_events`): APAGADA o SIN_PERMISO abren un tramo y
 * ENCENDIDA lo cierra. Tres fuentes: la app avisa al cambiar (`POST attendance/estado-ubicacion`),
 * una checada sin ubicación con su diagnóstico (`ubicacionFalla`) y un punto de GPS que llega,
 * que prueba que ya está encendida.
 */
import type { PrismaService } from '../prisma/prisma.service.js';
import { workDateKey } from '../common/time/workday.js';

export const ESTADOS_UBICACION = ['APAGADA', 'SIN_PERMISO', 'ENCENDIDA'] as const;
export type EstadoUbicacion = (typeof ESTADOS_UBICACION)[number];
export type FuenteEstadoUbicacion = 'APP' | 'CHECADA' | 'GPS';

export function normalizarEstadoUbicacion(valor: unknown): EstadoUbicacion | null {
  const v = String(valor ?? '').trim().toUpperCase();
  return (ESTADOS_UBICACION as readonly string[]).includes(v) ? (v as EstadoUbicacion) : null;
}

/** Lo que una checada sin coordenadas dice del teléfono. Señal o error no son «apagada». */
export function estadoPorFalla(falla: unknown): EstadoUbicacion | null {
  const v = String(falla ?? '').trim().toUpperCase();
  if (v === 'UBICACION_APAGADA') return 'APAGADA';
  if (v === 'PERMISO_NEGADO') return 'SIN_PERMISO';
  return null;
}

/**
 * ¿Se guarda este estado, dado el último que hay de la persona?
 *
 * ENCENDIDA solo cierra un tramo abierto: sin tramo abierto es ruido (cada punto de GPS la
 * mandaría). APAGADA o SIN_PERMISO se guardan si cambian, y también si el último aviso igual era
 * de otro día: así cada jornada muestra su propio tramo.
 */
export function debeRegistrarse(
  nuevo: EstadoUbicacion,
  ultimo: { estado: string; at: Date } | null,
  ahora: Date,
): boolean {
  if (nuevo === 'ENCENDIDA') return Boolean(ultimo && ultimo.estado !== 'ENCENDIDA');
  if (!ultimo) return true;
  if (ultimo.estado !== nuevo) return true;
  return workDateKey(ultimo.at) !== workDateKey(ahora);
}

/** Un tramo sin ubicación, recortado al rango pedido. `hasta` null: sigue apagada. */
export type TramoSinUbicacion = {
  estado: 'APAGADA' | 'SIN_PERMISO';
  desde: string;
  hasta: string | null;
  minutos: number;
};

/**
 * Tramos sin ubicación entre `desde` y `hasta`, a partir de los eventos (en cualquier orden;
 * conviene incluir el último anterior a `desde` para saber si ya venía apagada). Un tramo que
 * nadie cerró queda con `hasta: null` y cuenta sus minutos hasta `ahora` (o el fin del rango).
 */
export function tramosSinUbicacion(
  eventos: Array<{ estado: string; at: Date }>,
  desde: Date,
  hasta: Date,
  ahora: Date = new Date(),
): TramoSinUbicacion[] {
  const orden = [...eventos].sort((a, b) => a.at.getTime() - b.at.getTime());
  const tramos: TramoSinUbicacion[] = [];
  const agregar = (estado: 'APAGADA' | 'SIN_PERMISO', inicio: Date, fin: Date | null) => {
    if (fin && fin <= desde) return; // se cerró antes del rango
    const ini = inicio < desde ? desde : inicio;
    const tope = fin ?? (ahora < hasta ? ahora : hasta);
    const finEfectivo = tope > hasta ? hasta : tope;
    if (finEfectivo < ini) return;
    tramos.push({
      estado,
      desde: ini.toISOString(),
      hasta: fin && fin <= hasta ? fin.toISOString() : null,
      minutos: Math.round((finEfectivo.getTime() - ini.getTime()) / 60000),
    });
  };
  let abierto = null as { estado: 'APAGADA' | 'SIN_PERMISO'; desde: Date } | null;
  for (const e of orden) {
    if (e.at > hasta) break;
    const estado = normalizarEstadoUbicacion(e.estado);
    if (!estado) continue;
    if (estado === 'ENCENDIDA') {
      if (abierto) agregar(abierto.estado, abierto.desde, e.at);
      abierto = null;
      continue;
    }
    if (abierto?.estado === estado) continue;
    if (abierto) agregar(abierto.estado, abierto.desde, e.at);
    abierto = { estado, desde: e.at };
  }
  if (abierto) agregar(abierto.estado, abierto.desde, null);
  return tramos;
}

/**
 * Guarda el estado si cambia algo (ver `debeRegistrarse`). Nunca lanza: avisar de la ubicación
 * no puede tumbar una checada ni un punto de GPS.
 */
export async function registrarEstadoUbicacion(
  prisma: PrismaService,
  params: {
    userId: number;
    companyId: number;
    estado: EstadoUbicacion;
    fuente: FuenteEstadoUbicacion;
    origen?: string | null;
    deviceInfo?: string | null;
    ahora?: Date;
  },
): Promise<boolean> {
  const ahora = params.ahora ?? new Date();
  try {
    const ultimo = await prisma.locationStatusEvent.findFirst({
      where: { userId: params.userId, companyId: params.companyId },
      orderBy: { at: 'desc' },
      select: { estado: true, at: true },
    });
    if (!debeRegistrarse(params.estado, ultimo, ahora)) return false;
    await prisma.locationStatusEvent.create({
      data: {
        userId: params.userId,
        companyId: params.companyId,
        estado: params.estado,
        fuente: params.fuente,
        origen: params.origen ?? null,
        deviceInfo: params.deviceInfo ? params.deviceInfo.slice(0, 255) : null,
        at: ahora,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Tramos por persona en un rango, para Asistencias. Incluye el último aviso anterior al rango. */
export async function tramosSinUbicacionDe(
  prisma: PrismaService,
  params: { companyId: number; userIds: number[]; desde: Date; hasta: Date; ahora?: Date },
): Promise<Map<number, TramoSinUbicacion[]>> {
  const out = new Map<number, TramoSinUbicacion[]>();
  if (!params.userIds.length) return out;
  try {
    // Un día antes basta para saber si ya venía apagada desde la jornada anterior.
    const antes = new Date(params.desde.getTime() - 24 * 60 * 60 * 1000);
    const eventos = await prisma.locationStatusEvent.findMany({
      where: { companyId: params.companyId, userId: { in: params.userIds }, at: { gte: antes, lte: params.hasta } },
      orderBy: { at: 'asc' },
      select: { userId: true, estado: true, at: true },
    });
    const porUsuario = new Map<number, Array<{ estado: string; at: Date }>>();
    for (const e of eventos) {
      const lista = porUsuario.get(e.userId) ?? [];
      lista.push({ estado: e.estado, at: e.at });
      porUsuario.set(e.userId, lista);
    }
    for (const [userId, lista] of porUsuario) {
      const tramos = tramosSinUbicacion(lista, params.desde, params.hasta, params.ahora);
      if (tramos.length) out.set(userId, tramos);
    }
  } catch {
    // Tabla aún sin migrar o error de lectura: Asistencias se ve igual, sin la columna nueva.
  }
  return out;
}
