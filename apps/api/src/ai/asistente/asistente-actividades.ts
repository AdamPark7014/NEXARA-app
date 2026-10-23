/**
 * Asistente de actividades: el texto libre de dirección («que Antonio vaya a Tox a las 3
 * con el cliente») se convierte en propuestas de actividad listas para `POST /activities`.
 *
 * Reparto del trabajo:
 * - Claude solo LEE la instrucción y devuelve un plan (tipo, persona, cliente, fecha…) con
 *   los nombres tal como los entendió. No toca la base ni decide permisos.
 * - Este archivo (puro, con pruebas) busca esos nombres en NEXARA, arma el cuerpo de
 *   `CreateActivityDto` con las mismas reglas del formulario web (`lib/ops-activity-form.ts`
 *   y `lib/activity-kinds.ts`) y dice qué falta.
 * - Nada se crea hasta que la persona confirma: la web manda cada propuesta al alta normal,
 *   que vuelve a revisar permisos, organigrama y responsable activo.
 */

export const TIPOS_ACTIVIDAD = ['tarea', 'proyecto', 'obra', 'servicio', 'comercial'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

export const ETIQUETA_TIPO: Record<TipoActividad, string> = {
  tarea: 'Tarea',
  proyecto: 'Proyecto',
  obra: 'Obra',
  servicio: 'Servicio',
  comercial: 'Comercial',
};

/** Subtipos de Tarea (mismos textos que `TAREA_TIPOS` en la web: viajan en ticketTypeCustom). */
export const SUBTIPOS_TAREA = [
  'Levantamiento',
  'Recolección',
  'Entrega',
  'Junta',
  'Compra de material',
  'Preparación de equipo',
  'Trámite',
  'Capacitación',
  'Reporte / documentación',
  'Otro',
] as const;

export const TIPOS_SERVICIO = ['PREVENTIVO', 'CORRECTIVO', 'EMERGENCIA', 'INSTALACION'] as const;

/** Zona de la empresa. México no tiene horario de verano desde 2022: siempre UTC-6. */
export const ZONA_HORARIA = 'America/Mexico_City';
const DESFASE_CDMX = '-06:00';
const TOPE_MINUTOS = 12 * 60;

/** Lo que devuelve Claude por cada actividad que entendió. */
export type AccionPlan = {
  tipo: TipoActividad;
  /** Ya no se pide (ahorra salida); queda por si llega de un plan viejo. */
  razonTipo?: string;
  /** Subtipo de la tarea (`SUBTIPOS_TAREA`) o tipo del servicio (`TIPOS_SERVICIO`); null en los demás. */
  subtipo?: string | null;
  /** Planes anteriores al 23-10-2026 (dos campos separados). */
  subtipoTarea?: string | null;
  tipoServicio?: (typeof TIPOS_SERVICIO)[number] | null;
  titulo: string;
  indicaciones: string | null;
  responsable: string | null;
  cliente: string | null;
  sitio: string | null;
  /** Día en que se hace o empieza (cita, visita, «empezando el jueves»). */
  fecha: string | null;
  hora: string | null;
  /** Para cuándo debe quedar («para el viernes», «a más tardar…», fin de un rango). */
  fechaLimite: string | null;
  horaLimite: string | null;
  duracionMin: number | null;
  prioridad: 'Alta' | 'Media' | 'Baja';
  encargo: 'ejecucion' | 'despacho' | null;
};

export type PlanAsistente = {
  acciones: AccionPlan[];
  /** Pregunta para quien escribió cuando no se entiende qué hacer. */
  aclaracion: string | null;
};

/**
 * Lo que devuelve Claude, en corto: cada clave y cada null se pagan y se esperan (la salida
 * es lo que más tarda y más cuesta), así que van nombres breves y día con hora en un solo
 * campo. `planDeSalida` lo pasa a `AccionPlan`.
 */
export type AccionIA = {
  tipo: TipoActividad;
  sub: string | null;
  titulo: string;
  detalle: string | null;
  quien: string | null;
  cliente: string | null;
  lugar: string | null;
  /** «AAAA-MM-DD» o «AAAA-MM-DD HH:MM». */
  inicio: string | null;
  limite: string | null;
  min: number | null;
  prio: 'Alta' | 'Media' | 'Baja';
  encargo: 'ejecucion' | 'despacho' | null;
};
export type SalidaIA = { acciones: AccionIA[]; aclaracion: string | null };

const textoONulo = { type: ['string', 'null'] };
const enumONulo = (valores: readonly string[]) => ({ anyOf: [{ type: 'string', enum: [...valores] }, { type: 'null' }] });

/** JSON Schema de la salida estructurada (todas las claves obligatorias, sin extras). */
export const ESQUEMA_PLAN: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['acciones', 'aclaracion'],
  properties: {
    acciones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'sub', 'titulo', 'detalle', 'quien', 'cliente', 'lugar', 'inicio', 'limite', 'min', 'prio', 'encargo'],
        properties: {
          tipo: { type: 'string', enum: [...TIPOS_ACTIVIDAD] },
          sub: enumONulo([...SUBTIPOS_TAREA, ...TIPOS_SERVICIO]),
          titulo: { type: 'string' },
          detalle: textoONulo,
          quien: textoONulo,
          cliente: textoONulo,
          lugar: textoONulo,
          inicio: textoONulo,
          limite: textoONulo,
          min: { type: ['integer', 'null'] },
          prio: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          encargo: enumONulo(['ejecucion', 'despacho']),
        },
      },
    },
    aclaracion: textoONulo,
  },
};

/** «2026-10-23 18:00» → día y hora; «2026-10-23» → día sin hora. */
function diaYHora(valor: unknown): { dia: string | null; hora: string | null } {
  const m = /^\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/.exec(typeof valor === 'string' ? valor : '');
  return { dia: m?.[1] ?? null, hora: m?.[2] ?? null };
}

