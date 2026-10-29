import { aTiempo, planDeRelleno, type FilaAbierta } from './rellenar-tiempos.js';
import { estandarDeLectura } from './tiempo-entrega.js';

const fila = (extra: Partial<FilaAbierta> = {}): FilaAbierta => ({
  id: 1,
  anNumber: 'AN-0001',
  titulo: 'Apoyo Biblioteca Tlaxcala',
  estatus: 'Por Validar',
  creadoPorId: 7,
  responsableId: 7,
  tiempoEstimadoMin: null,
  tiempoEstandarMin: null,
  complejidad: null,
  complejidadSugerida: null,
  unidades: null,
  fechaInicio: new Date('2026-10-28T16:00:00Z'),
  fechaAsignacion: new Date('2026-10-28T15:00:00Z'),
  fechaEntregaEsperada: null,
  fechaMaxima: null,
  periodoFin: null,
  entregadaAt: null,
  ...extra,
});

describe('relleno de las abiertas sin tiempo ni entrega', () => {
  const est = estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación' }, { cantidad: 2 });

  it('llena estándar, tiempo y entrega (fin del día de su inicio)', () => {
    const { cambios, nota } = planDeRelleno(fila(), est);
    expect(cambios).toMatchObject({ tiempoEstandarMin: 40, tiempoEstimadoMin: 40, unidades: { clave: 'reportes', cantidad: 2 } });
    // Fin del 28-10 en CDMX.
    expect((cambios.fechaEntregaEsperada as Date).toISOString()).toBe('2026-10-29T05:59:59.999Z');
    expect(cambios.fechaMaxima).toEqual(cambios.fechaEntregaEsperada);
    expect(nota).toBeNull();
  });

  it('si ya se entregó después de ese día, el fin del día en que se entregó: no se vuelve «tarde»', () => {
    const entregadaAt = new Date('2026-10-29T20:00:00Z');
    const { cambios, nota } = planDeRelleno(fila({ entregadaAt }), est);
    expect((cambios.fechaEntregaEsperada as Date).toISOString()).toBe('2026-10-30T05:59:59.999Z');
    expect(aTiempo(entregadaAt, cambios.fechaEntregaEsperada as Date)).toBe(true);
    expect(nota).toMatch(/no cambia su «a tiempo»/);
  });

  it('idempotente: lo que ya tiene no se toca, y una completa no cambia nada', () => {
    const completa = fila({
      tiempoEstandarMin: 60,
      tiempoEstimadoMin: 90,
      fechaEntregaEsperada: new Date('2026-10-28T23:00:00Z'),
      fechaMaxima: new Date('2026-10-28T23:00:00Z'),
    });
    expect(planDeRelleno(completa, est).cambios).toEqual({});
    // Solo le faltaba el tiempo: el estándar que ya tenía.
    expect(planDeRelleno({ ...completa, tiempoEstimadoMin: null }, null).cambios).toEqual({ tiempoEstimadoMin: 60 });
    // Solo le faltaba una de las fechas: se copia.
    const soloMax = planDeRelleno({ ...completa, fechaEntregaEsperada: null }, null).cambios;
    expect(soloMax).toEqual({ fechaEntregaEsperada: completa.fechaMaxima });
  });

  it('con periodo la entrega la pone el periodo; sin inicio, desde la asignación', () => {
    expect(planDeRelleno(fila({ periodoFin: new Date('2026-10-31T00:00:00Z') }), est).cambios.fechaEntregaEsperada).toBeUndefined();
    const sinInicio = planDeRelleno(fila({ fechaInicio: null }), est).cambios;
    expect((sinInicio.fechaEntregaEsperada as Date).toISOString()).toBe('2026-10-29T05:59:59.999Z');
  });

  it('«a tiempo»: sin límite cuenta a tiempo; sin entregar no se mide', () => {
    expect(aTiempo(new Date(), null)).toBe(true);
    expect(aTiempo(null, new Date())).toBeNull();
    expect(aTiempo(new Date('2026-10-29T10:00:00Z'), new Date('2026-10-29T09:00:00Z'))).toBe(false);
  });
});
