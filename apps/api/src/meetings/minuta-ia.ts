/**
 * Minuta automática de una junta grabada (Adam, 22-10-2026): «le pulsas comenzar a grabar
 * reunión… y en cuanto le das que concluyó, genera un PDF que desglose por apartados lo más
 * importante y detalle todo lo que se tocó».
 *
 * Dos llamadas a Claude, las dos con salida JSON por esquema y el prompt fijo en caché:
 *  1. Notas por tramo, en vivo: cada ~4 minutos de junta, solo el tramo nuevo (Haiku, centavos
 *     de centavo): lo que se ve en pantalla mientras sigue la junta.
 *  2. Minuta, al concluir: una sola llamada (Sonnet) sobre la transcripción completa (ver
 *     `UMBRAL_TRANSCRIPCION_COMPLETA`); solo un texto de más de ~3.5 h se resume por notas.
 *
 * Aquí va solo lógica pura (prompts, esquemas, tramos, armado de la minuta). El servicio
 * (`grabacion.service.ts`) y el eval (`apps/api/scripts/eval-minutas`) mandan exactamente lo mismo.
 */
import { aFechaISO, buscar, type Referencia } from '../ai/asistente/asistente-actividades.js';
import { MEETING_TYPES, type MeetingType } from './meeting-rhythm.js';

// ── Tramos ──────────────────────────────────────────────────────────────

/** Una junta de más de 3 horas se corta sola: la web avisa a las 2 h 50 min. */
export const MAX_DURACION_MS = 3 * 60 * 60_000;
/** Notas cuando hay al menos 4 minutos y 250 palabras nuevas… */
export const TRAMO_MIN_MS = 4 * 60_000;
export const TRAMO_MIN_PALABRAS = 250;
/** …o de inmediato al juntar 1,500 (y nunca más de eso en un tramo). */
export const TRAMO_MAX_PALABRAS = 1_500;
/**
 * Hasta aquí la minuta lee la transcripción completa en vez de las notas: ~3.5 horas de junta,
 * o sea, cualquier grabación (el tope es de 3 h). El eval (23-10-2026, 8 juntas de 11 a 56 min)
 * midió que la minuta sobre la transcripción completa sale mejor (juez 4.27 contra 3.93, la
 * mitad de inventos) y hasta más barata (US$0.073 contra 0.094 por junta) que la escrita sobre
 * las notas: las notas pesan casi lo mismo que el texto y hacen que el modelo escriba de más.
 * Las notas por tramo quedan para verlas en vivo, y para textos pegados enormes.
 */
export const UMBRAL_TRANSCRIPCION_COMPLETA = 30_000;

export type EstadoParte = 'PENDIENTE' | 'LISTA' | 'ERROR';

export type ParteTexto = {
  parte: number;
  estado: EstadoParte;
  texto: string | null;
  /** Desde el inicio de la grabación (sin pausas). null en texto pegado. */
  inicioMs: number | null;
  duracionMs: number | null;
};

export const contarPalabras = (texto: string | null | undefined): number =>
  (texto ?? '').split(/\s+/).filter(Boolean).length;

/**
 * Partes ya procesadas después de `hasta`, en orden y sin huecos: la primera que siga
 * pendiente detiene la cuenta (las notas no se saltan un pedazo de la junta).
 */
export function partesNuevas(partes: ParteTexto[], hasta: number): ParteTexto[] {
  const salida: ParteTexto[] = [];
  let esperada = hasta + 1;
  for (const p of [...partes].sort((a, b) => a.parte - b.parte)) {
    if (p.parte < esperada) continue;
    if (p.parte !== esperada || p.estado === 'PENDIENTE') break;
    salida.push(p);
    esperada++;
  }
  return salida;
}

/** Lo que cubre el siguiente tramo de notas, o null si todavía no toca. */
export function siguienteTramo(nuevas: ParteTexto[], opciones: { final?: boolean } = {}): ParteTexto[] | null {
  const tramo: ParteTexto[] = [];
  let palabras = 0;
  for (const p of nuevas) {
    const n = contarPalabras(p.texto);
    if (tramo.length && palabras + n > TRAMO_MAX_PALABRAS) break;
    tramo.push(p);
    palabras += n;
  }
  if (!tramo.length) return null;
  const lleno = tramo.length < nuevas.length || palabras >= TRAMO_MAX_PALABRAS;
  const ms = tramo.reduce((s, p) => s + (p.duracionMs ?? 0), 0);
  // Texto pegado (sin tiempos): solo por palabras.
  const tiempoCumplido = tramo.every((p) => p.duracionMs == null) || ms >= TRAMO_MIN_MS;
  if (!palabras) return null; // silencio o partes con error: nada que anotar
  return lleno || opciones.final || (tiempoCumplido && palabras >= TRAMO_MIN_PALABRAS) ? tramo : null;
}

const palabrasDe = (partes: ParteTexto[]) =>
  partes.filter((p) => p.estado === 'LISTA').reduce((s, p) => s + contarPalabras(p.texto), 0);

