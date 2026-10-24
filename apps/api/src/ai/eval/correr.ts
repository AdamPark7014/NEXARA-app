/**
 * Eval de la IA de NEXARA: «Asignar con IA» (asistente), «Acta de reunión» (actas) y triage.
 *
 * Llama exactamente lo mismo que producción (`peticionAsistente` / las piezas de `acta-ia.ts`
 * + `ClaudeService.json`) con cada variante de modelo, esfuerzo y razonamiento; califica con
 * revisiones en código (responsable, fechas, tipo, cliente…) y, si se pide, con un juez que
 * revisa lo que el código no puede (acuerdos equivalentes, nada inventado, resumen fiel).
 *
 * Costo (regla de Adam, 23-10-2026): todo va por la puerta con el token de pruebas, el juez
 * por omisión es Haiku 5.5 (`--juez sonnet|opus` solo pidiéndolo) y antes de llamar se
 * imprime el costo estimado; si pasa de `--max-usd` (o de lo que queda del tope de
 * `resultados/gasto.json`) no corre. Lo que se gasta queda en ese archivo.
 *
 *   npm run eval:ia -w apps/api -- \
 *     --funcion asistente|actas|triage [--variantes haiku-low-np] [--casos a01,a02] [--sin-juez] [--juez haiku] [--max-usd 0.05]
 *     [--concurrencia 1] [--etiqueta x]
 *
 * `--concurrencia 1` mide la latencia real (p50/p95 en el resumen); por omisión van 5 a la vez.
 *
 * Variante = <haiku|sonnet|opus>-<low|medium|high>[-np]; `-np` apaga el razonamiento.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeService, type UsoClaude } from '../claude/claude.service.js';
import {
  construirPropuesta,
  fechaLocalISO,
  peticionAsistente,
  planDeSalida,
  type SalidaIA,
  type AccionPlan,
  type PlanAsistente,
  type PropuestaActividad,
} from '../asistente/asistente-actividades.js';
import {
  ESQUEMA_ACTA,
  PROMPT_ACTA,
  bloquePersonasActa,
  construirActa,
  mensajeActa,
  type ActaPlan,
  type ActaPropuesta,
} from '../../meetings/acta-ia.js';
import { AHORA, AUTOR, CATALOGO, PERSONAS } from './catalogo.js';
import { CASOS_ASISTENTE, type AccionEsperada, type CasoAsistente } from './casos-asistente.js';
import { ESCENARIOS_ACTA, type EscenarioActa } from './casos-actas.js';
import { CASOS_TRIAGE, type CasoTriage } from './casos-triage.js';
import { limpiarTriage, peticionTriage, type ClasificacionTriage } from '../triage-ia.js';
import { leerTranscripcion } from './generar-transcripciones.js';
import {
  DIR_DETALLE,
  DIR_RESULTADOS,
  MODELOS,
  PresupuestoAgotado,
  argumentos,
  asegurarPresupuesto,
  cargarLlave,
  clienteEval,
  costoLlamada,
  enParalelo,
  gastado,
  modeloDe,
  plano,
  registrarGasto,
  restante,
  textoDe,
  topeUsd,
  usoDe,
} from './comun.js';

/** Juez: Haiku 5.5 salvo que se pida otro con `--juez`. */
let JUEZ = MODELOS.haiku;

type Variante = { nombre: string; modelo: string; esfuerzo: 'low' | 'medium' | 'high'; pensar: boolean };

function variante(nombre: string): Variante {
  const [m, esfuerzo, extra] = nombre.split('-');
  if (!MODELOS[m] || !['low', 'medium', 'high'].includes(esfuerzo)) throw new Error(`Variante inválida: ${nombre}`);
  return { nombre, modelo: modeloDe(m), esfuerzo: esfuerzo as Variante['esfuerzo'], pensar: extra !== 'np' };
}

type Revision = { nombre: string; ok: boolean; detalle?: string };

type Resultado = {
  caso: string;
  variante: string;
  revisiones: Revision[];
  puntaje: number;
  inventos: number;
  notaJuez: number | null;
  comentarioJuez: string | null;
  uso: UsoClaude | null;
  ms: number;
  error?: string;
  salida?: unknown;
};

const claude = new ClaudeService();

// ───────────────────────────── Juez ─────────────────────────────

async function juzgar<T>(concepto: string, sistema: string, bloques: Anthropic.TextBlockParam[], esquema: Record<string, unknown>): Promise<T> {
  asegurarPresupuesto(0.05);
  const r = await clienteEval().messages.create({
    model: JUEZ,
    max_tokens: 6_000,
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: bloques }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
  });
  registrarGasto(`juez ${concepto} (${JUEZ.replace('claude-', '')})`, usoDe(JUEZ, r).usdAprox);
  if (r.stop_reason !== 'end_turn') throw new Error(`juez: stop_reason ${r.stop_reason}`);
  return JSON.parse(textoDe(r)) as T;
}

