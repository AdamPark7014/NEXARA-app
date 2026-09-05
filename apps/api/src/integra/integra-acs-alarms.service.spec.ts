import { IntegraAcsAlarmsService } from './integra-acs-alarms.service';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ServiceClientsService } from '../service-clients/service-clients.service';

/**
 * De un evento que ya está en la base a una fila en la cola SOC.
 *
 * Lo que se prueba aquí es lo que el operador acaba viendo: qué alarma se abre,
 * con qué nombre, con qué severidad y cuándo se convierte en ticket. Sin base
 * ni red: `prisma` y `serviceClients` son dobles en memoria.
 *
 * HONESTIDAD SOBRE LA EVIDENCIA. Los `minor` 27 y 28 —puerta forzada y puerta
 * mantenida abierta— tienen **cero eventos en tres meses** sobre 47.343
 * revisados. Estas pruebas comprueban que el camino funciona y que el equipo
 * hace lo que el fabricante documenta; **no** comprueban que la instalación de
 * Oficinas emita esos avisos, porque eso no se ha visto nunca.
 */

const COMPANY = 4242;
const SITE = 7;

type AlarmRow = {
  id: number;
  companyId: number;
  siteId: number;
  kind: string;
  status: string;
  fingerprint: string;
  title: string;
  severity: string;
  personId: string | null;
  personName: string | null;
  doorNo: number | null;
  doorName: string | null;
  deviceIp: string | null;
  deviceName: string | null;
  photoPath: string | null;
  pushEventId: number | null;
  occurrenceCount: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  ticketRequestId: number | null;
  escalatedAt: Date | null;
  note: string | null;
  userId: number | null;
  updatedAt: Date;
};

function scenario(opts?: { serviceClientId?: number | null; authFailuresInWindow?: number }) {
  const rows: AlarmRow[] = [];
  let seq = 0;

  const prisma = {
    integraSite: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === SITE
          ? {
              id: SITE,
              companyId: COMPANY,
              alarmPolicy: null,
              serviceClientId: opts?.serviceClientId ?? null,
              label: 'Oficinas',
              name: 'Oficinas NEXARA',
            }
          : null,
      ),
    },
    integraDoor: {
      findMany: jest.fn(async () => [
        { name: 'Acceso General', doorIndexCode: '192.168.9.60|1' },
      ]),
    },
    integraDevice: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.ip === '192.168.9.174' ? { name: 'Support & Engineering 02' } : null,
      ),
    },
    integraPushEvent: {
      count: jest.fn(async () => opts?.authFailuresInWindow ?? 1),
    },
    integraSocAlarm: {
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = rows.find(
          (r) =>
            r.siteId === where.siteId &&
            r.fingerprint === where.fingerprint &&
            ['OPEN', 'ACK', 'TICKETED'].includes(r.status) &&
            r.lastOccurredAt >= where.lastOccurredAt.gte,
        );
        return hit ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row: AlarmRow = {
          id: ++seq,
          ticketRequestId: null,
          escalatedAt: null,
          note: null,
          userId: null,
          updatedAt: new Date(),
          ...data,
        };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error('fila inexistente');
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
    },
  } as unknown as PrismaService;

  const createTicketRequest = jest.fn(async () => ({ id: 900 }));
  const serviceClients = { createTicketRequest } as unknown as ServiceClientsService;

  return {
    service: new IntegraAcsAlarmsService(prisma, serviceClients),
    prisma,
    rows,
    createTicketRequest,
  };
}

const base = {
  companyId: COMPANY,
  siteId: SITE,
  pushEventId: 11,
  occurredAt: new Date('2026-09-03T12:00:00-06:00'), // jueves, en horario
  deviceIp: '192.168.9.60',
  deviceName: 'Acceso General',
};

