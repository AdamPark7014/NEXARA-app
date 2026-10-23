/**
 * Casos del eval de «Asignar con IA». Fecha y hora fijas: `AHORA` (miércoles 21-10-2026,
 * 10:30 en CDMX). Responsables, clientes, sucursales y proyectos son los ids de `catalogo.ts`.
 *
 * Cada campo que se indica se revisa sin juez (código); `undefined` = no se revisa. Las
 * listas son los valores aceptables (p. ej. prioridad Media o Alta).
 *
 * La agenda se revisa en lo que de verdad se guarda (el cuerpo de `POST /activities`):
 * `inicio` es el día de `fechaInicio` y `limite` el día contra el que se mide si llegó a
 * tiempo (`periodoFin`, o el de `fechaMaxima`). «Para el viernes» es plazo: empieza hoy y
 * vence el viernes; «el viernes a las 11» es una cita ese día.
 */
import type { TipoActividad } from '../asistente/asistente-actividades.js';

export type AccionEsperada = {
  /** Id esperado; null = no debe resolverse a nadie (ambiguo o no existe). */
  responsableId: number | null;
  /** Si `responsableId` es null: texto que debe conservar («Antonio», «Pedro»). */
  textoResponsable?: string;
  tipos: TipoActividad[];
  subtipo?: string[];
  tipoServicio?: string[];
  clienteId?: Array<number | null>;
  sucursalId?: Array<number | null>;
  proyectoId?: Array<number | null>;
  /** Día de inicio guardado (AAAA-MM-DD en CDMX); null = sin fecha. */
  inicio?: Array<string | null>;
  /** Día límite guardado (fin del periodo o día de la fecha máxima); null = sin fecha. */
  limite?: Array<string | null>;
  /** HH:MM de inicio que entendió la IA (null = no la dijeron). */
  hora?: Array<string | null>;
  /** HH:MM límite que entendió la IA («a más tardar a las 6»). */
  horaLimite?: Array<string | null>;
  prioridad?: Array<'Alta' | 'Media' | 'Baja'>;
  encargo?: Array<'ejecucion' | 'despacho' | null>;
  duracionMin?: Array<number | null>;
  /** Faltantes que la tarjeta debe marcar (lo que no se dijo y el alta necesita). */
  faltan?: string[];
  /** Detalle que no se debe perder: tiene que quedar en el título o en las indicaciones. */
  detalleCon?: string[];
  /** true = no dieron más detalle que el título: indicaciones vacías, no un eco del título. */
  sinIndicaciones?: boolean;
  /** Texto que debe quedar en el lugar (`branchName`) cuando no es una sucursal registrada. */
  lugarCon?: string;
};

export type CasoAsistente = {
  id: string;
  instruccion: string;
  acciones: AccionEsperada[];
  /** true = no hay actividad: acciones vacías y una pregunta en `aclaracion`. */
  aclaracion?: boolean;
  /** Lo que el juez debe vigilar en especial. */
  nota?: string;
};

const HOY = '2026-10-21';

