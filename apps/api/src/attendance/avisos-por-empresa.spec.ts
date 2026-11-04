/**
 * Una checada dice quién checó: solo le toca a la empresa donde checó. `emit()` la mandaba a `SALA_PERSONAL`, el
 * personal de todas. `User` no se filtra solo por empresa, así que la consulta de administradores también traía a los
 * de las otras. Aquí corre el gateway de verdad con un servidor falso, para ver a qué sala sale cada aviso.
 */
import { AttendanceService } from './attendance.service.js';
import { PETICION_APP } from './peticion-de-app.testing.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const FOTO = 'data:image/jpeg;base64,AAAA';
const OFICINA = { latitude: 19.074, longitude: -98.278 };
/** Lunes 5 de octubre de 2026, 09:00 en México: ni fin de semana ni festivo. */
const LUN_09 = new Date('2026-10-05T15:00:00Z');
const EMPRESA = 7;
const OTRA_EMPRESA = 2;
const ANA = 3;
const JEFE = 8;
const ADMIN_DE_OTRA = 9;

const ADMINS = [
  { id: JEFE, nombre: 'Jefe', email: 'jefe@example.com', empresas: [EMPRESA] },
  { id: ADMIN_DE_OTRA, nombre: 'Ajena', email: 'ajena@example.com', empresas: [OTRA_EMPRESA] },
];

