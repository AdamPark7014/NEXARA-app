import { LunchBreaksCronService } from './lunch-breaks.cron.service';

/**
 * Avisos de comida a la hora de cada quien. Antes salían a las 14:50 y 16:05 solo a roles con
 * acceso a consola (ninguno activo lo tenía) y a la cuadrilla le tocaba la ventana de oficina.
 * México no cambia de horario: 14:50 en México son las 20:50 UTC.
 */
const mx = (hm: string) => new Date(`2026-10-30T${String(Number(hm.slice(0, 2)) + 6).padStart(2, '0')}:${hm.slice(3)}:00Z`);

const OFICINA = { id: 1, email: 'ana@nexara.mx', isActive: true, roleKey: 'administrativo', tipoContrato: null, role: null, horario: null };
const CUADRILLA = {
  id: 2,
  email: 'beto@nexara.mx',
  isActive: true,
  roleKey: 'ing_campo',
  tipoContrato: null,
  role: null,
  horario: { horaEntrada: '08:00', horaSalida: '17:00', dias: [1, 2, 3, 4, 5], graciaMin: 15, jornadaOrdinariaMin: null },
};
const DIRECCION = { id: 3, email: 'dir@nexara.mx', isActive: true, roleKey: 'ceo', tipoContrato: null, role: null, horario: null };
const DEMO = { id: 4, email: 'prueba@demo.invalid', isActive: true, roleKey: 'administrativo', tipoContrato: null, role: null, horario: null };
const BAJA = { ...OFICINA, id: 5, email: 'baja@nexara.mx', isActive: false };

function build(opts: { jornadas?: number[]; comidas?: any[] } = {}) {
  const usuarios = [OFICINA, CUADRILLA, DIRECCION, DEMO, BAJA];
  const jornadas = (opts.jornadas ?? usuarios.map((u) => u.id)).map((userId) => ({ userId, companyId: 1 }));
  const enviados: any[] = [];
  const prisma: any = {
    attendanceDay: { findMany: jest.fn().mockResolvedValue(jornadas) },
    user: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(usuarios.filter((u) => where.id.in.includes(u.id) && u.isActive === where.isActive)),
      ),
    },
    lunchBreak: { findMany: jest.fn().mockResolvedValue(opts.comidas ?? []) },
    notification: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          enviados
            .filter((n) => where.userId.in.includes(n.userId) && n.entityType === where.entityType && where.type.in.includes(n.type))
            .map((n) => ({ userId: n.userId, type: n.type })),
        ),
      ),
    },
  };
  const notifications: any = {
    createNotification: jest.fn((p: any) => {
      enviados.push(p);
      return Promise.resolve({ id: enviados.length, ...p });
    }),
  };
  return { service: new LunchBreaksCronService(prisma, notifications), prisma, notifications, enviados };
}

describe('avisos de comida a su hora', () => {
  it('14:50: le avisa a oficina, una sola vez; a la cuadrilla no (su ventana ya abrió)', async () => {
    const { service, enviados } = build();

    expect(await service.revisarAvisos(mx('14:50'))).toEqual({ porSalir: [1], regresa: [] });
    expect(enviados[0]).toMatchObject({
      userId: 1,
      type: 'LUNCH_CHECKIN',
      entityType: 'AvisoComida',
      title: 'Tu hora de comida empieza en 10 minutos',
      collapseKey: 'nx_comida_u1',
      reemplazar: true,
      companyId: 1,
    });

    // El minuto siguiente ya no repite.
    expect(await service.revisarAvisos(mx('14:51'))).toEqual({ porSalir: [], regresa: [] });
    expect(enviados).toHaveLength(1);
  });

  it('12:50: le avisa a la cuadrilla con su ventana; a oficina todavía no', async () => {
    const { service, enviados } = build();

    expect(await service.revisarAvisos(mx('12:49'))).toEqual({ porSalir: [], regresa: [] });
    expect(await service.revisarAvisos(mx('12:50'))).toEqual({ porSalir: [2], regresa: [] });
    expect(enviados[0].message).toBe('Registra tu salida a comer con foto desde la app. Tienes una hora entre 1:00 y 5:00 p.m.');
  });

  it('la cuadrilla que salió a la 1:10 recibe «terminó» a las 2:15 si no ha vuelto', async () => {
    const comida = { id: 77, userId: 2, checkinTime: mx('13:10'), checkoutTime: null };
    const { service, enviados } = build({ comidas: [comida] });

    expect(await service.revisarAvisos(mx('14:14'))).toEqual({ porSalir: [], regresa: [] });
    expect(await service.revisarAvisos(mx('14:15'))).toEqual({ porSalir: [], regresa: [2] });
    expect(enviados[0]).toMatchObject({ type: 'LUNCH_CHECKOUT', relatedEntityId: 77, priority: 'high', title: 'Tu hora de comida terminó' });
    expect(await service.revisarAvisos(mx('14:30'))).toEqual({ porSalir: [], regresa: [] });
  });

  it('quien ya volvió no recibe «terminó»', async () => {
    const comida = { id: 78, userId: 1, checkinTime: mx('15:05'), checkoutTime: mx('15:55') };
    const { service } = build({ comidas: [comida] });

    expect(await service.revisarAvisos(mx('16:10'))).toEqual({ porSalir: [], regresa: [] });
  });

  it('sin jornada abierta no se le avisa a nadie', async () => {
    const { service, prisma } = build({ jornadas: [] });

    expect(await service.revisarAvisos(mx('14:50'))).toEqual({ porSalir: [], regresa: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('dirección (24/7), cuentas de prueba y bajas no reciben avisos', async () => {
    const { service } = build({ jornadas: [3, 4, 5] });

    expect(await service.revisarAvisos(mx('14:50'))).toEqual({ porSalir: [], regresa: [] });
  });
});
