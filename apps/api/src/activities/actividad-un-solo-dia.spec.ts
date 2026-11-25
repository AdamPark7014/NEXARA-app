import {
  desglosarPorDias,
  esDiaCalendarioLaborable,
  etiquetaSerie,
  fechasLaborablesEnRango,
  MENSAJE_UN_SOLO_DIA,
  MINUTOS_JORNADA_NETOS,
  repartirCamposPorDia,
  validarUnSoloDia,
} from './actividad-un-solo-dia.js';

describe('validarUnSoloDia', () => {
  it('acepta periodo del mismo dia', () => {
    expect(validarUnSoloDia({ periodoInicio: '2026-11-20', periodoFin: '2026-11-20' })).toEqual({ ok: true });
  });
  it('rechaza periodo de varios dias', () => {
    expect(validarUnSoloDia({ periodoInicio: '2026-11-16', periodoFin: '2026-11-20' })).toEqual({ ok: false, error: MENSAJE_UN_SOLO_DIA });
  });
  it('pide los dos extremos del periodo', () => {
    expect(validarUnSoloDia({ periodoInicio: '2026-11-20' })).toEqual({ ok: false, error: 'El periodo necesita día de inicio y día de fin' });
  });
  it('rechaza fechaMaxima en otro dia que fechaInicio', () => {
    expect(validarUnSoloDia({ fechaInicio: '2026-11-20T10:00:00-06:00', fechaMaxima: '2026-11-21T18:00:00-06:00' })).toEqual({ ok: false, error: MENSAJE_UN_SOLO_DIA });
  });
  it('rechaza tiempo planeado mayor a la jornada', () => {
    expect(validarUnSoloDia({ tiempoEstimadoMin: MINUTOS_JORNADA_NETOS + 1 })).toEqual({ ok: false, error: MENSAJE_UN_SOLO_DIA });
  });
  it('sin fechas ni tiempo pasa', () => {
    expect(validarUnSoloDia({})).toEqual({ ok: true });
  });
});

describe('esDiaCalendarioLaborable', () => {
  it('lunes si; sabado y domingo no', () => {
    expect(esDiaCalendarioLaborable('2026-11-16')).toBe(true);
    expect(esDiaCalendarioLaborable('2026-11-21')).toBe(false);
    expect(esDiaCalendarioLaborable('2026-11-22')).toBe(false);
  });
});

describe('desglosarPorDias', () => {
  it('5 dias desde viernes saltando fin de semana', () => {
    const dias = desglosarPorDias({ trabajo: 'Instalación IPADE', desde: '2026-11-20', diasLaborables: 5, cantidadTotal: 50, unidad: 'cámaras', tiempoTotalMin: 38 * 60 });
    expect(dias.map((d) => d.fecha)).toEqual(['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
    expect(dias.map((d) => d.cantidad)).toEqual([10, 10, 10, 10, 10]);
    expect(dias[0]).toMatchObject({ titulo: 'Instalación IPADE · día 1 de 5', alcance: '10 cámaras hoy', dia: 1, total: 5 });
    expect(dias.every((d) => d.tiempoEstimadoMin <= MINUTOS_JORNADA_NETOS)).toBe(true);
    expect(dias.reduce((s, d) => s + d.tiempoEstimadoMin, 0)).toBe(Math.min(38 * 60, MINUTOS_JORNADA_NETOS * 5));
  });
  it('el resto de la cantidad queda en el ultimo dia', () => {
    const dias = desglosarPorDias({ trabajo: 'Instalación', desde: '2026-11-16', diasLaborables: 5, cantidadTotal: 52, unidad: 'cámaras' });
    expect(dias.map((d) => d.cantidad)).toEqual([10, 10, 10, 10, 12]);
  });
});

describe('etiquetaSerie', () => {
  it('arma Dia N de M', () => {
    expect(etiquetaSerie(3, 5)).toBe('Día 3 de 5');
  });
});

describe('fechasLaborablesEnRango', () => {
  it('salta fin de semana', () => {
    expect(fechasLaborablesEnRango('2026-11-20', '2026-11-26')).toEqual([
      '2026-11-20',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
    ]);
  });
});

describe('repartirCamposPorDia', () => {
  it('reparte Camara 1..50 en 5 dias de 10', () => {
    const campos = Array.from({ length: 50 }, (_, i) => ({ nombre: `Cámara ${i + 1}` }));
    const grupos = repartirCamposPorDia(campos, [10, 10, 10, 10, 10]);
    expect(grupos.map((g) => g.length)).toEqual([10, 10, 10, 10, 10]);
    expect(grupos[0]![0]!.nombre).toBe('Cámara 1');
    expect(grupos[4]![0]!.nombre).toBe('Cámara 41');
  });
});
