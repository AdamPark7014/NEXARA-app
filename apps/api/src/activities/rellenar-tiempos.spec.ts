import { aTiempo, MOTIVO_RELLENO, planDeRelleno, tipoPorTitulo, yaEntregada, type FilaAbierta } from './rellenar-tiempos.js';
import { estandarDeLectura } from './tiempo-entrega.js';

const fila = (extra: Partial<FilaAbierta> = {}): FilaAbierta => ({
  id: 1,
  anNumber: 'AN-0001',
  titulo: 'Reporte de la semana',
  estatus: 'En Proceso',
  coreKind: 'tarea',
  ticketTypeCustom: 'Reporte / documentación',
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

describe('relleno de las abiertas sin tiempo ni entrega (opción B del 29-10)', () => {
  const est = estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación' }, { cantidad: 2 });

  it('en proceso: estándar, tiempo y entrega (fin del día de su inicio) desde el título', () => {
    const { cambios, nota } = planDeRelleno(fila(), est);
    expect(cambios).toMatchObject({ tiempoEstandarMin: 40, tiempoEstimadoMin: 40, unidades: { clave: 'reportes', cantidad: 2 } });
    expect(cambios.estandarCambiadoMotivo).toBeUndefined();
    // Fin del 28-10 en CDMX.
    expect((cambios.fechaEntregaEsperada as Date).toISOString()).toBe('2026-10-29T05:59:59.999Z');
    expect(cambios.fechaMaxima).toEqual(cambios.fechaEntregaEsperada);
    expect(nota).toBeNull();
  });

  it('en proceso con el tipo equivocado: el título manda (tubería no es «Preparación de equipo»)', () => {
    const tuberia = fila({ titulo: 'montaje de registro', ticketTypeCustom: 'Preparación de equipo' });
    const tipo = tipoPorTitulo(tuberia);
    expect(tipo).toEqual({ coreKind: 'tarea', ticketTypeCustom: 'Cableado y canalización' });
    const estCorregido = estandarDeLectura({ ...tuberia, ...tipo }, {});
    const { cambios, nota } = planDeRelleno(tuberia, estCorregido, { tipoCorregido: tipo });
    expect(cambios).toMatchObject({ ticketTypeCustom: 'Cableado y canalización', tiempoEstandarMin: 45, tiempoEstimadoMin: 45 });
    expect(nota).toMatch(/tipo corregido por el título: Cableado y canalización \(era Preparación de equipo\)/);
    // Facturas guardadas como comercial: son facturación.
    expect(tipoPorTitulo({ titulo: 'Elaboración de facturas del mes', coreKind: 'comercial', ticketTypeCustom: 'COMERCIAL' })).toEqual({
      coreKind: 'tarea',
      ticketTypeCustom: 'Facturación y contabilidad',
    });
    // Lo que cuadra, lo que no se sabe y los servicios no se tocan.
    expect(tipoPorTitulo({ titulo: 'Cableado de 4 nodos', coreKind: 'tarea', ticketTypeCustom: 'Cableado y canalización' })).toBeNull();
    expect(tipoPorTitulo({ titulo: 'Apoyo Biblioteca Tlaxcala', coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación' })).toBeNull();
    expect(tipoPorTitulo({ titulo: 'Revisar cableado del DVR', coreKind: 'servicio', ticketType: 'CORRECTIVO' })).toBeNull();
  });

  it('entregada: sin estándar; tiempo = mediana real de su tipo y marcado como relleno', () => {
    const entregada = fila({ estatus: 'Por Validar', entregadaAt: new Date('2026-10-28T23:00:00Z'), ticketTypeCustom: 'Preparación de equipo' });
    expect(yaEntregada(entregada)).toBe(true);
    const { cambios, nota } = planDeRelleno(entregada, est, { tipicoMin: 242 });
    expect(cambios).toMatchObject({ tiempoEstimadoMin: 240, estandarCambiadoMotivo: MOTIVO_RELLENO });
    expect(cambios.tiempoEstandarMin).toBeUndefined();
    expect(cambios.estandarDesglose).toBeUndefined();
    // Ni el tipo se le cambia: ya se entregó.
    expect(cambios.ticketTypeCustom).toBeUndefined();
    expect(nota).toMatch(/mediana real de su tipo/);
    // Sin mediana del tipo: el del título, igual sin estándar.
    expect(planDeRelleno(entregada, est, { tipicoMin: null }).cambios).toMatchObject({ tiempoEstimadoMin: 40, estandarCambiadoMotivo: MOTIVO_RELLENO });
    // Ya tenía tiempo: no se marca ni se toca.
    expect(planDeRelleno({ ...entregada, tiempoEstimadoMin: 90 }, est, { tipicoMin: 242 }).cambios.estandarCambiadoMotivo).toBeUndefined();
  });

  it('si ya se entregó después de ese día, el fin del día en que se entregó: no se vuelve «tarde»', () => {
    const entregadaAt = new Date('2026-10-29T20:00:00Z');
    const { cambios, nota } = planDeRelleno(fila({ estatus: 'Por Validar', entregadaAt }), est, { tipicoMin: 60 });
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
    expect(planDeRelleno({ ...completa, tiempoEstimadoMin: null }, null).cambios).toEqual({ tiempoEstimadoMin: 60 });
    expect(planDeRelleno({ ...completa, fechaEntregaEsperada: null }, null).cambios).toEqual({ fechaEntregaEsperada: completa.fechaMaxima });
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