/** La salida corta de Claude → el plan con el que trabaja el armado (acepta la forma vieja). */
export function planDeSalida(salida: unknown): PlanAsistente {
  const s = (salida ?? {}) as { acciones?: unknown; aclaracion?: unknown };
  const acciones = (Array.isArray(s.acciones) ? s.acciones : []).map((x): AccionPlan => {
    const a = (x ?? {}) as Record<string, unknown>;
    if ('responsable' in a || 'fecha' in a) return a as unknown as AccionPlan;
    const texto = (k: string) => (typeof a[k] === 'string' && (a[k] as string).trim() ? (a[k] as string) : null);
    const inicio = diaYHora(a.inicio);
    const limite = diaYHora(a.limite);
    return {
      tipo: a.tipo as TipoActividad,
      subtipo: texto('sub'),
      titulo: texto('titulo') ?? '',
      indicaciones: texto('detalle'),
      responsable: texto('quien'),
      cliente: texto('cliente'),
      sitio: texto('lugar'),
      fecha: inicio.dia,
      hora: inicio.hora,
      fechaLimite: limite.dia,
      horaLimite: limite.hora,
      duracionMin: typeof a.min === 'number' ? a.min : null,
      prioridad: (a.prio as AccionPlan['prioridad']) ?? 'Media',
      encargo: (a.encargo as AccionPlan['encargo']) ?? null,
    };
  });
  return { acciones, aclaracion: typeof s.aclaracion === 'string' && s.aclaracion.trim() ? s.aclaracion : null };
}

/**
 * Instrucciones fijas (no cambian entre llamadas: entran en la caché de Claude). Cortas a
 * propósito: casi todas las llamadas reales llegan con la caché fría y cada token de aquí se
 * paga completo. Lo que se puede resolver en código (catálogo, calendario, coincidencias,
 * fechas en el formato del alta) no se le pide a la IA.
 */
export const PROMPT_SISTEMA = `Asistente de asignación de actividades de NEXARA (seguridad electrónica e integración en México: CCTV, control de acceso, redes, alarmas, servicio de campo). Conviertes la instrucción de dirección (escrita o dictada por voz, con errores, muletillas y correcciones: «que Paty… no, que Carolina» es Carolina) en actividades. Una persona las revisa antes de crearlas.

Tipos:
- tarea: sin proyecto. sub: Levantamiento (revisar o medir un sitio antes de cotizar), Recolección, Entrega, Junta (reunión o llamada para revisar o acordar algo, también con un cliente), Compra de material, Preparación de equipo, Trámite (facturas, fianzas, permisos, pagos), Capacitación, Reporte / documentación (hacer o mandar un reporte, aunque sea de una falla), Otro.
- servicio: trabajo técnico en el sitio de un cliente. sub: PREVENTIVO (mantenimiento), CORRECTIVO (falla o cambio de una pieza), EMERGENCIA (sistema caído o urgente), INSTALACION (equipo nuevo de pocas horas).
- obra: instalación grande de un proyecto. proyecto: ingeniería, planos, pruebas o puesta en marcha de un proyecto. Solo si mencionan el proyecto, la obra o la puesta en marcha.
- comercial: solo para vender: cotizar, propuesta, seguimiento de venta, visita de venta. Una junta con un cliente para revisar algo es tarea Junta.
- obra, proyecto y comercial: sub null.

Campos:
- Una actividad por persona y por trabajo.
- quien: el nombre completo de las coincidencias si lo dicho (nombre o apodo: Beto→Roberto, Toño→Antonio) corresponde a una sola persona; si a varias o a ninguna, copia lo que dijeron. Si piden a alguien que mande a su gente, es esa persona (encargo despacho). null si no dijeron quién.
- cliente y lugar como en las coincidencias si son de ahí («Tox» → «Grupo Tox»); si no, como lo dijeron. Proveedores, tiendas y lugares que no son clientes: cliente null y el lugar en lugar. lugar: sucursal, planta, área o dirección; null si no lo dijeron.
- inicio («AAAA-MM-DD HH:MM», 24 h, o «AAAA-MM-DD» sin hora): cuándo se hace o empieza (cita, visita, «mañana a las 9», «empezando el jueves»). «mañana», «el lunes», «el viernes»: el primero con ese nombre en «Próximos días», nunca hoy. «a las 3» o «para las 3» = 15:00. Hora sin día: hoy, o mañana si ya pasó. «ya», «de inmediato»: hoy a la hora actual. «hoy» sin hora: solo el día. Si no dicen cuándo, null (no supongas hoy ni mañana).
- limite (mismo formato): para cuándo debe quedar: «para el viernes», «antes del…», «a más tardar», «tiene hasta», «que quede listo». «Para» con día y sin hora es plazo. En un rango («del lunes al miércoles») inicio es el primer día y limite el último. Si solo hay plazo, inicio null. Un día que encabeza varias actividades («Para el viernes: …») vale para todas, y una hora dentro de una es la hora de ese día. Plazo vago («la otra semana») o sin fechas: null.
- min: duración en minutos, solo si la dijeron («hora y media» 90, «media hora» 30, «jornadas de 8 horas» o «todo el día» 480), máximo 720.
- prio: Alta si es urgente, ya, cuanto antes o algo está caído; Baja si sin prisa; si no, Media.
- encargo: despacho si debe mandar a alguien de su equipo; ejecucion si la hace ella; null si no está claro.
- titulo: infinitivo + qué + dónde, máximo 80 caracteres («Revisar DVR que no graba en Angelópolis»).
- detalle: las indicaciones para quien la hará: solo lo que no cabe en el título (síntoma, cantidades, materiales, con quién, a quién llamar o entregar), en una o dos frases profesionales. No repitas el título ni agregues pasos u objetivos que nadie dijo («revisar la causa»), no expliques tu razonamiento, sin fechas, horas ni duración. null si no queda nada.
- No inventes personas, clientes, sucursales, proyectos, fechas ni cantidades.
- Si piden algún trabajo, devuelve la actividad aunque falten datos. Solo si no piden ningún trabajo: acciones vacío y en aclaracion una pregunta breve. Con actividades, aclaracion null.`;

