import type { ColumnaReporte, HojaReporte } from '../common/excel/reporte-excel.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { diasDelRango, type DiaKpi } from '../me/kpis-equipo.js';

/**
 * Las hojas día por día de la pre-nómina en Excel: «Horas por día» (una columna por fecha,
 * para ver de un vistazo cuánto trabajó cada quien cada día) y «Detalle diario» (entrada,
 * salida, comida, horas y extra de cada jornada). Salen de los mismos `DiaKpi` que los
 * indicadores, así que cuadran con la hoja de resumen.
 */

export type PersonaConDias = {
  userId: number;
  nombre: string;
  puesto: string | null;
  numeroEmpleado: string | null;
  dias: DiaKpi[];
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const ESTADO_EXTRA: Record<string, string> = {
  PENDIENTE: 'Sin aprobar',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

/** `2026-10-05` → «Lunes 05/10» (o «Lunes 05/10/2026» con año). */
export function etiquetaFecha(fecha: string, conAnio = false): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  const base = `${DIAS[dow]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  return conAnio ? `${base}/${y}` : base;
}

/** 490 → «8 h 10 min»; 45 → «45 min»; 480 → «8 h». */
export function horasEnPalabras(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** «Lunes 05/10: 8 h 10 min trabajadas, 5 h 20 min productivas (65 %)», o por qué no trabajó. */
export function resumenDelDia(d: DiaKpi): string {
  const dia = etiquetaFecha(d.fecha);
  if (!d.conJornada) return `${dia}: ${estadoDelDia(d).toLowerCase()}`;
  const pct = d.productividadPct != null ? ` (${Math.round(d.productividadPct)} %)` : '';
  const abierta = d.abierta ? ', sigue en jornada' : '';
  return `${dia}: ${horasEnPalabras(d.minutosLaborados)} trabajadas, ${horasEnPalabras(d.minutosProductivos)} productivas${pct}${abierta}`;
}

/** ISO → «09:58» en la zona de la jornada. */
export function horaLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleTimeString('es-MX', {
    timeZone: WORKDAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Cómo se lee el día en una palabra, para quien revisa antes de pagar. */
export function estadoDelDia(d: DiaKpi): string {
  if (d.abierta) return 'En jornada';
  if (d.faltaJustificada) return 'Falta justificada';
  if (d.sinChecada) return 'Falta (sin checar)';
  if (!d.conJornada) return d.laborable ? 'Sin jornada' : 'Descanso';
  if (d.cierreAutomatico) return 'Salida automática';
  if (d.sinSalida) return 'Sin salida';
  if (d.retardo) return 'Retardo';
  return d.laborable ? 'Normal' : 'Trabajó en descanso';
}

/** Un día entra al detalle si hubo jornada o si se esperaba que la hubiera. */
function cuentaEnDetalle(d: DiaKpi): boolean {
  return d.conJornada || d.laborable || d.faltaJustificada;
}

export function hojaHorasPorDia(
  personas: PersonaConDias[],
  rango: { desde: string; hasta: string },
): HojaReporte<Record<string, unknown>> {
  const fechas = diasDelRango(rango.desde, rango.hasta);
  const columnas: ColumnaReporte<Record<string, unknown>>[] = [
    { clave: 'numeroEmpleado', titulo: 'No. de empleado', ancho: 14 },
    { clave: 'nombre', titulo: 'Persona', ancho: 28 },
    ...fechas.flatMap((f): ColumnaReporte<Record<string, unknown>>[] => [
      { clave: `t_${f}`, titulo: `${etiquetaFecha(f)} · Trabajadas`, tipo: 'duracion', total: 'suma', ancho: 16 },
      { clave: `p_${f}`, titulo: `${etiquetaFecha(f)} · Productivas`, tipo: 'duracion', total: 'suma', ancho: 16 },
    ]),
    { clave: 'minutosLaborados', titulo: 'Total trabajadas', tipo: 'duracion', total: 'suma', ancho: 13 },
    { clave: 'minutosProductivos', titulo: 'Total productivas', tipo: 'duracion', total: 'suma', ancho: 13 },
    { clave: 'productividadPct', titulo: 'Productividad', tipo: 'porcentaje', ancho: 12 },
    { clave: 'diasTrabajados', titulo: 'Días trabajados', tipo: 'entero', total: 'suma', ancho: 12 },
  ];

  const filas = personas.map((p) => {
    const fila: Record<string, unknown> = { numeroEmpleado: p.numeroEmpleado, nombre: p.nombre };
    let trabajadas = 0;
    let productivas = 0;
    let dias = 0;
    for (const d of p.dias) {
      if (!d.conJornada) continue;
      fila[`t_${d.fecha}`] = d.minutosLaborados;
      fila[`p_${d.fecha}`] = d.minutosProductivos;
      trabajadas += d.minutosLaborados;
      productivas += d.minutosProductivos;
      dias += 1;
    }
    fila.minutosLaborados = trabajadas;
    fila.minutosProductivos = productivas;
    fila.productividadPct = trabajadas > 0 ? Math.round((productivas / trabajadas) * 100) : null;
    fila.diasTrabajados = dias;
    return fila;
  });

  return {
    hoja: 'Horas por día',
    titulo: 'Horas trabajadas y productivas por día',
    subtitulo: `Del ${etiquetaFecha(rango.desde, true)} al ${etiquetaFecha(rango.hasta, true)}`,
    notas: [
      'Trabajadas: de la entrada a la salida, sin la comida. Productivas: el tiempo dentro de actividades.',
      'Celda vacía: ese día no hubo jornada.',
    ],
    columnas,
    filas,
  };
}

export type FilaDetalleDiario = {
  numeroEmpleado: string | null;
  nombre: string;
  puesto: string | null;
  fecha: string;
  resumen: string;
  entrada: string | null;
  salida: string | null;
  estado: string;
  minutosComida: number | null;
  minutosLaborados: number | null;
  minutosProductivos: number | null;
  minutosInactivos: number | null;
  productividadPct: number | null;
  minutosTarde: number | null;
  minutosExtra: number | null;
  minutosExtraAprobados: number | null;
  extraEstado: string | null;
  extraNota: string | null;
};

export function filasDetalleDiario(personas: PersonaConDias[]): FilaDetalleDiario[] {
  const filas: FilaDetalleDiario[] = [];
  for (const p of personas) {
    const dias = [...p.dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const d of dias) {
      if (!cuentaEnDetalle(d)) continue;
      const trabajo = d.conJornada;
      filas.push({
        numeroEmpleado: p.numeroEmpleado,
        nombre: p.nombre,
        puesto: p.puesto,
        fecha: etiquetaFecha(d.fecha, true),
        resumen: resumenDelDia(d),
        entrada: horaLocal(d.entrada),
        salida: d.abierta ? null : horaLocal(d.salida),
        estado: estadoDelDia(d),
        minutosComida: trabajo ? d.minutosComida : null,
        minutosLaborados: trabajo ? d.minutosLaborados : null,
        minutosProductivos: trabajo ? d.minutosProductivos : null,
        minutosInactivos: trabajo ? d.minutosInactivos : null,
        productividadPct: trabajo ? d.productividadPct : null,
        minutosTarde: d.retardo ? d.minutosTarde : null,
        minutosExtra: d.minutosExtra && d.minutosExtra > 0 ? d.minutosExtra : null,
        minutosExtraAprobados: d.minutosExtraAprobados > 0 ? d.minutosExtraAprobados : null,
        extraEstado: d.extraEstado ? (ESTADO_EXTRA[d.extraEstado] ?? d.extraEstado) : null,
        extraNota: d.extraNota,
      });
    }
  }
  return filas;
}

const COLUMNAS_DETALLE_DIARIO: ColumnaReporte<FilaDetalleDiario>[] = [
  { clave: 'numeroEmpleado', titulo: 'No. de empleado', ancho: 14 },
  { clave: 'nombre', titulo: 'Persona', ancho: 28 },
  { clave: 'fecha', titulo: 'Día', ancho: 19 },
  { clave: 'resumen', titulo: 'En palabras', ancho: 46, ajustar: true },
  { clave: 'entrada', titulo: 'Entrada', ancho: 9 },
  { clave: 'salida', titulo: 'Salida', ancho: 9 },
  { clave: 'estado', titulo: 'Estado', ancho: 18 },
  { clave: 'minutosComida', titulo: 'Comida', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosLaborados', titulo: 'Horas trabajadas', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosProductivos', titulo: 'Horas productivas', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosInactivos', titulo: 'Horas sin actividad', tipo: 'duracion', total: 'suma' },
  { clave: 'productividadPct', titulo: 'Productividad', tipo: 'porcentaje', ancho: 13 },
  { clave: 'minutosTarde', titulo: 'Retardo', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosExtra', titulo: 'Extra calculado', tipo: 'duracion', total: 'suma' },
  { clave: 'minutosExtraAprobados', titulo: 'Extra aprobado', tipo: 'duracion', total: 'suma' },
  { clave: 'extraEstado', titulo: 'Decisión del extra', ancho: 14 },
  { clave: 'extraNota', titulo: 'Nota del jefe', ancho: 32 },
];

export function hojaDetalleDiario(
  personas: PersonaConDias[],
  rango: { desde: string; hasta: string },
): HojaReporte<FilaDetalleDiario> {
  return {
    hoja: 'Detalle diario',
    titulo: 'Detalle diario de jornadas',
    subtitulo: `Del ${etiquetaFecha(rango.desde, true)} al ${etiquetaFecha(rango.hasta, true)}`,
    notas: ['Una fila por persona y día laborable (y los descansos en que sí trabajó).'],
    columnas: COLUMNAS_DETALLE_DIARIO,
    filas: filasDetalleDiario(personas),
  };
}
