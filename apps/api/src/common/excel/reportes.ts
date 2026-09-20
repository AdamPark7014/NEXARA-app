import type { ColumnaReporte } from './reporte-excel.js';
import {
  ETIQUETA_ALERTA,
  ETIQUETA_APROBACION,
  ETIQUETA_CATEGORIA_VIATICO,
  ETIQUETA_CLASE_ACTIVIDAD,
  ETIQUETA_ENCARGO,
  ETIQUETA_ESTADO_COTIZACION,
  ETIQUETA_ESTADO_ERP,
  ETIQUETA_ESTATUS_ACTIVIDAD,
  ETIQUETA_ESTATUS_ACTIVIDAD_CRM,
  ETIQUETA_ESTATUS_FACTURA,
  ETIQUETA_ESTATUS_KB,
  ETIQUETA_ESTATUS_LEAD,
  ETIQUETA_ESTATUS_LICITACION,
  ETIQUETA_ESTATUS_PROYECTO,
  ETIQUETA_ESTATUS_VIATICO,
  ETIQUETA_ETAPA_OPORTUNIDAD,
  ETIQUETA_ORIGEN_VIATICO,
  ETIQUETA_PRIORIDAD,
  ETIQUETA_SEGMENTO_COTIZACION,
  ETIQUETA_TIPO_ACTIVIDAD_CRM,
  ETIQUETA_TIPO_FACTURA,
  ETIQUETA_TIPO_LICITACION,
  ETIQUETA_TIPO_PROYECTO,
  ETIQUETA_TIPO_TICKET,
  ETIQUETA_VINCULO,
  ETIQUETA_VISIBILIDAD_KB,
  listaEtiquetada,
} from './etiquetas.js';

/**
 * Qué columnas lleva cada reporte del sistema, en español y en el orden en que se leen.
 *
 * Antes cada endpoint pasaba el objeto de Prisma tal cual a `exportToExcel`, así que el
 * archivo salía con los encabezados en camelCase, con el `id` de base de datos de primera
 * columna y —lo grave— con **todo** lo que trae la relación: `passwordHash`, `mfaSecret` y
 * `portalPasswordHash` viajaban dentro de las hojas de actividades, evidencias, vehículos y
 * viáticos. Declarar las columnas a mano arregla las dos cosas de un golpe: el archivo se
 * entiende y solo sale lo que debe salir.
 *
 * El folio (`AN-…`, número de factura, folio de cotización) sí va de primera columna: es el
 * identificador con el que la gente habla. El `id` de la base no aparece en ninguno.
 */

const texto = (valor: unknown): string => (valor === null || valor === undefined ? '' : String(valor));

/** Nombre de una relación de usuario sin arrastrar el resto del registro. */
const nombreDe = (relacion: unknown): string => texto((relacion as { nombre?: string } | null)?.nombre);

const coordenadas = (lat: unknown, lon: unknown): string => {
  const a = Number(lat);
  const b = Number(lon);
  return Number.isFinite(a) && Number.isFinite(b) ? `${a.toFixed(6)}, ${b.toFixed(6)}` : '';
};

// ───────────────────────────────────────────────────────────────── actividades

