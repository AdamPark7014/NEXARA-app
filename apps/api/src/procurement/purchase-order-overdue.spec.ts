import {
  claveAvisoOc,
  estaCompletamenteRecibida,
  planificarAvisosOcAtrasadas,
  seleccionarAtrasadas,
  type OrdenParaAtraso,
} from './purchase-order-overdue';

// 2026-09-27 15:00 UTC = 09:00 en México (UTC-6, sin horario de verano).
const HOY = new Date('2026-09-27T15:00:00.000Z');

function oc(parcial: Partial<OrdenParaAtraso> & { id: number }): OrdenParaAtraso {
  return {
    poNumber: `OC-${String(parcial.id).padStart(4, '0')}`,
    companyId: 1,
    status: 'CONFIRMED',
    expectedDate: new Date('2026-09-26T00:00:00.000Z'), // ayer
    createdById: 10,
    approvedById: null,
    responsableNombre: 'Ana María López Ruiz',
    proveedor: 'Syscom',
    partidas: [{ quantity: 5, receivedQty: 0 }],
    ...parcial,
  };
}

const sinJefes = () => [] as number[];

describe('estaCompletamenteRecibida', () => {
  it('es completa sólo cuando todas las partidas recibieron lo pedido', () => {
    expect(estaCompletamenteRecibida([{ quantity: 5, receivedQty: 5 }])).toBe(true);
    expect(estaCompletamenteRecibida([{ quantity: '5.0000', receivedQty: '5.0000' }])).toBe(true);
    expect(
      estaCompletamenteRecibida([
        { quantity: 5, receivedQty: 5 },
        { quantity: 2, receivedQty: 1 },
      ]),
    ).toBe(false);
    expect(estaCompletamenteRecibida([{ quantity: 5, receivedQty: 0 }])).toBe(false);
  });

  it('una orden sin partidas no se da por recibida', () => {
    expect(estaCompletamenteRecibida([])).toBe(false);
  });
});

