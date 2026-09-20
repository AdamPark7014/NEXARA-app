import {
  LEAD_TIME_POR_DEFECTO_DIAS,
  STOCK_SEGURIDAD_POR_DEFECTO_DIAS,
  calcularMinMax,
  consumoDiario,
  redondearACompra,
  sugerenciaReabastecimiento,
  type MovimientoConsumo,
} from './reabastecimiento.js';

const HOY = new Date('2026-09-19T12:00:00.000Z');

/** Salidas repartidas: `cantidad` cada `cadaDias` hacia atrás desde hoy. */
function salidas(cantidad: number, veces: number, cadaDias: number): MovimientoConsumo[] {
  return Array.from({ length: veces }, (_, i) => ({
    quantity: cantidad,
    createdAt: new Date(HOY.getTime() - (i + 1) * cadaDias * 86_400_000),
  }));
}

describe('consumoDiario', () => {
  it('promedia sobre la ventana completa cuando hay historia larga', () => {
    // 90 salidas de 10 piezas, una por día → 900 en 90 días = 10/día.
    const res = consumoDiario(salidas(10, 90, 1), { hasta: HOY });
    expect(res.total).toBe(900);
    expect(res.consumoDiario).toBe(10);
    expect(res.diasConsiderados).toBe(90);
    expect(res.historiaCorta).toBe(false);
  });

  it('descarta lo que quedó fuera de la ventana', () => {
    const dentro: MovimientoConsumo = { quantity: 5, createdAt: new Date('2026-08-20T00:00:00.000Z') };
    const fuera: MovimientoConsumo = { quantity: 999, createdAt: new Date('2025-01-01T00:00:00.000Z') };
    const res = consumoDiario([dentro, fuera], { hasta: HOY });
    expect(res.total).toBe(5);
  });

  it('con producto nuevo divide entre los días que sí existen y lo marca', () => {
    // Solo 10 días de historia: 100 piezas en 10 días = 10/día, no 100/90.
    const res = consumoDiario(salidas(10, 10, 1), { hasta: HOY });
    expect(res.diasConsiderados).toBe(10);
    expect(res.consumoDiario).toBe(10);
    expect(res.historiaCorta).toBe(true);
  });

  it('ignora cantidades cero o basura', () => {
    const res = consumoDiario(
      [
        { quantity: 0, createdAt: new Date('2026-09-10T00:00:00.000Z') },
        { quantity: Number.NaN, createdAt: new Date('2026-09-10T00:00:00.000Z') },
        { quantity: 4, createdAt: new Date('2026-09-10T00:00:00.000Z') },
      ],
      { hasta: HOY },
    );
    expect(res.total).toBe(4);
  });

  it('sin movimientos no hay consumo', () => {
    expect(consumoDiario([], { hasta: HOY }).consumoDiario).toBe(0);
  });
});

describe('redondearACompra', () => {
  it('sube al siguiente múltiplo del empaque', () => {
    expect(redondearACompra(101, { piezasPorEmpaque: 100 })).toBe(200);
    expect(redondearACompra(100, { piezasPorEmpaque: 100 })).toBe(100);
  });

  it('nunca pide menos que la compra mínima', () => {
    expect(redondearACompra(3, { compraMinima: 50 })).toBe(50);
  });

  it('aplica primero la compra mínima y luego el empaque', () => {
    // Mínimo 120 con cajas de 100 → 200, no 100.
    expect(redondearACompra(10, { compraMinima: 120, piezasPorEmpaque: 100 })).toBe(200);
  });

  it('cero se queda en cero: no se pide por pedir', () => {
    expect(redondearACompra(0, { compraMinima: 50, piezasPorEmpaque: 100 })).toBe(0);
  });
});

