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
  horasEnPalabras,
  resumenDelDia,
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
    expect(etiquetaFecha('2026-10-05')).toBe('Lunes 05/10');
    expect(etiquetaFecha('2026-10-04', true)).toBe('Domingo 04/10/2026');
  });

  it('cada día se dice en palabras: horas trabajadas y productivas', () => {
    expect(resumenDelDia(dia('2026-10-05', { minutosLaborados: 490, minutosProductivos: 320, productividadPct: 65 }))).toBe(
      'Lunes 05/10: 8 h 10 min trabajadas, 5 h 20 min productivas (65 %)',
    );
    expect(resumenDelDia(dia('2026-10-06', { conJornada: false, sinChecada: true }))).toBe('Martes 06/10: falta (sin checar)');
    expect(horasEnPalabras(480)).toBe('8 h');
    expect(horasEnPalabras(45)).toBe('45 min');
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

  it('la matriz pone trabajadas y productivas de cada día y deja vacío donde no hubo jornada', () => {
    const hoja = hojaHorasPorDia([ana], { desde: '2026-09-28', hasta: '2026-10-04' });
    const titulos = hoja.columnas.map((c) => c.titulo);
    expect(titulos.slice(2, 6)).toEqual([
      'Lunes 28/09 · Trabajadas',
      'Lunes 28/09 · Productivas',
      'Martes 29/09 · Trabajadas',
      'Martes 29/09 · Productivas',
    ]);
    expect(titulos).toContain('Domingo 04/10 · Productivas');
    const fila = hoja.filas[0];
    expect(fila['t_2026-09-28']).toBe(360);
    expect(fila['p_2026-09-28']).toBe(240);
    expect(fila['t_2026-09-29']).toBe(480);
    expect(fila['t_2026-09-30']).toBeUndefined();
    expect(fila.minutosLaborados).toBe(840);
    expect(fila.minutosProductivos).toBe(480);
    expect(fila.productividadPct).toBe(57);
    expect(fila.diasTrabajados).toBe(2);
  });

  it('el detalle va en orden de fecha y omite los descansos sin trabajo', () => {
    const filas = filasDetalleDiario([ana]);
    expect(filas.map((f) => f.fecha)).toEqual(['Lunes 28/09/2026', 'Martes 29/09/2026', 'Miércoles 30/09/2026']);
    expect(filas[0].resumen).toBe('Lunes 28/09: 6 h trabajadas, 4 h productivas (67 %)');
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
