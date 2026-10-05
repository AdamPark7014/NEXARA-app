import ExcelJS from 'exceljs';
import { crearReporte } from '../common/excel/reporte-excel.js';
import type { DiaKpi } from '../me/kpis-equipo.js';
import {
  estadoDelDia,
  etiquetaFecha,
  filasDetalleDiario,
  hojaDetalleDiario,
  hojaHorasPorDia,
  horaLocal,
  type PersonaConDias,
} from './pre-nomina-dias.js';

function dia(fecha: string, extra: Partial<DiaKpi> = {}): DiaKpi {
  return {
    fecha,
    laborable: true,
    conJornada: true,
    sinChecada: false,
    faltaJustificada: false,
    entrada: `${fecha}T16:00:00.000Z`,
    salida: `${fecha}T23:00:00.000Z`,
    abierta: false,
    sinSalida: false,
    cierreAutomatico: false,
    checadaEntradaId: 1,
    retardo: false,
    minutosTarde: 0,
    uniformeOk: null,
    minutosComida: 60,
    minutosLaborados: 360,
    minutosProductivos: 240,
    minutosInactivos: 120,
    productividadPct: 67,
    minutosExtra: null,
    extraEstado: null,
    minutosExtraAprobados: 0,
    extraNota: null,
    actividadesFueraDeJornada: 0,
    ...extra,
  };
}

const ana: PersonaConDias = {
  userId: 7,
  nombre: 'Ana López',
  puesto: 'Técnica',
  numeroEmpleado: 'E-07',
  dias: [
    dia('2026-09-29', { minutosLaborados: 480 }),
    dia('2026-09-28', { retardo: true, minutosTarde: 15 }),
    dia('2026-09-30', { conJornada: false, sinChecada: true, entrada: null, salida: null }),
    dia('2026-10-04', { laborable: false, conJornada: false, entrada: null, salida: null }),
  ],
};

describe('pre-nómina día por día', () => {
  it('etiqueta la fecha con el día de la semana', () => {
    expect(etiquetaFecha('2026-10-05')).toBe('lun 05/10');
    expect(etiquetaFecha('2026-10-04', true)).toBe('dom 04/10/2026');
  });

  it('la hora sale en la zona de la jornada', () => {
    expect(horaLocal('2026-10-05T16:00:00.000Z')).toBe('10:00');
    expect(horaLocal(null)).toBeNull();
  });

  it('el estado del día dice lo que hay que revisar', () => {
    expect(estadoDelDia(dia('2026-10-05'))).toBe('Normal');
    expect(estadoDelDia(dia('2026-10-05', { retardo: true }))).toBe('Retardo');
    expect(estadoDelDia(dia('2026-10-05', { conJornada: false, sinChecada: true }))).toBe('Falta (sin checar)');
    expect(estadoDelDia(dia('2026-10-05', { conJornada: false, faltaJustificada: true }))).toBe('Falta justificada');
    expect(estadoDelDia(dia('2026-10-04', { laborable: false, conJornada: false }))).toBe('Descanso');
    expect(estadoDelDia(dia('2026-10-04', { laborable: false }))).toBe('Trabajó en descanso');
    expect(estadoDelDia(dia('2026-10-05', { abierta: true }))).toBe('En jornada');
  });

  it('la matriz pone una columna por día y deja vacío donde no hubo jornada', () => {
    const hoja = hojaHorasPorDia([ana], { desde: '2026-09-28', hasta: '2026-10-04' });
    const titulos = hoja.columnas.map((c) => c.titulo);
    expect(titulos.slice(2, 9)).toEqual([
      'lun 28/09',
      'mar 29/09',
      'mié 30/09',
      'jue 01/10',
      'vie 02/10',
      'sáb 03/10',
      'dom 04/10',
    ]);
    const fila = hoja.filas[0];
    expect(fila['d_2026-09-28']).toBe(360);
    expect(fila['d_2026-09-29']).toBe(480);
    expect(fila['d_2026-09-30']).toBeUndefined();
    expect(fila.minutosLaborados).toBe(840);
    expect(fila.diasTrabajados).toBe(2);
  });

  it('el detalle va en orden de fecha y omite los descansos sin trabajo', () => {
    const filas = filasDetalleDiario([ana]);
    expect(filas.map((f) => f.fecha)).toEqual(['lun 28/09/2026', 'mar 29/09/2026', 'mié 30/09/2026']);
    expect(filas[0]).toMatchObject({ entrada: '10:00', estado: 'Retardo', minutosTarde: 15, minutosLaborados: 360 });
    expect(filas[2]).toMatchObject({ estado: 'Falta (sin checar)', minutosLaborados: null, entrada: null });
  });

  it('el libro sale con el resumen y las dos hojas diarias', async () => {
    const rango = { desde: '2026-09-28', hasta: '2026-10-04' };
    const buffer = await crearReporte({
      hoja: 'Pre-nómina',
      titulo: 'Pre-nómina',
      columnas: [{ clave: 'nombre', titulo: 'Persona' }],
      filas: [{ nombre: 'Ana López' }],
      hojasExtra: [hojaHorasPorDia([ana], rango), hojaDetalleDiario([ana], rango)],
    });
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as any);
    const nombres = libro.worksheets.map((w) => w.name);
    expect(nombres).toEqual(expect.arrayContaining(['Pre-nómina', 'Horas por día', 'Detalle diario']));
  });
});