describe('calcularMinMax', () => {
  it('mínimo = consumo × (lead time + seguridad) y máximo suma un lote', () => {
    const res = calcularMinMax({
      movimientos: salidas(10, 90, 1), // 10/día
      hasta: HOY,
      leadTimeDias: 10,
      stockSeguridadDias: 5,
      piezasPorEmpaque: 100,
    });
    expect(res.consumoDiario).toBe(10);
    expect(res.min).toBe(150); // 10 × (10 + 5)
    expect(res.lote).toBe(100); // 10 × 10 = 100, ya es múltiplo de caja
    expect(res.max).toBe(250);
  });

  it('el lote respeta empaque y compra mínima', () => {
    const res = calcularMinMax({
      movimientos: salidas(10, 90, 1),
      hasta: HOY,
      leadTimeDias: 3, // 30 piezas de lote «natural»
      stockSeguridadDias: 2,
      piezasPorEmpaque: 100,
      compraMinima: 50,
    });
    expect(res.min).toBe(50); // 10 × 5
    expect(res.lote).toBe(100); // 30 → mínimo 50 → sube a una caja de 100
    expect(res.max).toBe(150);
  });

  it('usa los valores por defecto cuando el producto no los trae', () => {
    const res = calcularMinMax({ movimientos: salidas(2, 90, 1), hasta: HOY });
    expect(res.leadTimeDias).toBe(LEAD_TIME_POR_DEFECTO_DIAS);
    expect(res.stockSeguridadDias).toBe(STOCK_SEGURIDAD_POR_DEFECTO_DIAS);
    expect(res.min).toBe(2 * (LEAD_TIME_POR_DEFECTO_DIAS + STOCK_SEGURIDAD_POR_DEFECTO_DIAS));
  });

  it('respeta un stock de seguridad de cero (no lo confunde con «sin dato»)', () => {
    const res = calcularMinMax({
      movimientos: salidas(10, 90, 1),
      hasta: HOY,
      leadTimeDias: 4,
      stockSeguridadDias: 0,
    });
    expect(res.stockSeguridadDias).toBe(0);
    expect(res.min).toBe(40);
  });

  it('sin consumo no inventa mínimos: eso es dead stock, no reabastecimiento', () => {
    const res = calcularMinMax({ movimientos: [], hasta: HOY, leadTimeDias: 10 });
    expect(res).toMatchObject({ consumoDiario: 0, min: 0, max: 0, lote: 0 });
  });
});

describe('sugerenciaReabastecimiento', () => {
  const producto = { piezasPorEmpaque: 100, compraMinima: 50 };

  it('pide cuando el disponible tocó el mínimo, y sube al empaque', () => {
    const res = sugerenciaReabastecimiento({
      ...producto,
      onHand: 150,
      min: 150,
      max: 250,
      consumoDiario: 10,
    });
    expect(res.reponer).toBe(true);
    expect(res.faltante).toBe(100);
    expect(res.sugerido).toBe(100);
    expect(res.diasDeCobertura).toBe(15);
  });

  it('descuenta lo apartado: material comprometido no es disponible', () => {
    const res = sugerenciaReabastecimiento({
      ...producto,
      onHand: 200,
      reservado: 60,
      min: 150,
      max: 250,
      consumoDiario: 10,
    });
    expect(res.disponible).toBe(140);
    expect(res.reponer).toBe(true);
    expect(res.faltante).toBe(110);
    expect(res.sugerido).toBe(200); // 110 → siguiente caja completa
  });

  it('por encima del mínimo no sugiere nada', () => {
    const res = sugerenciaReabastecimiento({ ...producto, onHand: 240, min: 150, max: 250 });
    expect(res.reponer).toBe(false);
    expect(res.sugerido).toBe(0);
  });

  it('sin mínimo calculado no alerta', () => {
    const res = sugerenciaReabastecimiento({ ...producto, onHand: 0, min: 0, max: 0 });
    expect(res.reponer).toBe(false);
  });

  it('en cero pide hasta el máximo', () => {
    const res = sugerenciaReabastecimiento({
      ...producto,
      onHand: 0,
      min: 150,
      max: 250,
      consumoDiario: 10,
    });
    expect(res.faltante).toBe(250);
    expect(res.sugerido).toBe(300);
    expect(res.diasDeCobertura).toBe(0);
  });
});