export const CASOS_ASISTENTE: CasoAsistente[] = [
  {
    id: 'a01',
    instruccion: 'Que Luis vaya mañana a las 9 a Bodegas Luna Angelópolis, el DVR de la caja no está grabando.',
    acciones: [
      {
        responsableId: 3,
        tipos: ['servicio'],
        tipoServicio: ['CORRECTIVO'],
        clienteId: [103],
        sucursalId: [204],
        inicio: ['2026-10-22'],
        limite: ['2026-10-22'],
        hora: ['09:00'],
        prioridad: ['Media', 'Alta'],
        detalleCon: ['dvr', 'caja', 'grab'],
      },
    ],
  },
  {
    id: 'a02',
    instruccion:
      'Que Luis haga el lunes a las 10 el mantenimiento preventivo de cámaras en el Hospital San Rafael, en la Torre Médica, y que Jorge compre hoy 20 conectores RJ45 y una bobina de cable UTP.',
    acciones: [
      {
        responsableId: 3,
        tipos: ['servicio'],
        tipoServicio: ['PREVENTIVO'],
        clienteId: [102],
        sucursalId: [203],
        inicio: ['2026-10-26'],
        hora: ['10:00'],
        prioridad: ['Media'],
      },
      {
        responsableId: 7,
        tipos: ['tarea'],
        subtipo: ['Compra de material'],
        clienteId: [null],
        inicio: [HOY],
        limite: [HOY],
        prioridad: ['Media', 'Alta'],
        detalleCon: ['20', 'rj45', 'bobina', 'utp'],
      },
    ],
    nota: 'Las cantidades (20 conectores RJ45, una bobina de cable UTP) deben quedar en las indicaciones.',
  },
  {
    id: 'a03',
    instruccion: 'Urgente: se cayó todo el sistema de cámaras en el CEDIS de Tox, que Beto vaya ya.',
    acciones: [
      {
        responsableId: 11,
        tipos: ['servicio'],
        tipoServicio: ['EMERGENCIA'],
        clienteId: [101],
        sucursalId: [201],
        inicio: [HOY],
        limite: [HOY],
        prioridad: ['Alta'],
      },
    ],
    nota: '«Beto» es Roberto Castillo Núñez (único Roberto de la lista).',
  },
  {
    id: 'a04',
    instruccion:
      'Que Ricardo mande a alguien de su equipo a cablear la nave 2 de Tox para el proyecto del CEDIS, empezando el jueves 29.',
    acciones: [
      {
        responsableId: 5,
        tipos: ['obra'],
        encargo: ['despacho'],
        clienteId: [101],
        proyectoId: [301],
        sucursalId: [202, null],
        inicio: ['2026-10-29'],
      },
    ],
    nota: '«Empezando el jueves 29» es el inicio, no un plazo.',
  },
  {
    id: 'a05',
    instruccion: 'María Fernanda, mándale la cotización de control de acceso al Colegio Andes antes del viernes.',
    acciones: [
      {
        responsableId: 4,
        tipos: ['comercial'],
        clienteId: [104],
        inicio: [HOY],
        limite: ['2026-10-22', '2026-10-23'],
        prioridad: ['Media'],
      },
    ],
    nota: '«Antes del viernes» es un plazo: empieza hoy y vence el jueves o el viernes.',
  },
  {
    id: 'a06',
    instruccion: 'Diana y Luis vayan el jueves a las 4 a hacer un levantamiento en Plaza Solei para cotizar cámaras.',
    acciones: [
      { responsableId: 6, tipos: ['tarea'], subtipo: ['Levantamiento'], clienteId: [null], inicio: ['2026-10-22'], hora: ['16:00'], lugarCon: 'solei' },
      { responsableId: 3, tipos: ['tarea'], subtipo: ['Levantamiento'], clienteId: [null], inicio: ['2026-10-22'], hora: ['16:00'], lugarCon: 'solei' },
    ],
    nota: 'Plaza Solei no es cliente registrado: queda como lugar, sin inventar cliente. Una actividad por persona.',
  },
  {
    id: 'a07',
    instruccion: 'Que Antonio revise mañana el control de acceso del Colegio Andes, la puerta principal no abre.',
    acciones: [
      {
        responsableId: null,
        textoResponsable: 'Antonio',
        tipos: ['servicio'],
        tipoServicio: ['CORRECTIVO', 'EMERGENCIA'],
        clienteId: [104],
        inicio: ['2026-10-22'],
        prioridad: ['Media', 'Alta'],
        detalleCon: ['puerta principal'],
      },
    ],
    nota: 'Hay dos Antonio en la lista (José Antonio Ramírez Ortega y Antonio Vázquez Luna): no debe elegir a uno.',
  },
  {
    id: 'a08',
    instruccion: '¿Cómo vamos con las ventas de este mes?',
    acciones: [],
    aclaracion: true,
    nota: 'No pide ninguna actividad: acciones vacías y una pregunta breve.',
  },
  {
    id: 'a09',
    instruccion:
      'este... que la inge Diana eh prepare los planos de la red del hotel real de cholula para la puesta en marcha, sin prisa, para la otra semana',
    acciones: [
      {
        responsableId: 6,
        tipos: ['proyecto'],
        clienteId: [105],
        proyectoId: [303],
        prioridad: ['Baja'],
        inicio: [null, HOY, '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
        limite: [null, '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
      },
    ],
  },
  {
    id: 'a10',
    instruccion: 'Agenda una junta con Bodegas Luna mañana a las 12 para revisar el contrato de mantenimiento, va Carolina.',
    acciones: [
      {
        responsableId: 2,
        tipos: ['tarea'],
        subtipo: ['Junta'],
        clienteId: [103],
        inicio: ['2026-10-22'],
        limite: ['2026-10-22'],
        hora: ['12:00'],
        detalleCon: ['contrato'],
      },
    ],
  },
  {
    id: 'a11',
    instruccion:
      'Que Beto vaya a las 8 a la Torre Médica del San Rafael a instalar dos cámaras nuevas en el estacionamiento, le lleva como 3 horas.',
    acciones: [
      {
        responsableId: 11,
        tipos: ['servicio'],
        tipoServicio: ['INSTALACION'],
        clienteId: [102],
        sucursalId: [203],
        inicio: ['2026-10-22'],
        hora: ['08:00'],
        duracionMin: [180],
        detalleCon: ['dos camaras', 'estacionamiento'],
      },
    ],
    nota: 'Son las 10:30: «a las 8» ya pasó hoy, así que es mañana.',
  },
  {
    id: 'a12',
    instruccion:
      'Para el viernes: Alejandra que tramite la fianza del contrato de Tox, Jorge que entregue los 3 NVR en Bodegas Luna Atlixco, y Luis que capacite a las 11 al personal de seguridad del Colegio Andes en el uso del control de acceso.',
    acciones: [
      { responsableId: 8, tipos: ['tarea'], subtipo: ['Trámite'], clienteId: [101, null], inicio: [HOY], limite: ['2026-10-23'] },
      {
        responsableId: 7,
        tipos: ['tarea'],
        subtipo: ['Entrega'],
        clienteId: [103],
        sucursalId: [205],
        inicio: [HOY],
        limite: ['2026-10-23'],
        detalleCon: ['3', 'nvr'],
      },
      { responsableId: 3, tipos: ['tarea', 'servicio'], clienteId: [104], inicio: ['2026-10-23'], hora: ['11:00'], limite: ['2026-10-23'] },
    ],
    nota: '«Para el viernes» es plazo para la fianza y la entrega (empiezan hoy); la capacitación es una cita el viernes a las 11.',
  },
  {
    id: 'a13',
    instruccion: 'Que Pedro de sistemas cambie mañana el disco duro del NVR de Bodegas Luna Angelópolis.',
    acciones: [
      {
        responsableId: null,
        textoResponsable: 'Pedro',
        tipos: ['servicio'],
        tipoServicio: ['CORRECTIVO', 'PREVENTIVO'],
        clienteId: [103],
        sucursalId: [204],
        inicio: ['2026-10-22'],
      },
    ],
    nota: 'No hay ningún Pedro en la lista: no debe asignarlo a otra persona.',
  },
  {
    id: 'a14',
    instruccion: 'Luis tiene que ir a revisar la alarma de Bodegas Luna Atlixco, suena sola en las noches.',
    acciones: [
      {
        responsableId: 3,
        tipos: ['servicio'],
        tipoServicio: ['CORRECTIVO'],
        clienteId: [103],
        sucursalId: [205],
        inicio: [null],
        limite: [null],
        hora: [null],
        faltan: ['fecha', 'duración'],
        detalleCon: ['noche'],
      },
    ],
    nota: 'No dieron fecha, hora ni duración: deben quedar vacías y marcadas como faltantes.',
  },
  {
    id: 'a15',
    instruccion:
      'El lunes 2 de noviembre es día feriado, así que el preventivo mensual de Tox pásalo al martes 3 a las 9; lo hace José Antonio.',
    acciones: [
      {
        responsableId: 1,
        tipos: ['servicio'],
        tipoServicio: ['PREVENTIVO'],
        clienteId: [101],
        inicio: ['2026-11-03'],
        hora: ['09:00'],
      },
    ],
  },
  // ── Desde aquí: lo que se arregló el 23-10-2026 (plazos, duración, faltantes, indicaciones). ──
  {
    id: 'a16',
    instruccion:
      'asígnale a Carolina una actividad del Colegio Andes para las 3, tiene que ir a poner 12 pantallas por favor, debe durar una hora y media',
    acciones: [
      {
        responsableId: 2,
        tipos: ['servicio', 'tarea'],
        clienteId: [104],
        inicio: [HOY],
        limite: [HOY],
        hora: ['15:00'],
        duracionMin: [90],
        detalleCon: ['12 pantallas'],
      },
    ],
    nota: 'Dictado real de dirección (con otro cliente). «Para las 3» es la hora de la cita (hoy 15:00), no un plazo.',
  },
  {
    id: 'a17',
    instruccion: 'que María Fernanda haga la cotización de Hotel Real',
    acciones: [
      {
        responsableId: 4,
        tipos: ['comercial'],
        clienteId: [105],
        inicio: [null],
        limite: [null],
        duracionMin: [null],
        faltan: ['fecha', 'duración'],
        sinIndicaciones: true,
      },
    ],
    nota: 'No dieron fecha ni duración: quedan vacías y como faltantes. Las indicaciones no deben repetir el título.',
  },
  {
    id: 'a18',
    instruccion:
      'Que Diana tenga listo el reporte de pruebas de la puesta en marcha del Hotel Real a más tardar el martes 27; que empiece mañana, le lleva unas 6 horas.',
    acciones: [
      {
        responsableId: 6,
        tipos: ['proyecto'],
        clienteId: [105],
        proyectoId: [303],
        inicio: ['2026-10-22'],
        limite: ['2026-10-27'],
        duracionMin: [360],
      },
    ],
    nota: 'Empieza mañana y tiene hasta el martes 27: periodo de varios días.',
  },
  {
    id: 'a19',
    instruccion:
      'Del lunes 26 al miércoles 28, que Ricardo mande a su gente a cablear la nave 2 de Tox para el proyecto del CEDIS; son jornadas de 8 horas.',
    acciones: [
      {
        responsableId: 5,
        tipos: ['obra'],
        encargo: ['despacho'],
        clienteId: [101],
        proyectoId: [301],
        sucursalId: [202, null],
        inicio: ['2026-10-26'],
        limite: ['2026-10-28'],
        duracionMin: [480],
      },
    ],
  },
  {
    id: 'a20',
    instruccion: 'Jorge, para hoy recoge el pedido de material en Syscom.',
    acciones: [
      {
        responsableId: 7,
        tipos: ['tarea'],
        subtipo: ['Recolección'],
        clienteId: [null],
        inicio: [HOY],
        limite: [HOY],
        lugarCon: 'syscom',
      },
    ],
    nota: 'Syscom es un proveedor, no un cliente: queda como lugar, sin cliente.',
  },
  {
    id: 'a21',
    instruccion:
      'eh que Paty... no, perdón, que Carolina mañana a primera hora le llame a Bodegas Luna para confirmar la visita del jueves, es rápido, unos 15 minutos',
    acciones: [
      {
        responsableId: 2,
        tipos: ['tarea', 'comercial'],
        clienteId: [103],
        inicio: ['2026-10-22'],
        hora: [null, '09:00', '10:00'],
        duracionMin: [15],
        detalleCon: ['confirmar', 'visita'],
      },
    ],
    nota: 'Se corrigió al dictar: es Carolina, no Patricia. «A primera hora» puede quedar sin hora o a las 9-10.',
  },
  {
    id: 'a22',
    instruccion:
      'Urgente: Luis tiene que mandarle hoy a Bodegas Luna el reporte de la falla del DVR de Angelópolis, a más tardar a las 6 de la tarde.',
    acciones: [
      {
        responsableId: 3,
        tipos: ['tarea'],
        subtipo: ['Reporte / documentación', 'Entrega'],
        clienteId: [103],
        prioridad: ['Alta'],
        inicio: [HOY],
        limite: [HOY],
        horaLimite: ['18:00'],
        detalleCon: ['18:00'],
      },
    ],
    nota: 'Plazo hoy a las 18:00: la hora límite debe quedar escrita en las indicaciones («Entregar a más tardar…»).',
  },
  {
    id: 'a23',
    instruccion:
      'Para el lunes que Alejandra tenga lista la factura de Grupo Tox, y que Paty le dé seguimiento por teléfono el martes a las 10, como media hora.',
    acciones: [
      {
        responsableId: 8,
        tipos: ['tarea'],
        clienteId: [101],
        inicio: [HOY],
        limite: ['2026-10-26'],
      },
      {
        responsableId: 10,
        tipos: ['tarea', 'comercial'],
        clienteId: [101],
        inicio: ['2026-10-27'],
        limite: ['2026-10-27'],
        hora: ['10:00'],
        duracionMin: [30],
      },
    ],
    nota: 'Alejandra tiene plazo hasta el lunes; el seguimiento de Patricia es el martes a las 10 por media hora.',
  },
];
