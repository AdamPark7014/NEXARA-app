import { scoreProducts } from './quote-scoring.js';

describe('quote-scoring', () => {
  const rows = [
    {
      id: 1,
      clave: 'A',
      numParte: 'A',
      nombre: 'Cam barata',
      modelo: 'A',
      marca: 'X',
      categoria: 'Video Vigilancia',
      subcategoria: 'Camaras',
      descripcion_corta: null,
      imagen: null,
      precio: 100,
      moneda: 'MXN',
      tipoCambio: null,
      existencia: { PUE: 2 },
      protegido: false,
      sustituto: 'A',
      especificaciones: [],
      promociones: [],
    },
    {
      id: 2,
      clave: 'B',
      numParte: 'B',
      nombre: 'Cam stock',
      modelo: 'B',
      marca: 'Y',
      categoria: 'Video Vigilancia',
      subcategoria: 'Camaras',
      descripcion_corta: null,
      imagen: null,
      precio: 180,
      moneda: 'MXN',
      tipoCambio: null,
      existencia: { PUE: 50, DFA: 20 },
      protegido: false,
      sustituto: 'B',
      especificaciones: [],
      promociones: [{ name: 'promo' }],
    },
  ];

  it('marks BEST_PRICE and RECOMMENDED', () => {
    const scored = scoreProducts(rows, {
      mode: 'PRICE',
      targetMarginPercent: 30,
      preferredWarehouse: 'PUE',
    });
    expect(scored[0].badges).toContain('RECOMMENDED');
    expect(scored.find((s) => s.clave === 'A')?.badges).toContain('BEST_PRICE');
    expect(scored.find((s) => s.clave === 'B')?.badges).toContain('BEST_STOCK');
  });

  it('suggests sell price from target margin', () => {
    const scored = scoreProducts(rows, {
      mode: 'BALANCE',
      targetMarginPercent: 50,
      preferredWarehouse: 'PUE',
    });
    const a = scored.find((s) => s.clave === 'A')!;
    expect(a.costMxn).toBe(100);
    expect(a.sellPriceSuggested).toBe(200);
  });
});
