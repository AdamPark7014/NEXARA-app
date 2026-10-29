/**
 * Tiempo estándar por especificidad (§8 de `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md`, tarifas aprobadas
 * por Adam el 28-10-2026).
 *
 * Estándar = base + cantidad × minutos por unidad (o un total por complejidad, en los tipos sin
 * cantidad) + traslado de ida y vuelta + tiempo en el lugar. Lo calcula esta tabla, nunca la IA:
 * la IA solo propone la cantidad y el destino a partir del título, y quien asigna los confirma.
 *
 * La tabla vive aquí y la web la pide en `GET ai/estandar/tabla`: así solo hay un lugar donde se
 * mueven las tarifas. Puro.
 */
import { claveDeTipo, type Complejidad } from '../complejidad/tiempos-tipicos.js';

export type UnidadEstandar = {
  clave: string;
  /** «partida», «dispositivo», «nodo»… */
  singular: string;
  plural: string;
  /** «¿Cuántas partidas?» */
  pregunta: string;
  porUnidadMin: number;
  /** Unidades que ya cubre la base: se cobran solo las de más (cotización: hasta 10 partidas en 40 min). */
  incluidas?: number;
  /** La unidad ya es un día completo en sitio: no lleva la base del tipo. */
  sinBase?: boolean;
};

export type ReglaEstandar = {
  /** La de `claveDeTipo`: `comercial`, `tarea:Instalación`, `servicio:CORRECTIVO`. */
  clave: string;
  /** «Cotización», «Instalación»… (lo que se lee en el desglose). */
  nombre: string;
  baseMin: number;
  /** Lo que se cuenta; la primera es la de omisión. Vacío = el tipo no tiene cantidad. */
  unidades: UnidadEstandar[];
  /** Total por complejidad, para los tipos sin cantidad. */
  porComplejidad?: Record<Complejidad, number>;
  /** Va a otro lugar: se suma ida y vuelta según la ruta. */
  destino: boolean;
  /** Tiempo en el destino. */
  enLugarMin: number;
  /** Juntas, cursos, guardias: dura lo que dure la agenda; no hay estándar. */
  agenda?: boolean;
};

const u = (
  clave: string,
  singular: string,
  plural: string,
  porUnidadMin: number,
  femenino = false,
  incluidas?: number,
): UnidadEstandar => ({
  clave,
  singular,
  plural,
  pregunta: `¿${femenino ? 'Cuántas' : 'Cuántos'} ${plural}?`,
  porUnidadMin,
  ...(incluidas ? { incluidas } : {}),
});

const POR_COMPLEJIDAD_CORRECTIVO: Record<Complejidad, number> = { BASICA: 60, ESTANDAR: 120, COMPLEJA: 210, CRITICA: 300 };

/**
 * Jornada en obra (Adam, 29-10-2026: «obra se refiere a temas de tubería o cosas con temas de CCTV…
 * infraestructura»): un día completo en sitio, 8 h netas. El 44 % de lo terminado del 21-09 al 29-10
 * eran días así («cableado biblioteca», «instalación de tubería»), no piezas sueltas. La entrega se
 * topa a la salida de quien ejecuta (la cuadrilla, 08:00 + 8 h + comida = 17:00).
 */
export const JORNADA_EN_OBRA_MIN = 8 * 60;
const jornadaEnSitio = (): UnidadEstandar => ({
  ...u('jornadas', 'jornada en sitio', 'jornadas en sitio', JORNADA_EN_OBRA_MIN, true),
  sinBase: true,
});