export type PersonaAsignable = { id: number; nombre: string; puesto?: string | null; email?: string | null };
export type ClienteNexara = { id: number; name: string };
export type SucursalNexara = {
  id: number;
  clientId: number;
  name: string;
  branchNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  clientName: string;
};
export type ProyectoNexara = { id: number; title: string; clientId: number; clientName: string };

/**
 * Apodos frecuentes → nombres de pila, para encontrar a la persona en código antes de llamar
 * a la IA («Beto» → Roberto, «Paty» → Patricia, «Toño» → Antonio).
 */
const APODOS: Record<string, string[]> = {
  beto: ['roberto', 'alberto', 'norberto', 'heriberto', 'humberto'],
  paty: ['patricia'],
  pati: ['patricia'],
  tono: ['antonio'],
  tony: ['antonio'],
  pepe: ['jose'],
  chema: ['jose'],
  lupe: ['guadalupe'],
  lupita: ['guadalupe'],
  memo: ['guillermo'],
  paco: ['francisco'],
  pancho: ['francisco'],
  nacho: ['ignacio'],
  chuy: ['jesus'],
  chucho: ['jesus'],
  lalo: ['eduardo'],
  quique: ['enrique'],
  rafa: ['rafael'],
  fer: ['fernando', 'fernanda'],
  mafer: ['fernanda'],
  gaby: ['gabriela'],
  gabi: ['gabriela'],
  ale: ['alejandra', 'alejandro'],
  alex: ['alejandro', 'alejandra'],
  dani: ['daniela', 'daniel'],
  caro: ['carolina'],
  charly: ['carlos'],
  pau: ['paulina'],
  moni: ['monica'],
  vero: ['veronica'],
  lety: ['leticia'],
  isa: ['isabel'],
  santi: ['santiago'],
  tere: ['teresa'],
  mau: ['mauricio'],
  richi: ['ricardo'],
  poncho: ['alfonso'],
  cris: ['cristian', 'cristina'],
  mari: ['maria'],
  maru: ['maria'],
};

/**
 * Cómo suena una palabra (ya normalizada), para que el dictado no impida encontrarla:
 * «Toks» = «Tox», «Cristian» = «Christian», «Vanesa» = «Banessa».
 */
export function sonido(palabra: string): string {
  return palabra
    .replace(/chr/g, 'cr')
    .replace(/ch/g, '§')
    .replace(/h/g, '')
    .replace(/qu/g, 'k')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/ll/g, 'y')
    .replace(/ks/g, 'x')
    .replace(/w/g, 'u')
    .replace(/y$/, 'i')
    .replace(/(.)\1+/g, '$1')
    .replace(/§/g, 'ch');
}

/** Palabras con las que se puede nombrar algo (sin artículos, giros ni relleno). */
function palabrasNombre(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !PALABRAS_RELLENO.has(w) && !PALABRAS_GIRO.has(w))
    .map(sonido);
}

/** Lo dicho, como suena, con los apodos ya traducidos a nombres. */
function palabrasDichas(instruccion: string): string[] {
  const salida = new Set<string>();
  for (const w of normalizar(instruccion).split(' ')) {
    for (const nombre of APODOS[w] ?? []) salida.add(sonido(nombre));
    if (w.length >= 3 && !/^\d+$/.test(w) && !PALABRAS_RELLENO.has(w)) salida.add(sonido(w));
  }
  return [...salida];
}

function parecidas(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
}

/** Tope de cada lista de coincidencias que se manda a la IA. */
const MAX_COINCIDENCIAS = 8;

/**
 * Lo del catálogo que se mencionó (por nombre, apodo o como suena), resuelto en código antes
 * de llamar a la IA: se le manda solo esto en vez de toda la empresa. Lo que no aparece aquí
 * lo copia la IA tal cual y el código lo vuelve a buscar en el catálogo completo.
 */
export function catalogoRelevante(instruccion: string, catalogos: CatalogosNexara): CatalogosNexara {
  const dichas = palabrasDichas(instruccion);
  const coincide = (nombre: string) => palabrasNombre(nombre).some((w) => dichas.some((d) => parecidas(d, w)));
  const personas = catalogos.personas.filter((p) => coincide(p.nombre)).slice(0, MAX_COINCIDENCIAS);
  const sucursales = catalogos.sucursales.filter((s) => coincide(s.name)).slice(0, MAX_COINCIDENCIAS);
  const proyectos = catalogos.proyectos.filter((p) => coincide(p.title)).slice(0, MAX_COINCIDENCIAS);
  const deOtros = new Set([...sucursales.map((s) => s.clientId), ...proyectos.map((p) => p.clientId)]);
  const clientes = catalogos.clientes.filter((c) => coincide(c.name) || deOtros.has(c.id)).slice(0, MAX_COINCIDENCIAS);
  return {
    personas,
    clientes,
    // Solo sucursales de clientes que quedaron (o de los que se nombró la sucursal).
    sucursales: sucursales.filter((s) => clientes.some((c) => c.id === s.clientId)),
    proyectos,
  };
}

/** Las coincidencias como texto para el mensaje (lo variable va fuera de la caché). */
export function bloqueCoincidencias(rel: CatalogosNexara): string {
  const lista = (xs: string[], vacio = 'ninguno') => (xs.length ? xs.join('; ') : vacio);
  const cliente = (c: ClienteNexara) => {
    const suc = rel.sucursales.filter((s) => s.clientId === c.id).map((s) => s.name);
    return suc.length ? `${c.name} (sucursales: ${suc.join(', ')})` : c.name;
  };
  return [
    'Coincidencias en el catálogo (escribe estos nombres tal cual):',
    `Personas: ${lista(rel.personas.map((p) => p.nombre), 'ninguna')}`,
    `Clientes: ${lista(rel.clientes.map(cliente))}`,
    `Proyectos: ${lista(rel.proyectos.map((p) => `${p.title} (${p.clientName})`))}`,
  ].join('\n');
}