export const COLUMNAS_ACTIVIDADES: ColumnaReporte<any>[] = [
  { clave: 'anNumber', titulo: 'Folio', ancho: 16 },
  { clave: 'titulo', titulo: 'Actividad', ancho: 42 },
  { clave: 'coreKind', titulo: 'Clase', etiquetas: ETIQUETA_CLASE_ACTIVIDAD, ancho: 12 },
  {
    clave: 'ticketType',
    titulo: 'Tipo',
    ancho: 16,
    valor: (a) =>
      a?.ticketType === 'OTRO' && a?.ticketTypeCustom
        ? texto(a.ticketTypeCustom)
        : (ETIQUETA_TIPO_TICKET[texto(a?.ticketType)] ?? texto(a?.ticketType)),
  },
  { clave: 'estatus', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_ACTIVIDAD, ancho: 14 },
  { clave: 'prioridad', titulo: 'Prioridad', etiquetas: ETIQUETA_PRIORIDAD, ancho: 11 },
  { clave: 'assignmentCharge', titulo: 'Encargo', etiquetas: ETIQUETA_ENCARGO, ancho: 12 },
  { clave: 'responsable', titulo: 'Responsable', valor: (a) => nombreDe(a?.responsable), ancho: 24 },
  {
    clave: 'client',
    titulo: 'Cliente',
    valor: (a) => texto((a?.client as { name?: string } | null)?.name),
    ancho: 26,
  },
  { clave: 'branchName', titulo: 'Sucursal', ancho: 24 },
  { clave: 'branchCity', titulo: 'Ciudad', ancho: 16 },
  { clave: 'branchState', titulo: 'Estado', ancho: 16 },
  { clave: 'fechaAsignacion', titulo: 'Asignada', tipo: 'fecha' },
  { clave: 'fechaEntregaEsperada', titulo: 'Entrega esperada', tipo: 'fecha' },
  { clave: 'fechaInicio', titulo: 'Inicio real', tipo: 'fechaHora' },
  { clave: 'fechaFinalizacion', titulo: 'Finalización', tipo: 'fechaHora' },
  { clave: 'tiempoEstimadoMin', titulo: 'Tiempo estimado', tipo: 'duracion', total: 'suma' },
  {
    clave: 'evidencias',
    titulo: 'Evidencias',
    tipo: 'entero',
    total: 'suma',
    ancho: 11,
    valor: (a) => (Array.isArray(a?.activityEvidences) ? a.activityEvidences.length : 0),
  },
  { clave: 'creador', titulo: 'Creada por', valor: (a) => nombreDe(a?.creador), ancho: 22 },
];

// ───────────────────────────────────────────────────────────────── evidencias

export const COLUMNAS_EVIDENCIAS: ColumnaReporte<any>[] = [
  {
    clave: 'folio',
    titulo: 'Folio',
    ancho: 16,
    valor: (e) => texto((e?.actividad as { anNumber?: string } | null)?.anNumber),
  },
  {
    clave: 'actividad',
    titulo: 'Actividad',
    ancho: 40,
    valor: (e) => texto((e?.actividad as { titulo?: string } | null)?.titulo),
  },
  { clave: 'tipoEvidencia', titulo: 'Tipo de evidencia', ancho: 22 },
  { clave: 'estatus', titulo: 'Estatus', ancho: 14 },
  { clave: 'aprobada', titulo: 'Aprobada', tipo: 'booleano', ancho: 11 },
  { clave: 'user', titulo: 'Subida por', valor: (e) => nombreDe(e?.user), ancho: 24 },
  { clave: 'subidoEn', titulo: 'Subida el', tipo: 'fechaHora' },
  { clave: 'aprobadoPor', titulo: 'Revisada por', valor: (e) => nombreDe(e?.aprobadoPor), ancho: 24 },
  { clave: 'revisadoEn', titulo: 'Revisada el', tipo: 'fechaHora' },
  { clave: 'calificacionEficiencia', titulo: 'Calificación', tipo: 'numero', total: 'promedio', ancho: 13 },
  { clave: 'comentarios', titulo: 'Comentarios', ancho: 40 },
  { clave: 'observacionesRevision', titulo: 'Observaciones de revisión', ancho: 40 },
  { clave: 'ubicacion', titulo: 'Ubicación', valor: (e) => coordenadas(e?.latitud, e?.longitud), ancho: 22 },
  { clave: 'archivoUrl', titulo: 'Archivo', ancho: 40 },
];

// ───────────────────────────────────────────────────────────────── vehículos