export const TABLA_ESTANDAR: ReglaEstandar[] = [
  // 40 min + 4 por partida: cumple los dos ejemplos de Adam (5 productos → 1 h, 50 → 4 h). El ajuste de
  // «hasta 10 en 40 min» del 29-10 se revirtió el mismo día porque rompía el de 5 → 1 h.
  { clave: 'comercial', nombre: 'Cotización', baseMin: 40, unidades: [u('partidas', 'partida', 'partidas', 4, true)], destino: false, enLugarMin: 0 },
  {
    clave: 'tarea:Instalación',
    nombre: 'Instalación',
    baseMin: 30,
    unidades: [u('dispositivos', 'dispositivo', 'dispositivos', 45), jornadaEnSitio()],
    destino: false,
    enLugarMin: 0,
  },
  {
    clave: 'tarea:Cableado y canalización',
    nombre: 'Cableado y canalización',
    baseMin: 0,
    unidades: [u('nodos', 'nodo', 'nodos', 45), u('metros', 'metro de tubería', 'metros de tubería', 4), jornadaEnSitio()],
    destino: false,
    enLugarMin: 0,
  },
  { clave: 'tarea:Mantenimiento preventivo', nombre: 'Mantenimiento preventivo', baseMin: 20, unidades: [u('equipos', 'equipo', 'equipos', 15)], destino: false, enLugarMin: 0 },
  { clave: 'tarea:Correctivo y diagnóstico', nombre: 'Correctivo y diagnóstico', baseMin: 0, unidades: [], porComplejidad: POR_COMPLEJIDAD_CORRECTIVO, destino: false, enLugarMin: 0 },
  { clave: 'tarea:Recolección', nombre: 'Recolección', baseMin: 0, unidades: [], destino: true, enLugarMin: 15 },
  { clave: 'tarea:Entrega', nombre: 'Entrega', baseMin: 0, unidades: [], destino: true, enLugarMin: 15 },
  { clave: 'tarea:Compra de material', nombre: 'Compra de material', baseMin: 0, unidades: [], destino: true, enLugarMin: 15 },
  { clave: 'tarea:Trámite', nombre: 'Trámite', baseMin: 0, unidades: [], destino: true, enLugarMin: 30 },
  {
    clave: 'tarea:Preparación de equipo',
    nombre: 'Preparación de equipo',
    baseMin: 0,
    unidades: [],
    // Cargar herramienta: 15 min. Armar equipo (lo complejo): 45 min.
    porComplejidad: { BASICA: 15, ESTANDAR: 15, COMPLEJA: 45, CRITICA: 45 },
    destino: false,
    enLugarMin: 0,
  },
  { clave: 'tarea:Reporte / documentación', nombre: 'Reporte / documentación', baseMin: 0, unidades: [u('reportes', 'reporte', 'reportes', 20)], destino: false, enLugarMin: 0 },
  { clave: 'tarea:Diseño, CAD y memoria técnica', nombre: 'Diseño, CAD y memoria técnica', baseMin: 0, unidades: [u('niveles', 'nivel o plano', 'niveles o planos', 120)], destino: false, enLugarMin: 0 },
  { clave: 'tarea:Configuración y soporte remoto', nombre: 'Configuración y soporte remoto', baseMin: 15, unidades: [u('equipos', 'equipo', 'equipos', 10)], destino: false, enLugarMin: 0 },
  { clave: 'tarea:Facturación y contabilidad', nombre: 'Facturación y contabilidad', baseMin: 0, unidades: [u('facturas', 'factura', 'facturas', 10, true)], destino: false, enLugarMin: 0 },
  { clave: 'tarea:Levantamiento', nombre: 'Levantamiento', baseMin: 0, unidades: [u('areas', 'área', 'áreas', 30, true)], destino: true, enLugarMin: 0 },
  { clave: 'tarea:Junta', nombre: 'Junta', baseMin: 0, unidades: [], destino: false, enLugarMin: 0, agenda: true },
  { clave: 'tarea:Capacitación', nombre: 'Capacitación', baseMin: 0, unidades: [], destino: false, enLugarMin: 0, agenda: true },
  { clave: 'tarea:Evento o guardia', nombre: 'Evento o guardia', baseMin: 0, unidades: [], destino: false, enLugarMin: 0, agenda: true },
  { clave: 'servicio:PREVENTIVO', nombre: 'Servicio preventivo', baseMin: 20, unidades: [u('equipos', 'equipo', 'equipos', 15)], destino: true, enLugarMin: 0 },
  { clave: 'servicio:CORRECTIVO', nombre: 'Servicio correctivo', baseMin: 0, unidades: [], porComplejidad: POR_COMPLEJIDAD_CORRECTIVO, destino: true, enLugarMin: 0 },
  { clave: 'servicio:EMERGENCIA', nombre: 'Servicio de emergencia', baseMin: 0, unidades: [], porComplejidad: POR_COMPLEJIDAD_CORRECTIVO, destino: true, enLugarMin: 0 },
  { clave: 'servicio:INSTALACION', nombre: 'Servicio de instalación', baseMin: 30, unidades: [u('dispositivos', 'dispositivo', 'dispositivos', 45)], destino: true, enLugarMin: 0 },
  // Obra (infraestructura en sitio ligada a proyecto: tubería, cableado, CCTV; Adam 29-10: «que las
  // obras tengan una parametrización de resultados»): las mismas tarifas de instalación y de
  // cableado, según lo que se cuente ese día, o la jornada en sitio. Sin traslado: la cuadrilla va al
  // sitio del proyecto en su jornada.
  {
    clave: 'obra',
    nombre: 'Obra',
    baseMin: 30,
    unidades: [
      u('dispositivos', 'dispositivo', 'dispositivos', 45),
      u('nodos', 'nodo', 'nodos', 45),
      u('metros', 'metro de tubería', 'metros de tubería', 4),
      jornadaEnSitio(),
    ],
    destino: false,
    enLugarMin: 0,
  },
];

