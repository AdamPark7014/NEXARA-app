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
  razonTipo: string;
  subtipoTarea: string | null;
  tipoServicio: (typeof TIPOS_SERVICIO)[number] | null;
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
        required: [
          'tipo',
          'razonTipo',
          'subtipoTarea',
          'tipoServicio',
          'titulo',
          'indicaciones',
          'responsable',
          'cliente',
          'sitio',
          'fecha',
          'hora',
          'fechaLimite',
          'horaLimite',
          'duracionMin',
          'prioridad',
          'encargo',
        ],
        properties: {
          tipo: { type: 'string', enum: [...TIPOS_ACTIVIDAD] },
          razonTipo: { type: 'string' },
          subtipoTarea: enumONulo(SUBTIPOS_TAREA),
          tipoServicio: enumONulo(TIPOS_SERVICIO),
          titulo: { type: 'string' },
          indicaciones: textoONulo,
          responsable: textoONulo,
          cliente: textoONulo,
          sitio: textoONulo,
          fecha: textoONulo,
          hora: textoONulo,
          fechaLimite: textoONulo,
          horaLimite: textoONulo,
          duracionMin: { type: ['integer', 'null'] },
          prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          encargo: enumONulo(['ejecucion', 'despacho']),
        },
      },
    },
    aclaracion: textoONulo,
  },
};