// ─────────────────────────── Asistente ───────────────────────────

const JUEZ_ASISTENTE = `Calificas la salida de un asistente que convierte instrucciones de dirección (español de México, a veces dictadas por voz) en actividades para el sistema NEXARA. Recibes la instrucción, la fecha actual, el catálogo de la empresa (personas, clientes con sus sucursales y proyectos activos, el mismo que recibió el asistente), lo que se esperaba y las actividades que se crearían.

Cómo se guardan las fechas: «inicio» es cuándo se hace o empieza; «límite» es el día contra el que se mide si se entregó a tiempo (vence al terminar ese día). Una cita o visita sin plazo vence el mismo día. Con un plazo («para el viernes», «antes del viernes», «a más tardar…») empieza hoy (salvo que digan otro inicio) y el límite es el plazo; «para las 3» o «el viernes a las 11» son la hora o el día de la cita. Sin hora dicha se usa la hora actual (si es hoy) o 09:00: no es invento.

Revisa solo esto:
- inventos: datos que no salen de la instrucción ni del catálogo: personas, clientes, sucursales, proyectos, lugares, cantidades, fechas u horas que nadie dijo, o una persona elegida cuando el nombre era ambiguo o no existe. Escribir el nombre registrado del cliente, sucursal o proyecto que corresponde a lo que dijeron no es invento («CEDIS de Tox» → sucursal «CEDIS Puebla» de Grupo Tox); poner una sucursal o un proyecto que no mencionaron sí lo es. La prioridad Media por omisión y las fechas calculadas desde «mañana», «el lunes», etc. no son invento.
- titulosOk: cada título es corto, en infinitivo y describe el trabajo pedido.
- indicacionesFieles: el detalle útil que dieron (síntoma, cantidades, materiales, con quién, a quién entregar, hora límite) queda en el título o en las indicaciones, y las indicaciones no repiten el título, no agregan pasos ni objetivos que nadie dijo («revisar la causa»), no explican el razonamiento y están redactadas de forma clara y profesional. Indicaciones vacías son correctas si todo cabe en el título. La frase «Entregar a más tardar el … a las …» con la hora límite que dijeron es correcta.
- nota: 1 a 5, qué tan lista para usarse está la propuesta (5 = se crea sin tocar nada).
- comentario: una frase con el problema principal, o «sin problemas».`;

const ESQUEMA_JUEZ_ASISTENTE = {
  type: 'object',
  additionalProperties: false,
  required: ['inventos', 'titulosOk', 'indicacionesFieles', 'nota', 'comentario'],
  properties: {
    inventos: { type: 'array', items: { type: 'string' } },
    titulosOk: { type: 'boolean' },
    indicacionesFieles: { type: 'boolean' },
    nota: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    comentario: { type: 'string' },
  },
};

const hhmm = (h: string | null | undefined) => (h && /^\d{1,2}:\d{2}$/.test(h) ? h.padStart(5, '0') : h ?? null);

function revisarAccion(e: AccionEsperada, a: AccionPlan, p: PropuestaActividad): Revision[] {
  const r: Revision[] = [];
  const en = <T>(nombre: string, lista: T[] | undefined, valor: T) => {
    if (lista) r.push({ nombre, ok: lista.includes(valor), detalle: String(valor) });
  };
  if (e.responsableId === null) {
    const conserva = !e.textoResponsable || plano(p.textoResponsable ?? '').includes(plano(e.textoResponsable));
    r.push({ nombre: 'responsable', ok: p.responsable === null && conserva, detalle: p.responsable?.nombre ?? p.textoResponsable ?? 'null' });
  } else {
    r.push({ nombre: 'responsable', ok: p.responsable?.id === e.responsableId, detalle: p.responsable?.nombre ?? p.textoResponsable ?? 'null' });
  }
  en('tipo', e.tipos, p.tipo);
  en('subtipo', e.subtipo, String(p.payload.ticketTypeCustom ?? ''));
  en('tipoServicio', e.tipoServicio, String(p.payload.ticketType ?? ''));
  en('cliente', e.clienteId, p.cliente?.id ?? null);
  en('sucursal', e.sucursalId, p.sucursal?.id ?? null);
  en('proyecto', e.proyectoId, p.proyecto?.id ?? null);
  // Agenda: lo que de verdad se guarda (día de inicio y día contra el que se mide «a tiempo»).
  const diaDe = (iso: unknown) => (typeof iso === 'string' && iso ? fechaLocalISO(new Date(iso)) : null);
  const cadena = (v: unknown) => (typeof v === 'string' && v ? v : null);
  en('inicio', e.inicio, diaDe(p.payload.fechaInicio) ?? cadena(p.payload.periodoInicio));
  en('límite', e.limite, cadena(p.payload.periodoFin) ?? diaDe(p.payload.fechaMaxima));
  en('hora', e.hora, hhmm(a.hora));
  en('hora límite', e.horaLimite, hhmm((a as AccionPlan & { horaLimite?: string | null }).horaLimite ?? null));
  en('prioridad', e.prioridad, a.prioridad);
  en('encargo', e.encargo, a.encargo ?? null);
  en('duracion', e.duracionMin, a.duracionMin ?? null);
  if (e.faltan) {
    const faltantes = p.faltantes ?? [];
    r.push({ nombre: 'faltantes', ok: e.faltan.every((f) => faltantes.includes(f)), detalle: faltantes.join(',') || '(ninguno)' });
  }
  const indicaciones = plano(String(p.payload.indicaciones ?? ''));
  if (e.detalleCon) {
    const texto = `${plano(String(p.payload.titulo ?? ''))} ${indicaciones}`;
    const faltan = e.detalleCon.filter((t) => !texto.includes(plano(t)));
    r.push({ nombre: 'detalle completo', ok: !faltan.length, detalle: faltan.length ? `sin ${faltan.join(', ')}` : undefined });
  }
  if (e.lugarCon) {
    r.push({ nombre: 'lugar', ok: plano(String(p.payload.branchName ?? '')).includes(plano(e.lugarCon)), detalle: String(p.payload.branchName ?? '') });
  }
  if (e.sinIndicaciones) {
    r.push({ nombre: 'indicaciones sin eco', ok: !indicaciones.trim(), detalle: String(p.payload.indicaciones ?? '') });
  }
  return r;
}

