import { armarResumenCeo, datosCeoVacios, type DatosCeo } from './ceo-brief.js';

const FECHA = '2026-09-28';
const con = (parcial: Partial<DatosCeo>): DatosCeo => ({ ...datosCeoVacios(), ...parcial });

describe('armarResumenCeo', () => {
  it('sin pendientes: «todo al día» y marcado vacío (no se manda aviso)', () => {
    const r = armarResumenCeo(datosCeoVacios(), FECHA);
    expect(r.vacio).toBe(true);
    expect(r.titulo).toBe('Todo al día');
    expect(r.items).toEqual([]);
  });

  it('solo aparece lo que no es cero, en el orden de importancia del CEO', () => {
    const r = armarResumenCeo(
      con({
        porAprobar: { cantidad: 3, monto: 148250, masAntiguaDias: 1, masGrandes: [] },
        cobranza: { vencidas: 2, monto: 92400, diasMasAtrasada: 12 },
        comprasAtrasadas: 1,
      }),
      FECHA,
    );
    expect(r.vacio).toBe(false);
    expect(r.items.map((i) => i.clave)).toEqual(['aprobaciones', 'cobranza', 'compras']);
    expect(r.titulo).toBe('Tu día: 3 por aprobar · 2 facturas vencidas · 1 OC atrasada');
    expect(r.items[0].texto).toMatch(/^3 solicitudes por aprobar \(\$148,250\)$/);
    expect(r.items[0].url).toBe('/erp/approvals');
    expect(r.prioridad).toBe('normal');
  });

  it('prioridad alta: una aprobación de 3+ días o una factura de 30+ días', () => {
    expect(
      armarResumenCeo(con({ porAprobar: { cantidad: 1, monto: 0, masAntiguaDias: 4, masGrandes: [] } }), FECHA),
    ).toMatchObject({ prioridad: 'alta' });
    expect(
      armarResumenCeo(con({ cobranza: { vencidas: 1, monto: 5000, diasMasAtrasada: 45 } }), FECHA),
    ).toMatchObject({ prioridad: 'alta' });
    expect(
      armarResumenCeo(con({ cobranza: { vencidas: 1, monto: 5000, diasMasAtrasada: 5 } }), FECHA),
    ).toMatchObject({ prioridad: 'normal' });
  });

  it('singular y plural concuerdan', () => {
    const uno = armarResumenCeo(
      con({ cobranza: { vencidas: 1, monto: 1000, diasMasAtrasada: 1 }, cotizaciones: { porVencer: 1, monto: 0, dias: 3 } }),
      FECHA,
    );
    expect(uno.items[0].texto).toBe('1 factura vencida por cobrar ($1,000), la más atrasada lleva 1 día');
    expect(uno.items[1].texto).toBe('1 cotización vence en 3 días');
  });

  it('aprobaciones sin importe conocido no inventan un monto', () => {
    const r = armarResumenCeo(con({ porAprobar: { cantidad: 2, monto: 0, masAntiguaDias: 0, masGrandes: [] } }), FECHA);
    expect(r.items[0].texto).toBe('2 solicitudes por aprobar');
  });

  it('operación junta atrasadas y por validar en un solo renglón', () => {
    const r = armarResumenCeo(con({ operacion: { actividadesAtrasadas: 4, porValidar: 2 } }), FECHA);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].texto).toBe('4 actividades atrasadas y 2 trabajos por validar');
    expect(r.titulo).toBe('Tu día: hay pendientes en operación');
  });

  it('nómina: avisa cuando la quincena ya cerró y, si no, solo cuando el corte está a 2 días o menos', () => {
    const cerrada = armarResumenCeo(
      con({ nomina: { listaParaRevisar: { etiqueta: '1.ª quincena de septiembre de 2026 (1–15)', desde: '2026-09-01', hasta: '2026-09-15' }, proximoCorte: null } }),
      FECHA,
    );
    expect(cerrada.items[0]).toMatchObject({ clave: 'nomina', url: '/erp/finance/prenomina' });
    expect(cerrada.items[0].texto).toContain('ya cerró');
    expect(cerrada.titulo).toContain('pre-nómina lista');

    const cerca = armarResumenCeo(
      con({ nomina: { listaParaRevisar: null, proximoCorte: { corte: '2026-09-30', dias: 2, etiqueta: '2.ª quincena' } } }),
      FECHA,
    );
    expect(cerca.items[0]).toMatchObject({ clave: 'nomina', tono: 'info' });
    expect(cerca.items[0].texto).toContain('en 2 días');

    const lejos = armarResumenCeo(
      con({ nomina: { listaParaRevisar: null, proximoCorte: { corte: '2026-09-30', dias: 9, etiqueta: '2.ª quincena' } } }),
      FECHA,
    );
    expect(lejos.vacio).toBe(true);
  });

  it('el mensaje se corta a 400 caracteres', () => {
    const r = armarResumenCeo(
      con({
        porAprobar: { cantidad: 99, monto: 1e9, masAntiguaDias: 90, masGrandes: [] },
        cobranza: { vencidas: 99, monto: 1e9, diasMasAtrasada: 400 },
        comprasAtrasadas: 99,
        cotizaciones: { porVencer: 99, monto: 1e9, dias: 3 },
        operacion: { actividadesAtrasadas: 99, porValidar: 99 },
        nomina: { listaParaRevisar: { etiqueta: 'x'.repeat(200), desde: 'a', hasta: 'b' }, proximoCorte: null },
      }),
      FECHA,
    );
    expect(r.mensaje.length).toBeLessThanOrEqual(400);
    expect(r.items.length).toBe(6);
  });
});
