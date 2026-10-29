/**
 * Reglas del asistente del chat: qué quiere la persona, sin IA.
 *
 * Regla de Adam (29-10-2026): «el código hace la mayoría de las cosas y solo los extras jala la IA».
 * Todo lo común (saludo, qué puedes hacer, mis pendientes, quién está en jornada, mi asistencia, el
 * estado de un folio, cómo hago X / dónde está Y) se decide aquí y lo contesta la base de datos o
 * la guía. Solo lo que no cae en ninguna regla va a Claude (`ia`), y «asígnale a…» reusa el
 * asistente de actividades.
 */
import { temaSeguro } from './ayuda-core.js';
import { normalizarTexto } from './texto.js';

export type CuandoPendientes = 'hoy' | 'manana' | 'vencidas' | 'todas';

export type Intencion =
  | { tipo: 'saludo' }
  | { tipo: 'gracias' }
  | { tipo: 'capacidades' }
  | { tipo: 'pendientes'; cuando: CuandoPendientes }
  | { tipo: 'jornada'; ver: 'en-jornada' | 'sin-entrada' }
  | { tipo: 'mi-asistencia' }
  | { tipo: 'folios'; folios: string[] }
  | { tipo: 'ayuda'; temaId: string }
  | { tipo: 'asignar' }
  | { tipo: 'fuera-de-tema' }
  | { tipo: 'ia' };

const FOLIO_ACTIVIDAD = /(?<![A-Za-z0-9-])AN-\d{3,}(?![\dA-Za-z])/gi;
const FOLIO_COTIZACION =
  /(?<![A-Za-z0-9-])(?:NEX-[A-Z]{2}\d{8}-\d{4,}(?:-[A-Z]{2}(?:\.[A-Z]{2})*)?(?:-R\d+)?|NXR-\d{4}-\d{3,})(?![\dA-Za-z])/gi;

/** Folios de actividad y cotización en el orden en que aparecen, sin repetir (máx. 3). */
export function foliosEnTexto(texto: string): string[] {
  const hallados: Array<{ folio: string; pos: number }> = [];
  for (const m of texto.matchAll(FOLIO_ACTIVIDAD)) hallados.push({ folio: m[0].toUpperCase(), pos: m.index ?? 0 });
  for (const m of texto.matchAll(FOLIO_COTIZACION)) hallados.push({ folio: m[0].toUpperCase(), pos: m.index ?? 0 });
  return [...new Set(hallados.sort((a, b) => a.pos - b.pos).map((h) => h.folio))].slice(0, 3);
}

const ASIGNAR =
  /^(?:(?:por favor|porfa|oye|hey)\s+)?(?:asigna|asignale|asignales|asignarle|asignarles|asignale a|crea(?:le)?\s+(?:una\s+)?(?:actividad|tarea|ot)|crear\s+(?:una\s+)?(?:actividad|tarea)|ponle a|ponles a|pon a|encargale|encargales|encarga a|mandale a|manda a)\b/;

/** «¿Cómo…?», «¿dónde…?»: piden instrucciones, no datos. */
const PREGUNTA_DE_USO =
  /^(?:y\s+)?(?:como|donde|en donde|de que forma|que pasa si|que hago (?:para|si|cuando)|para que sirve|cual es|cuales son|puedo|se puede|quien puede|quienes pueden|que significa)\b/;

const SALUDO = /^(?:hola|buen(?:os|as)?(?: (?:dias|tardes|noches))?|que tal|hey|saludos|que onda)\b/;
const GRACIAS = /^(?:(?:ok|va|perfecto|listo|excelente|muy bien)\s+)?(?:muchas\s+)?gracias\b/;
const CAPACIDADES =
  /(?:que (?:puedes|sabes) hacer|en que (?:me )?(?:puedes ayudar|ayudas)|^ayuda\b|^ayudame$|como funcionas|para que sirves|que eres|quien eres|comandos|que te puedo preguntar)/;

