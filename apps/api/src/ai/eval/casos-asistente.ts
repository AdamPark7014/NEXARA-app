/**
 * Casos del eval de «Asignar con IA». Fecha y hora fijas: `AHORA` (miércoles 21-10-2026,
 * 10:30 en CDMX). Responsables, clientes, sucursales y proyectos son los ids de `catalogo.ts`.
 *
 * Cada campo que se indica se revisa sin juez (código); `undefined` = no se revisa. Las
 * listas son los valores aceptables (p. ej. prioridad Media o Alta).
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
  /** AAAA-MM-DD en CDMX; null = sin fecha. */
  fecha?: Array<string | null>;
  /** HH:MM en CDMX. */
  hora?: Array<string | null>;
  prioridad?: Array<'Alta' | 'Media' | 'Baja'>;
  encargo?: Array<'ejecucion' | 'despacho' | null>;
  duracionMin?: Array<number | null>;
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
        fecha: ['2026-10-22'],
        hora: ['09:00'],
        prioridad: ['Media', 'Alta'],
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
        fecha: ['2026-10-26'],
        hora: ['10:00'],
        prioridad: ['Media'],
      },
      {
        responsableId: 7,
        tipos: ['tarea'],
        subtipo: ['Compra de material'],
        clienteId: [null],
        fecha: ['2026-10-21'],
        prioridad: ['Media', 'Alta'],
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
        fecha: ['2026-10-21'],
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
        fecha: ['2026-10-29'],
      },
    ],
  },
  {
    id: 'a05',
    instruccion: 'María Fernanda, mándale la cotización de control de acceso al Colegio Andes antes del viernes.',
    acciones: [
      {
        responsableId: 4,
        tipos: ['comercial'],
        clienteId: [104],
        fecha: ['2026-10-22', '2026-10-23'],
        prioridad: ['Media'],
      },
    ],
  },
  {
    id: 'a06',
    instruccion: 'Diana y Luis vayan el jueves a las 4 a hacer un levantamiento en Plaza Solei para cotizar cámaras.',
    acciones: [
      { responsableId: 6, tipos: ['tarea'], subtipo: ['Levantamiento'], clienteId: [null], fecha: ['2026-10-22'], hora: ['16:00'] },
      { responsableId: 3, tipos: ['tarea'], subtipo: ['Levantamiento'], clienteId: [null], fecha: ['2026-10-22'], hora: ['16:00'] },
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
        fecha: ['2026-10-22'],
        prioridad: ['Media', 'Alta'],
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
        fecha: [null, '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
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
        fecha: ['2026-10-22'],
        hora: ['12:00'],
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
        fecha: ['2026-10-22'],
        hora: ['08:00'],
        duracionMin: [180],
      },
    ],
    nota: 'Son las 10:30: «a las 8» ya pasó hoy, así que es mañana.',
  },
  {
    id: 'a12',
    instruccion:
      'Para el viernes: Alejandra que tramite la fianza del contrato de Tox, Jorge que entregue los 3 NVR en Bodegas Luna Atlixco, y Luis que capacite a las 11 al personal de seguridad del Colegio Andes en el uso del control de acceso.',
    acciones: [
      { responsableId: 8, tipos: ['tarea'], subtipo: ['Trámite'], clienteId: [101, null], fecha: ['2026-10-23'] },
      { responsableId: 7, tipos: ['tarea'], subtipo: ['Entrega'], clienteId: [103], sucursalId: [205], fecha: ['2026-10-23'] },
      { responsableId: 3, tipos: ['tarea', 'servicio'], clienteId: [104], fecha: ['2026-10-23'], hora: ['11:00'] },
    ],
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
        fecha: ['2026-10-22'],
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
        fecha: [null],
        hora: [null],
      },
    ],
    nota: 'No dieron fecha ni hora: deben quedar vacías.',
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
        fecha: ['2026-11-03'],
        hora: ['09:00'],
      },
    ],
  },
];