/** «sáb 2026-10-24, dom 2026-10-25, …»: los próximos días ya calculados en código. */
export function proximosDias(ahora: Date, dias = 7): string {
  const [y, m, d] = fechaLocalISO(ahora).split('-').map(Number);
  const salida: string[] = [];
  for (let i = 1; i <= dias; i++) {
    const dia = new Date(Date.UTC(y, m - 1, d + i, 12));
    salida.push(`${DIAS_SEMANA[dia.getUTCDay()].slice(0, 3)} ${dia.toISOString().slice(0, 10)}`);
  }
  return salida.join(', ');
}

/** Mensaje del turno: hoy, los próximos días, quién escribe, las coincidencias y la instrucción. */
export function mensajeUsuario(texto: string, ahora: Date, autor: string | null, coincidencias?: string): string {
  const fecha = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(ahora);
  const iso = fechaLocalISO(ahora);
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ahora);
  return [
    `Hoy: ${fecha} (${iso}), ${hora} hora de Ciudad de México.`,
    `Próximos días: ${proximosDias(ahora)}.`,
    autor ? `Quien escribe: ${autor}.` : null,
    coincidencias ?? null,
    '',
    `Instrucción:\n${texto.trim()}`,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

/**
 * Modelo y parámetros del asistente, medidos con el eval (`src/ai/eval/`, 23-10-2026): Haiku 5.5
 * en esfuerzo `low` y sin razonamiento sacó lo mismo que con razonamiento y que Sonnet 5.5
 * (15/15 en las revisiones de código), con la mitad de tokens de salida y ~2 s por llamada.
 * Con plazos, duración, faltantes y catálogo de clientes (23 casos, 23-10-2026): 0.94 con juez
 * (antes 0.85) y nota 4.3/5 (antes 3.6); con razonamiento costó 2.4× sin mejorar. Costo real
 * en producción (caché fría, que es lo normal con uso esporádico): con toda la empresa en el
 * prompt ~4,800 tokens de entrada y US$0.0007 por llamada; con solo las coincidencias y el
 * prompt corto, ver `.ai/RELEVO.md`.
 * El modelo se puede cambiar sin desplegar con `ANTHROPIC_ASSISTANT_MODEL`.
 */
export const CONFIG_ASISTENTE = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  // ~200 tokens por actividad; el plan admite hasta 10.
  maxTokens: 3_000,
  // Por intento ~10 s y un solo reintento: lo normal son 2–3 s; si no, mensaje claro y el
  // texto sigue en la caja para reintentar (antes 60 s × 3 intentos).
  timeoutMs: 10_000,
  reintentos: 1,
};

/** La petición completa a Claude (el servicio y el eval mandan exactamente lo mismo). */
export function peticionAsistente(
  instruccion: string,
  catalogos: CatalogosNexara,
  ahora: Date,
  autor: string | null,
) {
  return {
    // Solo el prompt fijo va en la caché; del catálogo va lo que se mencionó (resuelto en
    // código), no la empresa entera.
    sistema: [PROMPT_SISTEMA],
    usuario: mensajeUsuario(instruccion, ahora, autor, bloqueCoincidencias(catalogoRelevante(instruccion, catalogos))),
    esquema: ESQUEMA_PLAN,
    modelo: CONFIG_ASISTENTE.modelo,
    esfuerzo: CONFIG_ASISTENTE.esfuerzo,
    pensar: CONFIG_ASISTENTE.pensar,
    maxTokens: CONFIG_ASISTENTE.maxTokens,
    timeoutMs: CONFIG_ASISTENTE.timeoutMs,
    reintentos: CONFIG_ASISTENTE.reintentos,
  };
}

/** AAAA-MM-DD en hora de Ciudad de México. */
export function fechaLocalISO(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(d);
}

export function normalizar(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras que no distinguen un nombre de otro («CEDIS de Tox», «la Torre Médica»). */
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'con', 'para', 'por']);

/**
 * Palabras de giro: «Grupo», «Hotel», «Bodegas»… no distinguen a un cliente de otro, así
 * que «Tox nave 2» encuentra a «Grupo Tox» por su palabra propia («tox»).
 */
const PALABRAS_GIRO = new Set([
  'grupo', 'corporativo', 'corporacion', 'hotel', 'hospital', 'clinica', 'colegio', 'escuela', 'instituto',
  'universidad', 'bodega', 'bodegas', 'plaza', 'tienda', 'tiendas', 'sucursal', 'empresa', 'servicios',
  'centro', 'oficinas', 'farmacia', 'farmacias', 'restaurante', 'constructora', 'inmobiliaria',
  'sa', 'cv', 'sapi', 'rl', 'sc',
]);

function palabrasUtiles(s: string): string[] {
  return normalizar(s)
    .split(' ')
    .filter((w) => w.length >= 2 && !PALABRAS_VACIAS.has(w));
}

/**
 * Qué tan bien coincide `consulta` con `nombre` (0 = nada, 3 = igual).
 * 2: cada palabra de la consulta es (o empieza) una palabra del nombre («antonio» → «José
 *    Antonio Ramírez», «banor» → «Banorte»), o el nombre completo viene dentro de la consulta
 *    («Bodegas Luna Atlixco» → «Bodegas Luna», «Torre Médica del San Rafael» → «Torre Médica»).
 * 1: solo algunas palabras coinciden así: se propone, no se elige.
 */
