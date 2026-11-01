/**
 * Casos del eval de «a qué proyecto va esta actividad» (bandeja de Costos). Solo lo que las reglas no
 * resuelven llega a la IA, así que los casos son los dudosos. Lo peor que puede hacer es cargarle el
 * costo al proyecto equivocado: por eso los casos sin señal esperan NINGUNA. Empresa y clientes
 * inventados: el repo es público.
 */
import type { ActividadSuelta, Candidato } from '../../costos/calculos/sugerir-liga.js';

export const CANDIDATOS_LIGA: Candidato[] = [
  { tipo: 'PROYECTO', id: 1, nombre: 'CCTV Bodega Norte', cliente: 'Bodegas Luna' },
  { tipo: 'PROYECTO', id: 2, nombre: 'Red de datos Plaza Sur', cliente: 'Hospital San Rafael' },
  { tipo: 'PROYECTO', id: 3, nombre: 'Control de acceso torre A', cliente: 'Colegio Andes' },
  { tipo: 'PROYECTO', id: 4, nombre: 'Control de acceso torre B', cliente: 'Colegio Andes' },
  { tipo: 'COTIZACION', id: 42, nombre: 'NEX-0042 · Videovigilancia sucursales', cliente: 'Grupo Tox' },
  { tipo: 'COTIZACION', id: 43, nombre: 'NEX-0043 · Enlace de fibra', cliente: 'Transportes Coatzacoalcos' },
  { tipo: 'COTIZACION', id: 44, nombre: 'NEX-0044 · Cámaras en estacionamiento', cliente: 'Hotel Real de Cholula' },
];

export type RespuestaEsperada = { tipo: 'PROYECTO' | 'COTIZACION'; id: number } | 'INTERNA' | 'NINGUNA';

export type CasoLiga = {
  id: string;
  actividad: ActividadSuelta;
  /** Respuestas aceptables. */
  aceptables: RespuestaEsperada[];
};

const proyecto = (id: number): RespuestaEsperada => ({ tipo: 'PROYECTO', id });
const cotizacion = (id: number): RespuestaEsperada => ({ tipo: 'COTIZACION', id });

export const CASOS_LIGA: CasoLiga[] = [
  // Apunta a un trabajo por apodo, sucursal o abreviatura: lo que una regla de palabras no ve.
  { id: 'l01', aceptables: [proyecto(2)], actividad: { titulo: 'Peinar el rack de plaza sur', coreKind: 'tarea' } },
  { id: 'l02', aceptables: [proyecto(1)], actividad: { titulo: 'Acomodar NVR en la bodega norte de Luna', coreKind: 'tarea' } },
  { id: 'l03', aceptables: [cotizacion(44)], actividad: { titulo: 'Medir el estacionamiento del hotel en Cholula para las cámaras', coreKind: 'tarea' } },
  { id: 'l04', aceptables: [cotizacion(42)], actividad: { titulo: 'Levantamiento en sucursal Toks Angelópolis para videovigilancia', coreKind: 'tarea' } },
  { id: 'l05', aceptables: [cotizacion(43)], actividad: { titulo: 'Fusionar fibra en patio de transportes', coreKind: 'tarea', lugar: 'Coatzacoalcos' } },
  { id: 'l06', aceptables: [proyecto(2)], actividad: { titulo: 'Certificar nodos del San Rafael', coreKind: 'servicio' } },
  { id: 'l07', aceptables: [proyecto(3)], actividad: { titulo: 'Programar lectoras de la torre A', coreKind: 'tarea', lugar: 'Colegio Andes' } },
  { id: 'l08', aceptables: [proyecto(4)], actividad: { titulo: 'Colocar torniquete en torre B', coreKind: 'tarea', lugar: 'Colegio' } },

  // Dos del mismo cliente sin nada que los distinga: no debe adivinar.
  { id: 'l09', aceptables: ['NINGUNA'], actividad: { titulo: 'Revisar lectoras del colegio', coreKind: 'tarea', lugar: 'Colegio Andes' } },

  // Trabajo de la empresa, escrito de formas que la regla no alcanza.
  { id: 'l10', aceptables: ['INTERNA'], actividad: { titulo: 'Llevar la camioneta a verificación', coreKind: 'tarea' } },
  { id: 'l11', aceptables: ['INTERNA'], actividad: { titulo: 'Comprar garrafones y papel para la oficina', coreKind: 'tarea' } },
  { id: 'l12', aceptables: ['INTERNA'], actividad: { titulo: 'Preparar el kit de herramienta de los nuevos', coreKind: 'tarea' } },
  { id: 'l13', aceptables: ['INTERNA'], actividad: { titulo: 'Conciliar estados de cuenta del mes', coreKind: 'comercial' } },
  { id: 'l14', aceptables: ['INTERNA'], actividad: { titulo: 'Subir fotos a redes sociales de la empresa', coreKind: 'tarea' } },

  // Sin señal: el costo no se le carga a nadie hasta que una persona decida.
  { id: 'l15', aceptables: ['NINGUNA'], actividad: { titulo: 'Ver pendiente con Luis', coreKind: 'tarea' } },
  { id: 'l16', aceptables: ['NINGUNA'], actividad: { titulo: 'Apoyo en sitio', coreKind: 'tarea' } },
  { id: 'l17', aceptables: ['NINGUNA'], actividad: { titulo: 'Revisar cámaras', coreKind: 'tarea' } },

  // Un cliente que no está entre los candidatos no es interno ni es otro proyecto.
  { id: 'l18', aceptables: ['NINGUNA'], actividad: { titulo: 'Instalar 4 cámaras en Farmacia del Ahorro Zavaleta', coreKind: 'tarea' } },
  { id: 'l19', aceptables: ['NINGUNA'], actividad: { titulo: 'Soporte remoto al NVR de Super Kwik', coreKind: 'servicio' } },
  { id: 'l20', aceptables: ['NINGUNA'], actividad: { titulo: 'Mantenimiento preventivo CCTV planta Volkswagen', coreKind: 'servicio', lugar: 'Puebla' } },

  // Parecen de un proyecto por una palabra suelta, pero no lo son.
  { id: 'l21', aceptables: ['NINGUNA'], actividad: { titulo: 'Reparar cámara de la bodega de Coca-Cola', coreKind: 'servicio' } },
  { id: 'l22', aceptables: ['NINGUNA', 'INTERNA'], actividad: { titulo: 'Recoger material en bodega de proveedor', coreKind: 'tarea' } },
  { id: 'l23', aceptables: ['NINGUNA'], actividad: { titulo: 'Cableado en plaza comercial Angelópolis', coreKind: 'tarea' } },
  { id: 'l24', aceptables: ['NINGUNA'], actividad: { titulo: 'Junta con cliente nuevo por control de acceso', coreKind: 'comercial' } },
];