describe('planificarAvisosOcAtrasadas', () => {
  it('OC atrasada 1 día: avisa al comprador con el texto en singular', () => {
    const plan = planificarAvisosOcAtrasadas({ ordenes: [oc({ id: 12 })], hoy: HOY, jefesDe: sinJefes });

    expect(plan.atrasadas).toBe(1);
    expect(plan.avisos).toHaveLength(1);
    const a = plan.avisos[0];
    expect(a.userId).toBe(10);
    expect(a.companyId).toBe(1);
    expect(a.ordenIds).toEqual([12]);
    expect(a.titulo).toBe('Orden de compra atrasada');
    expect(a.mensaje).toContain('OC-0012 de Syscom');
    expect(a.mensaje).toContain('26 sep');
    expect(a.mensaje).toContain('1 día de atraso');
    expect(a.mensaje).not.toContain('1 días');
    expect(a.url).toBe('/erp/procurement?tab=orders&id=12');
    expect(a.prioridad).toBe('normal');
  });

  it('varias del mismo comprador se agrupan en un solo aviso, la más atrasada primero', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [
        oc({ id: 1, expectedDate: new Date('2026-09-25T00:00:00.000Z') }), // 2 días
        oc({ id: 2, expectedDate: new Date('2026-09-20T00:00:00.000Z') }), // 7 días
        oc({ id: 3 }), // 1 día
        oc({ id: 4, expectedDate: new Date('2026-09-24T00:00:00.000Z') }), // 3 días
      ],
      hoy: HOY,
      jefesDe: sinJefes,
    });

    expect(plan.avisos).toHaveLength(1);
    const a = plan.avisos[0];
    expect(a.ordenIds).toEqual([2, 4, 1, 3]);
    expect(a.titulo).toBe('4 órdenes de compra atrasadas');
    expect(a.mensaje).toContain('OC-0002 (7 días), OC-0004 (3 días), OC-0001 (2 días) y 1 más');
    expect(a.url).toBe('/erp/procurement?tab=orders');
    expect(a.prioridad).toBe('high'); // 7 días o más
  });

  it('una orden ya recibida (o que no se espera) no avisa', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [
        oc({ id: 1, partidas: [{ quantity: 5, receivedQty: 5 }] }), // completa aunque el estado no se actualizó
        oc({ id: 2, status: 'RECEIVED' }),
        oc({ id: 3, status: 'INVOICED' }),
        oc({ id: 4, status: 'CANCELLED' }),
        oc({ id: 5, status: 'DRAFT' }),
      ],
      hoy: HOY,
      jefesDe: sinJefes,
    });

    expect(plan.atrasadas).toBe(0);
    expect(plan.avisos).toEqual([]);
  });

  it('una recepción parcial sigue contando como atrasada', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [
        oc({
          id: 7,
          status: 'PARTIALLY_RECEIVED',
          partidas: [
            { quantity: 5, receivedQty: 5 },
            { quantity: 4, receivedQty: 1 },
          ],
        }),
      ],
      hoy: HOY,
      jefesDe: sinJefes,
    });

    expect(plan.avisos).toHaveLength(1);
    expect(plan.avisos[0].ordenIds).toEqual([7]);
  });

  it('no mezcla empresas: cada aviso lleva sólo órdenes de su empresa', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [
        oc({ id: 1, companyId: 1, createdById: 10 }),
        oc({ id: 2, companyId: 2, createdById: 10 }), // mismo usuario, otra empresa
        oc({ id: 3, companyId: 2, createdById: 20 }),
      ],
      hoy: HOY,
      // El jefe 99 sólo lo es dentro de la empresa 1: la función de jefes ya viene acotada por empresa.
      jefesDe: (companyId) => (companyId === 1 ? [99] : []),
    });

    const de = (companyId: number, userId: number) =>
      plan.avisos.find((a) => a.companyId === companyId && a.userId === userId);

    expect(de(1, 10)?.ordenIds).toEqual([1]);
    expect(de(2, 10)?.ordenIds).toEqual([2]);
    expect(de(2, 20)?.ordenIds).toEqual([3]);
    expect(de(1, 99)?.ordenIds).toEqual([1]);
    expect(de(2, 99)).toBeUndefined();
    expect(plan.avisos).toHaveLength(4);
    // Ninguna orden de la empresa 2 aparece en un aviso de la empresa 1 y viceversa.
    for (const a of plan.avisos) {
      const ids = a.companyId === 1 ? [1] : [2, 3];
      for (const id of a.ordenIds) expect(ids).toContain(id);
    }
  });

  describe('zona horaria y medianoche', () => {
    const ordenAyer = [oc({ id: 1, expectedDate: new Date('2026-09-26T00:00:00.000Z') })];

    it('en el mismo día de México todavía no está atrasada (aunque en UTC ya sea el día siguiente)', () => {
      // 05:59:59 UTC del 27 = 23:59:59 del 26 en México: el día prometido no ha terminado.
      const plan = planificarAvisosOcAtrasadas({
        ordenes: ordenAyer,
        hoy: new Date('2026-09-27T05:59:59.000Z'),
        jefesDe: sinJefes,
      });
      expect(plan.atrasadas).toBe(0);
    });

    it('a la medianoche de México pasa a atrasada de 1 día', () => {
      const plan = planificarAvisosOcAtrasadas({
        ordenes: ordenAyer,
        hoy: new Date('2026-09-27T06:00:00.000Z'),
        jefesDe: sinJefes,
      });
      expect(plan.atrasadas).toBe(1);
      expect(plan.avisos[0].mensaje).toContain('1 día de atraso');
    });

    it('una orden que se esperaba hoy no está atrasada', () => {
      const plan = planificarAvisosOcAtrasadas({
        ordenes: [oc({ id: 1, expectedDate: new Date('2026-09-27T00:00:00.000Z') })],
        hoy: HOY,
        jefesDe: sinJefes,
      });
      expect(plan.atrasadas).toBe(0);
    });

    it('sin fecha esperada no hay atraso que medir', () => {
      const plan = planificarAvisosOcAtrasadas({
        ordenes: [oc({ id: 1, expectedDate: null })],
        hoy: HOY,
        jefesDe: sinJefes,
      });
      expect(plan.atrasadas).toBe(0);
    });
  });

  it('sin jefe: sólo se avisa al comprador', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [oc({ id: 1 }), oc({ id: 2 })],
      hoy: HOY,
      jefesDe: sinJefes,
    });

    expect(plan.avisos.map((a) => a.userId)).toEqual([10]);
  });

  it('el jefe recibe un resumen del equipo, y el comprador no se cuenta como su propio jefe', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [
        oc({ id: 1, createdById: 10, responsableNombre: 'Ana María López Ruiz' }),
        oc({ id: 2, createdById: 10, responsableNombre: 'Ana María López Ruiz' }),
        oc({ id: 3, createdById: 11, responsableNombre: 'Luis Pérez' }),
      ],
      hoy: HOY,
      // Cadena de ambos: 50 (jefe directo) y, por error, ellos mismos: no deben avisarse a sí mismos como jefes.
      jefesDe: (_c, userId) => [50, userId],
    });

    const jefe = plan.avisos.find((a) => a.userId === 50)!;
    expect(jefe.ordenIds.sort()).toEqual([1, 2, 3]);
    expect(jefe.titulo).toBe('3 órdenes de compra atrasadas en tu equipo');
    expect(jefe.mensaje).toContain('Ana López (2)');
    expect(jefe.mensaje).toContain('Luis Pérez (1)');

    // Cada comprador ve sólo lo suyo.
    expect(plan.avisos.find((a) => a.userId === 10)?.ordenIds.sort()).toEqual([1, 2]);
    expect(plan.avisos.find((a) => a.userId === 11)?.ordenIds).toEqual([3]);
    expect(plan.avisos).toHaveLength(3);
  });

  it('un jefe con una sola orden en su equipo ve quién la lleva', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [oc({ id: 9, createdById: 11, responsableNombre: 'Luis Pérez' })],
      hoy: HOY,
      jefesDe: () => [50],
    });

    const jefe = plan.avisos.find((a) => a.userId === 50)!;
    expect(jefe.titulo).toBe('Orden de compra atrasada en tu equipo');
    expect(jefe.mensaje).toContain('a cargo de Luis Pérez');
  });

  it('quien es comprador y jefe a la vez recibe un solo aviso con las dos partes', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [
        oc({ id: 1, createdById: 50, responsableNombre: 'Marta Gómez' }),
        oc({ id: 2, createdById: 11, responsableNombre: 'Luis Pérez' }),
      ],
      hoy: HOY,
      jefesDe: (_c, userId) => (userId === 11 ? [50] : []),
    });

    const deMarta = plan.avisos.filter((a) => a.userId === 50);
    expect(deMarta).toHaveLength(1);
    expect(deMarta[0].ordenIds.sort()).toEqual([1, 2]);
    expect(deMarta[0].mensaje).toContain('Tuyas: OC-0001 (1 día)');
    expect(deMarta[0].mensaje).toContain('De tu equipo: Luis Pérez (1)');
  });

  it('no repite el aviso a quien ya lo recibió hoy', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [oc({ id: 1, createdById: 10 })],
      hoy: HOY,
      jefesDe: () => [50],
      yaAvisados: new Set([claveAvisoOc(1, 10)]),
    });

    expect(plan.avisos.map((a) => a.userId)).toEqual([50]);
    expect(plan.omitidosPorYaAvisados).toBe(1);
  });

  it('haber recibido el aviso en otra empresa no cuenta como ya avisado', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [oc({ id: 1, companyId: 2, createdById: 10 })],
      hoy: HOY,
      jefesDe: sinJefes,
      yaAvisados: new Set([claveAvisoOc(1, 10)]),
    });

    expect(plan.avisos).toHaveLength(1);
  });

  it('si no hay creador usa a quien la aprobó; si tampoco hay, no hay a quién avisar', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [
        oc({ id: 1, createdById: null, approvedById: 30 }),
        oc({ id: 2, createdById: null, approvedById: null }),
      ],
      hoy: HOY,
      jefesDe: sinJefes,
    });

    expect(plan.avisos.map((a) => a.userId)).toEqual([30]);
    expect(plan.sinResponsable).toEqual([2]);
  });

  it('sin nombre de proveedor el texto no inventa uno', () => {
    const plan = planificarAvisosOcAtrasadas({
      ordenes: [oc({ id: 1, proveedor: null })],
      hoy: HOY,
      jefesDe: sinJefes,
    });

    expect(plan.avisos[0].mensaje).toMatch(/^OC-0001 debía llegar/);
  });
});

describe('seleccionarAtrasadas', () => {
  it('calcula los días de atraso por día de calendario', () => {
    const { atrasadas } = seleccionarAtrasadas(
      [oc({ id: 1, expectedDate: new Date('2026-09-17T00:00:00.000Z') })],
      HOY,
    );
    expect(atrasadas[0].dias).toBe(10);
  });

  it('acepta la fecha esperada como texto AAAA-MM-DD', () => {
    const { atrasadas } = seleccionarAtrasadas([oc({ id: 1, expectedDate: '2026-09-25' })], HOY);
    expect(atrasadas[0].dias).toBe(2);
  });
});
