/**
 * La parte de IA del asistente del chat: solo para lo que las reglas no resolvieron.
 *
 * Lo que recibe Claude es lo mínimo: la guía de uso de Core (fija, primero y con caché), el rol de
 * quien pregunta y la pregunta. Ningún dato de la empresa (personas, actividades, montos) viaja: eso
 * lo contestan las reglas con la base. Responde en JSON corto: si es de la plataforma, el tema de la
 * guía y 1–3 frases; si no, `fueraDeTema` y el código contesta con un texto fijo.
 *
 * El servicio y el eval (`src/ai/eval/correr-asistente-chat.ts`) mandan exactamente esta petición.
 */
import { TEMAS_AYUDA, guiaParaIA } from './ayuda-core.js';

export const CONFIG_ASISTENTE_CHAT = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  // ~3 frases en español + el JSON: 120–200 tokens de salida.
  maxTokens: 350,
  // En el chat se espera rápido: un intento de 8 s y un reintento.
  timeoutMs: 8_000,
  reintentos: 1,
};

/** Encabezado del bloque de conocimiento (el juez del eval lo usa para recortarlo). */
export const ENCABEZADO_CONOCIMIENTO = 'LO QUE SABES DE NEXARA CORE:';

export const PROMPT_ASISTENTE_CHAT = `Eres el asistente de NEXARA Core dentro del canal #general del chat interno de NEXARA (empresa mexicana de CCTV, control de acceso, redes e infraestructura TI). NEXARA Core es su plataforma de trabajo: actividades y evidencias, asistencia y comida, chat, reuniones, clientes, cotizaciones, proyectos, viáticos, facturas, almacén, herramientas, vehículos, organigrama y desempeño.

Reglas:
- Solo respondes sobre el uso de NEXARA Core y el trabajo dentro de la plataforma. Cualquier otra cosa (cultura general, chistes, programación, opiniones, temas personales, otras empresas o apps) es fueraDeTema: true, tema null y respuesta vacía.
- Usa solo lo que sabes (abajo). No inventes pantallas, botones, menús, estados, políticas, horarios ni permisos, ni digas que algo se puede borrar, reemplazar, editar o cancelar si no está abajo. Si no lo sabes, di «No tengo ese dato» y sugiere preguntarle a su jefe o a administración; tema null.
- No hables de tus fuentes («la guía», «la información que tengo»): contesta directo sobre NEXARA.
- No tienes datos de la empresa (personas, actividades, montos): si piden datos concretos, di dónde verlos.
- Responde en español de México, de tú, en 1 o 2 frases cortas (máximo 3), sin saludo ni despedida, sin markdown ni listas.
- tema: el id entre corchetes del tema que más ayude, o null.

${ENCABEZADO_CONOCIMIENTO}
${guiaParaIA()}`;

export const ESQUEMA_ASISTENTE_CHAT = {
  type: 'object',
  additionalProperties: false,
  required: ['fueraDeTema', 'tema', 'respuesta'],
  properties: {
    fueraDeTema: { type: 'boolean' },
    tema: { anyOf: [{ type: 'string', enum: TEMAS_AYUDA.map((t) => t.id) }, { type: 'null' }] },
    respuesta: { type: 'string' },
  },
};

export type SalidaAsistenteChat = { fueraDeTema: boolean; tema: string | null; respuesta: string };

/** La petición completa a Claude (el servicio y el eval mandan lo mismo). */
export function peticionAsistenteChat(pregunta: string, rol: string | null) {
  return {
    sistema: [PROMPT_ASISTENTE_CHAT],
    usuario: `Rol de quien pregunta: ${rol || 'colaborador'}\nPregunta: ${pregunta.slice(0, 600)}`,
    esquema: ESQUEMA_ASISTENTE_CHAT,
    modelo: CONFIG_ASISTENTE_CHAT.modelo,
    esfuerzo: CONFIG_ASISTENTE_CHAT.esfuerzo,
    pensar: CONFIG_ASISTENTE_CHAT.pensar,
    maxTokens: CONFIG_ASISTENTE_CHAT.maxTokens,
    timeoutMs: CONFIG_ASISTENTE_CHAT.timeoutMs,
    reintentos: CONFIG_ASISTENTE_CHAT.reintentos,
  };
}

/** Lo que el código acepta de la IA: tema válido, texto corto, sin markdown ni enlaces inventados. */
export function limpiarSalida(salida: Partial<SalidaAsistenteChat> | null | undefined): SalidaAsistenteChat {
  const fueraDeTema = Boolean(salida?.fueraDeTema);
  const tema = TEMAS_AYUDA.some((t) => t.id === salida?.tema) ? (salida!.tema as string) : null;
  const respuesta = String(salida?.respuesta ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  return { fueraDeTema, tema: fueraDeTema ? null : tema, respuesta: fueraDeTema ? '' : respuesta };
}