describe('IntegraAcsAlarmsService · alarmas de puerta', () => {
  it('27 · puerta forzada abre ticket al PRIMER evento, sin esperar repeticiones', async () => {
    const { service, rows, createTicketRequest } = scenario({ serviceClientId: 3 });
    const r = await service.onPushEvent({ ...base, major: 5, minor: 27 });

    expect(r).not.toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('DOOR_FORCED');
    expect(rows[0].severity).toBe('alta');
    expect(rows[0].title).toBe('Puerta forzada · Acceso General');
    // El umbral general del sitio es 3; puerta forzada no espera a la tercera.
    expect(r?.escalated).toBe(true);
    expect(createTicketRequest).toHaveBeenCalledTimes(1);
  });

  it('28 · puerta mantenida abierta: alarma media y sin ticket inmediato', async () => {
    const { service, rows, createTicketRequest } = scenario({ serviceClientId: 3 });
    const r = await service.onPushEvent({ ...base, major: 5, minor: 28 });

    expect(rows[0].kind).toBe('DOOR_HELD_OPEN');
    expect(rows[0].severity).toBe('media');
    expect(r?.escalated).toBe(false);
    expect(createTicketRequest).not.toHaveBeenCalled();
  });

  it('el ruido operativo no crea ni una fila', async () => {
    const { service, rows } = scenario();
    // 21/22 la puerta, 23/24 el botón de salida. Esto era el 94,3 % del
    // tráfico y llenaba la cola de «acceso denegado».
    for (const minor of [21, 22, 23, 24]) {
      expect(await service.onPushEvent({ ...base, major: 5, minor })).toBeNull();
    }
    expect(rows).toHaveLength(0);
  });
});

describe('IntegraAcsAlarmsService · fallos de reconocimiento', () => {
  it('un fallo suelto no abre nada', async () => {
    // El lector cuenta 1 fallo en la ventana: la persona reintenta y entra.
    const { service, rows } = scenario({ authFailuresInWindow: 1 });
    expect(await service.onPushEvent({ ...base, major: 5, minor: 76 })).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it('cinco en el mismo lector sí, y de severidad baja', async () => {
    const { service, rows } = scenario({ authFailuresInWindow: 5, serviceClientId: 3 });
    await service.onPushEvent({ ...base, major: 5, minor: 76 });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('AUTH_FAILURE_BURST');
    // Un lector sucio no es un intruso: nunca sube de baja.
    expect(rows[0].severity).toBe('baja');
    expect(rows[0].title).toBe('Lector sin reconocer credenciales · Acceso General');
  });

  it('vale también lo que declara el equipo, sin contar nada', async () => {
    const { service, rows } = scenario({ authFailuresInWindow: 1 });
    await service.onPushEvent({ ...base, major: 5, minor: 104, activePostCount: 9 });
    expect(rows[0]?.kind).toBe('AUTH_FAILURE_BURST');
  });
});

describe('IntegraAcsAlarmsService · salud de cámara', () => {
  const cam = {
    companyId: COMPANY,
    siteId: SITE,
    pushEventId: 22,
    occurredAt: new Date('2026-09-03T12:00:00-06:00'),
    deviceIp: '192.168.9.174',
  };

  it('cámara tapada: alarma alta que nombra la cámara, sin persona ni puerta', async () => {
    const { service, rows } = scenario();
    // Sin `channelName` en el aviso, el nombre sale del espejo de equipos.
    const r = await service.onCameraEvent({ ...cam, eventType: 'shelteralarm' });

    expect(r).not.toBeNull();
    expect(rows[0].kind).toBe('CAMERA_TAMPER');
    expect(rows[0].severity).toBe('alta');
    expect(rows[0].title).toBe('Cámara tapada · Support & Engineering 02');
    expect(rows[0].personId).toBeNull();
    // No es una puerta: la consola no debe ofrecer abrir nada.
    expect(rows[0].doorNo).toBeNull();
    expect(rows[0].doorName).toBeNull();
  });

  it('desenfocada es baja, y no se funde con la tapada de la misma cámara', async () => {
    const { service, rows } = scenario();
    await service.onCameraEvent({ ...cam, eventType: 'shelteralarm' });
    await service.onCameraEvent({ ...cam, eventType: 'defocus' });

    // Dos averías distintas de la misma cámara son dos filas, no una con «×2».
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.severity)).toEqual(['alta', 'baja']);
    expect(rows[1].title).toBe('Cámara desenfocada · Support & Engineering 02');
    expect(rows[0].fingerprint).not.toBe(rows[1].fingerprint);
  });

  it('el mismo aviso repetido agrupa en la misma fila', async () => {
    const { service, rows } = scenario();
    await service.onCameraEvent({ ...cam, eventType: 'scenechangedetection' });
    await service.onCameraEvent({ ...cam, eventType: 'scenechangedetection' });

    expect(rows).toHaveLength(1);
    expect(rows[0].occurrenceCount).toBe(2);
    expect(rows[0].severity).toBe('media');
    expect(rows[0].title).toBe('Cámara movida · Support & Engineering 02');
  });

  it('una detección normal no abre alarma de cámara', async () => {
    const { service, rows } = scenario();
    // `fielddetection` dispara a todas horas por diseño.
    expect(await service.onCameraEvent({ ...cam, eventType: 'fielddetection' })).toBeNull();
    expect(rows).toHaveLength(0);
  });
});
