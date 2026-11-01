import { calcularMatriz, explosionInsumos, type Recurso, type RenglonMatriz } from './matriz';

const catalogo = new Map<string, Recurso>(
  [
    { id: 'camara', tipo: 'MATERIAL', costo: 1850 },
    { id: 'cable', tipo: 'MATERIAL', costo: 9.5 },
    { id: 'accesorios', tipo: 'MATERIAL', costo: 120 },
    { id: 'instalador', tipo: 'MANO_OBRA', costo: 1000 },
    { id: 'ayudante', tipo: 'MANO_OBRA', costo: 640 },
    {
      id: 'cuadrilla',
      tipo: 'MANO_OBRA',
      renglones: [
        { recursoId: 'instalador', cantidad: 1 },
        { recursoId: 'ayudante', cantidad: 1 },
      ],
    },
    { id: 'herramienta', tipo: 'HERRAMIENTA' },
    { id: 'seguridad', tipo: 'HERRAMIENTA' },
    { id: 'camioneta', tipo: 'EQUIPO', costo: 7.31 },
    { id: 'escalera', tipo: 'EQUIPO', costo: 120 },
  ].map((r) => [r.id, r as Recurso]),
);

/** Cámara bala 4 MP instalada, con 4 cámaras por jornada. */
const camaraInstalada: RenglonMatriz[] = [
  { recursoId: 'camara', cantidad: 1 },
  { recursoId: 'cable', cantidad: 30, desperdicio: 0.05 },
  { recursoId: 'accesorios', cantidad: 1 },
  { recursoId: 'cuadrilla', cantidad: 1 / 4 },
  { recursoId: 'herramienta', cantidad: 0.03, porcentajeDe: 'MANO_OBRA' },
  { recursoId: 'seguridad', cantidad: 0.01, porcentajeDe: 'MANO_OBRA' },
  { recursoId: 'camioneta', cantidad: 60 / 4 },
  { recursoId: 'escalera', cantidad: 1 / 4 },
];

describe('matriz (caso hecho a mano)', () => {
  it('cámara instalada: costo directo 2,835.30', () => {
    const m = calcularMatriz(catalogo, camaraInstalada);
    expect(m.costoDirecto).toBe(2835.3);
    const por = Object.fromEntries(m.renglones.map((r) => [r.recursoId, r.importe]));
    expect(por.cable).toBe(299.25);
    expect(por.cuadrilla).toBe(410);
    expect(por.herramienta).toBe(12.3);
    expect(por.seguridad).toBe(4.1);
    expect(por.camioneta).toBe(109.65);
    expect(por.escalera).toBe(30);
    expect(m.porTipo.MATERIAL).toBe(2269.25);
    expect(m.porTipo.MANO_OBRA).toBe(410);
  });

  it('si baja el rendimiento sube la mano de obra y lo que depende de ella', () => {
    const lento = camaraInstalada.map((r) => (r.recursoId === 'cuadrilla' ? { ...r, cantidad: 1 / 2 } : r));
    const m = calcularMatriz(catalogo, lento);
    expect(m.renglones.find((r) => r.recursoId === 'cuadrilla')?.importe).toBe(820);
    expect(m.renglones.find((r) => r.recursoId === 'herramienta')?.importe).toBe(24.6);
  });

  it('una matriz que se contiene a sí misma no se cuelga', () => {
    const ciclo = new Map<string, Recurso>([
      ['a', { id: 'a', tipo: 'AUXILIAR', renglones: [{ recursoId: 'b', cantidad: 1 }] }],
      ['b', { id: 'b', tipo: 'AUXILIAR', renglones: [{ recursoId: 'a', cantidad: 1 }] }],
    ]);
    expect(() => calcularMatriz(ciclo, [{ recursoId: 'a', cantidad: 1 }])).toThrow(/se contiene a sí misma/);
  });

  it('un recurso desconocido se dice, no vale cero', () => {
    expect(() => calcularMatriz(catalogo, [{ recursoId: 'nada', cantidad: 1 }])).toThrow(/desconocido/);
  });
});

describe('explosión de insumos', () => {
  it('64 cámaras abren la cuadrilla en sus dos categorías', () => {
    const e = new Map(explosionInsumos(catalogo, camaraInstalada, 64).map((f) => [f.recursoId, f]));
    expect(e.get('camara')?.cantidad).toBe(64);
    expect(e.get('cable')?.cantidad).toBe(2016);
    expect(e.get('instalador')?.cantidad).toBe(16);
    expect(e.get('ayudante')?.cantidad).toBe(16);
    expect(e.has('cuadrilla')).toBe(false);
    expect(e.get('camioneta')?.cantidad).toBe(960);
  });

  it('la suma de la explosión es el costo directo por la cantidad', () => {
    const total = explosionInsumos(catalogo, camaraInstalada, 64).reduce((a, f) => a + f.importe, 0);
    expect(total).toBeCloseTo(2835.3 * 64, 1);
  });
});
