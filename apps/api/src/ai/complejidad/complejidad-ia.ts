/**
 * Sugerencia de complejidad con Claude al asignar una actividad. La web la enseña como
 * «Sugerencia: Compleja · <motivo>»; quien asigna decide y las dos quedan guardadas
 * (`complejidad` y `complejidadSugerida`). Modelo y parámetros medidos con el eval
 * (`src/ai/eval/`, `--funcion complejidad`).
 */
import { COMPLEJIDADES, esComplejidad, type Complejidad } from './tiempos-tipicos.js';

export type SugerenciaComplejidad = { complejidad: Complejidad; motivo: string };

export const ESQUEMA_COMPLEJIDAD: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['complejidad', 'motivo'],
  properties: {
    complejidad: { type: 'string', enum: [...COMPLEJIDADES] },
    motivo: { type: 'string' },
  },
};

export const PROMPT_COMPLEJIDAD = `Calificas la complejidad de actividades de NEXARA, empresa mexicana de seguridad electrónica e infraestructura TI (CCTV, control de acceso, redes, cableado, alarmas, soporte y servicio de campo). Recibes el tipo de trabajo, el título y, si hay, las indicaciones de una actividad que alguien va a asignar.

Niveles, comparados con lo normal de ese mismo tipo de trabajo:
- BASICA: rutina corta y conocida, un solo punto o equipo, sin coordinar a nadie. Ej.: entregar documentos, recoger material, cambiar la contraseña de un DVR, revisar una cámara.
- ESTANDAR: lo normal del tipo. Ej.: preventivo de un sitio, instalar 2 o 3 cámaras, configurar un equipo, un reporte de servicio, una junta.
- COMPLEJA: más volumen o más difícil de lo normal: varios equipos o puntos, altura, canalización larga, varios sitios o áreas, falla sin causa clara, integrar sistemas, coordinar con el cliente u otras áreas. Ej.: instalar 8 cámaras con tubería, diagnosticar cámaras que fallan intermitentes, memoria técnica de un proyecto.
- CRITICA: el cliente está detenido o hay riesgo: sistema caído, sin acceso o sin grabación en operación, robo o incidente, plazo de horas con penalización, trabajo nocturno o en sitio de alto riesgo.

Reglas:
- Califica solo con lo escrito. Si no hay señales de más o menos, es ESTANDAR.
- La urgencia sola no es complejidad: «urgente» sube a CRITICA solo si el cliente está detenido o hay riesgo.
- motivo: una frase de máximo 120 caracteres, en español, que diga qué del texto te hizo elegir el nivel. Sin inventar datos ni repetir el título.`;

export const CONFIG_COMPLEJIDAD = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 200,
  timeoutMs: 6_000,
  reintentos: 0,
};

export type ActividadAClasificar = {
  /** «Tarea · Instalación», «Servicio · CORRECTIVO», «Obra»… */
  tipo: string;
  titulo: string;
  indicaciones?: string | null;
};

/** La petición completa a Claude (el servicio y el eval mandan exactamente lo mismo). */
export function peticionComplejidad(a: ActividadAClasificar) {
  const usuario = [
    `Tipo de trabajo: ${String(a.tipo ?? '').trim() || '(sin tipo)'}`,
    `Título: ${String(a.titulo ?? '').trim()}`,
    a.indicaciones?.trim() ? `Indicaciones: ${a.indicaciones.trim().slice(0, 1200)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    sistema: [PROMPT_COMPLEJIDAD],
    usuario,
    esquema: ESQUEMA_COMPLEJIDAD,
    modelo: CONFIG_COMPLEJIDAD.modelo,
    esfuerzo: CONFIG_COMPLEJIDAD.esfuerzo,
    pensar: CONFIG_COMPLEJIDAD.pensar,
    maxTokens: CONFIG_COMPLEJIDAD.maxTokens,
    timeoutMs: CONFIG_COMPLEJIDAD.timeoutMs,
    reintentos: CONFIG_COMPLEJIDAD.reintentos,
  };
}

/** Solo valores válidos; si el nivel no lo es, no hay sugerencia. */
export function limpiarComplejidad(datos: Partial<SugerenciaComplejidad> | null | undefined): SugerenciaComplejidad | null {
  if (!esComplejidad(datos?.complejidad)) return null;
  const motivo = String(datos?.motivo ?? '').trim().replace(/\s+/g, ' ');
  return { complejidad: datos.complejidad, motivo: motivo.slice(0, 140) };
}