/** Instrucciones fijas (no cambian entre llamadas: así entran en la caché de Claude). */
export const PROMPT_SISTEMA = `Eres el asistente de asignación de actividades de NEXARA, empresa mexicana de seguridad electrónica e integración (CCTV, control de acceso, redes, alarmas, servicio de campo).

Recibes una instrucción de dirección, escrita o dictada por voz (con errores de transcripción, muletillas y correcciones al vuelo: «que Paty… no, que Carolina» es Carolina), y la conviertes en actividades con todos sus campos llenos con lo que se dijo. Una persona las revisa antes de crearlas.

Tipos (uno por actividad):
- tarea: trabajo del día sin proyecto. subtipoTarea: Levantamiento (visitar un sitio para revisar o medir antes de cotizar), Recolección, Entrega, Junta (reunión o llamada para revisar o acordar algo, también con un cliente), Compra de material, Preparación de equipo, Trámite (facturas, fianzas, permisos, pagos, papeleo), Capacitación, Reporte / documentación (hacer o mandar un reporte), Otro.
- servicio: ir al sitio de un cliente a hacer trabajo técnico (falla, mantenimiento, revisión, instalación de pocas horas). tipoServicio: PREVENTIVO (mantenimiento programado), CORRECTIVO (falla), EMERGENCIA (sistema caído o urgente), INSTALACION (equipo nuevo pequeño).
- obra: instalación grande de uno de los proyectos activos (cableado, montaje en obra).
- proyecto: trabajo de uno de los proyectos activos que no es instalación (ingeniería, planos, pruebas, puesta en marcha).
- obra y proyecto solo si mencionan el proyecto, la obra o la puesta en marcha: que el cliente tenga un proyecto activo no basta. Una instalación de pocas horas es servicio INSTALACION.
- comercial: solo para vender: cotizar, mandar una propuesta, dar seguimiento a una venta o visitar para vender. Una junta con un cliente para revisar algo (contrato, avance, entrega) es tarea Junta.

Campos:
- Una actividad por persona y por trabajo: si piden lo mismo a dos personas, son dos actividades.
- responsable: el nombre completo de la lista de personas cuando lo que dijeron (nombre de pila, apodo: Beto→Roberto, Paty→Patricia, Toño→Antonio) coincide con una sola persona. Si coincide con varias o con nadie, copia exactamente lo que dijeron («Antonio», «Pedro») sin elegir a otra persona, y crea la actividad igual. Si piden a alguien que mande a su gente, el responsable es esa persona (encargo despacho). null si no dijeron quién.
- cliente: si es uno de los clientes registrados (aunque lo digan corto o con otra ortografía: «Tox» → «Grupo Tox»), escríbelo como en la lista; si no está en la lista, como lo dijeron, sin cambiarlo por otro. Proveedores, tiendas y lugares que no son clientes: cliente null y el nombre del lugar en sitio. sitio: la sucursal, planta, área, plaza o dirección, como en la lista si es una sucursal registrada («la Torre Médica del San Rafael» → cliente «Hospital San Rafael», sitio «Torre Médica»). null si no lo dijeron, aunque el cliente tenga una sola sucursal.
- Fechas AAAA-MM-DD y horas HH:MM (24 h), hora de Ciudad de México, calculadas desde la fecha y hora actuales que se te dan. «mañana», «el lunes», «el viernes» = el próximo día con ese nombre después de hoy. «a las 3» o «para las 3» en horario laboral = 15:00.
- fecha y hora: cuándo se hace o empieza: cita, visita, junta, «mañana a las 9», «el lunes», «empezando el jueves». Hora sin fecha: hoy, o mañana si esa hora ya pasó. «ya», «de inmediato», «ahorita»: hoy a la hora actual. «hoy» sin hora: hoy con hora null.
- fechaLimite y horaLimite: para cuándo debe quedar terminado: «para el viernes», «antes del viernes», «a más tardar», «tiene hasta», «que quede listo», «que lo entregue el». «Para» con día y sin hora es plazo; con hora («para las 3») es la hora de la cita. En un rango («del lunes al miércoles») fecha es el primer día y fechaLimite el último. Si solo dieron plazo, fecha null. «Para hoy» es fechaLimite hoy. Un día o plazo que encabeza varias actividades («Para el viernes: …») vale para todas, y una hora dentro de una de ellas es la hora de ese día («que capacite a las 11» → el viernes a las 11).
- Plazo vago («la otra semana», «luego») o sin fechas: todo null.
- duracionMin: cuánto tarda, solo si lo dijeron («una hora y media» 90, «como 3 horas» 180, «media hora» 30, «jornadas de 8 horas» o «todo el día» 480). Máximo 720. Si no, null.
- prioridad: Alta si dicen urgente, ya, cuanto antes o algo está caído; Baja si dicen sin prisa; si no, Media.
- encargo: despacho si la persona debe mandar a alguien de su equipo; ejecucion si la hace ella; null si no está claro.
- titulo: verbo en infinitivo + qué + dónde, máximo 80 caracteres, claro y profesional («Revisar DVR que no graba en Angelópolis»).
- indicaciones: el detalle que dieron y que no cabe en el título (síntoma, cantidades, materiales, equipos, con quién ir o coordinarse, a quién llamar o entregar, para qué), en una o dos frases claras y profesionales, sin muletillas. No repitas el título, no agregues pasos ni objetivos que nadie dijo («revisar la causa», «restablecer el servicio», «tomar medidas»), no menciones proyectos ni sucursales que no dijeron, no expliques tu razonamiento y no pongas fechas, horas ni duración (van en sus campos). null si no queda nada.
- razonTipo: máximo 12 palabras.
- No inventes personas, clientes, fechas, cantidades ni datos.
- Si piden algún trabajo, aunque falten datos, devuelve la actividad con lo que haya. Solo si no piden ningún trabajo o no se entiende: acciones vacío y en aclaracion una pregunta breve (nunca acciones vacío con aclaracion null). Si hay actividades, aclaracion null.`;

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

/** Lista de personas para el bloque de sistema (estable por empresa → cacheable). */
export function bloquePersonas(personas: PersonaAsignable[]): string {
  const filas = personas.map((p) => `- ${p.nombre}${p.puesto ? ` (${p.puesto})` : ''}`);
  return `Personas a las que quien escribe puede asignar trabajo:\n${filas.join('\n') || '- (ninguna)'}`;
}

/** Topes del bloque de clientes: con más, se manda lo primero y el resto se busca en código. */
const MAX_CLIENTES_PROMPT = 300;
const MAX_SUCURSALES_POR_CLIENTE = 25;
const MAX_PROYECTOS_PROMPT = 80;

