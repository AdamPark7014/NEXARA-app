/**
 * Textos de los avisos que la plataforma manda por el chat (mensaje directo de quien causó el aviso).
 * Puro, para probarlo; la liga es el token de siempre `[etiqueta](/erp/…)`, que el chat pinta como tarjeta.
 */
export type ActividadAviso = { id: number; anNumber?: string | null; titulo: string };

const etiqueta = (a: ActividadAviso) => `${a.anNumber ? `${a.anNumber} · ` : ''}${a.titulo}`.replace(/[[\]]/g, '').slice(0, 120);
export const ligaActividad = (a: ActividadAviso, sub = '') => `[${etiqueta(a)}](/erp/actividades/${a.id}${sub})`;

/** Actividad autoasignada o del mismo día: aviso al supervisor (Luis). */
export function avisoActividadNoProgramada(
  a: ActividadAviso,
  creadorNombre: string,
  motivo: 'autoasignada' | 'mismo_dia',
): string {
  const que =
    motivo === 'autoasignada'
      ? 'se autoasignó una actividad'
      : 'creó una actividad para ejecutar hoy';
  return `📌 ${creadorNombre} ${que}: ${ligaActividad(a)}. Revísala y aprueba cuando corresponda.`;
}

/** Evidencia lista para revisión: aviso al revisor con liga directa. */
export function avisoEvidenciaPorRevisar(a: ActividadAviso, quienNombre: string): string {
  return `📷 ${quienNombre} envió evidencias de ${ligaActividad(a, '/evidencias')} listas para tu revisión.`;
}

export function avisoRevision(
  a: ActividadAviso,
  decision: 'APROBADA' | 'DEVUELTA_PASOS' | 'DEVUELTA_TODO',
  notas: string | null | undefined,
  calificacion: number | null | undefined,
): string {
  const nota = (notas || '').trim();
  const conNota = nota && nota !== 'Sin observaciones' ? ` Observaciones: ${nota.slice(0, 600)}` : '';
  if (decision === 'APROBADA') {
    return `✅ Aprobé tu evidencia de ${ligaActividad(a)}${calificacion ? ` con ${calificacion} de 5` : ''}.${conNota}`;
  }
  const que = decision === 'DEVUELTA_TODO' ? 'para rehacerla completa' : 'para corregir algunos pasos';
  return `↩️ Te devolví la evidencia de ${ligaActividad(a, '/evidencias')} ${que}.${conNota} Corrígela hoy para que cuente a tiempo.`;
}

export function avisoIncidencia(a: ActividadAviso, tipo: string, severidad: string, descripcion: string): string {
  return `⚠️ Reporté una incidencia ${severidad.toLowerCase()} (${tipo.replace(/_/g, ' ').toLowerCase()}) en ${ligaActividad(a)}: ${descripcion.trim().slice(0, 600)}`;
}

export function avisoNoCumplida(a: ActividadAviso, causa: string, limite: Date | null): string {
  const cuando = limite
    ? ` El límite era el ${new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(limite)}.`
    : '';
  return `⛔ ${ligaActividad(a)} quedó como «No cumplida»: ${causa}.${cuando} Si hubo un motivo, explícalo en la actividad.`;
}
