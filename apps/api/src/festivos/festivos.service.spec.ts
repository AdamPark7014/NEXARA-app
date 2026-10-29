import { ForbiddenException } from '@nestjs/common';
import { FestivosService } from './festivos.service';

// Datos ficticios. La base en memoria implementa solo lo que usa el servicio.
type Fila = Record<string, any>;

function base() {
  const db = {
    users: [
      { id: 1, nombre: 'Ana Prueba', email: 'ana@ejemplo.test', puesto: null, avatarUrl: null, roleKey: 'ing_soporte', tipoContrato: null, role: null, horario: null },
      { id: 2, nombre: 'Beto Campo', email: 'beto@ejemplo.test', puesto: null, avatarUrl: null, roleKey: 'ing_campo', tipoContrato: 'Planta', role: null, horario: null },
      // Dirección (24/7): sin horario, no se le avisa.
      { id: 3, nombre: 'Ceci Dirección', email: 'ceci@ejemplo.test', puesto: null, avatarUrl: null, roleKey: 'ceo', tipoContrato: null, role: null, horario: null },
    ] as Fila[],
    festivos: [] as Fila[],
    guardias: [] as Fila[],
    notificaciones: [] as Fila[],
  };
  const prisma = {
    user: { findMany: async () => db.users },
    companyProfile: { findMany: async () => [{ id: 7 }] },
    diaFestivo: {
      findMany: async ({ where }: any) =>
        db.festivos.filter((f) => f.companyId === where.companyId && f.fecha >= where.fecha.gte && f.fecha <= where.fecha.lte),
      upsert: async ({ create }: any) => {
        db.festivos = db.festivos.filter((f) => !(f.companyId === create.companyId && f.fecha.getTime() === create.fecha.getTime()));
        db.festivos.push({ ...create, updatedAt: new Date() });
        return create;
      },
      deleteMany: async ({ where }: any) => {
        const antes = db.festivos.length;
        db.festivos = db.festivos.filter((f) => !(f.companyId === where.companyId && f.fecha.getTime() === where.fecha.getTime()));
        return { count: antes - db.festivos.length };
      },
    },
    guardia: {
      findMany: async ({ where }: any) =>
        db.guardias.filter(
          (g) =>
            (where.userId == null || g.userId === where.userId) &&
            (where.fecha instanceof Date ? g.fecha.getTime() === where.fecha.getTime() : g.fecha >= where.fecha.gte && g.fecha <= where.fecha.lte),
        ),
    },
    notification: {
      findMany: async ({ where }: any) =>
        db.notificaciones.filter(
          (n) => where.userId.in.includes(n.userId) && n.type === where.type && n.entityType === where.entityType && n.relatedEntityId === where.relatedEntityId,
        ),
    },
  };
  const notifications = {
    createNotification: async (p: Fila) => {
      db.notificaciones.push(p);
      return p;
    },
  };
  return { db, servicio: new FestivosService(prisma as any, notifications as any) };
}

const DIRECCION = { id: 9, email: 'gerencia@nexara.com.mx' };
const EQUIPO = { id: 1, email: 'ana@ejemplo.test' };

describe('festivos: servicio', () => {
  it('solo dirección marca días', async () => {
    const { servicio } = base();
    await expect(servicio.guardar(EQUIPO, '2026-11-02', { nombre: 'Día de Muertos', modo: 'NO_SE_LABORA' }, 7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const f = await servicio.guardar(DIRECCION, '2026-11-02', { nombre: 'Día de Muertos', modo: 'NO_SE_LABORA' }, 7);
    expect(f).toMatchObject({ fecha: '2026-11-02', origen: 'EMPRESA', modo: 'NO_SE_LABORA', guardado: true });
    await expect(servicio.quitar(EQUIPO, '2026-11-02', 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.quitar(DIRECCION, '2026-11-02', 7)).resolves.toEqual({ quitado: true, fecha: '2026-11-02', deLey: false });
  });

  it('el aviso sale 3 días antes, una sola vez por persona y no a dirección', async () => {
    const { db, servicio } = base();
    await servicio.guardar(DIRECCION, '2026-11-16', { modo: 'HORARIO', horaEntrada: '10:00', horaSalida: '14:00', personas: [2] }, 7);
    db.notificaciones = [];
    const viernes = new Date('2026-11-13T10:00:00-06:00');
    expect(await servicio.enviarAvisos(viernes)).toBe(2);
    expect(db.notificaciones.map((n) => [n.userId, n.title])).toEqual([
      [1, 'El lunes 16 no se labora'],
      [2, 'El lunes 16 te toca de 10:00 a 14:00'],
    ]);
    expect(db.notificaciones[1]).toMatchObject({ priority: 'high', relatedEntityId: 20261116, entityType: 'DiaFestivo' });
    // La pasada de las 13:00 no repite.
    expect(await servicio.enviarAvisos(new Date('2026-11-13T13:00:00-06:00'))).toBe(0);
  });

  it('«mio» resuelve el día para quien consulta', async () => {
    const { db, servicio } = base();
    db.festivos.push({
      companyId: 7,
      fecha: new Date(Date.UTC(2026, 10, 16)),
      nombre: '',
      origen: 'LEY',
      modo: 'HORARIO',
      horaEntrada: '10:00',
      horaSalida: '14:00',
      personas: [2],
      pagoDoble: true,
      avisar: true,
      nota: null,
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-11-16T09:00:00-06:00'));
    try {
      const beto = await servicio.mio({ id: 2 }, 7);
      expect(beto.festivoHoy).toMatchObject({
        nombre: 'Día de la Revolución',
        como: { trabaja: true, horario: { entrada: '10:00', salida: '14:00' }, pagoDoble: true },
      });
      const ana = await servicio.mio({ id: 1 }, 7);
      expect(ana.festivoHoy?.como.trabaja).toBe(false);
      // Los próximos 90 días.
      expect(ana.proximos.map((p) => p.fecha)).toEqual(['2026-12-25', '2027-01-01', '2027-02-01']);
    } finally {
      jest.useRealTimers();
    }
  });
});
