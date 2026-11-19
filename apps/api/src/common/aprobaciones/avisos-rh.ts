import type { EstadoSolicitudRh, NotificationType, TipoSolicitudRh } from '@prisma/client';

/**
 * Tipo de aviso de cada solicitud de RH. Antes se armaba con plantillas (`RH_${tipo}_PENDIENTE`) que
 * TypeScript no podía revisar y ninguno existía en el enum: Prisma rechazaba el aviso en silencio.
 */
export const AVISO_RH_PENDIENTE: Record<TipoSolicitudRh, NotificationType> = {
  CAMBIO_PUESTO: 'RH_CAMBIO_PUESTO_PENDIENTE',
  CAMBIO_JEFE: 'RH_CAMBIO_JEFE_PENDIENTE',
  AJUSTE_SUELDO: 'RH_AJUSTE_SUELDO_PENDIENTE',
  VACACIONES: 'RH_VACACIONES_PENDIENTE',
  PERMISO: 'RH_PERMISO_PENDIENTE',
};

export const AVISO_RH_DECISION: Record<Extract<EstadoSolicitudRh, 'APROBADA' | 'RECHAZADA'>, NotificationType> = {
  APROBADA: 'RH_SOLICITUD_APROBADA',
  RECHAZADA: 'RH_SOLICITUD_RECHAZADA',
};