/**
 * Al concluir, antes de la minuta: el tramo que todavía conviene anotar. Si la junta fue corta
 * no hace falta (la minuta lee todo); si quedó una cola larga sin notas (o el texto se pegó),
 * se anota por tramos hasta que lo que queda quepa crudo en la minuta.
 */
export function tramoAlConcluir(partes: ParteTexto[], hasta: number, umbral = UMBRAL_TRANSCRIPCION_COMPLETA): ParteTexto[] | null {
  if (palabrasDe(partes) <= umbral) return null;
  const nuevas = partesNuevas(partes, hasta);
  return palabrasDe(nuevas) > TRAMO_MAX_PALABRAS ? siguienteTramo(nuevas) : null;
}

/** 754_000 → «12:34»; con horas, «1:02:03». */
export function marcaTiempo(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

/** Transcripción con la marca de tiempo de cada parte, para leer o para el anexo del PDF. */
export function transcripcionConMarcas(partes: ParteTexto[]): string {
  return [...partes]
    .sort((a, b) => a.parte - b.parte)
    .filter((p) => p.estado === 'LISTA' && p.texto?.trim())
    .map((p) => (p.inicioMs != null ? `[${marcaTiempo(p.inicioMs)}] ${p.texto!.trim()}` : p.texto!.trim()))
    .join('\n');
}

function rangoDe(partes: ParteTexto[]): string | null {
  const ini = partes[0]?.inicioMs;
  const ult = partes[partes.length - 1];
  if (ini == null || ult?.inicioMs == null) return null;
  return `${marcaTiempo(ini)}–${marcaTiempo(ult.inicioMs + (ult.duracionMs ?? 0))}`;
}

// ── Lo que devuelve la IA ───────────────────────────────────────────────

export const PRIORIDADES = ['alta', 'media', 'baja'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const ESTADOS_PREVIO = ['cumplido', 'en_proceso', 'sin_avance', 'bloqueado', 'cancelado'] as const;
export type EstadoPrevio = (typeof ESTADOS_PREVIO)[number];

/** Cómo quedó cada tema (Adam, 23-10-2026: «concluye cada uno de los parámetros de la reunión»). */
export const ESTADOS_TEMA = ['decidido', 'en_seguimiento', 'abierto', 'informativo'] as const;
export type EstadoTema = (typeof ESTADOS_TEMA)[number];
export const ESTADO_TEMA_LABEL: Record<EstadoTema, string> = {
  decidido: 'Decidido',
  en_seguimiento: 'En seguimiento',
  abierto: 'Abierto',
  informativo: 'Informativo',
};


export type NotasTramo = {
  temas: Array<{ titulo: string; puntos: string[] }>;
  decisiones: string[];
  acuerdos: Array<{ que: string; responsable: string | null; fecha: string | null; prioridad: Prioridad }>;
  pendientes: string[];
  preguntas: string[];
  riesgos: string[];
  cifras: string[];
  lecciones: string[];
  avancesPrevios: Array<{ ref: string; estado: EstadoPrevio; detalle: string }>;
};

/** Notas de un tramo tal como se guardan: qué partes cubren y cuándo pasó. */
export type NotasGuardadas = {
  desde: number;
  hasta: number;
  inicioMs: number | null;
  finMs: number | null;
  palabras: number;
  notas: NotasTramo;
};

export type ParticipantePlan = { nombre: string; organizacion: string | null; rol: string | null };

export type MinutaPlan = {
  tituloSugerido: string | null;
  /** Quiénes se reunieron, para qué y el alcance (1–2 frases): va a la descripción de la reunión. */
  descripcion: string;
  tipoSugerido: MeetingType;
  /** Organizaciones externas con las que fue la junta (clientes, proveedores); vacío si fue interna. */
  organizaciones: string[];
  participantes: ParticipantePlan[];
  resumenEjecutivo: string;
  loMasImportante: string[];
  /** resumen = planteamiento (qué se planteó y por qué); puntos = desarrollo; conclusion = cómo quedó. */
  temas: Array<{ titulo: string; resumen: string; puntos: string[]; conclusion: string | null; estado: EstadoTema }>;
  decisiones: string[];
  acuerdos: Array<{ descripcion: string; responsable: string | null; fechaCompromiso: string | null; prioridad: Prioridad }>;
  pendientes: string[];
  preguntasAbiertas: string[];
  riesgos: Array<{ riesgo: string; mitigacion: string | null }>;
  cifras: Array<{ dato: string; contexto: string }>;
  proximosPasos: string[];
  lecciones: string[];
  seguimiento: Array<{ ref: string; estado: EstadoPrevio; detalle: string }>;
};

const texto = { type: 'string' };
const textoONulo = { type: ['string', 'null'] };
const lista = (items: Record<string, unknown>) => ({ type: 'array', items });
const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const prioridad = { type: 'string', enum: [...PRIORIDADES] };
const avance = objeto({ ref: texto, estado: { type: 'string', enum: [...ESTADOS_PREVIO] }, detalle: texto });

export const ESQUEMA_NOTAS: Record<string, unknown> = objeto({
  temas: lista(objeto({ titulo: texto, puntos: lista(texto) })),
  decisiones: lista(texto),
  acuerdos: lista(objeto({ que: texto, responsable: textoONulo, fecha: textoONulo, prioridad })),
  pendientes: lista(texto),
  preguntas: lista(texto),
  riesgos: lista(texto),
  cifras: lista(texto),
  lecciones: lista(texto),
  avancesPrevios: lista(avance),
});

export const ESQUEMA_MINUTA: Record<string, unknown> = objeto({
  tituloSugerido: texto,
  descripcion: texto,
  tipoSugerido: { type: 'string', enum: [...MEETING_TYPES] },
  organizaciones: lista(texto),
  participantes: lista(objeto({ nombre: texto, organizacion: textoONulo, rol: textoONulo })),
  resumenEjecutivo: texto,
  loMasImportante: lista(texto),
  temas: lista(
    objeto({ titulo: texto, resumen: texto, puntos: lista(texto), conclusion: texto, estado: { type: 'string', enum: [...ESTADOS_TEMA] } }),
  ),
  decisiones: lista(texto),
  acuerdos: lista(objeto({ descripcion: texto, responsable: textoONulo, fechaCompromiso: textoONulo, prioridad })),
  pendientes: lista(texto),
  preguntasAbiertas: lista(texto),
  riesgos: lista(objeto({ riesgo: texto, mitigacion: textoONulo })),
  cifras: lista(objeto({ dato: texto, contexto: texto })),
  proximosPasos: lista(texto),
  lecciones: lista(texto),
  seguimiento: lista(avance),
});

// ── Prompts (fijos: van en caché) ───────────────────────────────────────

const EMPRESA =
  'NEXARA es una empresa mexicana de seguridad electrónica e integración (CCTV, control de acceso, redes, alarmas, servicio de campo) con sede en Puebla; también desarrolla plataformas de software a la medida para clientes (por ejemplo, la plataforma ARTA de ARTA Producciones para eventos y su auditorio).';

const REGLAS_FIDELIDAD = `Fidelidad (lo más importante):
- Solo lo que se dijo. No supongas responsables, fechas, cifras, causas ni conclusiones. Si no se sabe a quién le toca, el responsable es null.
- La transcripción es automática y casi siempre sale de un micrófono en la sala: no dice quién habla, la puntuación falla, hay palabras mal oídas, frases que se repiten en bucle, frases que el reconocedor inventa en los silencios («gracias», «nos vemos en el próximo video», «[Música]», «suscríbete») y pedazos sin sentido o en otro idioma. Ignora todo eso. Reconstruye lo que se quiso decir solo cuando el contexto lo deja claro (marcas, clientes, sistemas, nombres de la lista de personas); lo que no se entiende se omite sin mencionarlo. Nunca armes horas, fechas, cifras o nombres juntando pedazos sueltos («el viernes a las 10… 30» es el viernes 30 a las 10, no las 10:30). Una persona que habla en primera persona («yo lo mando») solo tiene nombre si alguien la nombró.
- Una propuesta rechazada, descartada o que quedó en el aire no es decisión. Un comentario o una queja no es acuerdo. Lo que alguien dijo que NO hará no es compromiso.
- Plática social, bromas y asuntos personales (fiestas, comida, ofrendas, futbol, tráfico, cumpleaños) no van en ninguna parte, tampoco como pendiente.
- Un riesgo es un problema que alguien planteó como tal; si se dijo que algo está bien, alcanza o ya se resolvió, no es riesgo. No lleva responsable salvo que alguien lo haya tomado como tarea (entonces también es acuerdo).
- Un pendiente es trabajo que alguien dijo que hay que hacer y nadie tomó; un tema que se dejó «para otro día» sin tarea concreta va como pregunta abierta, no como pendiente.`;

const REGLAS_REDACCION = `Redacción:
- Escribe con tus palabras, en tercera persona y en tono de acta formal. Nunca copies frases de la transcripción ni pongas citas textuales, muletillas o preguntas tal como se dijeron: cuenta qué se trató y cómo quedó.
- No hables de la grabación, del audio, del micrófono ni de la calidad de la transcripción en ningún campo: el documento trata de la junta.`;

const REGLAS_ACUERDOS = `Acuerdos: compromisos concretos de hacer algo.
- Descripción en infinitivo y específica («Enviar a Grupo Tox la cotización de 12 cámaras»).
- Responsable: el nombre tal como aparece en la lista de personas si es claramente la misma persona (mismo nombre de pila o un apodo conocido: Beto = Roberto, Toño = Antonio, Mafer = María Fernanda). Un nombre solo parecido no es la misma persona (Diana no es Daniela, Mario no es Marco): si en la lista no hay nadie con ese nombre, escríbelo como se dijo. null si nadie lo tomó.
- Fecha en AAAA-MM-DD si se dijo un día o un plazo («el viernes», «en dos semanas», «mañana»), calculada desde la fecha de la reunión; si no, null.
- Prioridad: alta si se dijo urgente, para hoy o crítico; baja si se dijo que puede esperar; si no, media.
- Lo que quedó por hacer sin que nadie lo tomara va en pendientes, no en acuerdos (y nunca en los dos).`;

export const PROMPT_NOTAS = `Tomas las notas de una junta de trabajo mientras ocurre. ${EMPRESA}

Recibes un tramo de la transcripción automática (unos minutos de junta). Las notas de todos los tramos se juntan al terminar en la minuta oficial, así que anota todo lo de ESTE tramo con detalle concreto (quién, qué, cuánto, cuándo, clientes, equipos, cantidades) y nada de tramos anteriores.

${REGLAS_FIDELIDAD}

${REGLAS_REDACCION}

${REGLAS_ACUERDOS}

Campos:
- temas: los asuntos del tramo en orden. Título corto; si el asunto continúa uno de «Temas anteriores», usa exactamente ese título. Puntos: lo que se dijo, una frase completa por punto.
- decisiones: lo que el grupo decidió de forma explícita.
- acuerdos (que, responsable, fecha, prioridad), pendientes (sin responsable), preguntas (dudas que quedaron abiertas), riesgos (problemas o bloqueos que pueden afectar el trabajo).
- cifras: montos, cantidades, porcentajes y fechas clave, cada una con su contexto en la misma frase.
- lecciones: aprendizajes que el grupo dijo que hay que recordar.
- avancesPrevios: solo si en el tramo se habla de un acuerdo de la reunión anterior (A1, A2…): ref, estado y detalle de lo que se dijo.
- Listas vacías cuando no haya nada. Si el tramo es silencio o ruido, todo vacío.`;

export const PROMPT_MINUTA = `Redactas la minuta oficial de una junta de trabajo. ${EMPRESA}

Recibes los datos de la reunión y su contenido: las notas que se tomaron por tramos durante la junta más la transcripción del último tramo, o la transcripción completa si la junta fue corta. Es el registro oficial de la junta: quien no estuvo debe entender con ella, a detalle, qué se trató, qué se dijo de cada asunto, cómo quedó cada uno, qué sigue y quién lo hace. Profesional y completa, pero sin relleno.

${REGLAS_FIDELIDAD}

${REGLAS_REDACCION}

${REGLAS_ACUERDOS}

Campos:
- tituloSugerido: título profesional y específico. Si la junta fue con una organización externa, nómbrala y di de qué fue («ARTA Producciones: avance de la plataforma de eventos y permisos por área»); si fue interna, el asunto principal («Junta comercial: cierre de Grupo Tox y metas de noviembre»).
- descripcion: 1 o 2 frases: quiénes se reunieron (NEXARA y, si aplica, la organización externa), con qué propósito y qué alcance tuvo. Sin fecha ni duración.
- tipoSugerido: EXTRAORDINARIA si fue con un cliente, proveedor u otras personas de fuera, o sobre un asunto puntual; DIARIA, PLANEACION_SEMANAL, REVISION_AVANCES o CIERRE_SEMANAL solo si fue esa junta interna del equipo de NEXARA. Si no hay forma de saberlo, el tipo actual de la reunión.
- organizaciones: las organizaciones externas con las que fue la junta (cliente, proveedor), como se llaman. Vacío si fue interna.
- participantes: las personas que tomaron parte (hablaron, se les habló directamente o se presentaron), no las que solo se mencionaron. nombre: como aparece en la lista de personas si es de la empresa; si es de fuera, como lo dijeron. organizacion: «NEXARA» o la organización externa, o null si no se sabe. rol: su función si se dijo o es evidente (dirección, producción, sistemas…), si no null. No inventes nombres: quien no se identifica no va.
- resumenEjecutivo: un párrafo de 6 a 10 líneas: con quién y para qué fue la junta, lo esencial de cada tema y cómo quedó cada uno.
- loMasImportante: hasta 5 puntos, lo que un director debe saber, de lo más a lo menos importante.
- temas: TODOS los asuntos con contenido, en el orden en que se trataron, sin juntar asuntos distintos en uno ni dejar fuera ninguno. Un asunto que aparece en varios tramos va una sola vez con todo lo que se dijo.
  · titulo: el asunto, específico («Firma de documentos en la plataforma», no «Varios»).
  · resumen: el planteamiento, en 1 a 3 frases: qué se planteó, por qué y quién lo planteó si se sabe.
  · puntos: el desarrollo completo, una frase completa y concreta por cada idea, requerimiento, dato, propuesta, objeción y respuesta relevante, sin perder nombres, cantidades, fechas, sistemas ni clientes. Las que haga falta para no perder nada (normalmente de 3 a 8); ninguna de relleno.
  · conclusion: siempre, en 1 o 2 frases: qué se decidió; o qué quedó en proceso, con quién y para cuándo; o qué quedó abierto y qué falta para cerrarlo; o, si solo se informó, qué quedó claro.
  · estado: decidido (se resolvió o acordó), en_seguimiento (quedó en proceso con alguien a cargo), abierto (quedó sin definir), informativo (solo se informó, no requería decisión).
- decisiones; acuerdos (descripcion, responsable, fechaCompromiso, prioridad); pendientes (sin responsable); preguntasAbiertas.
- riesgos: riesgo o bloqueo y su mitigación si se dijo (si no, null).
- cifras: montos, cantidades, porcentajes y plazos que aporten, cada uno con su contexto. Las fechas, escritas («viernes 30 de octubre, 10:00»), nunca en AAAA-MM-DD. No repitas aquí lo que ya está en acuerdos o próximos pasos.
- proximosPasos: lo que sigue después de la junta, breve (puede retomar acuerdos y la próxima reunión si se fijó).
- lecciones: aprendizajes que el grupo dijo que hay que recordar.
- seguimiento: por cada acuerdo de la reunión anterior (A1, A2…) del que se habló: ref, estado y detalle. Los que no se mencionaron no van.
- Sin repetir lo mismo en varias listas, salvo que proximosPasos retome acuerdos. Listas vacías cuando no haya nada: nunca pongas algo solo por llenar un campo.`;

export type PersonaMinuta = { id: number; nombre: string; puesto?: string | null };

/** Acuerdo de la reunión anterior de la misma serie, para el seguimiento. */
export type AcuerdoPrevio = {
  ref: string;
  agreementId: number | null;
  descripcion: string;
  responsable: string | null;
  fechaCompromiso: string | null;
  estado: string;
};

export type ReunionAnterior = { id: number; titulo: string; fecha: string };

export type ContextoReunion = {
  titulo: string;
  /** AAAA-MM-DD. */
  fecha: string;
  horaInicio?: string | null;
  duracionMs?: number | null;
  /** Tipo con el que se creó (el botón de grabar usa el del día). */
  tipo?: MeetingType | null;
  /** Quien conduce y grabó la junta. */
  conduce?: string | null;
  asistentes: string[];
  agenda?: string | null;
  personas: Array<{ nombre: string; puesto?: string | null }>;
  anterior?: ReunionAnterior | null;
  previos: AcuerdoPrevio[];
};

export function bloquePersonas(personas: ContextoReunion['personas']): string {
  return `Personas de la empresa:\n${personas.map((p) => `- ${p.nombre}${p.puesto ? ` (${p.puesto})` : ''}`).join('\n') || '- (ninguna)'}`;
}

export function bloquePrevios(anterior: ReunionAnterior | null | undefined, previos: AcuerdoPrevio[]): string {
  if (!anterior || !previos.length) return '';
  return [
    `Acuerdos de la reunión anterior de esta serie («${anterior.titulo}», ${anterior.fecha}):`,
    ...previos.map(
      (a) =>
        `${a.ref}. ${a.descripcion} — ${a.responsable ?? 'sin responsable'}${a.fechaCompromiso ? ` — para ${a.fechaCompromiso}` : ''} — ${a.estado.toLowerCase()}`,
    ),
  ].join('\n');
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «jueves 22 de octubre de 2026 (2026-10-22)»: el día de la semana evita errores con «el viernes». */
export function fechaLarga(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()} (${fecha})`;
}

function encabezado(ctx: ContextoReunion): string[] {
  return [
    `Reunión: ${ctx.titulo}`,
    `Fecha: ${fechaLarga(ctx.fecha)}${ctx.horaInicio ? ` · inicio ${ctx.horaInicio}` : ''}${
      ctx.duracionMs ? ` · duración ${Math.max(1, Math.round(ctx.duracionMs / 60_000))} min` : ''
    }`,
    ...(ctx.tipo ? [`Tipo actual: ${ctx.tipo}`] : []),
    ...(ctx.conduce ? [`Conduce: ${ctx.conduce}`] : []),
    ...(ctx.asistentes.length ? [`Asistentes: ${ctx.asistentes.join(', ')}`] : []),
    ...(ctx.agenda?.trim() ? [`Agenda:\n${ctx.agenda.trim()}`] : []),
  ];
}

/**
 * Parámetros medidos con el eval (`apps/api/scripts/eval-minutas`). El modelo se cambia sin
 * desplegar con `ANTHROPIC_NOTAS_MODEL` / `ANTHROPIC_MINUTA_MODEL`.
 */
export const CONFIG_NOTAS = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 4_000,
  timeoutMs: 90_000,
};

/** Esfuerzo medio desde el 23-10-2026: con la junta real de ARTA (28 min, audio de sala) entendió mejor quién se reunió
 * y sacó los pendientes que bajo omitía, por el mismo costo (~US$0.055 contra 0.052). */
export const CONFIG_MINUTA = {
  modelo: 'claude-sonnet-5-5',
  esfuerzo: 'medium' as const,
  pensar: true,
  maxTokens: 16_000,
  timeoutMs: 300_000,
};

/** Petición de notas de un tramo. `temasPrevios`: títulos ya usados, para continuar el mismo tema. */
export function peticionNotas(ctx: ContextoReunion, tramo: ParteTexto[], temasPrevios: string[]) {
  const rango = rangoDe(tramo);
  return {
    sistema: [PROMPT_NOTAS, bloquePersonas(ctx.personas), bloquePrevios(ctx.anterior, ctx.previos)],
    usuario: [
      `Reunión: ${ctx.titulo} · ${fechaLarga(ctx.fecha)}`,
      `Temas anteriores: ${temasPrevios.length ? temasPrevios.join(' | ') : '(ninguno)'}`,
      '',
      `Tramo${rango ? ` ${rango}` : ''}:`,
      tramo
        .map((p) => p.texto?.trim())
        .filter(Boolean)
        .join('\n'),
    ].join('\n'),
    esquema: ESQUEMA_NOTAS,
    modelo: CONFIG_NOTAS.modelo,
    esfuerzo: CONFIG_NOTAS.esfuerzo,
    pensar: CONFIG_NOTAS.pensar,
    maxTokens: CONFIG_NOTAS.maxTokens,
    timeoutMs: CONFIG_NOTAS.timeoutMs,
  };
}

const unir = (items: string[], sep = '; ') => items.map((s) => s.trim()).filter(Boolean).join(sep);

/** Las notas en texto compacto (menos tokens que el JSON) para la minuta. */
export function notasEnTexto(guardadas: NotasGuardadas[]): string {
  return guardadas
    .map((g) => {
      const n = g.notas;
      const rango = g.inicioMs != null && g.finMs != null ? `${marcaTiempo(g.inicioMs)}–${marcaTiempo(g.finMs)}` : `partes ${g.desde}-${g.hasta}`;
      const lineas = [`[${rango}]`];
      for (const t of n.temas ?? []) {
        lineas.push(`• ${t.titulo}`);
        for (const p of t.puntos ?? []) lineas.push(`  - ${p}`);
      }
      const seccion = (nombre: string, items: string[] | undefined) => {
        if (items?.length) lineas.push(`${nombre}: ${unir(items)}`);
      };
      seccion('Decisiones', n.decisiones);
      seccion(
        'Acuerdos',
        (n.acuerdos ?? []).map((a) => `${a.que} (${a.responsable ?? 'sin responsable'}; ${a.fecha ?? 'sin fecha'}; ${a.prioridad})`),
      );
      seccion('Pendientes', n.pendientes);
      seccion('Preguntas', n.preguntas);
      seccion('Riesgos', n.riesgos);
      seccion('Cifras', n.cifras);
      seccion('Lecciones', n.lecciones);
      seccion(
        'Avances de acuerdos anteriores',
        (n.avancesPrevios ?? []).map((a) => `${a.ref} ${a.estado}: ${a.detalle}`),
      );
      return lineas.join('\n');
    })
    .join('\n\n');
}

export type EntradaMinuta = { fuente: 'transcripcion' | 'notas'; texto: string; palabras: number };

/**
 * Qué lee la minuta: la transcripción completa si la junta fue corta; si no, las notas y el
 * texto que quedó después de la última nota.
 */
export function entradaMinuta(partes: ParteTexto[], notas: NotasGuardadas[], umbral = UMBRAL_TRANSCRIPCION_COMPLETA): EntradaMinuta {
  const listas = [...partes].sort((a, b) => a.parte - b.parte).filter((p) => p.estado === 'LISTA');
  const palabras = listas.reduce((s, p) => s + contarPalabras(p.texto), 0);
  if (palabras <= umbral || !notas.length) {
    return { fuente: 'transcripcion', texto: transcripcionConMarcas(listas), palabras };
  }
  const hasta = Math.max(...notas.map((n) => n.hasta));
  const cola = listas.filter((p) => p.parte > hasta);
  const partesTexto = [
    'NOTAS POR TRAMO',
    notasEnTexto([...notas].sort((a, b) => a.desde - b.desde)),
  ];
  if (cola.length) {
    const rango = rangoDe(cola);
    partesTexto.push('', `TRANSCRIPCIÓN DEL ÚLTIMO TRAMO${rango ? ` ${rango}` : ''}`, cola.map((p) => p.texto!.trim()).join('\n'));
  }
  return { fuente: 'notas', texto: partesTexto.join('\n'), palabras };
}

export function peticionMinuta(ctx: ContextoReunion, entrada: EntradaMinuta) {
  return {
    sistema: [PROMPT_MINUTA, bloquePersonas(ctx.personas), bloquePrevios(ctx.anterior, ctx.previos)],
    usuario: [
      ...encabezado(ctx),
      '',
      entrada.fuente === 'transcripcion' ? 'TRANSCRIPCIÓN COMPLETA' : '',
      entrada.texto,
    ]
      .filter((l, i, todas) => l !== '' || todas[i - 1] !== '')
      .join('\n'),
    esquema: ESQUEMA_MINUTA,
    modelo: CONFIG_MINUTA.modelo,
    esfuerzo: CONFIG_MINUTA.esfuerzo,
    pensar: CONFIG_MINUTA.pensar,
    maxTokens: CONFIG_MINUTA.maxTokens,
    timeoutMs: CONFIG_MINUTA.timeoutMs,
  };
}

// ── La minuta que se guarda ─────────────────────────────────────────────

export type AcuerdoMinuta = {
  descripcion: string;
  textoResponsable: string | null;
  responsable: Referencia | null;
  responsableCandidatos: Referencia[];
  /** AAAA-MM-DD o null. */
  fechaCompromiso: string | null;
  prioridad: Prioridad;
};

export type SeguimientoMinuta = {
  ref: string;
  agreementId: number | null;
  acuerdo: string;
  responsable: string | null;
  estado: EstadoPrevio | 'sin_mencion';
  detalle: string | null;
};

/** Participante con su usuario de NEXARA cuando es claramente alguien de la empresa. */
export type ParticipanteMinuta = ParticipantePlan & { persona: Referencia | null };

export type TemaMinuta = { titulo: string; resumen: string; puntos: string[]; conclusion: string | null; estado?: EstadoTema };

/** Las minutas anteriores al 23-10-2026 no traen descripción, tipo, organizaciones, participantes ni estado por tema. */
export type Minuta = Omit<MinutaPlan, 'acuerdos' | 'seguimiento' | 'descripcion' | 'tipoSugerido' | 'organizaciones' | 'participantes' | 'temas'> & {
  descripcion?: string | null;
  tipoSugerido?: MeetingType | null;
  organizaciones?: string[];
  participantes?: ParticipanteMinuta[];
  temas: TemaMinuta[];
  acuerdos: AcuerdoMinuta[];
  seguimiento: SeguimientoMinuta[];
  reunionAnterior: ReunionAnterior | null;
  fuente: EntradaMinuta['fuente'];
};

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => String(s ?? '').trim()).filter(Boolean) : [];
const fecha = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return aFechaISO(s, null) ? s : null;
};
const prioridadDe = (v: unknown): Prioridad => (PRIORIDADES as readonly string[]).includes(String(v)) ? (v as Prioridad) : 'media';

/** Respuesta de la IA → minuta lista: responsables buscados en la empresa y seguimiento completo. */
export function construirMinuta(
  plan: MinutaPlan,
  personas: PersonaMinuta[],
  previos: AcuerdoPrevio[],
  extra: { anterior: ReunionAnterior | null; fuente: EntradaMinuta['fuente'] },
): Minuta {
  const p = (plan ?? {}) as Partial<MinutaPlan>;
  const avances = new Map((Array.isArray(p.seguimiento) ? p.seguimiento : []).map((s) => [String(s?.ref ?? '').trim().toUpperCase(), s]));
  const limpio = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const vistos = new Set<string>();
  const participantes: ParticipanteMinuta[] = [];
  for (const x of Array.isArray(p.participantes) ? p.participantes : []) {
    const nombre = limpio(x?.nombre, 160);
    if (!nombre) continue;
    const organizacion = limpio(x?.organizacion, 160);
    // Solo alguien de NEXARA (o sin organización) se busca entre las personas de la empresa.
    const interno = !organizacion || /nexara/i.test(organizacion);
    const r = interno ? buscar(nombre, personas, (y) => y.nombre) : { elegido: null };
    const persona = r.elegido ? { id: r.elegido.id, nombre: r.elegido.nombre } : null;
    const clave = persona ? `#${persona.id}` : nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    participantes.push({ nombre: persona?.nombre ?? nombre, organizacion: persona ? 'NEXARA' : organizacion, rol: limpio(x?.rol, 120), persona });
  }
  return {
    tituloSugerido: typeof p.tituloSugerido === 'string' && p.tituloSugerido.trim() ? p.tituloSugerido.trim().slice(0, 200) : null,
    descripcion: limpio(p.descripcion, 1_000),
    tipoSugerido: (MEETING_TYPES as readonly string[]).includes(String(p.tipoSugerido)) ? (p.tipoSugerido as MeetingType) : null,
    organizaciones: [...new Set(textos(p.organizaciones).map((o) => o.slice(0, 160)))],
    participantes,
    resumenEjecutivo: String(p.resumenEjecutivo ?? '').trim(),
    loMasImportante: textos(p.loMasImportante).slice(0, 5),
    temas: (Array.isArray(p.temas) ? p.temas : [])
      .filter((t) => t?.titulo?.trim())
      .map((t) => ({
        titulo: t.titulo.trim(),
        resumen: String(t.resumen ?? '').trim(),
        puntos: textos(t.puntos),
        conclusion: typeof t.conclusion === 'string' && t.conclusion.trim() ? t.conclusion.trim() : null,
        estado: (ESTADOS_TEMA as readonly string[]).includes(String(t.estado)) ? t.estado : undefined,
      })),
    decisiones: textos(p.decisiones),
    acuerdos: (Array.isArray(p.acuerdos) ? p.acuerdos : [])
      .filter((a) => a?.descripcion?.trim())
      .map((a) => {
        const r = buscar(a.responsable, personas, (x) => x.nombre);
        return {
          descripcion: a.descripcion.trim(),
          textoResponsable: a.responsable?.trim() || null,
          responsable: r.elegido ? { id: r.elegido.id, nombre: r.elegido.nombre } : null,
          responsableCandidatos: r.elegido ? [] : r.candidatos.map((x) => ({ id: x.id, nombre: x.nombre })),
          fechaCompromiso: fecha(a.fechaCompromiso),
          prioridad: prioridadDe(a.prioridad),
        };
      }),
    pendientes: textos(p.pendientes),
    preguntasAbiertas: textos(p.preguntasAbiertas),
    riesgos: (Array.isArray(p.riesgos) ? p.riesgos : [])
      .filter((r) => r?.riesgo?.trim())
      .map((r) => ({ riesgo: r.riesgo.trim(), mitigacion: typeof r.mitigacion === 'string' && r.mitigacion.trim() ? r.mitigacion.trim() : null })),
    cifras: (Array.isArray(p.cifras) ? p.cifras : [])
      .filter((c) => c?.dato?.trim())
      .map((c) => ({ dato: c.dato.trim(), contexto: String(c.contexto ?? '').trim() })),
    proximosPasos: textos(p.proximosPasos),
    lecciones: textos(p.lecciones),
    // Todos los acuerdos anteriores; los que no se tocaron quedan «sin mención» sin gastar tokens.
    seguimiento: previos.map((a) => {
      const s = avances.get(a.ref.toUpperCase());
      const estado = s && (ESTADOS_PREVIO as readonly string[]).includes(s.estado) ? s.estado : null;
      return {
        ref: a.ref,
        agreementId: a.agreementId,
        acuerdo: a.descripcion,
        responsable: a.responsable,
        estado: estado ?? 'sin_mencion',
        detalle: estado ? String(s!.detalle ?? '').trim() || null : null,
      };
    }),
    reunionAnterior: extra.anterior,
    fuente: extra.fuente,
  };
}

export const ESTADO_PREVIO_LABEL: Record<SeguimientoMinuta['estado'], string> = {
  cumplido: 'Cumplido',
  en_proceso: 'En proceso',
  sin_avance: 'Sin avance',
  bloqueado: 'Bloqueado',
  cancelado: 'Cancelado',
  sin_mencion: 'No se mencionó',
};

export const PRIORIDAD_LABEL: Record<Prioridad, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

/** Minuta en texto plano: lo que queda en `notas` de la reunión (se lee y se busca por fecha). */
export function minutaTexto(m: Minuta): string {
  const bloques: string[] = [];
  if (m.descripcion) bloques.push(m.descripcion);
  const participantes = (m.participantes ?? []).map((p) =>
    [p.nombre, [p.rol, p.organizacion].filter(Boolean).join(', ')].filter(Boolean).join(' — '),
  );
  bloques.push(`RESUMEN EJECUTIVO\n${m.resumenEjecutivo}`);
  const vinetas = (titulo: string, items: string[]) => {
    if (items.length) bloques.push(`${titulo}\n${items.map((i) => `- ${i}`).join('\n')}`);
  };
  vinetas('PARTICIPANTES', participantes);
  vinetas('LO MÁS IMPORTANTE', m.loMasImportante);
  if (m.temas.length) {
    bloques.push(
      `TEMAS\n${m.temas
        .map((t, i) =>
          [
            `${i + 1}. ${t.titulo}${t.estado ? ` [${ESTADO_TEMA_LABEL[t.estado]}]` : ''}`,
            t.resumen ? `   ${t.resumen}` : '',
            ...t.puntos.map((p) => `   - ${p}`),
            t.conclusion ? `   Conclusión: ${t.conclusion}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n')}`,
    );
  }
  vinetas('DECISIONES', m.decisiones);
  vinetas(
    'ACUERDOS',
    m.acuerdos.map(
      (a) =>
        `${a.descripcion} · ${a.responsable?.nombre ?? a.textoResponsable ?? 'sin responsable'}${a.fechaCompromiso ? ` · ${a.fechaCompromiso}` : ''} · prioridad ${PRIORIDAD_LABEL[a.prioridad].toLowerCase()}`,
    ),
  );
  vinetas('PENDIENTES SIN RESPONSABLE', m.pendientes);
  vinetas('PREGUNTAS ABIERTAS', m.preguntasAbiertas);
  vinetas('RIESGOS Y BLOQUEOS', m.riesgos.map((r) => (r.mitigacion ? `${r.riesgo} (mitigación: ${r.mitigacion})` : r.riesgo)));
  vinetas('CIFRAS Y DATOS', m.cifras.map((c) => (c.contexto ? `${c.dato}: ${c.contexto}` : c.dato)));
  vinetas('LECCIONES', m.lecciones);
  vinetas('PRÓXIMOS PASOS', m.proximosPasos);
  vinetas(
    'SEGUIMIENTO DE LA REUNIÓN ANTERIOR',
    m.seguimiento.map((s) => `${s.acuerdo}: ${ESTADO_PREVIO_LABEL[s.estado]}${s.detalle ? ` — ${s.detalle}` : ''}`),
  );
  return bloques.join('\n\n');
}