function revisarAsistente(caso: CasoAsistente, plan: PlanAsistente, propuestas: PropuestaActividad[]): Revision[] {
  const acciones = plan.acciones.slice(0, 10);
  const revisiones: Revision[] = [
    { nombre: 'número de actividades', ok: propuestas.length === caso.acciones.length, detalle: `${propuestas.length}/${caso.acciones.length}` },
  ];
  if (caso.aclaracion) revisiones.push({ nombre: 'aclaración', ok: !acciones.length && Boolean(plan.aclaracion?.trim()) });
  const usadas = new Set<number>();
  for (const e of caso.acciones) {
    let mejor: { i: number; r: Revision[] } | null = null;
    propuestas.forEach((p, i) => {
      if (usadas.has(i)) return;
      const r = revisarAccion(e, acciones[i], p);
      if (!mejor || r.filter((x) => x.ok).length > mejor.r.filter((x) => x.ok).length) mejor = { i, r };
    });
    const elegido = mejor as { i: number; r: Revision[] } | null;
    if (elegido) {
      usadas.add(elegido.i);
      revisiones.push(...elegido.r);
    } else {
      const vacia = revisarAccion(e, { fecha: '∅' } as AccionPlan, { payload: {}, responsable: { id: -1 } } as unknown as PropuestaActividad);
      revisiones.push(...vacia.map((x) => ({ ...x, ok: false, detalle: 'falta la actividad' })));
    }
  }
  return revisiones;
}

/** Lo que se crearía, como lo ve quien confirma (sirve para el código de antes y el de ahora). */
function textoPropuestas(propuestas: PropuestaActividad[]): string {
  if (!propuestas.length) return '(ninguna actividad)';
  const diaHora = (iso: unknown) => {
    if (typeof iso !== 'string' || !iso) return 'sin fecha';
    const d = new Date(iso);
    const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return `${fechaLocalISO(d)} ${hora}`;
  };
  return propuestas
    .map((p, i) => {
      const x = p.payload;
      const limite = (typeof x.periodoFin === 'string' && x.periodoFin) || (typeof x.fechaMaxima === 'string' ? fechaLocalISO(new Date(x.fechaMaxima)) : 'sin fecha');
      return [
        `${i + 1}. título: ${x.titulo}`,
        `indicaciones: ${x.indicaciones ?? '(vacías)'}`,
        `tipo: ${p.tipoEtiqueta}${x.ticketTypeCustom ? ` · ${x.ticketTypeCustom}` : x.ticketType && p.tipo === 'servicio' ? ` · ${x.ticketType}` : ''}`,
        `responsable: ${p.responsable?.nombre ?? `sin elegir (dijeron «${p.textoResponsable ?? ''}»)`}`,
        `cliente: ${p.cliente?.nombre ?? 'ninguno'}${p.sucursal ? ` · sucursal ${p.sucursal.nombre}` : x.branchName ? ` · lugar ${x.branchName}` : ''}${p.proyecto ? ` · proyecto ${p.proyecto.nombre}` : ''}`,
        `inicio: ${diaHora(x.fechaInicio)} · límite: ${limite}`,
        `duración: ${x.tiempoEstimadoMin ? `${x.tiempoEstimadoMin} min` : 'sin dato'} · prioridad: ${x.prioridad} · encargo: ${x.assignmentCharge ?? 'sin dato'}`,
      ].join('\n   ');
    })
    .join('\n');
}

