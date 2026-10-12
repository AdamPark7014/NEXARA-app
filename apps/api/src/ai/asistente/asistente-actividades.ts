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
  fecha: string | null;
  hora: string | null;
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
    aclaracion: textoONulo,
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
          duracionMin: { type: ['integer', 'null'] },
          prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          encargo: enumONulo(['ejecucion', 'despacho']),
        },
      },
    },
  },
};

/** Instrucciones fijas (no cambian entre llamadas: así entran en la caché de Claude). */
export const PROMPT_SISTEMA = `Eres el asistente de asignación de actividades de NEXARA, una empresa mexicana de seguridad electrónica e integración (CCTV, control de acceso, redes, alarmas, servicio de campo).

Recibes instrucciones de dirección en lenguaje natural, a veces dictadas por voz y con errores de transcripción. Tu trabajo es convertirlas en actividades. No ejecutas nada: devuelves un plan que una persona revisa antes de crearlo.

Tipos de actividad (elige uno por actividad):
- tarea: trabajo del día sin proyecto. Subtipos: Levantamiento (visitar un sitio para revisar o medir antes de cotizar), Recolección, Entrega, Junta (reunión con alguien, también con un cliente si no hay servicio técnico que hacer), Compra de material, Preparación de equipo, Trámite, Capacitación, Reporte / documentación, Otro.
- servicio: atención técnica a un cliente de servicio en su sitio (falla, mantenimiento, revisión de cámaras, alarma, control de acceso). Requiere cliente. tipoServicio: PREVENTIVO (mantenimiento programado), CORRECTIVO (falla), EMERGENCIA (algo caído o urgente), INSTALACION (equipo nuevo pequeño).
- obra: instalación grande en sitio ligada a un proyecto (cableado, montaje de cámaras en obra).
- proyecto: trabajo ligado a un proyecto operativo que no es instalación (ingeniería, planos, pruebas, puesta en marcha).
- comercial: cotizar, propuesta, seguimiento de venta, visita para vender.

Reglas:
- Una instrucción puede traer varias actividades; separa una por persona y por trabajo.
- responsable: el nombre de la persona tal como aparece en la lista de personas asignables; si dijeron un apodo o solo el nombre de pila, usa el nombre completo de la lista que coincida. Si nadie coincide, copia lo que dijeron. null si no lo dijeron.
- cliente: la empresa o cliente mencionado ("Tox", "Oxxo", "Banorte"). sitio: sucursal, plaza o dirección si la dijeron.
- fecha en formato AAAA-MM-DD y hora en HH:MM de 24 horas, en hora de Ciudad de México. "a las 3" en horario laboral es 15:00. "mañana", "el lunes", etc. se calculan desde la fecha actual que se te da. Si no dijeron fecha pero sí hora, es hoy (o mañana si esa hora ya pasó). Sin fecha ni hora: null.
- duracionMin: solo si la dijeron o es evidente; máximo 720.
- prioridad: Alta si dicen urgente, ya, cuanto antes o algo está caído; Baja si dicen sin prisa; si no, Media.
- encargo: "despacho" si piden que la persona reparta el trabajo a su equipo ("que Antonio mande a alguien"); "ejecucion" si la hace ella; null si no está claro.
- titulo: corto y en infinitivo, máximo 120 caracteres ("Visitar a Tox con el cliente"). indicaciones: el detalle útil que dieron, sin inventar.
- razonTipo: una frase corta de por qué elegiste ese tipo.
- No inventes personas, clientes, fechas ni datos que no estén en la instrucción.
- Si la instrucción no pide ninguna actividad o es incomprensible, devuelve acciones vacío y en aclaracion una pregunta breve en español. Si se entiende, aclaracion es null.`;

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

/**
 * Qué tan bien coincide `consulta` con `nombre` (0 = nada, 3 = igual).
 * 2: cada palabra de la consulta es (o empieza) una palabra del nombre («antonio» → «José
 *    Antonio Ramírez», «banor» → «Banorte»).
 * 1: solo algunas palabras coinciden así: se propone, no se elige.
 */