export function puntaje(consulta: string, nombre: string): number {
  const c = normalizar(consulta);
  const n = normalizar(nombre);
  if (!c || !n) return 0;
  if (c === n) return 3;
  const palabrasN = n.split(' ');
  const palabrasC = palabrasUtiles(consulta);
  const esInicio = (w: string) => palabrasN.some((p) => p.startsWith(w));
  if (palabrasC.length && palabrasC.every((w) => palabrasN.includes(w) || (w.length >= 3 && esInicio(w)))) return 2;
  const utilesN = palabrasUtiles(nombre);
  if (utilesN.length && utilesN.every((w) => palabrasC.includes(w))) return 2;
  // «Tox nave 2» → «Grupo Tox»: basta con las palabras propias del nombre (sin el giro).
  const propiasN = utilesN.filter((w) => w.length >= 3 && !PALABRAS_GIRO.has(w));
  if (propiasN.length && propiasN.every((w) => palabrasC.includes(w))) return 2;
  if (palabrasC.some((w) => w.length >= 3 && esInicio(w))) return 1;
  return 0;
}

/** Palabras que no aportan al comparar indicaciones con el título. */
const PALABRAS_RELLENO = new Set([
  ...PALABRAS_VACIAS,
  'que', 'se', 'un', 'una', 'unos', 'unas', 'su', 'sus', 'es', 'son', 'esta', 'este', 'esto', 'estos', 'lo', 'le',
  'les', 'hay', 'muy', 'sobre', 'realizar', 'hacer', 'llevar', 'cabo', 'favor', 'cliente', 'sitio', 'actividad',
]);

/** Raíz corta para que «graba» y «grabando» o «cablear» y «cableado» cuenten igual. */
function raicesDe(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((w) => w.length >= 3 && !PALABRAS_RELLENO.has(w))
    .map((w) => w.slice(0, 5));
}

/**
 * Las indicaciones que solo repiten el título («Adquirir 20 conectores RJ45…» bajo «Comprar
 * 20 conectores RJ45…») no le dicen nada a quien la hace: se quitan. Se quedan si traen al
 * menos una palabra nueva (o dos, cuando es un texto largo: suele ser el sinónimo del verbo)
 * o una cantidad que el título no tiene.
 */
export function indicacionesSinEco(indicaciones: string | null | undefined, titulo: string, conocidas: Array<string | null | undefined> = []): string | null {
  const texto = (indicaciones || '').trim();
  if (!texto) return null;
  const numerosTitulo = new Set(titulo.match(/\d+/g) ?? []);
  if ((texto.match(/\d+/g) ?? []).some((n) => !numerosTitulo.has(n))) return texto;
  const vistas = new Set([titulo, ...conocidas].flatMap((t) => (t ? raicesDe(t) : [])));
  const propias = new Set(raicesDe(texto));
  const nuevas = [...propias].filter((w) => !vistas.has(w));
  // «Colocar 12 pantallas» bajo «Instalar 12 pantallas»: lo único nuevo es el verbo.
  const primera = normalizar(texto).split(' ')[0] ?? '';
  const soloVerbo = nuevas.length === 1 && /(ar|er|ir)$/.test(primera) && nuevas[0] === primera.slice(0, 5);
  if (!nuevas.length || soloVerbo || (nuevas.length === 1 && propias.size >= 4)) return null;
  return texto;
}

/**
 * ¿Se mencionó `lugar` en la instrucción? Basta una palabra propia o un número de su nombre
 * («la 14», «Angelópolis», «CEDIS»). Así no se cuela la única sucursal de un cliente cuando
 * solo dijeron el cliente.
 */
export function lugarDicho(lugar: string | null | undefined, instruccion?: string): boolean {
  if (!lugar) return false;
  if (!instruccion) return true;
  const dichas = new Set(raicesDe(instruccion));
  const numeros = new Set(normalizar(instruccion).match(/\d+/g) ?? []);
  const propias = normalizar(lugar)
    .split(' ')
    .filter((w) => /^\d+$/.test(w) || (w.length >= 3 && !PALABRAS_GIRO.has(w) && !PALABRAS_RELLENO.has(w)));
  if (!propias.length) return true;
  return propias.some((w) => (/^\d+$/.test(w) ? numeros.has(w) : dichas.has(w.slice(0, 5))));
}

/** Quita de `texto` las palabras de `nombre` («CEDIS de Tox» sin «Grupo Tox» → «CEDIS»). */
function sinPalabrasDe(texto: string | null, nombre: string): string | null {
  if (!texto) return null;
  const quitar = new Set(palabrasUtiles(nombre));
  const resto = palabrasUtiles(texto).filter((w) => !quitar.has(w));
  return resto.length ? resto.join(' ') : null;
}

export type Coincidencia<T> = { elegido: T | null; candidatos: T[] };