function textoCatalogo(): string {
  return [
    `Personas: ${PERSONAS.map((p) => p.nombre).join('; ')}`,
    `Clientes y sucursales: ${CATALOGO.clientes
      .map((c) => {
        const suc = CATALOGO.sucursales.filter((s) => s.clientId === c.id).map((s) => s.name);
        return suc.length ? `${c.name} (${suc.join(', ')})` : c.name;
      })
      .join('; ')}`,
    `Proyectos activos: ${CATALOGO.proyectos.map((p) => `${p.title} (${p.clientName})`).join('; ')}`,
  ].join('\n');
}

function textoEsperadoAsistente(caso: CasoAsistente): string {
  if (caso.aclaracion) return 'Ninguna actividad: acciones vacías y una pregunta en aclaracion.';
  const nombre = (id: number | null | undefined) => (id == null ? null : PERSONAS.find((p) => p.id === id)?.nombre);
  const cliente = (id: number | null | undefined) => (id == null ? null : CATALOGO.clientes.find((c) => c.id === id)?.name);
  return caso.acciones
    .map((e, i) =>
      [
        `${i + 1}. responsable: ${nombre(e.responsableId) ?? `nadie de la lista (conservar «${e.textoResponsable ?? ''}»)`}`,
        `tipo: ${e.tipos.join('/')}`,
        e.clienteId ? `cliente: ${e.clienteId.map((c) => cliente(c) ?? 'ninguno registrado').join(' o ')}` : null,
        e.inicio ? `inicio: ${e.inicio.map((f) => f ?? 'sin fecha').join(' o ')}` : null,
        e.limite ? `límite: ${e.limite.map((f) => f ?? 'sin fecha').join(' o ')}` : null,
        e.hora ? `hora: ${e.hora.map((h) => h ?? 'sin hora').join(' o ')}` : null,
        e.duracionMin ? `duración: ${e.duracionMin.map((d) => (d == null ? 'no la dijeron' : `${d} min`)).join(' o ')}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join('\n');
}

async function correrAsistente(caso: CasoAsistente, v: Variante, conJuez: boolean): Promise<Resultado> {
  const t0 = Date.now();
  const base = { caso: caso.id, variante: v.nombre };
  try {
    asegurarPresupuesto(0.02);
    const pet = peticionAsistente(caso.instruccion, CATALOGO, AHORA, AUTOR);
    const { datos: salida, uso } = await claude.json<SalidaIA>({
      ...pet,
      proceso: 'eval-asistente',
      companyId: 0,
      modelo: v.modelo,
      esfuerzo: v.esfuerzo,
      pensar: v.pensar,
    });
    const ms = Date.now() - t0;
    registrarGasto(`asistente ${v.nombre}`, uso.usdAprox);
    const plan: PlanAsistente = planDeSalida(salida);
    const propuestas = plan.acciones.slice(0, 10).map((a) => construirPropuesta(a, CATALOGO, { creadoPorId: 12, ahora: AHORA, instruccion: caso.instruccion }));
    const revisiones = revisarAsistente(caso, plan, propuestas);

    let notaJuez: number | null = null;
    let comentarioJuez: string | null = null;
    let inventos = 0;
    if (conJuez) {
      const j = await juzgar<{ inventos: string[]; titulosOk: boolean; indicacionesFieles: boolean; nota: number; comentario: string }>(
        'asistente',
        JUEZ_ASISTENTE,
        [
          {
            type: 'text',
            text: [
              `Fecha actual: miércoles 21 de octubre de 2026, 10:30 (Ciudad de México).`,
              textoCatalogo(),
              `Instrucción: ${caso.instruccion}`,
              `Se esperaba:\n${textoEsperadoAsistente(caso)}`,
              caso.nota ? `Ojo: ${caso.nota}` : null,
              plan.aclaracion ? `Pregunta de aclaración del asistente: ${plan.aclaracion}` : null,
              `Actividades que se crearían:\n${textoPropuestas(propuestas)}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        ESQUEMA_JUEZ_ASISTENTE,
      );
      inventos = j.inventos.length;
      notaJuez = j.nota;
      comentarioJuez = j.inventos.length ? `${j.comentario} | inventos: ${j.inventos.join('; ')}` : j.comentario;
      revisiones.push({ nombre: 'sin inventos (juez)', ok: j.inventos.length === 0, detalle: j.inventos.join('; ') });
      revisiones.push({ nombre: 'títulos (juez)', ok: j.titulosOk });
      revisiones.push({ nombre: 'indicaciones fieles (juez)', ok: j.indicacionesFieles });
    }
    return {
      ...base,
      revisiones,
      puntaje: revisiones.filter((r) => r.ok).length / revisiones.length,
      inventos,
      notaJuez,
      comentarioJuez,
      uso,
      ms,
      salida: plan,
    };
  } catch (error) {
    if (error instanceof PresupuestoAgotado) throw error;
    return { ...base, revisiones: [], puntaje: 0, inventos: 0, notaJuez: null, comentarioJuez: null, uso: null, ms: Date.now() - t0, error: String((error as Error).message ?? error) };
  }
}