const POR_CLAVE = new Map(TABLA_ESTANDAR.map((r) => [r.clave, r]));

export function reglaDe(a: { coreKind?: string | null; ticketType?: string | null; ticketTypeCustom?: string | null }): ReglaEstandar | null {
  const clave = claveDeTipo(a);
  return clave ? (POR_CLAVE.get(clave) ?? null) : null;
}

/** Ninguna actividad dura más de 12 h; si lleva más, va con periodo de varios días. */
export const TOPE_ESTANDAR_MIN = 720;

export type Traslado = { idaMin: number; vueltaMin: number };
export type Desglose = Array<{ concepto: string; minutos: number }>;
export type ResultadoEstandar = {
  totalMin: number | null;
  desglose: Desglose;
  /** Lo que falta para calcularlo: `cantidad`, `destino` o `complejidad`. */
  faltan: Array<'cantidad' | 'destino' | 'complejidad'>;
  /** Pasó de 12 h: se topa y conviene un periodo de varios días. */
  topado: boolean;
};

export function calcularEstandar(
  regla: ReglaEstandar,
  datos: { cantidad?: number | null; unidad?: string | null; complejidad?: Complejidad | null; traslado?: Traslado | null },
): ResultadoEstandar {
  const desglose: Desglose = [];
  const faltan: ResultadoEstandar['faltan'] = [];
  if (regla.agenda) return { totalMin: null, desglose, faltan, topado: false };
  if (regla.unidades.length) {
    const unidad = regla.unidades.find((x) => x.clave === datos.unidad) ?? regla.unidades[0];
    const n = Math.max(0, Math.round(Number(datos.cantidad) || 0));
    const incluidas = Math.max(0, unidad.incluidas ?? 0);
    if (regla.baseMin && !unidad.sinBase) {
      const hasta = incluidas ? ` (hasta ${incluidas} ${unidad.plural})` : '';
      desglose.push({ concepto: `Base de ${regla.nombre.toLowerCase()}${hasta}`, minutos: regla.baseMin });
    }
    // Lo que la base ya cubre no se cobra otra vez: solo las unidades de más.
    const extra = n - incluidas;
    if (n > 0 && extra > 0) {
      desglose.push({
        concepto: `${extra} ${extra === 1 ? unidad.singular : unidad.plural}${incluidas ? ' más' : ''} × ${unidad.porUnidadMin} min`,
        minutos: extra * unidad.porUnidadMin,
      });
    }
    if (n <= 0) faltan.push('cantidad');
  } else if (regla.porComplejidad) {
    if (datos.complejidad) desglose.push({ concepto: `${regla.nombre} · complejidad`, minutos: regla.porComplejidad[datos.complejidad] });
    else faltan.push('complejidad');
  } else if (regla.baseMin) {
    desglose.push({ concepto: regla.nombre, minutos: regla.baseMin });
  }
  if (regla.destino) {
    if (datos.traslado) {
      desglose.push({ concepto: 'Ida', minutos: Math.max(0, Math.round(datos.traslado.idaMin)) });
      desglose.push({ concepto: 'Vuelta', minutos: Math.max(0, Math.round(datos.traslado.vueltaMin)) });
    } else {
      faltan.push('destino');
    }
    if (regla.enLugarMin) desglose.push({ concepto: 'En el lugar', minutos: regla.enLugarMin });
  }
  if (faltan.length) return { totalMin: null, desglose, faltan, topado: false };
  const suma = desglose.reduce((s, d) => s + d.minutos, 0);
  // Redondeado a 5 min, como la rueda del formulario.
  const redondeado = Math.max(5, Math.round(suma / 5) * 5);
  return { totalMin: Math.min(TOPE_ESTANDAR_MIN, redondeado), desglose, faltan, topado: redondeado > TOPE_ESTANDAR_MIN };
}
