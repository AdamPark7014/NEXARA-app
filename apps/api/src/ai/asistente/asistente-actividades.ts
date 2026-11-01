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
import { claveDeTipo, type Complejidad } from '../complejidad/tiempos-tipicos.js';
import { cantidadDelTitulo, estandarDeLectura, tipoDelTitulo } from '../../activities/tiempo-entrega.js';
import { motivoDe, ordenarPorProbabilidad, tieneRespaldo, type ActividadPasada } from './elegir-persona.js';
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
  soloGiro,
  type Corregido,
} from './nombres.js';
import { SUBTIPOS_TAREA, TIPOS_ACTIVIDAD, TIPOS_SERVICIO, subtipoEquivalente, type TipoActividad } from './tipos-actividad.js';

export { SUBTIPOS_TAREA, TIPOS_ACTIVIDAD, TIPOS_SERVICIO, tiposQueCrea, tiposQueRecibe, type TipoActividad } from './tipos-actividad.js';

export const ETIQUETA_TIPO: Record<TipoActividad, string> = {
  tarea: 'Tarea',
  proyecto: 'Proyecto',
  obra: 'Obra',
  servicio: 'Servicio',
  comercial: 'Comercial',
};

const SUBTIPO_RESPALDO = 'Otro';

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
  /** Lo que lee la tabla de tiempos cuando no dijeron cuánto tarda (los minutos no salen de la IA). */
  complejidad?: Complejidad | null;
  cantidad?: number | null;
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
  comp: Complejidad | null;
  cant: number | null;
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
        required: ['tipo', 'sub', 'titulo', 'detalle', 'quien', 'cliente', 'lugar', 'inicio', 'limite', 'min', 'prio', 'encargo', 'comp', 'cant'],
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
          comp: enumONulo(['BASICA', 'ESTANDAR', 'COMPLEJA', 'CRITICA']),
          cant: { type: ['integer', 'null'] },
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
      complejidad: (a.comp as Complejidad | null | undefined) ?? null,
      cantidad: typeof a.cant === 'number' ? a.cant : null,
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
export const PROMPT_SISTEMA = `Asistente de asignación de actividades de NEXARA (seguridad electrónica e integración en México: CCTV, control de acceso, redes, alarmas, servicio de campo). Conviertes la instrucción de dirección (escrita o dictada por voz, con errores, muletillas, lenguaje informal y correcciones: «que Paty… no, que Carolina» es Carolina) en actividades. Una persona las revisa antes de crearlas: entrega siempre tu mejor interpretación.

Lenguaje informal: entiéndelo y escribe título y detalle con la palabra completa y bien escrita: compu = computadora, lap = laptop, cel = celular, impre = impresora, coti = cotización, mante = mantenimiento, depa = departamento. «Echar un ojo» o «ver lo de» = revisar; «meter cable» = cablear; «arreglar» = reparar; «urge» = prioridad Alta.

Tipos:
- tarea: sin proyecto. sub (elige siempre uno): Instalación (equipo nuevo: cámaras, control de acceso, biométrico, red, audio), Cableado y canalización (cable, tubería, charola, nodos), Mantenimiento preventivo, Correctivo y diagnóstico (falla, revisar por qué no funciona), Levantamiento (revisar o medir un sitio antes de cotizar), Recolección (recoger o ir por material, pedidos o equipo), Entrega (llevar material, traslados), Preparación de equipo (almacén, armar y probar antes de ir), Diseño, CAD y memoria técnica (planos, dibujos), Configuración y soporte remoto (software, instalar programas, NVR, Hik-Connect, Fortinet, módem), Trámite (fianzas, permisos, pagos, cheques), Compra de material, Facturación y contabilidad (facturas, nómina, pólizas), Reporte / documentación (hacer o mandar un reporte o documento), Capacitación, Junta (reunión o llamada para revisar o acordar algo, también con un cliente), Evento o guardia.
- servicio: trabajo técnico sobre los equipos de un cliente en su sitio. sub: PREVENTIVO (mantenimiento), CORRECTIVO (falla o cambio de una pieza), EMERGENCIA (sistema caído o urgente), INSTALACION (equipo nuevo de pocas horas). Una falla o revisión técnica en un cliente es servicio, no tarea Correctivo: esa es para equipo propio o sin cliente. Llevar o recoger cosas, preparar equipo, levantar, cablear o tirar nodos son tareas aunque sean para un cliente.
- obra: instalación grande de un proyecto. proyecto: ingeniería, planos, pruebas o puesta en marcha de un proyecto. Solo si mencionan el proyecto, la obra o la puesta en marcha.
- comercial: solo para vender: cotizar, hacer o enviar una cotización o propuesta, seguimiento de venta, visita de venta. Una junta con un cliente para revisar algo es tarea Junta.
- obra, proyecto y comercial: sub null.

Campos:
- Una actividad por persona y por trabajo: «Diana y Luis» son dos actividades iguales, cada una con una sola persona en quien. Con «y» o «y que» entre trabajos, cada trabajo es otra actividad con sus propias fechas.
- quien: el nombre completo de las coincidencias si lo dicho (nombre o apodo: Beto→Roberto, Toño→Antonio) corresponde a una sola persona; si a varias o a ninguna, copia lo que dijeron. Si piden a alguien que mande a su gente, es esa persona (encargo despacho). null si no dijeron quién. Quien solo ayuda o acompaña va en detalle.
- cliente: la empresa para la que se trabaja, como en las coincidencias si está («Tox» → «Grupo Tox»); si no está, como la dijeron («arreglar la comandera de Toks» → Toks). Proveedores (Syscom), tiendas donde se compra o entrega y sitios propios (oficina, bodega, almacén, site): cliente null y van en lugar.
- lugar: sucursal, planta, área o dirección donde se hace, como en las coincidencias si está; null si no lo dijeron. Nunca el equipo ni el mismo nombre del cliente.
- inicio («AAAA-MM-DD HH:MM», 24 h, o «AAAA-MM-DD» sin hora): cuándo se hace o empieza (cita, visita, «empezando el jueves»). Un día dicho sin «para», «antes de» ni «a más tardar» («que cambie mañana el disco») es inicio. null si no dijeron cuándo o si solo hay plazo.
  Días: «mañana», «pasado mañana»: los que trae el mensaje. «el lunes», «el viernes»: el primero con ese nombre en «Próximos días», nunca hoy. «la otra semana», «la próxima», «la semana que entra»: el lunes de «Próxima semana», y limite su viernes.
  Horas sin am ni pm, en horario de trabajo: de 1 a 6 son de la tarde (13:00 a 18:00), de 7 a 11 de la mañana, 12 es mediodía. «a las 3» o «para las 3» = 15:00. Hora sin día: hoy, o mañana si ya pasó.
  Momentos vagos: «ya», «ahorita», «de inmediato»: hoy a la hora actual. «al rato», «más tarde», «en un rato»: hoy, una hora después de la actual. «en dos horas»: la actual más 2. «temprano», «a primera hora», «en la mañana»: solo el día, sin hora. «a mediodía»: 12:00. «en la tarde», «después de comer»: 16:00. «en la noche»: 19:00. «hoy» sin hora: solo el día, y limite null.
- limite (mismo formato; sin hora si no dijeron hora): para cuándo debe quedar: «para el viernes», «antes del…», «a más tardar», «máximo el…», «tiene hasta», «que quede listo». «Para» con día y sin hora es plazo: «para mañana» es limite mañana e inicio null. «antes de las 5»: ese día a las 17:00. «antes de comer»: 15:00. «al final del día», «antes de irse», «antes de que se vaya», «antes de salir»: ese día a las 18:00. «esta semana»: el viernes de «Esta semana», sin hora. «fin de mes», «antes de que acabe el mes»: «Fin de mes», sin hora. En un rango («del lunes al miércoles») inicio es el primer día y limite el último. Un día que encabeza varias actividades («Para el viernes: …») vale para todas, y una hora dentro de una es la hora de ese día. Sin plazo: null.
- min: duración en minutos, solo si la dijeron («hora y media» 90, «media hora» 30, «jornadas de 8 horas» o «todo el día» 480), máximo 720. Si no la dijeron, null: no la calcules.
- comp: complejidad comparada con lo normal de ese trabajo. BASICA: rutina de un solo punto. ESTANDAR: lo normal (si no hay señales). COMPLEJA: varios equipos o sitios, o falla sin causa clara. CRITICA: el cliente está detenido o el sistema caído.
- cant: cuántas unidades se cuentan si lo dijeron, con número o palabra («dos cámaras» 2, «50 productos» 50); si no, null.
- prio: Alta si es urgente, ya, cuanto antes o algo está caído; Baja si sin prisa; si no, Media.
- encargo: despacho solo si debe mandar a alguien de su equipo o repartir el trabajo («que mande a su gente»); mandar un documento no lo es. Si no, ejecucion.
- titulo: infinitivo + qué + dónde, máximo 80 caracteres («Revisar DVR que no graba en Angelópolis»).
- detalle: las indicaciones para quien la hará: solo lo que dijeron y no cabe en el título (síntoma, cantidades, materiales, con quién, a quién llamar o entregar), con las mismas palabras que usaron («no prende», no «no enciende»), en una o dos frases profesionales. Si no dijeron nada más es null, y eso es lo normal: «que Carolina revise la compu» lleva detalle null. No repitas el título con otras palabras ni agregues pasos u objetivos que nadie dijo («revisar la causa», «acudir al sitio»), no expliques tu razonamiento, sin fechas, horas ni duración.
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
  /** `HH:MM` de su salida (18:00 la oficina, 17:00 la cuadrilla); null = la de la oficina. */
  horaSalida?: string | null;
  /** Tipos que se le pueden asignar (`tiposQueRecibe`); sin dato, cualquiera. */
  recibe?: readonly TipoActividad[];
};

/** La salida de la oficina: el «final del día» de quien no tiene horario. */
export const HORA_SALIDA_OFICINA = '18:00';

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
  const clientes = elegir(catalogos.clientes.filter((c) => !soloGiro(c.name)), 'cliente', (c) => c.id, (c) => c.name, (c) => deOtros.has(c.id));
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

/** «esta semana», «la otra semana» y «fin de mes» ya calculados en código. En fin de semana, «esta semana» es la que empieza. */
export function semanasDe(ahora: Date): string {
  const [y, m, d] = fechaLocalISO(ahora).split('-').map(Number);
  const dia = (extra: number) => new Date(Date.UTC(y, m - 1, d + extra, 12)).toISOString().slice(0, 10);
  const aViernes = diasAlViernes(ahora);
  const finDeMes = new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
  return `Mañana: ${dia(1)}. Pasado mañana: ${dia(2)}. Esta semana: hasta el vie ${dia(aViernes)}. Próxima semana: del lun ${dia(aViernes + 3)} al vie ${dia(aViernes + 7)}. Fin de mes: ${finDeMes}.`;
}

function diasAlViernes(ahora: Date): number {
  return (5 - new Date(`${fechaLocalISO(ahora)}T12:00:00Z`).getUTCDay() + 7) % 7;
}

/**
 * «La próxima semana» es del lunes al viernes siguientes: la IA a veces deja solo el plazo, y así
 * empezaría hoy un trabajo que dijeron para la otra semana.
 */
export function inicioDeProximaSemana<T extends Pick<AccionPlan, 'fecha' | 'fechaLimite'>>(accion: T, ahora: Date, instruccion?: string): T {
  if (accion.fecha || !accion.fechaLimite || !/\b(otra semana|proxima semana|semana que entra|siguiente semana)\b/.test(normalizar(instruccion))) return accion;
  const lunes = new Date(`${fechaLocalISO(ahora)}T12:00:00Z`);
  lunes.setUTCDate(lunes.getUTCDate() + diasAlViernes(ahora) + 3);
  const dia = lunes.toISOString().slice(0, 10);
  return accion.fechaLimite >= dia ? { ...accion, fecha: dia } : accion;
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
    semanasDe(ahora),
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
export function indicacionesSinEco(
  indicaciones: string | null | undefined,
  titulo: string,
  conocidas: Array<string | null | undefined> = [],
  instruccion?: string,
): string | null {
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
  // «Atender la falla reportada» bajo «Revisar falla…»: lo nuevo no salió de lo que dijeron, es relleno.
  if (instruccion) {
    const dichas = new Set(raicesDe(instruccion));
    if (!nuevas.some((w) => dichas.has(w))) return null;
  }
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
  /** false = no dijeron cuándo y quedó hoy (o el siguiente día si ya terminó la jornada). */
  diaDicho?: boolean;
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

/**
 * Si no dicen cuándo, se espera que hoy (Adam, 01-11-2026). Ya terminada la jornada de quien lo hace
 * no cabe hoy: el siguiente día, sin caer en domingo.
 */
export function diaPorOmision(ahora: Date, salida?: string | null): string {
  if (horaActualRedondeada(ahora) < (aHora(salida) ?? HORA_SALIDA_OFICINA)) return fechaLocalISO(ahora);
  const manana = new Date(ahora.getTime() + 86_400_000);
  const dia = new Date(`${fechaLocalISO(manana)}T12:00:00Z`).getUTCDay();
  return fechaLocalISO(dia === 0 ? new Date(ahora.getTime() + 2 * 86_400_000) : manana);
}

/**
 * «Al final del día» es la salida de quien lo hace: la IA pone 18:00 (la de la oficina) o 23:59 y la
 * cuadrilla sale a las 17:00. Una hora límite que sí dijeron no se mueve.
 */
export function horaLimiteDe(accion: Pick<AccionPlan, 'horaLimite'>, salida?: string | null, instruccion?: string): string | null {
  const hora = aHora(accion.horaLimite);
  if (!hora) return null;
  const fin = aHora(salida) ?? HORA_SALIDA_OFICINA;
  if (hora >= '23:00') return fin;
  if (hora !== HORA_SALIDA_OFICINA || !instruccion) return hora;
  const texto = normalizar(instruccion);
  if (/\b(final del dia|fin del dia|acabe el dia|termine el dia|antes de irse|antes de que se vaya|antes de salir)\b/.test(texto)) return fin;
  // Un plazo de día que la IA escribió a las 18:00 sin que nadie lo dijera sería un compromiso de
  // más para los KPI: el límite de un día ya es su fin.
  return /\b(6|18|seis)\b/.test(texto) ? hora : null;
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
   * De dónde salió el responsable: dicho tal cual, el más probable entre varios que se llaman igual
   * o sugerido porque nadie dijo quién. null si no hay (nombraron a alguien que no existe).
   */
  responsableOrigen: 'dicho' | 'probable' | 'sugerido' | null;
  /** Cliente que no está registrado y se da de alta al confirmar («Toks»); nada se crea antes. */
  clienteNuevo: string | null;
  /** Por qué se propuso a esa persona o ese cliente (también va en `avisos`): se lee en su renglón. */
  notaResponsable: string | null;
  notaCliente: string | null;
  /** dicha = la dijeron; estimada = la tabla de tiempos (la misma cuenta del alta). */
  duracionOrigen: 'dicha' | 'estimada';
  /** De qué se compone lo estimado («Servicio correctivo 120 min + Ida 30 min + Vuelta 30 min»). */
  duracionDetalle: string | null;
  /**
   * Lo que no se pudo proponer y hay que completar en la tarjeta: el responsable, si nombraron a
   * alguien que no existe (no se le asigna a otra persona), o el proyecto si no hay ninguno.
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
  /** Actividades recientes: quién hace qué, para proponer a la persona más probable. */
  actividades?: ActividadPasada[];
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
  // También los apodos ya traducidos: «Toño» es tan ambiguo como «Antonio».
  const dichas = new Set([...palabrasUtiles(instruccion), ...palabrasDe(instruccion).map((d) => d.norm)]);
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

/** Palabras de un dictado informal que la IA a veces deja tal cual; nunca llegan a la tarjeta. */
const PALABRAS_INFORMALES: Record<string, string> = {
  compu: 'computadora',
  compus: 'computadoras',
  lap: 'laptop',
  laps: 'laptops',
  cel: 'celular',
  impre: 'impresora',
  impres: 'impresoras',
  coti: 'cotización',
  cotis: 'cotizaciones',
  mante: 'mantenimiento',
  depa: 'departamento',
};

/** «Revisar la compu» → «Revisar la computadora» (respeta la mayúscula inicial). */
export function sinPalabrasInformales(texto: string): string {
  return texto.replace(/[\p{L}\p{N}]+/gu, (w) => {
    const bien = PALABRAS_INFORMALES[w.toLowerCase()];
    if (!bien) return w;
    return /^\p{Lu}/u.test(w) ? bien[0].toUpperCase() + bien.slice(1) : bien;
  });
}

/**
 * ¿La instrucción habla de cuánto tarda? La IA a veces saca una duración de otra cosa («6 nodos» →
 * 240 min): si no dijeron ninguna unidad de tiempo, los minutos los pone la tabla.
 */
export function dijeronDuracion(instruccion: string | undefined): boolean {
  if (instruccion === undefined) return true;
  return /\b(horas?|hrs?|h|minutos?|mins?|medio dia|todo el dia|dia completo|jornadas?|rato largo)\b/.test(normalizar(instruccion));
}

/** Sitios propios que nunca son un cliente, aunque la IA los ponga como tal. */
const SITIOS_PROPIOS = /^(la |el |las |los |en |nuestra |nuestro )*(oficinas?|bodegas?|almacen|site|taller|recepcion|casa|aqui)$/;

/**
 * «Salvador y Erick» en una sola acción son dos actividades: el prompt lo pide y la IA a veces no lo
 * hace. Solo se separa si cada parte es alguien del catálogo («Ana y Luis Pérez» de verdad son dos).
 */
export function accionesPorPersona(acciones: AccionPlan[], personas: PersonaAsignable[]): AccionPlan[] {
  return acciones.flatMap((accion) => {
    const partes = (accion.responsable ?? '').split(/\s*(?:,|;|\by\b|\be\b)\s*/i).map((x) => x.trim()).filter(Boolean);
    if (partes.length < 2) return [accion];
    const todas = partes.every((parte) => {
      const b = buscar(parte, personas, (p) => p.nombre, 5, { aproximado: true });
      return b.elegido || b.empatados.length;
    });
    return todas ? partes.map((responsable) => ({ ...accion, responsable })) : [accion];
  });
}

/**
 * «Sephora» no es cliente, pero sus actividades se han hecho a nombre de Tekserve: el cliente con el
 * que la empresa ya trabajó ese nombre. Así no se da de alta un cliente que en realidad ya tiene.
 */
export function clienteDeHistorial(nombre: string | null, historial: ActividadPasada[], clientes: ClienteNexara[]): ClienteNexara | null {
  const palabras = palabrasUtiles(nombre ?? '').filter((w) => w.length >= 4 && !PALABRAS_GIRO.has(w));
  if (!palabras.length) return null;
  const veces = new Map<number, number>();
  for (const a of historial) {
    if (!a.clientId || !a.titulo) continue;
    const delTitulo = palabrasUtiles(a.titulo);
    if (palabras.every((w) => delTitulo.includes(w))) veces.set(a.clientId, (veces.get(a.clientId) ?? 0) + 1);
  }
  const genericos = /^a quien corresponda$/;
  const [mejor] = [...veces.entries()]
    .map(([id, n]) => ({ cliente: clientes.find((c) => c.id === id), n }))
    .filter((x) => x.cliente && !genericos.test(normalizar(x.cliente.name)))
    .sort((a, b) => b.n - a.n);
  return mejor?.cliente ?? null;
}

/** Lo que se le pasa a `construirPropuesta` además del catálogo. */
export type ContextoPropuesta = {
  creadoPorId: number;
  ahora: Date;
  instruccion?: string;
  /** Mediana real de cada tipo («tarea:Instalación» → minutos), para lo que la tabla no mide. */
  medianas?: Map<string, number>;
  /** Quién se eligió ya para un nombre ambiguo: en una misma instrucción «Antonio» es la misma persona. */
  elegidas?: Map<string, PersonaAsignable>;
  /** Lo que puede asignar quien escribe (`tiposQueCrea`); sin dato, todo. */
  tiposPermitidos?: readonly TipoActividad[];
};

/** Todas las propuestas de una instrucción (el servicio y el eval mandan exactamente lo mismo). */
export function construirPropuestas(acciones: AccionPlan[], catalogos: CatalogosNexara, contexto: ContextoPropuesta): PropuestaActividad[] {
  const elegidas = new Map<string, PersonaAsignable>();
  return accionesPorPersona(acciones, catalogos.personas)
    .slice(0, 10)
    .map((accion) => construirPropuesta(accion, catalogos, { ...contexto, elegidas }));
}

/** Convierte una acción del plan en una propuesta lista para confirmar. */
export function construirPropuesta(accion: AccionPlan, catalogos: CatalogosNexara, contexto: ContextoPropuesta): PropuestaActividad {
  let tipo: TipoActividad = (TIPOS_ACTIVIDAD as readonly string[]).includes(accion.tipo) ? accion.tipo : 'tarea';
  /** Subtipo de la tarea o tipo del servicio; cambia si el tipo tiene que pasar a tarea. */
  let subtipo: string | null = accion.subtipo ?? (tipo === 'servicio' ? accion.tipoServicio : accion.subtipoTarea) ?? null;
  const pasarATarea = () => {
    const equivalente = subtipoEquivalente(tipo, subtipo, accion.titulo);
    // «Terminar el cableado» no es un correctivo aunque llegara como servicio correctivo.
    subtipo = tipoDelTitulo({ coreKind: 'tarea', ticketTypeCustom: equivalente, titulo: accion.titulo })?.ticketTypeCustom ?? equivalente;
    tipo = 'tarea';
  };
  const avisos: string[] = [];
  if (contexto.tiposPermitidos && !contexto.tiposPermitidos.includes(tipo)) {
    avisos.push(`No puedes asignar ${ETIQUETA_TIPO[tipo].toLowerCase()}: quedó como tarea.`);
    pasarATarea();
  }
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
  const historial = catalogos.actividades ?? [];
  // «Bodega» o «la oficina» no son un cliente aunque exista uno mal capturado que se llame así.
  const paraCliente = (texto: string | null) => (texto && !soloGiro(texto) && !SITIOS_PROPIOS.test(normalizar(texto)) ? texto : null);
  const clientesReales = catalogos.clientes.filter((c) => !soloGiro(c.name));

  // Cliente / sucursal: «Tox» puede ser el cliente o una de sus sucursales. Un sitio que no
  // se mencionó (la IA lo sacó del catálogo) no se usa.
  const sitio = lugarDicho(accion.sitio, contexto.instruccion) ? accion.sitio : null;
  const textoClienteDicho = paraCliente(accion.cliente);
  const textoCliente = textoClienteDicho || sitio;
  let cliente: Referencia | null = null;
  let sucursal: SucursalNexara | null = null;
  let clienteCandidatos: Referencia[] = [];
  const porCliente = buscar(textoClienteDicho, clientesReales, (c) => c.name, 5, aproximado);
  if (porCliente.elegido) cliente = ref(porCliente.elegido.id, porCliente.elegido.name);
  // «Bodegas Luna Atlixco» puede llegar solo como sitio: el cliente también se busca ahí.
  if (!cliente && paraCliente(sitio)) {
    const porSitio = buscar(sitio, clientesReales, (c) => c.name, 5, aproximado);
    if (porSitio.elegido) cliente = ref(porSitio.elegido.id, porSitio.elegido.name);
  }
  // La IA copió lo mal oído («Talk») y la instrucción sí nombra a un cliente («talks» =
  // Grupo Tox): con eso basta una letra de diferencia.
  if (!cliente && textoCliente && contexto.instruccion) {
    const mencionados = catalogoRelevante(contexto.instruccion, catalogos).clientes;
    const porMencion = buscar(paraCliente(textoCliente), mencionados, (c) => c.name, 5, { aproximado: true, modo: 'holgada' });
    if (porMencion.elegido) cliente = ref(porMencion.elegido.id, porMencion.elegido.name);
  }
  let notaCliente: string | null = null;
  // No está en el catálogo, pero sus actividades anteriores van a nombre de otro cliente.
  const nombreDicho = textoClienteDicho || paraCliente(sitio);
  if (!cliente && !porCliente.empatados.length && nombreDicho) {
    const delHistorial = clienteDeHistorial(nombreDicho, historial, clientesReales);
    if (delHistorial) {
      cliente = ref(delHistorial.id, delHistorial.name);
      notaCliente = `«${nombreDicho}» no es un cliente registrado; sus actividades anteriores van con ${delHistorial.name}: propongo ese cliente.`;
      avisos.push(notaCliente);
    }
  }
  // Dos clientes igual de parecidos: el que más ha trabajado la empresa, y se dice cuáles eran.
  if (!cliente && porCliente.empatados.length > 1) {
    const usos = (id: number) => historial.filter((a) => a.clientId === id).length;
    const [mejor] = [...porCliente.empatados].sort((a, b) => usos(b.id) - usos(a.id));
    cliente = ref(mejor.id, mejor.name);
    clienteCandidatos = porCliente.empatados.slice(0, 5).map((c) => ref(c.id, c.name));
    notaCliente = `«${textoCliente}» puede ser ${clienteCandidatos.slice(0, 3).map((c) => c.nombre).join(' o ')}: propongo ${cliente.nombre}. Cámbialo si era otro.`;
    avisos.push(notaCliente);
  }
  const sucursalesDelCliente = cliente
    ? catalogos.sucursales.filter((s) => s.clientId === cliente!.id)
    : catalogos.sucursales;
  const consultaSucursal = sitio || (cliente ? null : textoClienteDicho);
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
    if (!clienteCandidatos.length) anotar('cliente', cliente.nombre, corregido(cliente.nombre, contexto.instruccion, accion.cliente, sitio));
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
      // Sin proyecto activo que se le parezca no hay obra que ligar: el trabajo queda como tarea.
      if (proyectoCandidatos.length) faltantes.push('proyecto');
      else {
        pasarATarea();
        avisos.push('No encontré un proyecto activo para esto: quedó como tarea.');
      }
    }
  }

  // Un servicio es en el sitio de un cliente: sin nadie a quien nombrar («la compu de recepción»)
  // o en un sitio propio («la oficina») es una tarea.
  if (tipo === 'servicio' && !cliente && !nombreDicho) pasarATarea();

  // Persona. Lo mal oído («Jair» por Yahir) se empata en código y se dice. Si lo dicho encaja con
  // varias («Antonio» con dos Antonio), o si nadie dijo quién, se propone a la más probable para
  // este trabajo y se dice por qué. Si nombraron a alguien que no existe no se le da a otra persona.
  const persona = buscar(accion.responsable, catalogos.personas, (p) => p.nombre, 5, aproximado);
  const trabajo = () => ({ tipo, subtipo, clienteId: cliente?.id ?? null });
  let notaResponsable: string | null = null;
  let elegida: PersonaAsignable | null = persona.elegido;
  let responsableOrigen: PropuestaActividad['responsableOrigen'] = elegida ? 'dicho' : null;
  let candidatosPersona = persona.candidatos;
  const empatadas = elegida && contexto.instruccion ? mencionAmbigua(elegida, catalogos.personas, contexto.instruccion) : persona.empatados.length > 1 ? persona.empatados : null;
  if (empatadas) {
    const dichas = palabrasDe(contexto.instruccion ?? accion.responsable).map((d) => d.norm);
    const orden = ordenarPorProbabilidad(empatadas, trabajo(), historial, dichas);
    // En una misma instrucción el mismo nombre es la misma persona, aunque el otro trabajo le encaje a otra.
    const clave = empatadas.map((p) => p.id).sort((a, b) => a - b).join(',');
    const ya = contexto.elegidas?.get(clave);
    const mejor = orden.find((x) => x.persona.id === ya?.id) ?? orden[0];
    contexto.elegidas?.set(clave, mejor.persona);
    elegida = mejor.persona;
    responsableOrigen = 'probable';
    candidatosPersona = [mejor, ...orden.filter((x) => x !== mejor)].map((x) => x.persona);
    const comun = palabrasUtiles(elegida.nombre).find((w) => orden.every((x) => palabrasUtiles(x.persona.nombre).includes(w)));
    const dicho = comun ? `«${comun[0].toUpperCase()}${comun.slice(1)}»` : 'El nombre que dijeron';
    notaResponsable = `${dicho} puede ser ${candidatosPersona.map((p) => p.nombre).join(' o ')}: propongo a ${elegida.nombre} ${motivoDe(mejor, orden.filter((x) => x !== mejor), trabajo())}. Cámbialo si era otra persona.`;
    avisos.push(notaResponsable);
  } else if (!accion.responsable) {
    const orden = ordenarPorProbabilidad(catalogos.personas, trabajo(), historial).filter(tieneRespaldo);
    if (orden.length) {
      elegida = orden[0].persona;
      responsableOrigen = 'sugerido';
      candidatosPersona = orden.slice(0, 4).map((x) => x.persona);
      notaResponsable = `No dijiste quién: propongo a ${elegida.nombre} ${motivoDe(orden[0], orden.slice(1), trabajo())}. Cámbialo si es otra persona.`;
      avisos.push(notaResponsable);
    }
  }
  const responsable = elegida ? ref(elegida.id, elegida.nombre) : null;
  if (responsable) {
    const c = responsableOrigen === 'dicho' ? corregido(responsable.nombre, contexto.instruccion, accion.responsable) : null;
    // Los apodos no se cambian en el texto («Chava» puede quedarse en las indicaciones).
    if (c) anotar('responsable', responsable.nombre, c.como === 'apodo' ? { ...c, pares: [] } : c);
  } else {
    faltantes.push('responsable');
    if (accion.responsable && !candidatosPersona.length) {
      avisos.push(`No encontré a «${accion.responsable}» entre las personas que puedes asignar.`);
    } else if (accion.responsable && candidatosPersona.length > 1) {
      avisos.push(`«${accion.responsable}» puede ser ${candidatosPersona.slice(0, 3).map((p) => p.nombre).join(' o ')}: elige a la persona.`);
    }
  }

  // Lo que esa persona no puede recibir no se podría confirmar: pasa a la tarea equivalente, que
  // es como la empresa ya registra este trabajo (302 de 377 actividades son tareas).
  if (elegida?.recibe && !elegida.recibe.includes(tipo)) {
    const etiqueta = ETIQUETA_TIPO[tipo].toLowerCase();
    pasarATarea();
    proyecto = null;
    proyectoCandidatos = [];
    avisos.push(`A ${elegida.nombre} no se le puede asignar ${etiqueta}: quedó como tarea.`);
  }

  // Lugar libre (no es una sucursal registrada): si suena igual a un nombre ya usado en
  // actividades («talks» = «Toks»), se escribe como siempre se ha escrito.
  let lugarLibre: string | null = !sucursal ? sitio || (textoCliente && !cliente ? textoCliente : null) : null;
  // «Sephora» a nombre de Tekserve: el nombre que se dijo sigue siendo el lugar.
  if (!sucursal && !lugarLibre && cliente && nombreDicho && sinPalabrasDe(nombreDicho, cliente.nombre)) lugarLibre = nombreDicho;
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
  // El mismo nombre del cliente no es un lugar («ANFORA» en ANFORA).
  if (lugarLibre && cliente && !sinPalabrasDe(lugarLibre, cliente.nombre)) lugarLibre = null;

  // Cliente que no está registrado. Un servicio sí lo necesita (en producción, 5 de 5) y una
  // cotización también es para alguien: se propone darlo de alta al confirmar con el nombre ya
  // corregido; nada se crea antes. En una tarea (302 de 302 sin cliente) queda como lugar.
  const nombreNuevo =
    !cliente && !clienteCandidatos.length && nombreDicho && (tipo === 'servicio' || tipo === 'comercial')
      ? corregirEnTexto(nombreDicho, pares, { primera: true }).trim().slice(0, 200)
      : null;
  const clienteNuevo = nombreNuevo || null;
  // El nombre ya es el cliente: no se repite como lugar.
  if (clienteNuevo && lugarLibre && normalizar(lugarLibre) === normalizar(clienteNuevo)) lugarLibre = null;
  if (clienteNuevo) {
    notaCliente = `«${clienteNuevo}» no está registrado: se da de alta como cliente nuevo al confirmar. Cámbialo si ya existe con otro nombre.`;
    avisos.push(notaCliente);
  } else if (!cliente && clienteCandidatos.length > 1) {
    avisos.push(`«${textoCliente}» puede ser ${clienteCandidatos.slice(0, 3).map((c) => c.nombre).join(' o ')}: elige el cliente.`);
  } else if (!cliente && textoClienteDicho) {
    avisos.push(`«${lugarLibre ?? textoClienteDicho}» no es un cliente registrado: queda sin cliente${lugarLibre ? ' y como lugar de la actividad' : ''}.`);
  }

  // Fechas como el formulario «Asignar»: inicio = entrega = máxima; con plazo de varios días,
  // además el periodo (la API pone la máxima y la entrega al fin de su último día). Si no dijeron
  // cuándo se espera que hoy; una obra o proyecto toma después el periodo de su etapa, en la web.
  const entrada = elegida?.horaEntrada ?? null;
  const salida = elegida?.horaSalida ?? null;
  const diaDicho = esDia(accion.fecha) || esDia(accion.fechaLimite);
  const conDia = {
    ...inicioDeProximaSemana(accion, contexto.ahora, contexto.instruccion),
    horaLimite: horaLimiteDe(accion, salida, contexto.instruccion),
  };
  if (!diaDicho) conDia.fecha = diaPorOmision(contexto.ahora, salida);
  const agenda: Agenda = { ...agendaDe(corregirHoraPasada(conDia, contexto.ahora, contexto.instruccion), contexto.ahora, entrada), diaDicho };
  const fechaInicio = aFechaISO(agenda.dia, agenda.hora);
  const hoy = fechaLocalISO(contexto.ahora);
  if (agenda.hasta ? agenda.hasta < hoy : fechaInicio && new Date(fechaInicio).getTime() < contexto.ahora.getTime() - 15 * 60_000) {
    avisos.push('La fecha quedó en el pasado; revísala.');
  }

  // «A más tardar a las 6» el mismo día es la hora compromiso del formulario (fecha máxima y
  // entrega a esa hora). Con varios días no tiene columna: se escribe en las indicaciones.
  const fechaLimite = agenda.compromiso ? aFechaISO(agenda.dia, agenda.compromiso) : fechaInicio;
  const horaLimite = conDia.horaLimite;
  const diaLimite = esDia(accion.fechaLimite) ? accion.fechaLimite : agenda.dia;
  const notaLimite =
    horaLimite && diaLimite && !agenda.compromiso ? `Entregar a más tardar el ${diaLargo(diaLimite)} a las ${horaLimite}.` : null;
  const tituloFinal = sinPalabrasInformales(corregirEnTexto(recortar(accion.titulo, 200) || 'Actividad', pares));
  const propias = indicacionesSinEco(accion.indicaciones ? sinPalabrasInformales(corregirEnTexto(accion.indicaciones, pares)) : null, tituloFinal, [
    responsable?.nombre,
    accion.responsable,
    cliente?.nombre,
    accion.cliente,
    accion.sitio,
    sucursal?.name,
    lugarLibre,
  ], contexto.instruccion);
  const indicaciones = [propias, notaLimite].filter(Boolean).join(' ') || null;
  const prioridad = (['Alta', 'Media', 'Baja'] as const).includes(accion.prioridad) ? accion.prioridad : 'Media';
  // Sin decir que lo reparta, lo hace en persona (la web deja a cada quien lo que le toca).
  const encargo = accion.encargo === 'despacho' ? 'despacho' : 'ejecucion';

  const conProyecto = tipo === 'obra' || tipo === 'proyecto';
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

  // Duración: la que dijeron o, si no, la misma cuenta del alta (tabla de tarifas de Adam con lo que
  // se lee del título, o la mediana real del tipo). Los minutos nunca salen de la IA.
  const datosTipo = { coreKind: tipo, ticketType, ticketTypeCustom: ticketTypeCustom ?? null };
  const dicha = accion.duracionMin && accion.duracionMin > 0 && dijeronDuracion(contexto.instruccion) ? Math.min(TOPE_MINUTOS, Math.round(accion.duracionMin)) : null;
  const estimada = dicha
    ? null
    : estandarDeLectura(
        { ...datosTipo, titulo: tituloFinal, indicaciones },
        { complejidad: accion.complejidad ?? null, cantidad: accion.cantidad ?? cantidadDelTitulo(tituloFinal) },
        { tipicoMin: contexto.medianas?.get(claveDeTipo(datosTipo) ?? '') ?? null },
      );
  const duracion = dicha ?? Math.max(5, Math.round((estimada?.totalMin ?? 60) / 5) * 5);
  const duracionDetalle = estimada ? estimada.desglose.map((d) => `${d.concepto} ${d.minutos} min`).join(' + ') : null;

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
    assignmentCharge: encargo,
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
    responsableOrigen,
    notaResponsable,
    responsableCandidatos: responsableOrigen === 'dicho' ? [] : candidatosPersona.map((p) => ref(p.id, p.nombre)),
    clienteNuevo,
    notaCliente,
    textoCliente: textoCliente ?? null,
    cliente,
    clienteCandidatos,
    sucursal: sucursal ? ref(sucursal.id, sucursal.name) : null,
    proyecto,
    proyectoCandidatos,
    fechaInicio,
    agenda,
    duracionMin: duracion,
    duracionOrigen: dicha ? 'dicha' : 'estimada',
    duracionDetalle,
    prioridad,
    encargo,
    indicaciones: (payload.indicaciones as string | undefined) ?? null,
    faltantes,
    avisos,
    correcciones,
    payload,
  };
}