const armar = (o: { jornadaAbierta?: boolean; salidaPorDeshacer?: boolean } = {}) => {
  const salidas: Array<{ sala: string; evento: string; payload: any }> = [];
  const gateway = new RealtimeGateway({} as any);
  gateway.server = {
    to: (sala: string) => ({
      emit: (evento: string, payload: unknown) => salidas.push({ sala, evento, payload }),
    }),
    emit: (evento: string, payload: unknown) => salidas.push({ sala: 'todos', evento, payload }),
  } as any;

  const ana = { id: ANA, nombre: 'Ana', email: 'ana@example.com', departmentId: 1 };
  const fila = { id: 1, photoUrl: null, user: { ...ana, avatarUrl: '/ya-tiene.jpg' } };
  const salidaDeAna = {
    id: 44,
    userId: ANA,
    type: 'salida',
    timestamp: new Date(LUN_09.getTime() - 60_000),
    correcciones: [],
  };
  const tx = {
    activityWorkSession: { findMany: jest.fn(async () => []) },
    salidaDeshecha: { create: jest.fn(async () => ({ id: 1 })) },
    attendance: { delete: jest.fn(async () => ({})) },
  };
  const prisma: any = {
    attendance: {
      create: jest.fn(async () => fila),
      update: jest.fn(async () => fila),
      findFirst: jest.fn(async () => (o.salidaPorDeshacer ? salidaDeAna : null)),
      findMany: jest.fn(async () => []),
    },
    attendanceDay: {
      findFirst: jest.fn(async () =>
        o.jornadaAbierta ? { id: 9, isOpen: true, lastEntryAt: new Date(LUN_09.getTime() - 60_000) } : null,
      ),
      upsert: jest.fn(async () => ({ id: 9, isOpen: true })),
      update: jest.fn(async () => ({ id: 9, isOpen: false })),
    },
    attendanceRejection: {
      create: jest.fn(async () => ({ id: 1 })),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    activityNonCompliance: { findMany: jest.fn(async () => []) },
    activityWorkSession: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
    activity: { findMany: jest.fn(async () => []) },
    guardia: { findFirst: jest.fn(async () => null) },
    locationTracking: { create: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 0 })) },
    notification: { create: jest.fn(async () => ({})) },
    user: {
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      findUnique: jest.fn(async () => ana),
      // Como la base: `User` no trae filtro de empresa, solo el que pida la consulta.
      findMany: jest.fn(async ({ where }: { where?: any } = {}) => {
        const empresa = where?.companyMemberships?.some?.companyId;
        return ADMINS.filter((a) => empresa === undefined || a.empresas.includes(empresa));
      }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const servicio = new AttendanceService(prisma, gateway, {
    notifyAttendanceChange: jest.fn(async () => undefined),
    notifyAttendanceFlagged: jest.fn(async () => undefined),
  } as any);
  return { servicio, salidas };
};

const delEvento = (salidas: Array<{ sala: string; evento: string }>, evento: string) =>
  salidas.filter((s) => s.evento === evento).map((s) => s.sala);

/** El aviso sale sin esperarse: que termine la consulta de administradores antes de mirar. */
const terminar = () => new Promise((listo) => setImmediate(listo));

const entrada = { type: 'entrada', photoBase64: FOTO, ...OFICINA, accuracyM: 10 } as any;
const salida = { type: 'salida', photoBase64: FOTO, ...OFICINA, accuracyM: 10, confirmada: true } as any;
const jefe = { id: JEFE, email: 'rh@example.com', roleKey: 'rh', permissions: [] };

describe('los avisos de asistencia van solo a la empresa de la checada', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: LUN_09, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });
  afterEach(() => jest.useRealTimers());

  describe('attendance:updated', () => {
    it('una entrada no sale a todo el personal', async () => {
      const { servicio, salidas } = armar();
      await servicio.register(entrada, ANA, PETICION_APP, EMPRESA);
      await terminar();
      expect(delEvento(salidas, 'attendance:updated')).toEqual([`company:${EMPRESA}`]);
    });

    it('una salida tampoco', async () => {
      const { servicio, salidas } = armar({ jornadaAbierta: true });
      await servicio.register(salida, ANA, PETICION_APP, EMPRESA);
      await terminar();
      expect(delEvento(salidas, 'attendance:updated')).toEqual([`company:${EMPRESA}`]);
    });

    it('la que registra su jefe tampoco', async () => {
      const { servicio, salidas } = armar();
      await servicio.registrarPorJefe(
        jefe,
        { userId: ANA, type: 'entrada', motivo: 'Se le descompuso el teléfono en la obra' },
        EMPRESA,
      );
      await terminar();
      expect(delEvento(salidas, 'attendance:updated')).toEqual([`company:${EMPRESA}`]);
    });

    it('la sugerida por un acceso tampoco', async () => {
      const { servicio, salidas } = armar();
      await servicio.registerSuggestedAcsEntry({
        targetUserId: ANA,
        timestamp: LUN_09,
        actorUserId: JEFE,
        companyId: EMPRESA,
      });
      await terminar();
      expect(delEvento(salidas, 'attendance:updated')).toEqual([`company:${EMPRESA}`]);
    });

    it('deshacer una salida tampoco', async () => {
      const { servicio, salidas } = armar({ salidaPorDeshacer: true });
      await servicio.deshacerMiSalida(ANA, EMPRESA);
      await terminar();
      expect(delEvento(salidas, 'attendance:updated')).toEqual([`company:${EMPRESA}`]);
    });

    it('va a la empresa de la checada, aunque no sea la principal', async () => {
      const { servicio, salidas } = armar();
      await servicio.register(entrada, ANA, PETICION_APP, OTRA_EMPRESA);
      await terminar();
      expect(delEvento(salidas, 'attendance:updated')).toEqual([`company:${OTRA_EMPRESA}`]);
    });

    it('sigue diciendo quién y qué, para que la pantalla refresque', async () => {
      const { servicio, salidas } = armar();
      await servicio.register(entrada, ANA, PETICION_APP, EMPRESA);
      await terminar();
      expect(salidas.find((s) => s.evento === 'attendance:updated')?.payload).toMatchObject({
        userId: ANA,
        type: 'entrada',
      });
    });
  });

  describe('attendance:notification', () => {
    it('trae nombre y correo: solo a cada administrador de esa empresa', async () => {
      const { servicio, salidas } = armar();
      await servicio.register(entrada, ANA, PETICION_APP, EMPRESA);
      await terminar();
      expect(delEvento(salidas, 'attendance:notification')).toEqual([`user:${JEFE}`]);
    });

    it('al administrador de la otra empresa no le llega por ningún lado', async () => {
      const { servicio, salidas } = armar();
      await servicio.register(entrada, ANA, PETICION_APP, EMPRESA);
      await terminar();
      expect(salidas.filter((s) => s.sala === `user:${ADMIN_DE_OTRA}`)).toEqual([]);
      expect(
        salidas.filter((s) => s.evento === 'attendance:notification' && s.payload.adminId === ADMIN_DE_OTRA),
      ).toEqual([]);
    });

    it('en la otra empresa, solo a los suyos', async () => {
      const { servicio, salidas } = armar();
      await servicio.register(entrada, ANA, PETICION_APP, OTRA_EMPRESA);
      await terminar();
      expect(delEvento(salidas, 'attendance:notification')).toEqual([`user:${ADMIN_DE_OTRA}`]);
    });

    it('lleva lo mismo que antes', async () => {
      const { servicio, salidas } = armar();
      await servicio.register(entrada, ANA, PETICION_APP, EMPRESA);
      await terminar();
      expect(salidas.find((s) => s.evento === 'attendance:notification')?.payload).toEqual({
        adminId: JEFE,
        userId: ANA,
        type: 'entrada',
        userName: 'Ana',
        userEmail: 'ana@example.com',
        timestamp: LUN_09.toISOString(),
      });
    });
  });

  it('el portal de esa empresa no recibe nada de esto', async () => {
    const { servicio, salidas } = armar();
    await servicio.register(entrada, ANA, PETICION_APP, EMPRESA);
    await terminar();
    expect(salidas.filter((s) => s.sala.endsWith(':portal') && s.evento !== 'entity:updated')).toEqual([]);
  });
});
