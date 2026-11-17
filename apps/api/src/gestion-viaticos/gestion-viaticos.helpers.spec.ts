import {
  diaMexico,
  esContadora,
  esGestora,
  normalizarTipo,
  ordenarBandeja,
  plazoFacturacionPorOmision,
  sumaTicketsParaCosto,
  venceHoy,
  type FilaBandeja,
} from './gestion-viaticos.helpers.js';

describe('gestion-viaticos.helpers', () => {
  it('normaliza tipos y alias', () => {
    expect(normalizarTipo('gasolina')).toBe('GASOLINA');
    expect(normalizarTipo('COMBUSTIBLE')).toBe('GASOLINA');
    expect(normalizarTipo('alimentacion')).toBe('COMIDA');
    expect(normalizarTipo('raro')).toBe('OTRO');
  });

  it('gasolina vence el mismo día; comida no pone plazo', () => {
    const fecha = new Date('2026-11-16T18:30:00-06:00');
    const plazo = plazoFacturacionPorOmision('GASOLINA', fecha, true);
    expect(plazo).not.toBeNull();
    // El plazo se guarda como DATE civil (YYYY-MM-DDT00:00Z); se compara por ISO, no por zona.
    expect(plazo!.toISOString().slice(0, 10)).toBe(diaMexico(fecha));
    expect(plazoFacturacionPorOmision('COMIDA', fecha, true)).toBeNull();
    expect(plazoFacturacionPorOmision('GASOLINA', fecha, false)).toBeNull();
  });

  it('venceHoy compara día civil', () => {
    expect(venceHoy('2026-11-16T00:00:00.000Z', '2026-11-16')).toBe(true);
    expect(venceHoy('2026-11-15T00:00:00.000Z', '2026-11-16')).toBe(false);
    expect(venceHoy(null, '2026-11-16')).toBe(false);
  });

  it('ordena por urgencia y luego por antigüedad', () => {
    const filas: FilaBandeja[] = [
      { clave: 'v1', urgencia: 'viatico', titulo: 'v', resumen: '', accion: '', href: '', entidadId: 1, createdAt: '2026-11-16T12:00:00Z' },
      { clave: 't1', urgencia: 'ticket_hoy', titulo: 't', resumen: '', accion: '', href: '', entidadId: 2, createdAt: '2026-11-16T15:00:00Z' },
      { clave: 'c1', urgencia: 'comprobacion', titulo: 'c', resumen: '', accion: '', href: '', entidadId: 3, createdAt: '2026-11-16T10:00:00Z' },
    ];
    expect(ordenarBandeja(filas).map((f) => f.clave)).toEqual(['t1', 'c1', 'v1']);
  });

  it('sumaTicketsParaCosto ignora pendientes y rechazados', () => {
    expect(
      sumaTicketsParaCosto([
        { estado: 'PENDIENTE', monto: 100 },
        { estado: 'APROBADO', monto: 50.5 },
        { estado: 'FACTURADO', monto: 20 },
        { estado: 'RECHAZADO', monto: 999 },
        { estado: 'NO_FACTURABLE', monto: 10 },
      ]),
    ).toBe(80.5);
  });

  it('roles gestora y contadora', () => {
    expect(esGestora('coord_admin')).toBe(true);
    expect(esGestora('ing_campo')).toBe(false);
    expect(esGestora('dir_admin')).toBe(false);
    expect(esContadora({ roleKey: 'ceo' })).toBe(false);
    expect(esContadora({ roleKey: 'administrativo', email: 'finanzas@nexara.com.mx' })).toBe(true);
    expect(esContadora({ roleKey: 'administrativo', puesto: 'Contadora' })).toBe(true);
    expect(esContadora({ roleKey: 'administrativo', puesto: 'Recepcion' })).toBe(false);
  });
});
