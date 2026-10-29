import { armarBalance, armarEstadoResultados, rangosPeriodo, resultadoDe, type SaldoCuenta } from './estados-financieros.js';

let id = 0;
const s = (codigo: string, tipo: string, debe: number, haber: number, agrupador: string | null = codigo): SaldoCuenta => ({
  cuentaId: ++id,
  codigo,
  nombre: `Cuenta ${codigo}`,
  tipo,
  agrupador,
  debe,
  haber,
});

describe('armarEstadoResultados', () => {
  // Números del mockup (octubre vs septiembre), reducidos a una cuenta por renglón.
  const octubre = [
    s('401.01', 'REVENUE', 0, 412300),
    s('501.01', 'EXPENSE', 206000, 0),
    s('601.01', 'EXPENSE', 112100, 0),
    s('603.01', 'EXPENSE', 1240, 0),
    s('404.01', 'REVENUE', 0, 380),
    s('604.01', 'EXPENSE', 28000, 0),
  ];
  const septiembre = [
    s('401.01', 'REVENUE', 0, 372400),
    s('501.01', 'EXPENSE', 188400, 0),
    s('601.01', 'EXPENSE', 107000, 0),
    s('603.01', 'EXPENSE', 1180, 0),
    s('404.01', 'REVENUE', 0, 260),
    s('604.01', 'EXPENSE', 22800, 0),
  ];

  it('arma utilidad bruta, de operación y neta', () => {
    const r = armarEstadoResultados(octubre, septiembre);
    expect(r.ingresos.actual).toBe(412300);
    expect(r.utilidadBruta.actual).toBe(206300);
    expect(r.utilidadOperacion.actual).toBe(94200);
    expect(r.utilidadNeta.actual).toBe(65340);
    expect(r.utilidadNeta.anterior).toBe(53280);
    expect(r.utilidadNeta.pctIngresos).toBe(15.8);
    expect(r.utilidadNeta.variacionPct).toBe(22.6);
  });

  it('en financieros los gastos van en negativo y los productos en positivo', () => {
    const fin = armarEstadoResultados(octubre, septiembre).secciones.find((x) => x.clave === 'financieros')!;
    expect(fin.filas.map((f) => [f.codigo, f.actual])).toEqual([
      ['404.01', 380],
      ['603.01', -1240],
      ['604.01', -28000],
    ]);
  });

  it('una cuenta que solo tuvo movimiento el mes anterior también sale', () => {
    const r = armarEstadoResultados([s('401.01', 'REVENUE', 0, 100)], [s('401.01', 'REVENUE', 0, 80), s('601.04', 'EXPENSE', 50, 0)]);
    const gastos = r.secciones.find((x) => x.clave === 'gastos')!;
    expect(gastos.filas[0]).toMatchObject({ codigo: '601.04', actual: 0, anterior: 50 });
  });

  it('sin movimientos todo queda en cero, sin dividir entre cero', () => {
    const r = armarEstadoResultados([], []);
    expect(r.utilidadNeta).toMatchObject({ actual: 0, pctIngresos: null, variacionPct: null });
  });
});

describe('armarBalance', () => {
  it('cuadra al incluir el resultado del ejercicio en el capital', () => {
    const saldos = [
      s('102.01', 'ASSET', 500, 0),
      s('105.01', 'ASSET', 300, 0),
      s('115.01', 'ASSET', 100, 0),
      s('124.01', 'ASSET', 400, 0),
      s('173.01', 'ASSET', 0, 50),
      s('201.01', 'LIABILITY', 0, 250),
      s('301.01', 'EQUITY', 0, 700),
    ];
    // activo 1,250 = pasivo 250 + capital 700 + resultado 300
    const b = armarBalance(saldos, 300, 0, 600, 31);
    expect(b.activo.total).toBe(1250);
    expect(b.pasivo.total).toBe(250);
    expect(b.capital.total).toBe(1000);
    expect(b.cuadra).toBe(true);
    expect(b.activo.secciones.map((x) => x.titulo)).toEqual(['Circulante', 'No circulante']);
    expect(b.activo.secciones[1].filas.find((f) => f.nombre === 'Cuenta 173.01')?.saldo).toBe(-50);
    expect(b.indicadores).toEqual({ liquidez: 3.6, pruebaAcida: 3.2, diasCobro: 16, endeudamiento: 20 });
  });

  it('si no cuadra lo dice con la diferencia', () => {
    const b = armarBalance([s('102.01', 'ASSET', 100, 0)], 0, 0, 0, 30);
    expect(b.cuadra).toBe(false);
    expect(b.diferencia).toBe(100);
    expect(b.indicadores.liquidez).toBeNull();
  });

  it('resultadoDe suma ingresos menos costos y gastos', () => {
    expect(resultadoDe([s('401.01', 'REVENUE', 0, 1000), s('601.02', 'EXPENSE', 300, 0)])).toBe(700);
  });
});

describe('rangosPeriodo', () => {
  it('mes y su anterior', () => {
    const r = rangosPeriodo('mes', '2026-10', '2026-10-29');
    expect(r.actual).toEqual({ etiqueta: 'Octubre 2026', from: '2026-10-01', to: '2026-10-31' });
    expect(r.anterior.etiqueta).toBe('Septiembre 2026');
    expect(rangosPeriodo('mes', '2026-01', '2026-10-29').anterior.from).toBe('2025-12-01');
  });

  it('trimestre y año', () => {
    const t = rangosPeriodo('trimestre', '2026-11', '2026-10-29');
    expect(t.actual).toEqual({ etiqueta: 'Oct–dic 2026', from: '2026-10-01', to: '2026-12-31' });
    expect(t.anterior.from).toBe('2026-07-01');
    expect(rangosPeriodo('trimestre', '2026-02', '2026-10-29').anterior.from).toBe('2025-10-01');
    expect(rangosPeriodo('anio', '2026-10', '2026-10-29').actual).toEqual({ etiqueta: '2026', from: '2026-01-01', to: '2026-12-31' });
  });
});
