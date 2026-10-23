/**
 * Triage de tickets con Claude (solo si la bandera `product.ai.triage` está encendida). Mismas
 * prioridades y tipos que las reglas de `ai-triage.service.ts`: la IA solo afina la
 * clasificación y el resumen. Modelo y parámetros medidos con el eval (`src/ai/eval/`).
 */
export const PRIORIDADES_TRIAGE = ['P0', 'P1', 'P2', 'P3'] as const;
export const TIPOS_TRIAGE = ['EMERGENCIA', 'CORRECTIVO', 'PREVENTIVO', 'INSTALACION', 'OTRO'] as const;

export type ClasificacionTriage = {
  priority: (typeof PRIORIDADES_TRIAGE)[number];
  ticketType: (typeof TIPOS_TRIAGE)[number];
  summary: string;
};

export const ESQUEMA_TRIAGE: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['priority', 'ticketType', 'summary'],
  properties: {
    priority: { type: 'string', enum: [...PRIORIDADES_TRIAGE] },
    ticketType: { type: 'string', enum: [...TIPOS_TRIAGE] },
    summary: { type: 'string' },
  },
};

export const PROMPT_TRIAGE = `Clasificas solicitudes de servicio de NEXARA, empresa mexicana de seguridad electrónica (CCTV, control de acceso, redes, alarmas, servicio de campo). Recibes el título, la descripción y el cliente de un ticket.

- priority: P0 si el sistema está caído o sin servicio, hay robo, incendio o piden atención urgente; P1 si una falla afecta la operación (cámara, DVR/NVR, alarma, acceso o red que no funciona); P2 para trabajo normal sin urgencia (instalaciones, cambios, ajustes); P3 para preventivos o rutina programada.
- Si el texto dice que el cliente es VIP o tiene un SLA o penalización estrictos, sube la prioridad un nivel.
- ticketType: EMERGENCIA (algo caído o urgente), CORRECTIVO (falla), PREVENTIVO (mantenimiento programado), INSTALACION (equipo o sitio nuevo), OTRO (cotización, trámite, duda).
- summary: una frase de máximo 160 caracteres con qué pasa y dónde, en español, sin inventar datos.`;

export const CONFIG_TRIAGE = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 400,
  timeoutMs: 12_000,
};

export type TicketTriage = { title: string; description?: string; clientName?: string };

/** La petición completa a Claude (el servicio y el eval mandan exactamente lo mismo). */
export function peticionTriage(ticket: TicketTriage) {
  const usuario = [
    `Título: ${String(ticket.title ?? '').trim()}`,
    `Descripción: ${String(ticket.description ?? '').trim() || '(sin descripción)'}`,
    ticket.clientName ? `Cliente: ${ticket.clientName}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    sistema: [PROMPT_TRIAGE],
    usuario,
    esquema: ESQUEMA_TRIAGE,
    modelo: CONFIG_TRIAGE.modelo,
    esfuerzo: CONFIG_TRIAGE.esfuerzo,
    pensar: CONFIG_TRIAGE.pensar,
    maxTokens: CONFIG_TRIAGE.maxTokens,
    timeoutMs: CONFIG_TRIAGE.timeoutMs,
  };
}

/** Acepta solo valores válidos; un campo raro deja el de las reglas. */
export function limpiarTriage(datos: Partial<ClasificacionTriage> | null | undefined): Partial<ClasificacionTriage> {
  const salida: Partial<ClasificacionTriage> = {};
  if (datos?.priority && (PRIORIDADES_TRIAGE as readonly string[]).includes(datos.priority)) salida.priority = datos.priority;
  if (datos?.ticketType && (TIPOS_TRIAGE as readonly string[]).includes(datos.ticketType)) salida.ticketType = datos.ticketType;
  const resumen = String(datos?.summary ?? '').trim();
  if (resumen) salida.summary = resumen.slice(0, 180);
  return salida;
}