/** Elige solo cuando hay un único mejor resultado; si empatan, deja que la persona escoja. */
export function buscar<T>(consulta: string | null, items: T[], nombreDe: (t: T) => string, max = 5): Coincidencia<T> {
  if (!consulta || !normalizar(consulta)) return { elegido: null, candidatos: [] };
  const puntuados = items
    .map((item) => ({ item, p: puntaje(consulta, nombreDe(item)) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p);
  if (!puntuados.length) return { elegido: null, candidatos: [] };
  const mejor = puntuados[0].p;
  const empatados = puntuados.filter((x) => x.p === mejor);
  return {
    elegido: empatados.length === 1 && mejor >= 2 ? empatados[0].item : null,
    candidatos: puntuados.slice(0, max).map((x) => x.item),
  };
}

/** `AAAA-MM-DD` + `HH:MM` de CDMX → ISO UTC. null si falta la fecha o no es válida. */
export function aFechaISO(fecha: string | null, hora: string | null): string | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const h = hora && /^\d{1,2}:\d{2}$/.test(hora) ? hora.padStart(5, '0') : '09:00';
  const d = new Date(`${fecha}T${h}:00${DESFASE_CDMX}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function esDia(s: string | null | undefined): s is string {
  return Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime()));
}

function aHora(s: string | null | undefined): string | null {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  return h <= 23 && m <= 59 ? s.padStart(5, '0') : null;
}

/** Hora actual de CDMX redondeada a los siguientes 5 minutos (tope 23:55). */
export function horaActualRedondeada(ahora: Date): string {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(ahora)
    .split(':')
    .map(Number);
  const total = Math.min(23 * 60 + 55, Math.ceil((h * 60 + m) / 5) * 5);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Agenda que se guarda, como en el formulario «Asignar» (día, hora y «Al» para varios días).
 * - Cita o inicio («mañana a las 9»): un solo momento.
 * - Plazo («para el viernes»): empieza hoy (o el día que dijeron) y vence el día del plazo; si
 *   son días distintos va como periodo, así se queda en la pizarra cada día y no cuenta como
 *   atrasada antes del último.
 * - Sin hora: hoy, la hora actual; otro día, 09:00 (la del formulario).
 */
export type Agenda = {
  dia: string | null;
  hora: string | null;
  /** Último día cuando dura varios (`periodoFin`); null si es de un solo día. */
  hasta: string | null;
  /** false = la hora no se dijo y se puso la de omisión. */
  horaDicha: boolean;
};

/** ¿La instrucción dice algún día («hoy», «mañana», «el viernes», «3 de noviembre», «24/10»)? */
export function mencionaDia(instruccion: string): boolean {
  // `normalizar` deja letras, números y espacios: «24/10» llega como «24 10».
  return /\b(hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2} de [a-z]+|\d{1,2} \d{1,2})\b/.test(normalizar(instruccion));
}

/**
 * «Que vaya a las 8» a las 10:30 sin decir día: es mañana a las 8, no hoy en el pasado. La
 * IA a veces lo pone hoy; en código se corrige cuando la instrucción no dice ningún día.
 */
export function corregirHoraPasada<T extends Pick<AccionPlan, 'fecha' | 'hora'>>(accion: T, ahora: Date, instruccion?: string): T {
  const hora = aHora(accion.hora);
  if (!instruccion || !hora || accion.fecha !== fechaLocalISO(ahora) || mencionaDia(instruccion)) return accion;
  if (hora >= horaActualRedondeada(new Date(ahora.getTime() - 15 * 60_000))) return accion;
  return { ...accion, fecha: fechaLocalISO(new Date(ahora.getTime() + 86_400_000)) };
}

export function agendaDe(accion: Pick<AccionPlan, 'fecha' | 'hora' | 'fechaLimite'>, ahora: Date): Agenda {
  const hoy = fechaLocalISO(ahora);
  const limite = esDia(accion.fechaLimite) ? accion.fechaLimite : null;
  let dia = esDia(accion.fecha) ? accion.fecha : limite ? (limite < hoy ? limite : hoy) : null;
  // Un inicio después del plazo no tiene sentido: se hace el día del plazo.
  if (dia && limite && dia > limite) dia = limite;
  const dicha = aHora(accion.hora);
  const hora = dicha ?? (dia === hoy ? horaActualRedondeada(ahora) : dia ? '09:00' : null);
  return { dia, hora, hasta: dia && limite && limite > dia ? limite : null, horaDicha: Boolean(dicha) };
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «miércoles 21 de octubre» (a mano: el formato de Intl cambia entre versiones de Node). */
function diaLargo(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** «vie 23 oct». */
function diaCorto(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${DIAS_SEMANA[d.getUTCDay()].slice(0, 3).replace('á', 'a').replace('é', 'e')} ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`;
}

export type Referencia = { id: number; nombre: string };

export type PropuestaActividad = {
  tipo: TipoActividad;
  tipoEtiqueta: string;
  razonTipo: string;
  resumen: string;
  titulo: string;
  textoResponsable: string | null;
  responsable: Referencia | null;
  responsableCandidatos: Referencia[];
  textoCliente: string | null;
  cliente: Referencia | null;
  clienteCandidatos: Referencia[];
  sucursal: Referencia | null;
  proyecto: Referencia | null;
  proyectoCandidatos: Referencia[];
  fechaInicio: string | null;
  /** Día, hora y último día tal como quedan (CDMX), para mostrarlos y corregirlos en la tarjeta. */
  agenda: Agenda;
  duracionMin: number | null;
  prioridad: 'Alta' | 'Media' | 'Baja';
  encargo: 'ejecucion' | 'despacho' | null;
  indicaciones: string | null;
  /**
   * Lo que no se dijo y hay que completar en la tarjeta: responsable, cliente (servicio),
   * proyecto (obra/proyecto), fecha y duración.
   */
  faltantes: string[];
  avisos: string[];
  /** Cuerpo para `POST /activities` (sin `responsableId` si aún no se eligió). */
  payload: Record<string, unknown>;
};

export type CatalogosNexara = {
  personas: PersonaAsignable[];
  clientes: ClienteNexara[];
  sucursales: SucursalNexara[];
  proyectos: ProyectoNexara[];
};

const ref = (id: number, nombre: string): Referencia => ({ id, nombre });

function recortar(s: string | null | undefined, max: number): string | undefined {
  const t = (s || '').trim();
  return t ? t.slice(0, max) : undefined;
}

function horaLegible(iso: string | null, ahora: Date): string {
  if (!iso) return 'sin fecha';
  const d = new Date(iso);
  const dia = fechaLocalISO(d);
  const hoy = fechaLocalISO(ahora);
  const manana = fechaLocalISO(new Date(ahora.getTime() + 86_400_000));
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const cuando =
    dia === hoy
      ? 'hoy'
      : dia === manana
        ? 'mañana'
        : new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'short' }).format(d);
  return `${cuando} ${hora}`;
}