// ───────────────────────────── Actas ─────────────────────────────

const JUEZ_ACTA = `Calificas actas de reunión generadas por IA para NEXARA, empresa mexicana de seguridad electrónica. Recibes la transcripción (o notas), los datos de la reunión, lo que el acta debía contener (E = acuerdos, D = decisiones, P = pendientes sin dueño, X = lo que no debe aparecer) y el acta generada (S = acuerdos del acta).

Devuelve:
- acuerdos: un elemento por cada E, en orden: { esperado: número de E, salida: número de S que expresa el mismo compromiso o riesgo/lección (aunque cambie la redacción), o -1 si ninguno }. Cada S se usa a lo más una vez.
- extras: cada S que no quedó ligado a ninguna E: { salida, sustentado: true si la transcripción respalda ese compromiso con ese responsable y esa fecha, false si lo inventó, le puso dueño o fecha que nadie dijo, o es plática social; motivo breve }.
- decisiones: por cada D, { esperada, cubierta: true si el acta la registra (en decisiones, o con claridad en temas o resumen) }.
- pendientes: por cada P, { esperado, cubierto: true si el acta lo registra sin dueño (en pendientes sin responsable o como acuerdo sin responsable) }.
- violaciones: cada cosa de X que el acta trae como acuerdo, decisión o pendiente, y cualquier dato inventado en resumen o temas (personas, cifras, fechas o hechos que no están en el texto).
- resumenFiel: true si el resumen cuenta lo importante sin inventar.
- nota: 1 a 5, qué tan lista está el acta para guardarse sin correcciones.
- comentario: una frase con el problema principal, o «sin problemas».`;

const ESQUEMA_JUEZ_ACTA = {
  type: 'object',
  additionalProperties: false,
  required: ['acuerdos', 'extras', 'decisiones', 'pendientes', 'violaciones', 'resumenFiel', 'nota', 'comentario'],
  properties: {
    acuerdos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['esperado', 'salida'],
        properties: { esperado: { type: 'integer' }, salida: { type: 'integer' } },
      },
    },
    extras: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['salida', 'sustentado', 'motivo'],
        properties: { salida: { type: 'integer' }, sustentado: { type: 'boolean' }, motivo: { type: 'string' } },
      },
    },
    decisiones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['esperada', 'cubierta'],
        properties: { esperada: { type: 'integer' }, cubierta: { type: 'boolean' } },
      },
    },
    pendientes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['esperado', 'cubierto'],
        properties: { esperado: { type: 'integer' }, cubierto: { type: 'boolean' } },
      },
    },
    violaciones: { type: 'array', items: { type: 'string' } },
    resumenFiel: { type: 'boolean' },
    nota: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    comentario: { type: 'string' },
  },
};

type VeredictoActa = {
  acuerdos: Array<{ esperado: number; salida: number }>;
  extras: Array<{ salida: number; sustentado: boolean; motivo: string }>;
  decisiones: Array<{ esperada: number; cubierta: boolean }>;
  pendientes: Array<{ esperado: number; cubierto: boolean }>;
  violaciones: string[];
  resumenFiel: boolean;
  nota: number;
  comentario: string;
};

function reunionDe(e: EscenarioActa) {
  return {
    titulo: e.titulo,
    fecha: new Date(`${e.fecha}T00:00:00Z`),
    agenda: e.agenda ?? null,
    asistentes: e.asistentesIds.map((id) => PERSONAS.find((p) => p.id === id)!.nombre),
  };
}

/** Bloque estable por escenario (se cachea entre variantes): transcripción + verdad. */
function bloqueVerdad(e: EscenarioActa, transcripcion: string): string {
  const nombre = (id: number | null) => (id == null ? 'nadie de la empresa' : PERSONAS.find((p) => p.id === id)!.nombre);
  return [
    `Reunión: ${e.titulo} · fecha ${e.fecha} · asistentes: ${reunionDe(e).asistentes.join(', ')}`,
    `TRANSCRIPCIÓN:\n${transcripcion}`,
    `LO QUE DEBÍA TRAER EL ACTA`,
    ...e.acuerdos.map(
      (a, i) =>
        `E${i + 1}. [${a.tipo}] ${a.descripcion} · responsable: ${a.responsableId.map(nombre).join(' o ')}${a.textoResponsable ? ` (${a.textoResponsable})` : ''} · fecha: ${a.fecha.map((f) => f ?? 'ninguna').join(' o ')}`,
    ),
    ...e.decisiones.map((d, i) => `D${i + 1}. ${d}`),
    ...e.pendientesSinDueno.map((p, i) => `P${i + 1}. ${p}`),
    ...(e.noDebe.length ? e.noDebe.map((x, i) => `X${i + 1}. ${x}`) : ['X: (nada en especial)']),
  ].join('\n');
}

