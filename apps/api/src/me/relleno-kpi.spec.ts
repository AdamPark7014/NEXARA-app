import { MOTIVO_RELLENO } from '../activities/rellenar-tiempos.js';
import { tiemposDto } from '../activities/actividad-tiempos.js';
import { estimadoParaKpi, minutosPlanDe } from './pizarra-kpi.js';

/**
 * El tiempo estimado que se rellenó el 29-10 en lo ya entregado (mediana de su tipo) no es un plan:
 * ni el desempeño ni el detalle lo usan, así que esas actividades se miden como antes.
 */
describe('tiempo rellenado tras la entrega', () => {
  it('el desempeño no lo toma como plan; el de siempre sí', () => {
    expect(estimadoParaKpi({ tiempoEstimadoMin: 240, estandarCambiadoMotivo: MOTIVO_RELLENO })).toBeNull();
    expect(estimadoParaKpi({ tiempoEstimadoMin: 240, estandarCambiadoMotivo: 'El cliente pidió más cámaras' })).toBe(240);
    expect(estimadoParaKpi({ tiempoEstimadoMin: 240 })).toBe(240);
    expect(minutosPlanDe(null, estimadoParaKpi({ tiempoEstimadoMin: 240, estandarCambiadoMotivo: MOTIVO_RELLENO }))).toBeNull();
    // Las horas de la persona siguen mandando.
    expect(minutosPlanDe(2, estimadoParaKpi({ tiempoEstimadoMin: 240, estandarCambiadoMotivo: MOTIVO_RELLENO }))).toBe(120);
  });

  it('el detalle no la enseña «excedida» contra un plan que nadie puso', () => {
    const ahora = new Date('2026-10-29T20:00:00Z');
    const fila = { inicioRealAt: new Date('2026-10-29T15:00:00Z'), finRealAt: new Date('2026-10-29T19:00:00Z') };
    const relleno = tiemposDto(fila, { estatus: 'Por Validar', tiempoEstimadoMin: 60, estandarCambiadoMotivo: MOTIVO_RELLENO }, ahora);
    expect(relleno.minutosPlan).toBeNull();
    expect(relleno.excedida).toBe(false);
    const normal = tiemposDto(fila, { estatus: 'Por Validar', tiempoEstimadoMin: 60 }, ahora);
    expect(normal.minutosPlan).toBe(60);
    expect(normal.excedida).toBe(true);
  });
});