/**
 * Clientes registrados con sus sucursales y los proyectos activos (estable por empresa →
 * cacheable). Con la lista, la IA escribe «Grupo Tox» aunque dicten «Tox».
 */
export function bloqueClientes(catalogos: Pick<CatalogosNexara, 'clientes' | 'sucursales' | 'proyectos'>): string {
  const porCliente = new Map<number, string[]>();
  for (const suc of catalogos.sucursales) {
    const lista = porCliente.get(suc.clientId) ?? [];
    if (lista.length < MAX_SUCURSALES_POR_CLIENTE) lista.push(suc.name);
    porCliente.set(suc.clientId, lista);
  }
  const clientes = [...catalogos.clientes]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .slice(0, MAX_CLIENTES_PROMPT)
    .map((c) => {
      const suc = porCliente.get(c.id);
      return `- ${c.name}${suc?.length ? ` · sucursales: ${suc.join('; ')}` : ''}`;
    });
  const proyectos = catalogos.proyectos
    .slice(0, MAX_PROYECTOS_PROMPT)
    .map((p) => `- ${p.title}${p.clientName ? ` (${p.clientName})` : ''}`);
  return [
    `Clientes registrados:\n${clientes.join('\n') || '- (ninguno)'}`,
    `Proyectos activos:\n${proyectos.join('\n') || '- (ninguno)'}`,
  ].join('\n\n');
}

/** Mensaje del turno: fecha y hora actuales + la instrucción. */
export function mensajeUsuario(texto: string, ahora: Date, autor: string | null): string {
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
  return `Fecha actual: ${fecha} (${iso}), ${hora} hora de Ciudad de México.${autor ? `\nQuien escribe: ${autor}.` : ''}\n\nInstrucción:\n${texto.trim()}`;
}

/**
 * Modelo y parámetros del asistente, medidos con el eval (`src/ai/eval/`, 23-10-2026): Haiku 5.5
 * en esfuerzo `low` y sin razonamiento sacó lo mismo que con razonamiento y que Sonnet 5.5
 * (15/15 en las revisiones de código), con la mitad de tokens de salida y ~2 s por llamada.
 * Con plazos, duración, faltantes y catálogo de clientes (23 casos, 23-10-2026): 0.94 con juez
 * (antes 0.85) y nota 4.3/5 (antes 3.6), ~US$0.0002 por llamada; con razonamiento costó 2.4×
 * sin mejorar.
 * El modelo se puede cambiar sin desplegar con `ANTHROPIC_ASSISTANT_MODEL`.
 */
export const CONFIG_ASISTENTE = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  // ~250 tokens por actividad; el plan admite hasta 10.
  maxTokens: 3_000,
};

/** La petición completa a Claude (el servicio y el eval mandan exactamente lo mismo). */
export function peticionAsistente(
  instruccion: string,
  catalogos: CatalogosNexara,
  ahora: Date,
  autor: string | null,
) {
  return {
    // Prompt fijo + personas + clientes de la empresa: cambian poco, así que se reutilizan
    // de la caché (cada bloque lleva su marca).
    sistema: [PROMPT_SISTEMA, bloquePersonas(catalogos.personas), bloqueClientes(catalogos)],
    usuario: mensajeUsuario(instruccion, ahora, autor),
    esquema: ESQUEMA_PLAN,
    modelo: CONFIG_ASISTENTE.modelo,
    esfuerzo: CONFIG_ASISTENTE.esfuerzo,
    pensar: CONFIG_ASISTENTE.pensar,
    maxTokens: CONFIG_ASISTENTE.maxTokens,
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
  if (!nuevas.length || (nuevas.length === 1 && propias.size >= 4)) return null;
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
  const agenda = agendaDe(accion, contexto.ahora);
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
  const ticketType =
    tipo === 'obra'
      ? 'INSTALACION'
      : tipo === 'tarea' || tipo === 'comercial'
        ? 'OTRO'
        : accion.tipoServicio || 'PREVENTIVO';
  const ticketTypeCustom =
    tipo === 'comercial' ? 'COMERCIAL' : tipo === 'tarea' ? accion.subtipoTarea || 'Otro' : undefined;

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