function bloqueActa(acta: ActaPropuesta): string {
  return [
    'ACTA GENERADA',
    `Resumen: ${acta.resumen}`,
    `Temas:\n${acta.temas.map((t, i) => `${i + 1}. ${t.titulo}: ${t.detalle}`).join('\n') || '(ninguno)'}`,
    `Decisiones:\n${acta.decisiones.map((d) => `- ${d}`).join('\n') || '(ninguna)'}`,
    `Acuerdos:\n${acta.acuerdos.map((a, i) => `S${i + 1}. [${a.tipo}] ${a.descripcion} · responsable: ${a.textoResponsable ?? 'ninguno'} · fecha: ${a.fechaCompromiso ?? 'ninguna'}`).join('\n') || '(ninguno)'}`,
    `Pendientes sin responsable:\n${acta.pendientesSinDueno.map((p) => `- ${p}`).join('\n') || '(ninguno)'}`,
  ].join('\n\n');
}

function revisarActa(e: EscenarioActa, acta: ActaPropuesta, j: VeredictoActa | null): { revisiones: Revision[]; inventos: number } {
  const revisiones: Revision[] = [];
  e.acuerdos.forEach((esp, i) => {
    const s = j?.acuerdos.find((x) => x.esperado === i + 1)?.salida ?? -1;
    const a = s >= 1 ? acta.acuerdos[s - 1] : undefined;
    const etiqueta = `E${i + 1}`;
    revisiones.push({ nombre: `${etiqueta} encontrado`, ok: Boolean(a) });
    const idSalida = a?.responsable?.id ?? null;
    const respOk =
      Boolean(a) &&
      esp.responsableId.includes(idSalida) &&
      (idSalida !== null || !esp.textoResponsable || plano(a!.textoResponsable ?? '').includes(plano(esp.textoResponsable)));
    revisiones.push({ nombre: `${etiqueta} responsable`, ok: respOk, detalle: a ? a.textoResponsable ?? 'null' : '—' });
    revisiones.push({ nombre: `${etiqueta} fecha`, ok: Boolean(a) && esp.fecha.includes(a!.fechaCompromiso), detalle: a?.fechaCompromiso ?? '—' });
    revisiones.push({ nombre: `${etiqueta} tipo`, ok: Boolean(a) && a!.tipo === esp.tipo, detalle: a?.tipo ?? '—' });
  });
  if (!j) return { revisiones, inventos: 0 };
  e.decisiones.forEach((_, i) =>
    revisiones.push({ nombre: `D${i + 1}`, ok: Boolean(j.decisiones.find((d) => d.esperada === i + 1)?.cubierta) }),
  );
  e.pendientesSinDueno.forEach((_, i) =>
    revisiones.push({ nombre: `P${i + 1}`, ok: Boolean(j.pendientes.find((p) => p.esperado === i + 1)?.cubierto) }),
  );
  const noSustentados = j.extras.filter((x) => !x.sustentado);
  const inventos = noSustentados.length + j.violaciones.length;
  revisiones.push({
    nombre: 'sin inventos (juez)',
    ok: inventos === 0,
    detalle: [...noSustentados.map((x) => `S${x.salida}: ${x.motivo}`), ...j.violaciones].join('; '),
  });
  revisiones.push({ nombre: 'resumen fiel (juez)', ok: j.resumenFiel });
  return { revisiones, inventos };
}

async function correrActa(e: EscenarioActa, v: Variante, conJuez: boolean): Promise<Resultado> {
  const t0 = Date.now();
  const base = { caso: e.id, variante: v.nombre };
  try {
    asegurarPresupuesto(0.05);
    const transcripcion = leerTranscripcion(e.id);
    // Misma petición que `ActaIaService.proponer` (meetings es de otro agente: aquí se arma
    // con sus piezas exportadas en vez de tocar su servicio).
    const { datos, uso } = await claude.json<ActaPlan>({
      sistema: [PROMPT_ACTA, bloquePersonasActa(PERSONAS)],
      usuario: mensajeActa(reunionDe(e), transcripcion),
      esquema: ESQUEMA_ACTA,
      maxTokens: 8_000,
      timeoutMs: 110_000,
      proceso: 'eval-acta',
      companyId: 0,
      modelo: v.modelo,
      esfuerzo: v.esfuerzo,
      pensar: v.pensar,
    });
    const ms = Date.now() - t0;
    registrarGasto(`actas ${v.nombre}`, uso.usdAprox);
    const acta = construirActa(datos, PERSONAS);
    let j: VeredictoActa | null = null;
    if (conJuez) {
      j = await juzgar<VeredictoActa>(
        'actas',
        JUEZ_ACTA,
        [
          { type: 'text', text: bloqueVerdad(e, transcripcion), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: bloqueActa(acta) },
        ],
        ESQUEMA_JUEZ_ACTA,
      );
    }
    const { revisiones, inventos } = revisarActa(e, acta, j);
    return {
      ...base,
      revisiones,
      puntaje: revisiones.filter((r) => r.ok).length / revisiones.length,
      inventos,
      notaJuez: j?.nota ?? null,
      comentarioJuez: j ? j.comentario : null,
      uso,
      ms,
      salida: { ...acta, juez: j },
    };
  } catch (error) {
    if (error instanceof PresupuestoAgotado) throw error;
    return { ...base, revisiones: [], puntaje: 0, inventos: 0, notaJuez: null, comentarioJuez: null, uso: null, ms: Date.now() - t0, error: String((error as Error).message ?? error) };
  }
}