/**
 * Personas que también encajan con lo que la instrucción dijo de `elegida` (las palabras de su
 * nombre que aparecen en el texto). null si no hay empate o si se nombró por apodo («Beto»).
 */
export function mencionAmbigua(
  elegida: PersonaAsignable,
  personas: PersonaAsignable[],
  instruccion: string,
): PersonaAsignable[] | null {
  const dichas = new Set(palabrasUtiles(instruccion));
  const mencion = palabrasUtiles(elegida.nombre).filter((w) => dichas.has(w));
  if (!mencion.length) return null;
  const otras = personas.filter(
    (p) => p.id !== elegida.id && mencion.every((w) => palabrasUtiles(p.nombre).includes(w)),
  );
  return otras.length ? [elegida, ...otras] : null;
}

/** Convierte una acción del plan en una propuesta lista para confirmar. */
export function construirPropuesta(
  accion: AccionPlan,
  catalogos: CatalogosNexara,
  contexto: { creadoPorId: number; ahora: Date; instruccion?: string },
): PropuestaActividad {
  const tipo: TipoActividad = (TIPOS_ACTIVIDAD as readonly string[]).includes(accion.tipo) ? accion.tipo : 'tarea';
  const avisos: string[] = [];
  const faltantes: string[] = [];

  // Persona. Si la IA eligió a alguien que en la instrucción solo se nombró con palabras que
  // comparte con otra persona («Antonio» con dos Antonio en la lista), no se elige.
  const persona = buscar(accion.responsable, catalogos.personas, (p) => p.nombre);
  let responsable = persona.elegido ? ref(persona.elegido.id, persona.elegido.nombre) : null;
  let candidatosPersona = persona.candidatos;
  if (persona.elegido && contexto.instruccion) {
    const empatadas = mencionAmbigua(persona.elegido, catalogos.personas, contexto.instruccion);
    if (empatadas) {
      responsable = null;
      candidatosPersona = empatadas;
      avisos.push(`El nombre que dijeron puede ser ${empatadas.map((p) => p.nombre).join(' o ')}: elige a la persona.`);
    }
  }
  if (!responsable) {
    faltantes.push('responsable');
    if (accion.responsable && !candidatosPersona.length) {
      avisos.push(`No encontré a «${accion.responsable}» entre las personas que puedes asignar.`);
    }
  }

  // Cliente / sucursal: «Tox» puede ser el cliente o una de sus sucursales. Un sitio que no
  // se mencionó (la IA lo sacó del catálogo) no se usa.
  const sitio = lugarDicho(accion.sitio, contexto.instruccion) ? accion.sitio : null;
  const textoCliente = accion.cliente || sitio;
  let cliente: Referencia | null = null;
  let sucursal: SucursalNexara | null = null;
  let clienteCandidatos: Referencia[] = [];
  const porCliente = buscar(accion.cliente, catalogos.clientes, (c) => c.name);
  if (porCliente.elegido) cliente = ref(porCliente.elegido.id, porCliente.elegido.name);
  // «Bodegas Luna Atlixco» puede llegar solo como sitio: el cliente también se busca ahí.
  if (!cliente && sitio) {
    const porSitio = buscar(sitio, catalogos.clientes, (c) => c.name);
    if (porSitio.elegido) cliente = ref(porSitio.elegido.id, porSitio.elegido.name);
  }
  const sucursalesDelCliente = cliente
    ? catalogos.sucursales.filter((s) => s.clientId === cliente!.id)
    : catalogos.sucursales;
  const consultaSucursal = sitio || (cliente ? null : accion.cliente);
  const porSucursal = buscar(
    cliente ? sinPalabrasDe(consultaSucursal, cliente.nombre) : consultaSucursal,
    sucursalesDelCliente,
    (s) => s.name,
  );
  if (porSucursal.elegido) {
    sucursal = porSucursal.elegido;
    if (!cliente) cliente = ref(sucursal.clientId, sucursal.clientName);
  }
  if (!cliente) {
    const vistos = new Set<number>();
    for (const c of porCliente.candidatos) {
      if (!vistos.has(c.id)) clienteCandidatos.push(ref(c.id, c.name));
      vistos.add(c.id);
    }
    for (const s of porSucursal.candidatos) {
      if (!vistos.has(s.clientId)) clienteCandidatos.push(ref(s.clientId, s.clientName));
      vistos.add(s.clientId);
    }
    clienteCandidatos = clienteCandidatos.slice(0, 5);
  }

  // Proyecto (obra / proyecto): el del cliente si es uno solo, o por nombre.
  let proyecto: Referencia | null = null;
  let proyectoCandidatos: Referencia[] = [];
  if (tipo === 'obra' || tipo === 'proyecto') {
    const delCliente = cliente ? catalogos.proyectos.filter((p) => p.clientId === cliente!.id) : [];
    const porNombre = buscar(accion.cliente || sitio || accion.titulo, catalogos.proyectos, (p) => `${p.title} ${p.clientName}`);
    if (delCliente.length === 1) proyecto = ref(delCliente[0].id, delCliente[0].title);
    else if (!cliente && porNombre.elegido) {
      proyecto = ref(porNombre.elegido.id, porNombre.elegido.title);
      cliente = ref(porNombre.elegido.clientId, porNombre.elegido.clientName);
    }
    if (!proyecto) {
      proyectoCandidatos = (delCliente.length ? delCliente : porNombre.candidatos).slice(0, 5).map((p) => ref(p.id, p.title));
      faltantes.push('proyecto');
    }
  }

  if (tipo === 'servicio' && !cliente) faltantes.push('cliente');
  if (textoCliente && !cliente && tipo !== 'servicio') {
    avisos.push(`«${textoCliente}» no es un cliente registrado; quedará como lugar en la actividad.`);
  }

  // Fechas como el formulario «Asignar»: inicio = entrega = máxima; con plazo de varios días,
  // además el periodo (la API pone la máxima y la entrega al fin de su último día).
  const agenda = agendaDe(corregirHoraPasada(accion, contexto.ahora, contexto.instruccion), contexto.ahora);
  const fechaInicio = aFechaISO(agenda.dia, agenda.hora);
  const hoy = fechaLocalISO(contexto.ahora);
  if (agenda.hasta ? agenda.hasta < hoy : fechaInicio && new Date(fechaInicio).getTime() < contexto.ahora.getTime() - 15 * 60_000) {
    avisos.push('La fecha quedó en el pasado; revísala.');
  }
  if (!agenda.dia) faltantes.push('fecha');
  const duracion =
    accion.duracionMin && accion.duracionMin > 0 ? Math.min(TOPE_MINUTOS, Math.round(accion.duracionMin)) : undefined;
  if (!duracion) faltantes.push('duración');

  // La hora límite no tiene columna (el plazo vence al fin del día): se escribe en las indicaciones.
  const horaLimite = aHora(accion.horaLimite);
  const diaLimite = esDia(accion.fechaLimite) ? accion.fechaLimite : agenda.dia;
  const notaLimite = horaLimite && diaLimite ? `Entregar a más tardar el ${diaLargo(diaLimite)} a las ${horaLimite}.` : null;
  const tituloFinal = recortar(accion.titulo, 200) || 'Actividad';
  const propias = indicacionesSinEco(accion.indicaciones, tituloFinal, [
    responsable?.nombre,
    accion.responsable,
    cliente?.nombre,
    accion.cliente,
    accion.sitio,
    sucursal?.name,
  ]);
  const indicaciones = [propias, notaLimite].filter(Boolean).join(' ') || null;
  const prioridad = (['Alta', 'Media', 'Baja'] as const).includes(accion.prioridad) ? accion.prioridad : 'Media';
  const encargo = accion.encargo === 'ejecucion' || accion.encargo === 'despacho' ? accion.encargo : null;

  const conProyecto = tipo === 'obra' || tipo === 'proyecto';
  const subtipo = accion.subtipo ?? null;
  const subtipoTarea = (SUBTIPOS_TAREA as readonly string[]).includes(subtipo ?? '') ? subtipo : accion.subtipoTarea;
  const tipoServicio = (TIPOS_SERVICIO as readonly string[]).includes(subtipo ?? '') ? subtipo : accion.tipoServicio;
  const ticketType =
    tipo === 'obra'
      ? 'INSTALACION'
      : tipo === 'tarea' || tipo === 'comercial'
        ? 'OTRO'
        : tipoServicio || 'PREVENTIVO';
  const ticketTypeCustom =
    tipo === 'comercial' ? 'COMERCIAL' : tipo === 'tarea' ? subtipoTarea || 'Otro' : undefined;

  const payload: Record<string, unknown> = {
    titulo: tituloFinal,
    indicaciones: recortar(indicaciones, 4000),
    prioridad,
    estatus: 'Pendiente',
    coreKind: tipo,
    activityType: conProyecto ? 'CLIENT' : 'INTERNAL',
    ticketType,
    ticketTypeCustom,
    workType: 'ISSUE',
    creadoPorId: contexto.creadoPorId,
    evidencePhotoRequired: 4,
    tiempoEstimadoMin: duracion,
    fechaInicio: fechaInicio ?? undefined,
    fechaEntregaEsperada: fechaInicio ?? undefined,
    fechaMaxima: fechaInicio ?? undefined,
    periodoInicio: agenda.hasta ? agenda.dia : undefined,
    periodoFin: agenda.hasta ?? undefined,
    assignmentCharge: encargo ?? undefined,
    clientId: cliente?.id,
    projectId: proyecto?.id,
  };
  if (responsable) payload.responsableId = responsable.id;
  if (sucursal) {
    payload.branchName = recortar(sucursal.name, 160);
    payload.branchNumber = recortar(sucursal.branchNumber, 60);
    payload.branchCity = recortar(sucursal.city, 120);
    payload.branchState = recortar(sucursal.state, 120);
    payload.branchAddress = recortar(sucursal.address, 220);
  } else if (sitio || (textoCliente && !cliente)) {
    payload.branchName = recortar(sitio || textoCliente, 160);
  }
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

  const partes = [
    ETIQUETA_TIPO[tipo] + (tipo === 'tarea' && ticketTypeCustom && ticketTypeCustom !== 'Otro' ? ` · ${ticketTypeCustom}` : ''),
    `para ${responsable?.nombre ?? accion.responsable ?? '(sin responsable)'}`,
    cliente ? `en ${cliente.nombre}${sucursal ? ` · ${sucursal.name}` : ''}` : textoCliente ? `en ${textoCliente}` : null,
    horaLegible(fechaInicio, contexto.ahora) + (agenda.hasta ? ` · vence ${diaCorto(agenda.hasta)}` : ''),
  ].filter(Boolean);

  return {
    tipo,
    tipoEtiqueta: ETIQUETA_TIPO[tipo],
    razonTipo: accion.razonTipo || '',
    resumen: partes.join(' '),
    titulo: String(payload.titulo),
    textoResponsable: accion.responsable,
    responsable,
    responsableCandidatos: responsable ? [] : candidatosPersona.map((p) => ref(p.id, p.nombre)),
    textoCliente: textoCliente ?? null,
    cliente,
    clienteCandidatos,
    sucursal: sucursal ? ref(sucursal.id, sucursal.name) : null,
    proyecto,
    proyectoCandidatos,
    fechaInicio,
    agenda,
    duracionMin: duracion ?? null,
    prioridad,
    encargo,
    indicaciones: (payload.indicaciones as string | undefined) ?? null,
    faltantes,
    avisos,
    payload,
  };
}
