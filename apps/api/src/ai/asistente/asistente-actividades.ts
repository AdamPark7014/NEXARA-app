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
 * - Los nombres mal oídos o mal escritos («talks» por Tox) los empata `nombres.ts` con el
 *   catálogo real; la IA nunca decide un cliente que no existe.
 */
import {
  PALABRAS_GIRO,
  PALABRAS_RELLENO,
  buscar,
  corregidoDe,
  corregirEnTexto,
  mencion,
  normalizar,
  palabrasDe,
  palabrasUtiles,
  parecido,
  type Corregido,
} from './nombres.js';

export const TIPOS_ACTIVIDAD = ['tarea', 'proyecto', 'obra', 'servicio', 'comercial'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

export const ETIQUETA_TIPO: Record<TipoActividad, string> = {
  tarea: 'Tarea',
  proyecto: 'Proyecto',
  obra: 'Obra',
  servicio: 'Servicio',
  comercial: 'Comercial',
};

/**
 * Subtipos de Tarea: el catálogo cerrado del 28-10 (mismos textos que `TAREA_TIPOS` en la web;
 * viajan en ticketTypeCustom). «Otro» ya no se ofrece al modelo: queda solo de respaldo si no
 * elige ninguno (`SUBTIPO_RESPALDO`).
 */
export const SUBTIPOS_TAREA = [
  'Instalación',
  'Cableado y canalización',
  'Mantenimiento preventivo',
  'Correctivo y diagnóstico',
  'Levantamiento',
  'Recolección',
  'Entrega',
  'Preparación de equipo',
  'Diseño, CAD y memoria técnica',
  'Configuración y soporte remoto',
  'Trámite',
  'Compra de material',
  'Facturación y contabilidad',
  'Reporte / documentación',
  'Capacitación',
  'Junta',
  'Evento o guardia',
] as const;

const SUBTIPO_RESPALDO = 'Otro';

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
- tarea: sin proyecto. sub (elige siempre uno): Instalación (equipo nuevo: cámaras, control de acceso, biométrico, red, audio), Cableado y canalización (cable, tubería, charola, nodos), Mantenimiento preventivo, Correctivo y diagnóstico (falla, revisar por qué no funciona), Levantamiento (revisar o medir un sitio antes de cotizar), Recolección, Entrega (llevar material, traslados), Preparación de equipo (almacén, armar y probar antes de ir), Diseño, CAD y memoria técnica, Configuración y soporte remoto (software, NVR, Hik-Connect, Fortinet, módem), Trámite (fianzas, permisos, pagos, cheques), Compra de material, Facturación y contabilidad, Reporte / documentación (hacer o mandar un reporte o documento), Capacitación, Junta (reunión o llamada para revisar o acordar algo, también con un cliente), Evento o guardia.
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

export { normalizar, sonido, puntaje, buscar, type Coincidencia } from './nombres.js';

export type PersonaAsignable = {
  id: number;
  nombre: string;
  puesto?: string | null;
  email?: string | null;
  /** `HH:MM` de su entrada (10:00 la oficina, 08:00 la cuadrilla); null = sin horario. */
  horaEntrada?: string | null;
};

/** La entrada de la oficina: la hora de inicio de quien no tiene horario. */
export const HORA_ENTRADA_OFICINA = '10:00';
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

/** Tope de cada lista de coincidencias que se manda a la IA. */
const MAX_COINCIDENCIAS = 8;

/** Lo que el catálogo relevante sabe además: cómo se dijo lo que no se dijo igual. */
export type CatalogoRelevante = CatalogosNexara & {
  /** «cliente:101» → «talks»: lo que se oyó cuando no fue el nombre tal cual. */
  comoSeDijo: Record<string, string>;
};

/**
 * Lo del catálogo que se mencionó (por nombre, apodo, como suena, siglas o casi igual),
 * resuelto en código antes de llamar a la IA: se le manda solo esto en vez de toda la
 * empresa, primero lo que coincide mejor. Lo que no aparece aquí lo copia la IA tal cual y
 * el código lo vuelve a buscar en el catálogo completo.
 */
export function catalogoRelevante(instruccion: string, catalogos: CatalogosNexara): CatalogoRelevante {
  const dichas = palabrasDe(instruccion);
  const comoSeDijo: Record<string, string> = {};
  const elegir = <T>(items: T[], tipo: string, idDe: (t: T) => number, nombreDe: (t: T) => string, extra?: (t: T) => boolean) =>
    items
      .map((item, orden) => ({ item, orden, m: mencion(dichas, nombreDe(item)) }))
      .filter((x) => x.m.nivel >= 1 || extra?.(x.item))
      .sort((a, b) => b.m.nivel - a.m.nivel || a.orden - b.orden)
      .slice(0, MAX_COINCIDENCIAS)
      .map((x) => {
        if (x.m.comoSeDijo) comoSeDijo[`${tipo}:${idDe(x.item)}`] = x.m.comoSeDijo;
        return x.item;
      });
  const personas = elegir(catalogos.personas, 'persona', (p) => p.id, (p) => p.nombre);
  const sucursales = elegir(catalogos.sucursales, 'sucursal', (s) => s.id, (s) => s.name);
  const proyectos = elegir(catalogos.proyectos, 'proyecto', (p) => p.id, (p) => p.title);
  const deOtros = new Set([...sucursales.map((s) => s.clientId), ...proyectos.map((p) => p.clientId)]);
  const clientes = elegir(catalogos.clientes, 'cliente', (c) => c.id, (c) => c.name, (c) => deOtros.has(c.id));
  // Nombres ya usados en actividades que no son clientes («Toks»): solo si suenan igual.
  const nombresUsados = (catalogos.nombresUsados ?? []).filter((n) => {
    const m = mencion(dichas, n);
    if (m.nivel < 2 || m.nivel >= 3 || !m.comoSeDijo) return false;
    comoSeDijo[`nombre:${n}`] = m.comoSeDijo;
    return true;
  });
  return {
    personas,
    clientes,
    // Solo sucursales de clientes que quedaron (o de los que se nombró la sucursal).
    sucursales: sucursales.filter((s) => clientes.some((c) => c.id === s.clientId)),
    proyectos,
    nombresUsados: nombresUsados.slice(0, MAX_COINCIDENCIAS),
    comoSeDijo,
  };
}

/** Las coincidencias como texto para el mensaje (lo variable va fuera de la caché). */
export function bloqueCoincidencias(rel: CatalogosNexara & { comoSeDijo?: Record<string, string> }): string {
  const lista = (xs: string[], vacio = 'ninguno') => (xs.length ? xs.join('; ') : vacio);
  const dicho = (clave: string) => (rel.comoSeDijo?.[clave] ? ` («${rel.comoSeDijo[clave]}»)` : '');
  const cliente = (c: ClienteNexara) => {
    const suc = rel.sucursales.filter((s) => s.clientId === c.id).map((s) => s.name + dicho(`sucursal:${s.id}`));
    return `${c.name}${dicho(`cliente:${c.id}`)}${suc.length ? ` (sucursales: ${suc.join(', ')})` : ''}`;
  };
  const usados = rel.nombresUsados?.length ? rel.nombresUsados.map((n) => n + dicho(`nombre:${n}`)) : null;
  return [
    'Coincidencias en el catálogo (escribe estos nombres tal cual; entre « » cómo se oyó):',
    `Personas: ${lista(rel.personas.map((p) => p.nombre + dicho(`persona:${p.id}`)), 'ninguna')}`,
    `Clientes: ${lista(rel.clientes.map(cliente))}`,
    `Proyectos: ${lista(rel.proyectos.map((p) => `${p.title} (${p.clientName})${dicho(`proyecto:${p.id}`)}`))}`,
    usados ? `Otros nombres ya usados (no son clientes): ${usados.join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
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
  const dicha = (w: string) => dichas.has(w.slice(0, 5)) || (w.length >= 4 && [...dichas].some((d) => d.startsWith(w)));
  if (propias.some((w) => (/^\d+$/.test(w) ? numeros.has(w) : dicha(w)))) return true;
  // Dicho como suena («Toks» en el lugar y «talks» en la instrucción).
  return mencion(palabrasDe(instruccion), lugar).nivel >= 2;
}

/** Quita de `texto` las palabras de `nombre`, también como suenan («talks nave 2» sin «Grupo Tox» → «nave 2»). */
function sinPalabrasDe(texto: string | null, nombre: string): string | null {
  if (!texto) return null;
  const quitar = palabrasUtiles(nombre);
  const resto = palabrasUtiles(texto).filter((w) => !quitar.some((q) => q === w || parecido(w, q) >= 2));
  return resto.length ? resto.join(' ') : null;
}

/** `AAAA-MM-DD` + `HH:MM` de CDMX → ISO UTC. null si falta la fecha o no es válida. */
export function aFechaISO(fecha: string | null, hora: string | null): string | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const h = hora && /^\d{1,2}:\d{2}$/.test(hora) ? hora.padStart(5, '0') : HORA_ENTRADA_OFICINA;
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
 * - Sin hora: hoy, la hora actual; otro día, la entrada de quien ejecuta (10:00 la oficina, 08:00 la
 *   cuadrilla), como el formulario.
 */
export type Agenda = {
  dia: string | null;
  hora: string | null;
  /** Último día cuando dura varios (`periodoFin`); null si es de un solo día. */
  hasta: string | null;
  /** false = la hora no se dijo y se puso la de omisión. */
  horaDicha: boolean;
  /** La hora es la entrada de quien ejecuta (no se dijo y es otro día): cambia si cambia la persona. */
  horaPorEntrada?: boolean;
  /**
   * «Entregar a más tardar» (`HH:MM`, el mismo día y después de la hora): la fecha máxima y
   * la entrega quedan a esa hora, como en el formulario. null si no la dijeron o dura varios días.
   */
  compromiso: string | null;
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

export function agendaDe(
  accion: Pick<AccionPlan, 'fecha' | 'hora' | 'fechaLimite'> & Partial<Pick<AccionPlan, 'horaLimite'>>,
  ahora: Date,
  entrada?: string | null,
): Agenda {
  const hoy = fechaLocalISO(ahora);
  const limite = esDia(accion.fechaLimite) ? accion.fechaLimite : null;
  let dia = esDia(accion.fecha) ? accion.fecha : limite ? (limite < hoy ? limite : hoy) : null;
  // Un inicio después del plazo no tiene sentido: se hace el día del plazo.
  if (dia && limite && dia > limite) dia = limite;
  const dicha = aHora(accion.hora);
  const hora = dicha ?? (dia === hoy ? horaActualRedondeada(ahora) : dia ? aHora(entrada) ?? HORA_ENTRADA_OFICINA : null);
  const hasta = dia && limite && limite > dia ? limite : null;
  const horaLimite = aHora(accion.horaLimite);
  const compromiso = dia && !hasta && horaLimite && hora && horaLimite > hora ? horaLimite : null;
  // Solo cuando aplica: la hora puesta por la entrada cambia si en la tarjeta se elige a otra persona.
  const porEntrada = !dicha && Boolean(dia) && dia !== hoy;
  return { dia, hora, hasta, horaDicha: Boolean(dicha), ...(porEntrada ? { horaPorEntrada: true } : {}), compromiso };
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
  /** Nombres que el código corrigió («talks» → Grupo Tox), para decirlo en cada campo. */
  correcciones: Correccion[];
  /** Cuerpo para `POST /activities` (sin `responsableId` si aún no se eligió). */
  payload: Record<string, unknown>;
};

export type CatalogosNexara = {
  personas: PersonaAsignable[];
  clientes: ClienteNexara[];
  sucursales: SucursalNexara[];
  proyectos: ProyectoNexara[];
  /**
   * Nombres propios ya escritos en actividades que no son clientes («Toks», «Sephora»), para
   * escribir igual lo que el dictado oyó distinto. Opcional: el eval y las pruebas no lo usan.
   */
  nombresUsados?: string[];
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
  const dichasDeElla = palabrasUtiles(elegida.nombre).filter((w) => dichas.has(w));
  if (!dichasDeElla.length) return null;
  const otras = personas.filter(
    (p) => p.id !== elegida.id && dichasDeElla.every((w) => palabrasUtiles(p.nombre).includes(w)),
  );
  return otras.length ? [elegida, ...otras] : null;
}

/** De quién es cada corrección de nombre que se muestra en la tarjeta. */
export type Correccion = {
  campo: 'responsable' | 'cliente' | 'sucursal' | 'proyecto' | 'lugar';
  /** Lo que se dijo o escribió («talks», «Chava»). */
  de: string;
  /** El nombre que quedó («Grupo Tox», «Salvador Ortiz Bravo»). */
  a: string;
  /** apodo («Chava» = Salvador) o parecido (mal oído o mal escrito). */
  como: 'apodo' | 'parecido';
};

/** Lo dicho de otra forma: primero cómo quedó en la instrucción y si no, lo que escribió la IA. */
function corregido(nombre: string, ...textos: Array<string | null | undefined>): Corregido | null {
  for (const t of textos) {
    const c = corregidoDe(nombre, t);
    if (c) return c;
  }
  return null;
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
  const correcciones: Correccion[] = [];
  /** Palabras mal oídas → bien, para el título, las indicaciones y el lugar. */
  const pares: Corregido['pares'] = [];
  const anotar = (campo: Correccion['campo'], nombre: string, c: Corregido | null) => {
    if (!c) return;
    correcciones.push({ campo, de: c.de, a: nombre, como: c.como });
    pares.push(...c.pares);
  };
  const aproximado = { aproximado: true } as const;

  // Persona. Si la IA eligió a alguien que en la instrucción solo se nombró con palabras que
  // comparte con otra persona («Antonio» con dos Antonio en la lista), no se elige. Lo mal
  // oído («Jair» por Yahir) se empata en código y se dice.
  const persona = buscar(accion.responsable, catalogos.personas, (p) => p.nombre, 5, aproximado);
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
  if (responsable) {
    const c = corregido(responsable.nombre, contexto.instruccion, accion.responsable);
    // Los apodos no se cambian en el texto («Chava» puede quedarse en las indicaciones).
    if (c) anotar('responsable', responsable.nombre, c.como === 'apodo' ? { ...c, pares: [] } : c);
  } else {
    faltantes.push('responsable');
    if (accion.responsable && !candidatosPersona.length) {
      avisos.push(`No encontré a «${accion.responsable}» entre las personas que puedes asignar.`);
    } else if (accion.responsable && candidatosPersona.length > 1 && !avisos.length) {
      avisos.push(`«${accion.responsable}» puede ser ${candidatosPersona.slice(0, 3).map((p) => p.nombre).join(' o ')}: elige a la persona.`);
    }
  }

  // Cliente / sucursal: «Tox» puede ser el cliente o una de sus sucursales. Un sitio que no
  // se mencionó (la IA lo sacó del catálogo) no se usa.
  const sitio = lugarDicho(accion.sitio, contexto.instruccion) ? accion.sitio : null;
  const textoCliente = accion.cliente || sitio;
  let cliente: Referencia | null = null;
  let sucursal: SucursalNexara | null = null;
  let clienteCandidatos: Referencia[] = [];
  const porCliente = buscar(accion.cliente, catalogos.clientes, (c) => c.name, 5, aproximado);
  if (porCliente.elegido) cliente = ref(porCliente.elegido.id, porCliente.elegido.name);
  // «Bodegas Luna Atlixco» puede llegar solo como sitio: el cliente también se busca ahí.
  if (!cliente && sitio) {
    const porSitio = buscar(sitio, catalogos.clientes, (c) => c.name, 5, aproximado);
    if (porSitio.elegido) cliente = ref(porSitio.elegido.id, porSitio.elegido.name);
  }
  // La IA copió lo mal oído («Talk») y la instrucción sí nombra a un cliente («talks» =
  // Grupo Tox): con eso basta una letra de diferencia.
  if (!cliente && textoCliente && contexto.instruccion) {
    const mencionados = catalogoRelevante(contexto.instruccion, catalogos).clientes;
    const porMencion = buscar(textoCliente, mencionados, (c) => c.name, 5, { aproximado: true, modo: 'holgada' });
    if (porMencion.elegido) cliente = ref(porMencion.elegido.id, porMencion.elegido.name);
  }
  const sucursalesDelCliente = cliente
    ? catalogos.sucursales.filter((s) => s.clientId === cliente!.id)
    : catalogos.sucursales;
  const consultaSucursal = sitio || (cliente ? null : accion.cliente);
  const porSucursal = buscar(
    cliente ? sinPalabrasDe(consultaSucursal, cliente.nombre) : consultaSucursal,
    sucursalesDelCliente,
    (s) => s.name,
    5,
    aproximado,
  );
  if (porSucursal.elegido) {
    sucursal = porSucursal.elegido;
    if (!cliente) cliente = ref(sucursal.clientId, sucursal.clientName);
  }
  if (cliente) {
    anotar('cliente', cliente.nombre, corregido(cliente.nombre, contexto.instruccion, accion.cliente, sitio));
  } else {
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
  if (sucursal) anotar('sucursal', sucursal.name, corregido(sucursal.name, sitio));

  // Proyecto (obra / proyecto): el del cliente si es uno solo, o por nombre.
  let proyecto: Referencia | null = null;
  let proyectoCandidatos: Referencia[] = [];
  if (tipo === 'obra' || tipo === 'proyecto') {
    const delCliente = cliente ? catalogos.proyectos.filter((p) => p.clientId === cliente!.id) : [];
    const porNombre = buscar(accion.cliente || sitio || accion.titulo, catalogos.proyectos, (p) => `${p.title} ${p.clientName}`, 5, aproximado);
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

  // Lugar libre (no es una sucursal registrada): si suena igual a un nombre ya usado en
  // actividades («talks» = «Toks»), se escribe como siempre se ha escrito.
  let lugarLibre: string | null = !sucursal ? sitio || (textoCliente && !cliente ? textoCliente : null) : null;
  if (lugarLibre && contexto.instruccion) {
    for (const usado of catalogos.nombresUsados ?? []) {
      const c = corregido(usado, contexto.instruccion, lugarLibre);
      if (!c || !c.pares.length) continue;
      const nuevo = corregirEnTexto(lugarLibre, c.pares, { primera: true });
      // La IA ya lo escribió bien («Toks» por «talks»): no cambia, pero se dice de dónde salió.
      const yaBien = palabrasUtiles(lugarLibre).includes(normalizar(usado));
      if (nuevo === lugarLibre && !yaBien) continue;
      correcciones.push({ campo: 'lugar', de: c.de, a: usado, como: 'parecido' });
      pares.push(...c.pares);
      lugarLibre = nuevo;
      break;
    }
  }
  if (lugarLibre) lugarLibre = corregirEnTexto(lugarLibre, pares, { primera: true });

  if (tipo === 'servicio' && !cliente) faltantes.push('cliente');
  if (textoCliente && !cliente) {
    avisos.push(
      clienteCandidatos.length > 1
        ? `«${textoCliente}» puede ser ${clienteCandidatos.slice(0, 3).map((c) => c.nombre).join(' o ')}: elige el cliente.`
        : `«${lugarLibre ?? textoCliente}» no es un cliente registrado: queda sin cliente${lugarLibre ? ' y como lugar de la actividad' : ''}.`,
    );
  }

  // Fechas como el formulario «Asignar»: inicio = entrega = máxima; con plazo de varios días,
  // además el periodo (la API pone la máxima y la entrega al fin de su último día).
  const entrada = responsable ? (catalogos.personas.find((p) => p.id === responsable!.id)?.horaEntrada ?? null) : null;
  const agenda = agendaDe(corregirHoraPasada(accion, contexto.ahora, contexto.instruccion), contexto.ahora, entrada);
  const fechaInicio = aFechaISO(agenda.dia, agenda.hora);
  const hoy = fechaLocalISO(contexto.ahora);
  if (agenda.hasta ? agenda.hasta < hoy : fechaInicio && new Date(fechaInicio).getTime() < contexto.ahora.getTime() - 15 * 60_000) {
    avisos.push('La fecha quedó en el pasado; revísala.');
  }
  if (!agenda.dia) faltantes.push('fecha');
  const duracion =
    accion.duracionMin && accion.duracionMin > 0 ? Math.min(TOPE_MINUTOS, Math.round(accion.duracionMin)) : undefined;
  if (!duracion) faltantes.push('duración');

  // «A más tardar a las 6» el mismo día es la hora compromiso del formulario (fecha máxima y
  // entrega a esa hora). Con varios días no tiene columna: se escribe en las indicaciones.
  const fechaLimite = agenda.compromiso ? aFechaISO(agenda.dia, agenda.compromiso) : fechaInicio;
  const horaLimite = aHora(accion.horaLimite);
  const diaLimite = esDia(accion.fechaLimite) ? accion.fechaLimite : agenda.dia;
  const notaLimite =
    horaLimite && diaLimite && !agenda.compromiso ? `Entregar a más tardar el ${diaLargo(diaLimite)} a las ${horaLimite}.` : null;
  const tituloFinal = corregirEnTexto(recortar(accion.titulo, 200) || 'Actividad', pares);
  const propias = indicacionesSinEco(accion.indicaciones ? corregirEnTexto(accion.indicaciones, pares) : null, tituloFinal, [
    responsable?.nombre,
    accion.responsable,
    cliente?.nombre,
    accion.cliente,
    accion.sitio,
    sucursal?.name,
    lugarLibre,
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
    tipo === 'comercial' ? 'COMERCIAL' : tipo === 'tarea' ? subtipoTarea || SUBTIPO_RESPALDO : undefined;

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
    fechaEntregaEsperada: fechaLimite ?? undefined,
    fechaMaxima: fechaLimite ?? undefined,
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
  } else if (lugarLibre) {
    payload.branchName = recortar(lugarLibre, 160);
  }
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

  const lugarResumen = lugarLibre ?? textoCliente;
  const partes = [
    ETIQUETA_TIPO[tipo] + (tipo === 'tarea' && ticketTypeCustom && ticketTypeCustom !== SUBTIPO_RESPALDO ? ` · ${ticketTypeCustom}` : ''),
    `para ${responsable?.nombre ?? accion.responsable ?? '(sin responsable)'}`,
    cliente ? `en ${cliente.nombre}${sucursal ? ` · ${sucursal.name}` : ''}` : lugarResumen ? `en ${lugarResumen}` : null,
    horaLegible(fechaInicio, contexto.ahora) +
      (agenda.compromiso ? ` · a más tardar ${agenda.compromiso}` : '') +
      (agenda.hasta ? ` · vence ${diaCorto(agenda.hasta)}` : ''),
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
    correcciones,
    payload,
  };
}