// ───────────────────────────── Triage ─────────────────────────────

async function correrTriage(caso: CasoTriage, v: Variante): Promise<Resultado> {
  const t0 = Date.now();
  const base = { caso: caso.id, variante: v.nombre };
  try {
    asegurarPresupuesto(0.01);
    const { datos, uso } = await claude.json<ClasificacionTriage>({
      ...peticionTriage(caso.ticket),
      proceso: 'eval-triage',
      companyId: 0,
      modelo: v.modelo,
      esfuerzo: v.esfuerzo,
      pensar: v.pensar,
    });
    registrarGasto(`triage ${v.nombre}`, uso.usdAprox);
    const c = limpiarTriage(datos);
    const revisiones: Revision[] = [
      { nombre: 'prioridad', ok: Boolean(c.priority && caso.prioridad.includes(c.priority)), detalle: c.priority },
      { nombre: 'tipo', ok: Boolean(c.ticketType && caso.tipo.includes(c.ticketType)), detalle: c.ticketType },
      { nombre: 'resumen', ok: Boolean(c.summary && c.summary.length <= 180), detalle: c.summary },
    ];
    return { ...base, revisiones, puntaje: revisiones.filter((r) => r.ok).length / revisiones.length, inventos: 0, notaJuez: null, comentarioJuez: null, uso, ms: Date.now() - t0, salida: c };
  } catch (error) {
    if (error instanceof PresupuestoAgotado) throw error;
    return { ...base, revisiones: [], puntaje: 0, inventos: 0, notaJuez: null, comentarioJuez: null, uso: null, ms: Date.now() - t0, error: String((error as Error).message ?? error) };
  }
}

// ──────────────────────────── Resumen ────────────────────────────

/** Percentil por rango más cercano (p50, p95) de los milisegundos de cada llamada. */
function percentil(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const orden = [...xs].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.max(0, Math.ceil(p * orden.length) - 1))];
}