export const COLUMNAS_VEHICULOS: ColumnaReporte<any>[] = [
  {
    clave: 'vehiculo',
    titulo: 'Vehículo',
    ancho: 24,
    valor: (v) => texto((v?.vehiculo as { nombre?: string } | null)?.nombre ?? v?.nombreVehiculo),
  },
  {
    clave: 'placas',
    titulo: 'Placas',
    ancho: 12,
    valor: (v) => texto((v?.vehiculo as { placas?: string } | null)?.placas ?? v?.placasVehiculo),
  },
  { clave: 'solicitante', titulo: 'Solicitante', valor: (v) => nombreDe(v?.solicitante), ancho: 24 },
  {
    clave: 'actividad',
    titulo: 'Actividad',
    ancho: 16,
    valor: (v) => texto((v?.actividad as { anNumber?: string } | null)?.anNumber),
  },
  { clave: 'motivoUso', titulo: 'Motivo de uso', ancho: 36 },
  { clave: 'estatusAprobacion', titulo: 'Aprobación', etiquetas: ETIQUETA_APROBACION, ancho: 13 },
  { clave: 'fechaSolicitud', titulo: 'Solicitado el', tipo: 'fechaHora' },
  { clave: 'fechaInicioAprobada', titulo: 'Inicio aprobado', tipo: 'fechaHora' },
  { clave: 'fechaFinAprobada', titulo: 'Fin aprobado', tipo: 'fechaHora' },
  { clave: 'fechaInicio', titulo: 'Salida real', tipo: 'fechaHora' },
  { clave: 'fechaFin', titulo: 'Regreso real', tipo: 'fechaHora' },
  { clave: 'odometroInicio', titulo: 'Odómetro salida', tipo: 'entero', ancho: 14 },
  { clave: 'odometroFin', titulo: 'Odómetro regreso', tipo: 'entero', ancho: 14 },
  {
    clave: 'kilometros',
    titulo: 'Kilómetros',
    tipo: 'entero',
    total: 'suma',
    ancho: 12,
    valor: (v) => {
      const ini = Number(v?.odometroInicio);
      const fin = Number(v?.odometroFin);
      return Number.isFinite(ini) && Number.isFinite(fin) && fin >= ini ? fin - ini : null;
    },
  },
  { clave: 'combustibleInicioPct', titulo: 'Combustible salida', tipo: 'porcentaje', ancho: 15 },
  { clave: 'combustibleFinPct', titulo: 'Combustible regreso', tipo: 'porcentaje', ancho: 15 },
  { clave: 'entregaEstatus', titulo: 'Entrega', ancho: 14 },
  { clave: 'entregaAprobada', titulo: 'Entrega aprobada', tipo: 'booleano', ancho: 13 },
  {
    clave: 'entregaRevisadoPor',
    titulo: 'Revisó entrega',
    valor: (v) => nombreDe(v?.entregaRevisadoPor),
    ancho: 22,
  },
  { clave: 'penalizacionMonto', titulo: 'Penalización', tipo: 'dinero', total: 'suma' },
  { clave: 'penalizacionNotas', titulo: 'Notas de penalización', ancho: 36 },
];

// ───────────────────────────────────────────────────────────────── viáticos

export const COLUMNAS_VIATICOS: ColumnaReporte<any>[] = [
  {
    clave: 'folio',
    titulo: 'Folio actividad',
    ancho: 16,
    valor: (v) => texto((v?.Activity as { anNumber?: string } | null)?.anNumber),
  },
  { clave: 'usuario', titulo: 'Solicitante', valor: (v) => nombreDe(v?.User ?? v?.usuario), ancho: 24 },
  { clave: 'categoria', titulo: 'Categoría', etiquetas: ETIQUETA_CATEGORIA_VIATICO, ancho: 15 },
  { clave: 'origen', titulo: 'Origen', etiquetas: ETIQUETA_ORIGEN_VIATICO, ancho: 12 },
  { clave: 'motivo', titulo: 'Motivo', ancho: 40 },
  { clave: 'montoSolicitado', titulo: 'Monto solicitado', tipo: 'dinero', total: 'suma' },
  { clave: 'estatus', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_VIATICO, ancho: 20 },
  {
    clave: 'proyecto',
    titulo: 'Proyecto',
    ancho: 28,
    valor: (v) => texto((v?.project as { name?: string } | null)?.name),
  },
  {
    clave: 'vehiculo',
    titulo: 'Vehículo',
    ancho: 24,
    valor: (v) => {
      const veh = v?.vehicle as { nombre?: string; placas?: string } | null;
      if (!veh?.nombre && !veh?.placas) return '';
      return [veh?.nombre, veh?.placas ? `(${veh.placas})` : ''].filter(Boolean).join(' ');
    },
  },
  { clave: 'fechaSolicitud', titulo: 'Solicitado el', tipo: 'fechaHora' },
  { clave: 'contabilidadRef', titulo: 'Referencia contable', ancho: 22 },
  { clave: 'ticketEvidenciaUrl', titulo: 'Comprobante', ancho: 40 },
];

