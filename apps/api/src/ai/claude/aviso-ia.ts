/**
 * El texto de la tarjeta que avisa cuando la IA de NEXARA cae y cuando vuelve. Módulo puro: sin Nest, sin Prisma, sin
 * variables de entorno. Lo usa `GuardiaIaService` (quien decide a quién y cuántas veces); aquí solo se escribe lo que
 * dice cada tarjeta, igual que `textoAvisoRecortes` en `notifications/aviso-recortes.service.ts`.
 *
 * Dos audiencias:
 *   - `desarrollo`: la cuenta de plataforma (`developer@`). Lleva la causa técnica y qué hacer para arreglarla (nombres de
 *     archivos y del script; nunca el valor de una llave).
 *   - `direccion`: CEO y directores. Sin nombres técnicos: qué se afecta, que ya se avisó a desarrollo y que la IA se
 *     prueba sola. Hoy NO sale (interruptor `ia.aviso_direccion.modo`, apagado de fábrica).
 */
import { WORKDAY_TIMEZONE, workDateKey } from '../../common/time/workday.js';
import type { EventoCompuerta, MotivoCorte } from './compuerta-ia.js';

/** Categoría de la tarjeta: con ella `GuardiaIaService` busca la última que mandó para acotar el aviso a uno por episodio. */
export const CATEGORIA_AVISO_IA = 'ia-estado';
/** `entityType` de la tarjeta que anuncia la caída. */
export const ENTIDAD_IA_CAIDA = 'IA_CAIDA';
/** `entityType` de la tarjeta que anuncia que la IA volvió. */
export const ENTIDAD_IA_VOLVIO = 'IA_VOLVIO';
/**
 * Interruptor (apagado | observar | activo) de la copia del aviso a la dirección. Sin fila vale `apagado`: se lee con
 * `leerModoPiloto(prisma, CLAVE_AVISO_DIRECCION, 'apagado')`. No es una `ClaveIa`: `ClaudeService.modoIa` nace en
 * `observar` y aquí lo que actúa debe nacer apagado.
 */
export const CLAVE_AVISO_DIRECCION = 'ia.aviso_direccion.modo';

export type AudienciaAvisoIa = 'desarrollo' | 'direccion';
export type TextoAvisoIa = { title: string; message: string; priority: 'high' | 'normal' };

/** Qué deja de funcionar mientras la IA no responde (es lo mismo sin importar el motivo). */
const QUE_SE_AFECTA =
  'Mientras tanto no hay sugerencia de complejidad, «Asignar con IA», actas ni lectura de fotos; lo demás sigue igual y nada se pierde.';

const TEXTO_REINTENTO = 'La IA se prueba sola cada 5 a 30 minutos y te aviso cuando regrese.';

/** Hora de México, de 00:00 a 23:59 (`h23`: a la medianoche no sale «24:05»). */
function horaMexico(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-MX', {
    timeZone: WORKDAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function diaMexico(ms: number): string {
  return new Date(ms).toLocaleDateString('es-MX', { timeZone: WORKDAY_TIMEZONE, day: 'numeric', month: 'long' });
}

/** `X h Y min`; menos de una hora, `Y min`. Sin días: una caída de 6 días dice `144 h 5 min`. */
export function duracionLegible(ms: number): string {
  const minutos = Math.max(0, Math.round(ms / 60_000));
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

function intentos(evento: Extract<EventoCompuerta, { tipo: 'CAIDA' }>): string {
  if (evento.origen === 'sonda' && evento.fallos <= 1) return 'lo confirmó la prueba automática';
  return evento.fallos === 1 ? '1 intento' : `${evento.fallos} intentos seguidos`;
}

type Causa = { causa: string; arreglo: string; causaSencilla: string };

function causaDe(motivo: MotivoCorte, cuenta: string): Causa {
  switch (motivo) {
    case 'llave_puerta_invalida':
      return {
        causa: `la puerta de IA rechaza la llave de Anthropic (${cuenta})`,
        arreglo: 'Para arreglarlo hay que poner una llave nueva con subir-llave-ia.ps1.',
        causaSencilla: 'la conexión con la IA dejó de funcionar',
      };
    case 'token_nexara_invalido':
      return {
        causa: `la puerta de IA no reconoce el token de NEXARA (${cuenta})`,
        arreglo: 'Para arreglarlo, revisa ANTHROPIC_API_KEY en /etc/ai/nexara-claude.env del servidor.',
        causaSencilla: 'la conexión con la IA dejó de funcionar',
      };
    case 'proyecto_desactivado':
      return {
        causa: `la puerta tiene desactivado el proyecto nexara (activo: false en config/proyectos.json; ${cuenta})`,
        arreglo: 'Para arreglarlo hay que volver a activarlo en la puerta de IA.',
        causaSencilla: 'la conexión con la IA quedó desactivada',
      };
    case 'presupuesto_agotado':
      return {
        causa: `se acabó el presupuesto mensual de IA de NEXARA en la puerta (${cuenta})`,
        arreglo: 'Vuelve solo el día 1; para antes, subir el tope en config/proyectos.json y correr subir-config.',
        causaSencilla: 'se acabó el presupuesto mensual de IA; se renueva solo el día 1',
      };
  }
}

/**
 * Título, mensaje y prioridad de la tarjeta de un cambio de estado de la IA.
 *
 * `CAIDA` va en prioridad alta (algo dejó de funcionar y alguien tiene que hacer algo); `VOLVIO` en normal. Todas las
 * horas son de México (`WORKDAY_TIMEZONE`). El mensaje de la caída nunca repite el `detalle` del evento (lleva el
 * estado HTTP y el tipo de error: sirve para el log, no para una tarjeta).
 */
export function textoAvisoIa(evento: EventoCompuerta, audiencia: AudienciaAvisoIa = 'desarrollo'): TextoAvisoIa {
  if (evento.tipo === 'VOLVIO') {
    const mismoDia = workDateKey(new Date(evento.desde)) === workDateKey(new Date(evento.hasta));
    const desde = `desde las ${horaMexico(evento.desde)}${mismoDia ? '' : ` del ${diaMexico(evento.desde)}`}`;
    const estuvo = `Estuvo sin responder ${duracionLegible(evento.hasta - evento.desde)} (${desde}).`;
    const cierre =
      audiencia === 'desarrollo'
        ? 'Ya pasó la prueba. Lo que se creó mientras tanto quedó sin sugerencia de complejidad; el detalle está en GET /ai/salud.'
        : 'La IA ya responde. Lo que se creó mientras tanto quedó sin sugerencia de complejidad.';
    return { title: 'La IA de NEXARA ya responde otra vez', message: `${estuvo} ${cierre}`, priority: 'normal' };
  }

  const c = causaDe(evento.motivo, intentos(evento));
  const desde = `Desde las ${horaMexico(evento.desde)}`;
  const message =
    audiencia === 'desarrollo'
      ? `${desde} ${c.causa}. ${QUE_SE_AFECTA} ${c.arreglo} ${TEXTO_REINTENTO}`
      : `${desde} ${c.causaSencilla}. ${QUE_SE_AFECTA} Ya se avisó a desarrollo. ${TEXTO_REINTENTO}`;
  return { title: 'La IA de NEXARA dejó de responder', message, priority: 'high' };
}
