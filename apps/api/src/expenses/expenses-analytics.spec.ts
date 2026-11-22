import { textoPorHoja } from '../common/pdf/texto-de-pdf.js';
import { ExpensesService } from './expenses.service.js';

/**
 * Panel y PDF de gastos administrativos.
 *
 * Dos fallas que no se veían por separado:
 *  - la empresa no llegaba del controlador, así que el filtro caía en el candado «sin empresa no
 *    hay filas» y el panel salía en ceros aunque la lista de la misma pantalla tuviera gastos;
 *  - el rango de fechas cortaba el día con la hora del servidor (UTC): un gasto capturado a las
 *    19:30 quedaba fuera del reporte de su día.
 */

type Where = Record<string, any>;

const GASTOS = [
  {
    id: 1,
    usuarioId: 10,
    usuario: { nombre: 'Persona Demo Uno' },
    concepto: 'Papelería',
    categoria: 'Oficina',
    montoSolicitado: 1200,
    estatusPago: 'Pagado',
    esRecurrente: false,
    fechaGasto: null,
    // 21-nov 19:30 en México.
    fechaSolicitud: new Date('2026-11-22T01:30:00.000Z'),
  },
  {
    id: 2,
    usuarioId: 11,
    usuario: { nombre: 'Persona Demo Dos' },
    concepto: 'Internet de la oficina',
    categoria: 'Servicios',
    montoSolicitado: 899.5,
    estatusPago: 'Pendiente',
    esRecurrente: true,
    fechaGasto: null,
    fechaSolicitud: new Date('2026-11-10T16:00:00.000Z'),
  },
];

function servicio() {
  const consultas: Where[] = [];
  const prisma = {
    expense: {
      findMany: jest.fn(async ({ where }: { where: Where }) => {
        consultas.push(where);
        // Como la base: sin empresa válida no hay filas, y el rango se respeta.
        if (where.companyId !== 7) return [];
        return GASTOS.filter((g) => {
          const r = where.fechaSolicitud as { gte?: Date; lte?: Date } | undefined;
          if (r?.gte && g.fechaSolicitud < r.gte) return false;
          if (r?.lte && g.fechaSolicitud > r.lte) return false;
          return true;
        });
      }),
    },
  };
  const svc = new ExpensesService(prisma as any, {} as any, {} as any, {} as any);
  return { svc, consultas };
}

describe('gastos administrativos · panel y PDF', () => {
  it('consulta los gastos de la empresa de quien pregunta', async () => {
    const { svc, consultas } = servicio();
    const r = await svc.analytics({}, undefined, 7);
    expect(consultas[0]).toMatchObject({ companyId: 7, isAdministrative: true, deletedAt: null });
    expect(r.count).toBe(2);
    expect(r.totalSolicitado).toBe(2099.5);
    expect(r.totalPagado).toBe(1200);
    expect(r.pendientes).toBe(1);
  });

  it('sin empresa el candado sigue: no devuelve gastos de nadie', async () => {
    const { svc, consultas } = servicio();
    const r = await svc.analytics({}, undefined, null);
    expect(consultas[0].companyId).toBe(-1);
    expect(r.count).toBe(0);
  });

  it('quien no administra contabilidad solo ve los de su departamento', async () => {
    const { svc, consultas } = servicio();
    await svc.analytics({}, 3, 7);
    expect(consultas[0]).toMatchObject({ companyId: 7, usuario: { departmentId: 3 } });
  });

  it('el rango son días de la empresa: el gasto de las 19:30 entra en su día', async () => {
    const { svc, consultas } = servicio();
    const del21 = await svc.analytics({ from: '2026-11-21', to: '2026-11-21' }, undefined, 7);
    expect(consultas[0].fechaSolicitud).toEqual({
      gte: new Date('2026-11-21T06:00:00.000Z'),
      lte: new Date('2026-11-22T05:59:59.999Z'),
    });
    expect(del21.rows.map((x) => x.id)).toEqual([1]);
    expect(del21.rows[0].fecha).toBe('2026-11-21');

    const del22 = await svc.analytics({ from: '2026-11-22', to: '2026-11-22' }, undefined, 7);
    expect(del22.count).toBe(0);
  });

  it('el PDF lleva los gastos de la empresa y el periodo como se lee', async () => {
    const { svc, consultas } = servicio();
    const pdf = await svc.reportPdf({ from: '2026-11-01', to: '2026-11-21' }, 'Persona Demo', undefined, 7);
    expect(consultas[0].companyId).toBe(7);
    const texto = textoPorHoja(pdf).join(' ').replace(/\s+/g, ' ');
    expect(texto).toContain('01/11/2026 al 21/11/2026');
    expect(texto).toContain('Papelería');
    expect(texto).toContain('Internet de la oficina');
  });
});