// ────────────────────────────────────────────────────── asistencia híbrida

export const COLUMNAS_ASISTENCIA_HIBRIDA: ColumnaReporte<any>[] = [
  { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
  {
    clave: 'persona',
    titulo: 'Persona',
    ancho: 26,
    valor: (i) =>
      texto(
        (i?.user as { nombre?: string } | null)?.nombre ??
          (i?.acs as { personName?: string } | null)?.personName ??
          (i?.acs as { personId?: string } | null)?.personId,
      ),
  },
  {
    clave: 'codigo',
    titulo: 'Nº empleado',
    ancho: 13,
    valor: (i) => {
      const u = i?.user as { employeeNumber?: string; companyEmployeeNumber?: string } | null;
      return texto(u?.employeeNumber ?? u?.companyEmployeeNumber ?? (i?.acs as { personId?: string } | null)?.personId);
    },
  },
  {
    clave: 'departamento',
    titulo: 'Departamento',
    ancho: 22,
    valor: (i) => texto((i?.user as { department?: string } | null)?.department),
  },
  { clave: 'linkStatus', titulo: 'Vínculo', etiquetas: ETIQUETA_VINCULO, ancho: 13 },
  { clave: 'expectedStart', titulo: 'Entrada esperada', ancho: 13 },
  {
    clave: 'erpEntrada',
    titulo: 'Entrada ERP',
    tipo: 'fechaHora',
    valor: (i) => (i?.erp as { checkIn?: string } | null)?.checkIn ?? null,
  },
  {
    clave: 'erpSalida',
    titulo: 'Salida ERP',
    tipo: 'fechaHora',
    valor: (i) => (i?.erp as { checkOut?: string } | null)?.checkOut ?? null,
  },
  {
    clave: 'erpMinutos',
    titulo: 'Jornada ERP',
    tipo: 'duracion',
    total: 'suma',
    valor: (i) => (i?.erp as { totalMinutes?: number } | null)?.totalMinutes ?? null,
  },
  {
    clave: 'erpEstado',
    titulo: 'Estado ERP',
    etiquetas: ETIQUETA_ESTADO_ERP,
    ancho: 12,
    valor: (i) => (i?.erp as { estado?: string } | null)?.estado ?? null,
  },
  {
    clave: 'acsEntrada',
    titulo: 'Primer acceso ACS',
    tipo: 'fechaHora',
    valor: (i) => (i?.acs as { firstAt?: string } | null)?.firstAt ?? null,
  },
  {
    clave: 'acsSalida',
    titulo: 'Último acceso ACS',
    tipo: 'fechaHora',
    valor: (i) => (i?.acs as { lastAt?: string } | null)?.lastAt ?? null,
  },
  {
    clave: 'acsMinutos',
    titulo: 'Permanencia ACS',
    tipo: 'duracion',
    total: 'suma',
    valor: (i) => (i?.acs as { minutes?: number } | null)?.minutes ?? null,
  },
  {
    clave: 'puerta',
    titulo: 'Puerta',
    ancho: 20,
    valor: (i) => texto((i?.acs as { firstDoor?: string } | null)?.firstDoor),
  },
  {
    clave: 'pases',
    titulo: 'Pases',
    tipo: 'entero',
    total: 'suma',
    ancho: 10,
    valor: (i) => (i?.acs as { passes?: number } | null)?.passes ?? null,
  },
  {
    clave: 'denegados',
    titulo: 'Denegados',
    tipo: 'entero',
    total: 'suma',
    ancho: 11,
    valor: (i) => (i?.acs as { denied?: number } | null)?.denied ?? null,
  },
  { clave: 'alertas', titulo: 'Alertas', ancho: 34, valor: (i) => listaEtiquetada(i?.flags, ETIQUETA_ALERTA) },
];

// ────────────────────────────────────────────────── KPI del equipo (me/kpis)

export const COLUMNAS_KPIS_PERSONAS: ColumnaReporte<any>[] = [
  { clave: 'persona', titulo: 'Persona', valor: (p) => nombreDe(p?.persona), ancho: 26 },
  {
    clave: 'puesto',
    titulo: 'Puesto',
    ancho: 24,
    valor: (p) => texto((p?.persona as { puesto?: string } | null)?.puesto),
  },
  {
    clave: 'horario',
    titulo: 'Horario',
    ancho: 24,
    valor: (p) => texto((p?.horario as { etiqueta?: string } | null)?.etiqueta),
  },
  {
    clave: 'diasConJornada',
    titulo: 'Días con jornada',
    tipo: 'entero',
    total: 'suma',
    ancho: 13,
    valor: (p) => p?.totales?.diasConJornada ?? 0,
  },
  {
    clave: 'diasSinChecada',
    titulo: 'Días sin checar',
    tipo: 'entero',
    total: 'suma',
    ancho: 13,
    valor: (p) => p?.totales?.diasSinChecada ?? 0,
  },
  {
    clave: 'faltasJustificadas',
    titulo: 'Faltas justificadas',
    tipo: 'entero',
    total: 'suma',
    ancho: 13,
    valor: (p) => p?.totales?.faltasJustificadas ?? 0,
  },
  {
    clave: 'retardos',
    titulo: 'Retardos',
    tipo: 'entero',
    total: 'suma',
    ancho: 11,
    valor: (p) => p?.totales?.retardos ?? 0,
  },
  {
    clave: 'minutosTarde',
    titulo: 'Tiempo de retardo',
    tipo: 'duracion',
    total: 'suma',
    valor: (p) => p?.totales?.minutosTarde ?? 0,
  },
  {
    clave: 'uniformePct',
    titulo: 'Uniforme ✓',
    tipo: 'porcentaje',
    ancho: 12,
    valor: (p) => p?.totales?.uniforme?.pct ?? null,
  },
  {
    clave: 'minutosLaborados',
    titulo: 'Horas laboradas',
    tipo: 'duracion',
    total: 'suma',
    valor: (p) => p?.totales?.minutosLaborados ?? 0,
  },
  {
    clave: 'minutosProductivos',
    titulo: 'Horas productivas',
    tipo: 'duracion',
    total: 'suma',
    valor: (p) => p?.totales?.minutosProductivos ?? 0,
  },
  {
    clave: 'minutosInactivos',
    titulo: 'Horas inactivas',
    tipo: 'duracion',
    total: 'suma',
    valor: (p) => p?.totales?.minutosInactivos ?? 0,
  },
  {
    clave: 'productividadPct',
    titulo: 'Productividad',
    tipo: 'porcentaje',
    ancho: 13,
    valor: (p) => p?.totales?.productividadPct ?? null,
  },
  {
    clave: 'minutosExtra',
    titulo: 'Tiempo extra',
    tipo: 'duracion',
    total: 'suma',
    valor: (p) => p?.totales?.minutosExtra ?? null,
  },
  {
    clave: 'jornadasSinSalida',
    titulo: 'Jornadas sin salida',
    tipo: 'entero',
    total: 'suma',
    ancho: 13,
    valor: (p) => p?.totales?.jornadasSinSalida ?? 0,
  },
  {
    clave: 'actividadesFueraDeJornada',
    titulo: 'Actividades fuera de jornada',
    tipo: 'entero',
    total: 'suma',
    ancho: 15,
    valor: (p) => p?.totales?.actividadesFueraDeJornada ?? 0,
  },
  { clave: 'motivos', titulo: 'Observaciones', ancho: 44, valor: (p) => (p?.motivos ?? []).join('; ') },
];

/** Detalle día por día de una persona (hoja secundaria del reporte de KPI). */
export const COLUMNAS_KPIS_DIAS: ColumnaReporte<any>[] = [
  { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
  { clave: 'laborable', titulo: 'Laborable', tipo: 'booleano', ancho: 11 },
  { clave: 'entrada', titulo: 'Entrada', tipo: 'fechaHora' },
  { clave: 'salida', titulo: 'Salida', tipo: 'fechaHora' },
  { clave: 'retardo', titulo: 'Retardo', tipo: 'booleano', ancho: 10 },
  { clave: 'minutosTarde', titulo: 'Minutos tarde', tipo: 'duracion', total: 'suma' },
  { clave: 'uniformeOk', titulo: 'Uniforme ✓', tipo: 'booleano', ancho: 11 },
  { clave: 'minutosComida', titulo: 'Comida', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosLaborados', titulo: 'Laborado', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosProductivos', titulo: 'Productivo', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosInactivos', titulo: 'Inactivo', tipo: 'duracion', total: 'suma' },
  { clave: 'productividadPct', titulo: 'Productividad', tipo: 'porcentaje', ancho: 13 },
  { clave: 'minutosExtra', titulo: 'Tiempo extra', tipo: 'duracion', total: 'suma' },
  { clave: 'sinChecada', titulo: 'Sin checar', tipo: 'booleano', ancho: 11 },
  { clave: 'faltaJustificada', titulo: 'Justificada', tipo: 'booleano', ancho: 11 },
  { clave: 'cierreAutomatico', titulo: 'Cierre automático', tipo: 'booleano', ancho: 13 },
  {
    clave: 'actividadesFueraDeJornada',
    titulo: 'Actividades fuera de jornada',
    tipo: 'entero',
    total: 'suma',
    ancho: 15,
  },
];

// ─────────────────────────────────────────────── packs del módulo «Exportar»

export type DefinicionReporte = {
  /** Título de la banda. */
  titulo: string;
  /** Nombre de la pestaña, en español. */
  hoja: string;
  columnas: ColumnaReporte<any>[];
};

export const REPORTES_POR_ENTIDAD: Record<string, DefinicionReporte> = {
  clients: {
    titulo: 'Clientes CRM',
    hoja: 'Clientes',
    columnas: [
      { clave: 'name', titulo: 'Cliente', ancho: 30 },
      { clave: 'legalName', titulo: 'Razón social', ancho: 34 },
      { clave: 'taxId', titulo: 'RFC', ancho: 15 },
      { clave: 'industry', titulo: 'Giro', ancho: 22 },
      { clave: 'billingEmail', titulo: 'Correo de facturación', ancho: 30 },
      { clave: 'billingPhone', titulo: 'Teléfono', ancho: 16 },
      { clave: 'status', titulo: 'Estatus', ancho: 14 },
      { clave: 'createdAt', titulo: 'Alta', tipo: 'fecha' },
    ],
  },
  leads: {
    titulo: 'Leads',
    hoja: 'Leads',
    columnas: [
      { clave: 'name', titulo: 'Contacto', ancho: 28 },
      { clave: 'company', titulo: 'Empresa', ancho: 30 },
      { clave: 'email', titulo: 'Correo', ancho: 30 },
      { clave: 'phone', titulo: 'Teléfono', ancho: 16 },
      { clave: 'status', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_LEAD, ancho: 16 },
      { clave: 'score', titulo: 'Puntaje', tipo: 'entero', total: 'promedio', ancho: 11 },
      { clave: 'source', titulo: 'Origen', ancho: 18 },
      { clave: 'createdAt', titulo: 'Alta', tipo: 'fecha' },
    ],
  },
  opportunities: {
    titulo: 'Oportunidades',
    hoja: 'Oportunidades',
    columnas: [
      { clave: 'title', titulo: 'Oportunidad', ancho: 38 },
      { clave: 'stage', titulo: 'Etapa', etiquetas: ETIQUETA_ETAPA_OPORTUNIDAD, ancho: 18 },
      { clave: 'value', titulo: 'Valor', tipo: 'dinero', total: 'suma' },
      { clave: 'probability', titulo: 'Probabilidad', tipo: 'porcentaje', ancho: 13 },
      { clave: 'expectedCloseDate', titulo: 'Cierre estimado', tipo: 'fecha' },
      { clave: 'closedAt', titulo: 'Cerrada el', tipo: 'fecha' },
      { clave: 'createdAt', titulo: 'Alta', tipo: 'fecha' },
    ],
  },
  tenders: {
    titulo: 'Licitaciones',
    hoja: 'Licitaciones',
    columnas: [
      { clave: 'tenderNumber', titulo: 'Número', ancho: 18 },
      { clave: 'title', titulo: 'Licitación', ancho: 40 },
      { clave: 'tenderType', titulo: 'Tipo', etiquetas: ETIQUETA_TIPO_LICITACION, ancho: 18 },
      { clave: 'status', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_LICITACION, ancho: 16 },
      { clave: 'conveningEntity', titulo: 'Convocante', ancho: 32 },
      { clave: 'budgetCeiling', titulo: 'Techo presupuestal', tipo: 'dinero', total: 'suma' },
      { clave: 'submissionDeadline', titulo: 'Cierre de propuestas', tipo: 'fechaHora' },
      { clave: 'createdAt', titulo: 'Alta', tipo: 'fecha' },
    ],
  },
  invoices: {
    titulo: 'Facturas emitidas',
    hoja: 'Facturas',
    columnas: [
      { clave: 'invoiceNumber', titulo: 'Folio', ancho: 18 },
      { clave: 'type', titulo: 'Tipo', etiquetas: ETIQUETA_TIPO_FACTURA, ancho: 14 },
      { clave: 'status', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_FACTURA, ancho: 14 },
      { clave: 'issueDate', titulo: 'Emisión', tipo: 'fecha' },
      { clave: 'dueDate', titulo: 'Vencimiento', tipo: 'fecha' },
      { clave: 'subtotal', titulo: 'Subtotal', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'taxAmount', titulo: 'Impuestos', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'totalAmount', titulo: 'Total', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'paidAmount', titulo: 'Pagado', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'currency', titulo: 'Moneda', ancho: 10 },
      { clave: 'cfdiUuid', titulo: 'UUID del CFDI', ancho: 38 },
      { clave: 'isCancelled', titulo: 'Cancelada', tipo: 'booleano', ancho: 11 },
    ],
  },
  activities: {
    titulo: 'Actividades / Órdenes de trabajo',
    hoja: 'Actividades',
    columnas: [
      { clave: 'anNumber', titulo: 'Folio', ancho: 16 },
      { clave: 'titulo', titulo: 'Actividad', ancho: 42 },
      { clave: 'estatus', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_ACTIVIDAD, ancho: 14 },
      { clave: 'prioridad', titulo: 'Prioridad', etiquetas: ETIQUETA_PRIORIDAD, ancho: 11 },
      { clave: 'ticketType', titulo: 'Tipo', etiquetas: ETIQUETA_TIPO_TICKET, ancho: 15 },
      { clave: 'branchName', titulo: 'Sucursal', ancho: 26 },
      { clave: 'fechaAsignacion', titulo: 'Asignada', tipo: 'fecha' },
      { clave: 'fechaInicio', titulo: 'Inicio real', tipo: 'fechaHora' },
      { clave: 'fechaEntregaEsperada', titulo: 'Entrega esperada', tipo: 'fecha' },
      { clave: 'fechaFinalizacion', titulo: 'Finalización', tipo: 'fechaHora' },
    ],
  },
  projects: {
    titulo: 'Proyectos operativos',
    hoja: 'Proyectos',
    columnas: [
      { clave: 'title', titulo: 'Proyecto', ancho: 40 },
      { clave: 'projectType', titulo: 'Tipo', etiquetas: ETIQUETA_TIPO_PROYECTO, ancho: 18 },
      { clave: 'status', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_PROYECTO, ancho: 16 },
      { clave: 'startDate', titulo: 'Inicio', tipo: 'fecha' },
      { clave: 'endDate', titulo: 'Fin planeado', tipo: 'fecha' },
      { clave: 'actualEndDate', titulo: 'Fin real', tipo: 'fecha' },
      {
        clave: 'diasDesfase',
        titulo: 'Días de desfase',
        tipo: 'entero',
        total: 'suma',
        ancho: 13,
        valor: (p: any) => {
          const plan = p?.endDate ? new Date(p.endDate).getTime() : NaN;
          const real = p?.actualEndDate ? new Date(p.actualEndDate).getTime() : NaN;
          if (!Number.isFinite(plan) || !Number.isFinite(real)) return null;
          return Math.round((real - plan) / 86_400_000);
        },
      },
    ],
  },
  users: {
    titulo: 'Usuarios',
    hoja: 'Usuarios',
    columnas: [
      { clave: 'employeeNumber', titulo: 'Nº empleado', ancho: 13 },
      { clave: 'nombre', titulo: 'Nombre', ancho: 30 },
      { clave: 'email', titulo: 'Correo', ancho: 32 },
      { clave: 'fechaCreacion', titulo: 'Alta', tipo: 'fecha' },
    ],
  },
  'kb-articles': {
    titulo: 'Base de conocimiento',
    hoja: 'Artículos',
    columnas: [
      { clave: 'title', titulo: 'Artículo', ancho: 44 },
      { clave: 'slug', titulo: 'Ruta', ancho: 30 },
      { clave: 'visibility', titulo: 'Visibilidad', etiquetas: ETIQUETA_VISIBILIDAD_KB, ancho: 15 },
      { clave: 'status', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_KB, ancho: 14 },
      { clave: 'viewCount', titulo: 'Vistas', tipo: 'entero', total: 'suma', ancho: 11 },
      { clave: 'helpfulCount', titulo: 'Votos útiles', tipo: 'entero', total: 'suma', ancho: 12 },
      { clave: 'publishedAt', titulo: 'Publicado', tipo: 'fecha' },
      { clave: 'createdAt', titulo: 'Alta', tipo: 'fecha' },
    ],
  },
  'crm-activities': {
    titulo: 'Actividades comerciales',
    hoja: 'Actividades CRM',
    columnas: [
      { clave: 'subject', titulo: 'Asunto', ancho: 42 },
      { clave: 'activityType', titulo: 'Tipo', etiquetas: ETIQUETA_TIPO_ACTIVIDAD_CRM, ancho: 18 },
      { clave: 'status', titulo: 'Estatus', etiquetas: ETIQUETA_ESTATUS_ACTIVIDAD_CRM, ancho: 16 },
      { clave: 'dueDate', titulo: 'Compromiso', tipo: 'fechaHora' },
      { clave: 'completedAt', titulo: 'Completada el', tipo: 'fechaHora' },
      { clave: 'createdAt', titulo: 'Alta', tipo: 'fecha' },
    ],
  },
  cotizaciones: {
    titulo: 'Cotizaciones',
    hoja: 'Cotizaciones',
    columnas: [
      { clave: 'folio', titulo: 'Folio', ancho: 24 },
      { clave: 'projectName', titulo: 'Proyecto', ancho: 38 },
      { clave: 'clientName', titulo: 'Cliente', ancho: 30 },
      { clave: 'clientCompany', titulo: 'Empresa', ancho: 30 },
      { clave: 'status', titulo: 'Estatus', etiquetas: ETIQUETA_ESTADO_COTIZACION, ancho: 13 },
      { clave: 'segmento', titulo: 'Segmento', etiquetas: ETIQUETA_SEGMENTO_COTIZACION, ancho: 13 },
      { clave: 'revision', titulo: 'Revisión', tipo: 'entero', ancho: 10 },
      { clave: 'issueDate', titulo: 'Emisión', tipo: 'fecha' },
      { clave: 'validUntil', titulo: 'Vigencia', tipo: 'fecha' },
      { clave: 'subtotal', titulo: 'Subtotal', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'discountTotal', titulo: 'Descuento', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'taxTotal', titulo: 'IVA', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'total', titulo: 'Total', tipo: 'dinero', monedaDe: 'currency', total: 'suma' },
      { clave: 'currency', titulo: 'Moneda', ancho: 10 },
      { clave: 'preparedBy', titulo: 'Elaboró', ancho: 24 },
      { clave: 'sentAt', titulo: 'Enviada el', tipo: 'fechaHora' },
      { clave: 'signedByName', titulo: 'Firmada por', ancho: 26 },
      { clave: 'signedAt', titulo: 'Firmada el', tipo: 'fechaHora' },
    ],
  },
};