function promedio(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function resumir(funcion: string, v: Variante, rs: Resultado[]) {
  const ok = rs.filter((r) => !r.error);
  const usos = ok.map((r) => r.uso!).filter(Boolean);
  const notas = ok.map((r) => r.notaJuez).filter((n): n is number => n !== null);
  return {
    funcion,
    variante: v.nombre,
    modelo: v.modelo,
    esfuerzo: v.esfuerzo,
    pensar: v.pensar,
    fecha: new Date().toISOString(),
    casos: rs.length,
    errores: rs.length - ok.length,
    puntaje: Number(promedio(rs.map((r) => r.puntaje)).toFixed(4)),
    casosPerfectos: rs.filter((r) => r.puntaje === 1).length,
    inventos: ok.reduce((s, r) => s + r.inventos, 0),
    notaJuez: notas.length ? Number(promedio(notas).toFixed(2)) : null,
    tokensEntradaMedios: Math.round(promedio(usos.map((u) => u.tokensEntrada + u.tokensCacheLeidos))),
    tokensSalidaMedios: Math.round(promedio(usos.map((u) => u.tokensSalida))),
    tokensPensamientoMedios: Math.round(promedio(usos.map((u) => u.tokensPensamiento))),
    usdPorLlamada: Number(promedio(usos.map((u) => u.usdAprox ?? 0)).toFixed(6)),
    msMedios: Math.round(promedio(ok.map((r) => r.ms))),
    // Con `--concurrencia 1` es la latencia que ve quien usa la función (cada llamada sola).
    msP50: percentil(ok.map((r) => r.ms), 0.5),
    msP95: percentil(ok.map((r) => r.ms), 0.95),
    fallos: rs
      .flatMap((r) => (r.error ? [`${r.caso}: ERROR ${r.error}`] : r.revisiones.filter((x) => !x.ok).map((x) => `${r.caso} ${x.nombre}${x.detalle ? ` (${x.detalle})` : ''}`)))
      .slice(0, 80),
  };
}

/**
 * Tokens típicos por llamada (asistente medido el 24-10-2026; el resto, el 23-10).
 * Sirven para estimar el costo antes de correr.
 */
const TOKENS_TIPICOS: Record<string, { entrada: number; cacheada: number; salida: number; juez: { entrada: number; salida: number } }> = {
  asistente: { entrada: 2_800, cacheada: 2_450, salida: 180, juez: { entrada: 2_500, salida: 350 } },
  actas: { entrada: 12_000, cacheada: 2_500, salida: 2_500, juez: { entrada: 14_000, salida: 1_500 } },
  triage: { entrada: 700, cacheada: 500, salida: 80, juez: { entrada: 0, salida: 0 } },
};

/** Costo estimado de la corrida: cada caso por variante (la primera escribe la caché) + juez. */
function estimarCorrida(funcion: string, casos: number, variantes: Variante[], conJuez: boolean): number {
  const t = TOKENS_TIPICOS[funcion];
  let total = 0;
  for (const v of variantes) {
    // Con razonamiento la salida es ~2.4× (medido en el asistente).
    const salida = Math.round(t.salida * (v.pensar ? 2.4 : 1));
    total += costoLlamada(v.modelo, { ...t, salida }, true) + (casos - 1) * costoLlamada(v.modelo, { ...t, salida });
    if (conJuez && t.juez.entrada) total += casos * costoLlamada(JUEZ, { entrada: t.juez.entrada, salida: t.juez.salida });
  }
  return Number(total.toFixed(4));
}

async function main() {
  const args = argumentos();
  const funcion = args.funcion;
  if (funcion !== 'asistente' && funcion !== 'actas' && funcion !== 'triage') throw new Error('--funcion asistente|actas|triage');
  const variantes = (args.variantes || 'haiku-low-np').split(',').map(variante);
  const conJuez = !args['sin-juez'];
  JUEZ = modeloDe(args.juez);
  const ids = args.casos ? args.casos.split(',') : null;
  console.log(`Llave: ${cargarLlave()} · gastado ${gastado().toFixed(4)} de ${topeUsd()} USD`);

  const todos: Array<{ id: string }> = funcion === 'asistente' ? CASOS_ASISTENTE : funcion === 'actas' ? ESCENARIOS_ACTA : CASOS_TRIAGE;
  const casos = todos.filter((c) => !ids || ids.includes(c.id));
  const estimado = estimarCorrida(funcion, casos.length, variantes, conJuez);
  const maximo = args['max-usd'] ? Number(args['max-usd']) : null;
  console.log(
    `Costo estimado: ~US$${estimado} (${casos.length} casos × ${variantes.map((v) => v.nombre).join(', ')}` +
      `${conJuez ? ` + juez ${JUEZ}` : ', sin juez'}) · quedan US$${restante().toFixed(4)} del tope`,
  );
  if (maximo !== null && estimado > maximo) throw new Error(`El costo estimado (US$${estimado}) pasa de --max-usd ${maximo}: no se corre.`);
  if (estimado > restante()) throw new Error(`El costo estimado (US$${estimado}) pasa de lo que queda del tope: no se corre.`);
  const porVariante = new Map<string, Resultado[]>(variantes.map((v) => [v.nombre, []]));
  // Caso por caso con todas las variantes seguidas: el juez reutiliza la caché del escenario.
  const concurrencia = args.concurrencia ? Math.max(1, Number(args.concurrencia)) : funcion === 'actas' ? 3 : 5;
  await enParalelo(casos, concurrencia, async (caso) => {
    for (const v of variantes) {
      const r =
        funcion === 'asistente'
          ? await correrAsistente(caso as CasoAsistente, v, conJuez)
          : funcion === 'actas'
            ? await correrActa(caso as EscenarioActa, v, conJuez)
            : await correrTriage(caso as CasoTriage, v);
      porVariante.get(v.nombre)!.push(r);
      const fallas = r.error ? `ERROR ${r.error}` : r.revisiones.filter((x) => !x.ok).map((x) => x.nombre).join(', ') || 'todo bien';
      console.log(`${caso.id} ${v.nombre}: ${(r.puntaje * 100).toFixed(0)} % · juez ${r.notaJuez ?? '—'} · ${r.uso?.tokensSalida ?? 0} tok salida · $${r.uso?.usdAprox ?? 0} · ${fallas}`);
    }
  });

  mkdirSync(DIR_DETALLE, { recursive: true });
  mkdirSync(DIR_RESULTADOS, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const archivoResumen = join(DIR_RESULTADOS, `${funcion}.json`);
  const historico: unknown[] = existsSync(archivoResumen) ? JSON.parse(readFileSync(archivoResumen, 'utf8')) : [];
  for (const v of variantes) {
    const rs = porVariante.get(v.nombre)!.sort((a, b) => a.caso.localeCompare(b.caso));
    writeFileSync(join(DIR_DETALLE, `${funcion}-${v.nombre}-${sello}.json`), JSON.stringify(rs, null, 2));
    const resumen = { ...resumir(funcion, v, rs), etiqueta: args.etiqueta ?? null };
    historico.push(resumen);
    const { fallos, ...corto } = resumen;
    console.log('\n' + JSON.stringify(corto));
    if (fallos.length) console.log('  fallos: ' + fallos.join(' | '));
  }
  writeFileSync(archivoResumen, JSON.stringify(historico, null, 2) + '\n');
  console.log(`\nGastado en pruebas: ${gastado().toFixed(4)} de ${topeUsd()} USD`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
