import { calculaKpisPersona, horarioDePersona } from '../me/kpis-equipo.js';
import {
  avisosDeFila,
  filaPreNomina,
  horas,
  minutosPagables,
  resumenPreNomina,
  type EntradaPreNomina,
} from './pre-nomina.js';

/**
 * Los números de la nómina.
 *
 * Dos cosas que antes no se cumplían y aquí quedan fijadas:
 *
 * 1. Las horas son netas. `AttendanceDay.totalMinutes` era entrada → salida en bruto,
 *    con la comida dentro: una hora al día por persona que nadie trabajó.
 * 2. El tiempo extra no se paga por existir. Calculado es una medición; pagable es una
 *    decisión de su jefe. Si nadie lo aprobó, no entra en ningún total pagable.
 */

const mx = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-06:00`);
const checada = (tipo: string, dia: string, hora: string) => ({ tipo, at: mx(dia, hora) });

/** Lunes 14-09-2026: entra 09:00, come una hora, sale 19:00. */
const DIA = '2026-09-14';
const baseKpi = {
  desde: DIA,
  hasta: DIA,
  ahora: mx('2026-09-16', '10:00'),
  horario: horarioDePersona('office_hours', null),
  checadas: [checada('entrada', DIA, '09:00'), checada('salida', DIA, '19:00')] as any,
  comidas: [{ inicio: mx(DIA, '14:00'), fin: mx(DIA, '15:00') }],
  actividades: [],
};

describe('las horas que llegan a nómina son netas', () => {
  it('de nueve a siete con una hora de comida son nueve horas, no diez', () => {
    const { dias, totales } = calculaKpisPersona({ ...baseKpi, detalle: true });
    // Diez horas de jornada, menos la comida que sí se registró.
    expect(dias[0].minutosComida).toBe(60);
    expect(totales.minutosLaborados).toBe(9 * 60);
    // Y de esas nueve, una es tiempo extra sobre la jornada de ocho.
    expect(totales.minutosExtra).toBe(60);
  });

  it('el extra calculado no se paga solo: sin decisión, no es pagable', () => {
    const { totales } = calculaKpisPersona(baseKpi);
    expect(totales.minutosExtra).toBe(60);
    expect(totales.minutosExtraAprobados).toBe(0);
    expect(totales.minutosExtraPendientes).toBe(60);
    expect(totales.diasExtraPendientes).toBe(1);
    expect(minutosPagables(totales)).toBe(9 * 60);
  });

  it('aprobado por el jefe, sí entra', () => {
    const { totales } = calculaKpisPersona({
      ...baseKpi,
      aprobacionesExtra: [{ fecha: DIA, minutos: 60, estado: 'APROBADO' }],
    });
    expect(totales.minutosExtraAprobados).toBe(60);
    expect(totales.minutosExtraPendientes).toBe(0);
    expect(totales.diasExtraPendientes).toBe(0);
    expect(minutosPagables(totales)).toBe(10 * 60);
  });

  it('rechazado no se paga, y tampoco queda pendiente: ya se miró', () => {
    const { totales } = calculaKpisPersona({
      ...baseKpi,
      aprobacionesExtra: [{ fecha: DIA, minutos: 60, estado: 'RECHAZADO', nota: 'No lo autoricé' }],
    });
    expect(totales.minutosExtraAprobados).toBe(0);
    expect(totales.minutosExtraPendientes).toBe(0);
    expect(totales.diasExtraPendientes).toBe(0);
    expect(minutosPagables(totales)).toBe(9 * 60);
  });

  it('el jefe puede autorizar menos de lo que salió', () => {
    // «Se quedó una hora de más, le autorizo media.»
    const { totales, dias } = calculaKpisPersona({
      ...baseKpi,
      detalle: true,
      aprobacionesExtra: [{ fecha: DIA, minutos: 30, estado: 'APROBADO' }],
    });
    expect(totales.minutosExtra).toBe(60);
    expect(totales.minutosExtraAprobados).toBe(30);
    expect(minutosPagables(totales)).toBe(9 * 60 + 30);
    expect(dias[0]).toMatchObject({ extraEstado: 'APROBADO', minutosExtraAprobados: 30 });
  });

  it('una decisión que sigue en PENDIENTE no aprueba nada', () => {
    const { totales } = calculaKpisPersona({
      ...baseKpi,
      aprobacionesExtra: [{ fecha: DIA, minutos: 60, estado: 'PENDIENTE' }],
    });
    expect(totales.minutosExtraAprobados).toBe(0);
    expect(minutosPagables(totales)).toBe(9 * 60);
  });
});

describe('la fila de pre-nómina', () => {
  const entrada = (over: Partial<EntradaPreNomina['totales']> = {}): EntradaPreNomina => ({
    userId: 3,
    nombre: 'Ana Pérez',
    puesto: 'Técnica',
    numeroEmpleado: 'NX-014',
    horario: 'Oficina · entra 09:00',
    totales: {
      diasConJornada: 5,
      diasSinChecada: 0,
      faltasJustificadas: 0,
      retardos: 1,
      minutosTarde: 20,
      minutosLaborados: 2_400,
      minutosProductivos: 1_800,
      minutosInactivos: 600,
      productividadPct: 75,
      minutosExtra: 120,
      minutosExtraAprobados: 120,
      minutosExtraPendientes: 0,
      diasExtraPendientes: 0,
      cierresAutomaticos: 0,
      jornadasSinSalida: 0,
      ...over,
    },
    pagos: [{ amount: 4_500 }],
  });

  it('lleva las horas, lo aprobado y lo ya capturado', () => {
    const f = filaPreNomina(entrada());
    expect(f).toMatchObject({
      numeroEmpleado: 'NX-014',
      minutosLaborados: 2_400,
      minutosExtraCalculados: 120,
      minutosExtraAprobados: 120,
      montoCapturado: 4_500,
      pagos: 1,
    });
    expect(f.avisos).toEqual([]);
  });

  it('avisa de lo que hay que revisar antes de pagar, y dice cuántas horas están en juego', () => {
    const f = filaPreNomina(
      entrada({
        minutosExtraAprobados: 0,
        minutosExtraPendientes: 120,
        diasExtraPendientes: 2,
        jornadasSinSalida: 1,
        cierresAutomaticos: 1,
        diasSinChecada: 1,
      }),
    );
    expect(f.avisos).toHaveLength(4);
    expect(f.avisos[0]).toBe('2 día(s) con tiempo extra sin aprobar (2 h no se pagan)');
    expect(f.avisos[1]).toMatch(/sin salida registrada/);
    expect(f.avisos[2]).toMatch(/cierre automático/);
    expect(f.avisos[3]).toMatch(/sin checar/);
  });

  it('los avisos salen siempre en el mismo orden: dos exportaciones se pueden comparar', () => {
    const t = entrada({ diasSinChecada: 1, diasExtraPendientes: 1, minutosExtraPendientes: 60 }).totales;
    expect(avisosDeFila(t)).toEqual(avisosDeFila({ ...t }));
  });

  it('el resumen suma lo de todos y cuenta a quién hay que mirarle algo', () => {
    const limpia = filaPreNomina(entrada());
    const conPendiente = filaPreNomina(
      entrada({ minutosExtraAprobados: 0, minutosExtraPendientes: 90, diasExtraPendientes: 1 }),
    );
    const r = resumenPreNomina([limpia, conPendiente]);
    expect(r).toMatchObject({
      personas: 2,
      minutosLaborados: 4_800,
      minutosExtraAprobados: 120,
      minutosExtraPendientes: 90,
      conAvisos: 1,
      montoCapturado: 9_000,
    });
  });
});

describe('horas', () => {
  it('se redondea a dos decimales, una sola vez', () => {
    expect(horas(90)).toBe(1.5);
    expect(horas(2_400)).toBe(40);
    expect(horas(100)).toBe(1.67);
  });
});