export function puntaje(consulta: string, nombre: string): number {
  const c = normalizar(consulta);
  const n = normalizar(nombre);
  if (!c || !n) return 0;
  if (c === n) return 3;
  const palabrasN = n.split(' ');
  const palabrasC = c.split(' ').filter((w) => w.length >= 2);
  const esInicio = (w: string) => palabrasN.some((p) => p.startsWith(w));
  if (palabrasC.length && palabrasC.every((w) => palabrasN.includes(w) || (w.length >= 3 && esInicio(w)))) return 2;
  if (palabrasC.some((w) => w.length >= 3 && esInicio(w))) return 1;
  return 0;
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
  /** Campos que hay que completar antes de crearla (responsable, cliente, proyecto). */
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

/** Convierte una acción del plan en una propuesta lista para confirmar. */
export function construirPropuesta(
  accion: AccionPlan,
  catalogos: CatalogosNexara,
  contexto: { creadoPorId: number; ahora: Date },
): PropuestaActividad {
  const tipo: TipoActividad = (TIPOS_ACTIVIDAD as readonly string[]).includes(accion.tipo) ? accion.tipo : 'tarea';
  const avisos: string[] = [];
  const faltantes: string[] = [];

  // Persona
  const persona = buscar(accion.responsable, catalogos.personas, (p) => p.nombre);
  const responsable = persona.elegido ? ref(persona.elegido.id, persona.elegido.nombre) : null;
  if (!responsable) {
    faltantes.push('responsable');
    if (accion.responsable && !persona.candidatos.length) {
      avisos.push(`No encontré a «${accion.responsable}» entre las personas que puedes asignar.`);
    }
  }

  // Cliente / sucursal: «Tox» puede ser el cliente o una de sus sucursales.
  const textoCliente = accion.cliente || accion.sitio;
  let cliente: Referencia | null = null;
  let sucursal: SucursalNexara | null = null;
  let clienteCandidatos: Referencia[] = [];
  const porCliente = buscar(accion.cliente, catalogos.clientes, (c) => c.name);
  if (porCliente.elegido) cliente = ref(porCliente.elegido.id, porCliente.elegido.name);
  const sucursalesDelCliente = cliente
    ? catalogos.sucursales.filter((s) => s.clientId === cliente!.id)
    : catalogos.sucursales;
  const porSucursal = buscar(accion.sitio || (cliente ? null : accion.cliente), sucursalesDelCliente, (s) => s.name);
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
    const porNombre = buscar(accion.cliente || accion.sitio || accion.titulo, catalogos.proyectos, (p) => `${p.title} ${p.clientName}`);
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

  // Fechas: el mismo instante en inicio, entrega y máxima, como el formulario web.
  const fechaInicio = aFechaISO(accion.fecha, accion.hora);
  if (fechaInicio && new Date(fechaInicio).getTime() < contexto.ahora.getTime() - 15 * 60_000) {
    avisos.push('La fecha y hora quedaron en el pasado; revísalas.');
  }
  const duracion =
    accion.duracionMin && accion.duracionMin > 0 ? Math.min(TOPE_MINUTOS, Math.round(accion.duracionMin)) : undefined;

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
    titulo: recortar(accion.titulo, 200) || 'Actividad',
    indicaciones: recortar(accion.indicaciones, 4000),
    prioridad: accion.prioridad || 'Media',
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
    assignmentCharge: accion.encargo ?? undefined,
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
  } else if (accion.sitio || (textoCliente && !cliente)) {
    payload.branchName = recortar(accion.sitio || textoCliente, 160);
  }
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

  const partes = [
    ETIQUETA_TIPO[tipo] + (tipo === 'tarea' && ticketTypeCustom && ticketTypeCustom !== 'Otro' ? ` · ${ticketTypeCustom}` : ''),
    `para ${responsable?.nombre ?? accion.responsable ?? '(sin responsable)'}`,
    cliente ? `en ${cliente.nombre}${sucursal ? ` · ${sucursal.name}` : ''}` : textoCliente ? `en ${textoCliente}` : null,
    horaLegible(fechaInicio, contexto.ahora),
  ].filter(Boolean);

  return {
    tipo,
    tipoEtiqueta: ETIQUETA_TIPO[tipo],
    razonTipo: accion.razonTipo || '',
    resumen: partes.join(' '),
    titulo: String(payload.titulo),
    textoResponsable: accion.responsable,
    responsable,
    responsableCandidatos: responsable ? [] : persona.candidatos.map((p) => ref(p.id, p.nombre)),
    textoCliente: textoCliente ?? null,
    cliente,
    clienteCandidatos,
    sucursal: sucursal ? ref(sucursal.id, sucursal.name) : null,
    proyecto,
    proyectoCandidatos,
    fechaInicio,
    faltantes,
    avisos,
    payload,
  };
}