const FUERA_DE_TEMA =
  /\b(?:chiste|chistes|receta|recetas|clima|futbol|partido|horoscopo|pelicula|peliculas|cancion|canciones|poema|bitcoin|criptomoneda|politica|elecciones|novia|novio|traduce|traducir|capital de|cuentame un|escribe un cuento)\b/;

const SIN_ENTRADA =
  /\bquien(?:es)?\b.*\b(?:falta|faltan|no ha checado|no han checado|no checo|no checaron|no ha llegado|no han llegado|no vino|no vinieron|sin checar|sin entrada)\b/;
const EN_JORNADA =
  /(?:\bquien(?:es)?\b|\bcuant(?:os|as)\b).*\b(?:jornada|checad[oa]s?|checo|checaron|trabajando|activos?|conectad[oa]s?|llego|llegaron|vino|vinieron|entro|entraron|en sitio|en la oficina)\b/;

const MI_ASISTENCIA =
  /\b(?:mi asistencia|mi entrada|mi checada|mis checadas|mis horas|mi jornada de hoy|a que hora (?:entre|chece|llegue)|cuantas horas (?:llevo|tengo|trabaje|he trabajado)|ya chece|si chece|chece (?:hoy|bien))\b/;

const PENDIENTES_DIRECTO = /^(?:mis\s+)?(?:pendientes|actividades|tareas)(?:\s+(?:de\s+)?(?:hoy|manana|vencidas|atrasadas))?$/;
const PENDIENTES_SUJETO = /\b(?:mis|tengo|me toca|me tocan|me quedan|me falta|me faltan|que hago|que sigue|tengo que)\b/;
const PENDIENTES_OBJETO = /\b(?:pendiente|pendientes|actividad|actividades|tarea|tareas|hoy|manana|vencidas|atrasadas|no cumplidas)\b/;

function cuandoDe(n: string): CuandoPendientes {
  if (/\b(?:vencid[ao]s?|atrasad[ao]s?|no cumplid[ao]s?|se me paso|se me pasaron)\b/.test(n)) return 'vencidas';
  if (/\bmanana\b/.test(n)) return 'manana';
  if (/\bhoy\b/.test(n)) return 'hoy';
  return 'todas';
}

/** Decide la intención. `pregunta` ya viene sin la mención al asistente (`preguntaLimpia`). */
export function detectarIntencion(pregunta: string): Intencion {
  const n = normalizarTexto(pregunta);
  if (!n) return { tipo: 'capacidades' };
  const palabras = n.split(' ').length;

  if (ASIGNAR.test(n)) return { tipo: 'asignar' };

  // Con un folio, lo útil es su estado y su tarjeta, aunque pregunten «¿cómo va…?».
  const folios = foliosEnTexto(pregunta);
  if (folios.length) return { tipo: 'folios', folios };

  const deUso = PREGUNTA_DE_USO.test(n);

  if (GRACIAS.test(n) && palabras <= 5) return { tipo: 'gracias' };
  if (CAPACIDADES.test(n)) return { tipo: 'capacidades' };
  if (SALUDO.test(n) && palabras <= 4) return { tipo: 'saludo' };

  if (!deUso) {
    if (SIN_ENTRADA.test(n)) return { tipo: 'jornada', ver: 'sin-entrada' };
    if (EN_JORNADA.test(n)) return { tipo: 'jornada', ver: 'en-jornada' };
    if (MI_ASISTENCIA.test(n)) return { tipo: 'mi-asistencia' };
    if (PENDIENTES_DIRECTO.test(n) || (PENDIENTES_SUJETO.test(n) && PENDIENTES_OBJETO.test(n))) {
      return { tipo: 'pendientes', cuando: cuandoDe(n) };
    }
  }

  const tema = temaSeguro(pregunta, deUso);
  if (FUERA_DE_TEMA.test(n) && !tema) return { tipo: 'fuera-de-tema' };
  if (tema) return { tipo: 'ayuda', temaId: tema.id };
  return { tipo: 'ia' };
}
