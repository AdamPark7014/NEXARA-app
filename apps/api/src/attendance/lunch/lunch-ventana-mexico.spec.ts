import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LunchBreaksService } from './lunch-breaks.service.js';

/**
 * La ventana de comida se mide en hora de México, no en la del contenedor.
 *
 * El contenedor corre en UTC. `setHours(0,0,0,0)` sobre esa hora corta el día
 * seis horas antes que en México: la tarde mexicana ya es el día siguiente en
 * UTC. En los datos reales de asistencia **10 de 15 registros** caían en un día
 * distinto según se midiera de una forma o de otra, y de estas tablas sale la
 * nómina.
 *
 * `getTodayLunchBreaks` seguía haciendo `setHours` después de que el resto del
 * archivo ya usara `workday.ts`. Estas pruebas fijan la ventana y fallan si
 * alguien vuelve a meter un cálculo de día con la hora del servidor.
 */

// 15:30 en México son las 21:30 UTC del mismo día.
const MX_1530 = new Date('2026-09-08T21:30:00Z');
// 19:00 del 8 de septiembre en México ya es el día SIGUIENTE en UTC (01:00Z
// del 9). Es el momento en que el defecto se notaba: el panel se vaciaba.
const MX_1900 = new Date('2026-09-09T01:00:00Z');

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    lunchBreak: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, user: { nombre: 'Ana', email: 'a@b.c', id: 3 } }),
      ),
      update: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, user: { nombre: 'Ana', email: 'a@b.c', id: 3 } }),
      ),
      ...over.lunchBreak,
    },
  };
  const service = new LunchBreaksService(prisma as any, {
    notifyLunchBreakChange: jest.fn().mockResolvedValue(undefined),
  } as any);
  return { service, prisma };
}

/** Día de calendario que quedó guardado en la columna `@db.Date`. */
const diaGuardado = (d: Date) => d.toISOString().slice(0, 10);

afterEach(() => {
  jest.useRealTimers();
});

describe('el día de la comida es el día de México', () => {
  it('a las 19:00 de México el "hoy" del panel sigue siendo ese día, no el siguiente', async () => {
    // Este es el defecto: `setHours(0,0,0,0)` sobre UTC daba el 9 de septiembre
    // a las 19:00 del 8 en México, y el panel salía vacío.
    jest.useFakeTimers().setSystemTime(MX_1900);
    const { service, prisma } = build();

    await service.getTodayLunchBreaks(7);

    const where = prisma.lunchBreak.findMany.mock.calls[0][0].where;
    expect(diaGuardado(where.date)).toBe('2026-09-08');
    expect(diaGuardado(where.date)).not.toBe('2026-09-09');
  });

  it('la entrada a comida de la tarde se guarda en el día mexicano', async () => {
    jest.useFakeTimers().setSystemTime(MX_1900);
    const { service, prisma } = build();

    await service.createCheckin(
      3,
      { checkinTime: MX_1900.toISOString(), checkinPhotoUrl: 'foto.jpg' } as any,
      7,
    );

    const data = prisma.lunchBreak.create.mock.calls[0][0].data;
    expect(diaGuardado(data.date)).toBe('2026-09-08');
  });

  it('la comida y el panel usan el MISMO día (si no, el panel nunca la encuentra)', async () => {
    jest.useFakeTimers().setSystemTime(MX_1900);
    const { service, prisma } = build();

    await service.createCheckin(
      3,
      { checkinTime: MX_1900.toISOString(), checkinPhotoUrl: 'foto.jpg' } as any,
      7,
    );
    await service.getTodayLunchBreaks(7);

    const escrito = prisma.lunchBreak.create.mock.calls[0][0].data.date;
    const consultado = prisma.lunchBreak.findMany.mock.calls[0][0].where.date;
    expect(consultado.getTime()).toBe(escrito.getTime());
  });

  it('la madrugada UTC que aún es ayer en México no adelanta el día', async () => {
    // 2026-09-09T04:00Z = 2026-09-08 22:00 mx
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T04:00:00Z'));
    const { service, prisma } = build();

    await service.getTodayLunchBreaks(7);

    const where = prisma.lunchBreak.findMany.mock.calls[0][0].where;
    expect(diaGuardado(where.date)).toBe('2026-09-08');
  });
});

describe('la ventana de comida son las 15:00–16:00 de México', () => {
  it('entrar a las 15:30 de México NO es tarde', async () => {
    jest.useFakeTimers().setSystemTime(MX_1530);
    const { service, prisma } = build();

    await service.createCheckin(
      3,
      { checkinTime: MX_1530.toISOString(), checkinPhotoUrl: 'foto.jpg' } as any,
      7,
    );

    const data = prisma.lunchBreak.create.mock.calls[0][0].data;
    expect(data.isCheckinLate).toBe(false);
    expect(data.notes).toBe('');
  });

  it('medida en UTC, esa misma entrada habría sido "tarde" — el error que había', () => {
    // A las 21:30 UTC, una ventana calculada con la hora del servidor (15:00 a
    // 16:00 UTC) ya habría pasado hace cinco horas y media.
    const utcInicio = new Date('2026-09-08T15:00:00Z');
    const utcFin = new Date('2026-09-08T16:00:00Z');
    expect(MX_1530 > utcFin).toBe(true);
    expect(MX_1530 > utcInicio).toBe(true);
  });

  it('entrar a las 14:30 de México es antes de la ventana', async () => {
    const mx1430 = new Date('2026-09-08T20:30:00Z');
    jest.useFakeTimers().setSystemTime(mx1430);
    const { service, prisma } = build();

    await service.createCheckin(
      3,
      { checkinTime: mx1430.toISOString(), checkinPhotoUrl: 'foto.jpg' } as any,
      7,
    );

    const data = prisma.lunchBreak.create.mock.calls[0][0].data;
    expect(data.isCheckinLate).toBe(true);
    expect(data.notes).toMatch(/30 minutos antes/);
  });

  it('entrar a las 16:30 de México es media hora tarde, no hora y media', async () => {
    // El retraso se mide contra el FIN de la ventana (16:00). Antes se medía
    // contra las 15:00 y la nota guardaba 90 minutos en vez de 30.
    const mx1630 = new Date('2026-09-08T22:30:00Z');
    jest.useFakeTimers().setSystemTime(mx1630);
    const { service, prisma } = build();

    await service.createCheckin(
      3,
      { checkinTime: mx1630.toISOString(), checkinPhotoUrl: 'foto.jpg' } as any,
      7,
    );

    const data = prisma.lunchBreak.create.mock.calls[0][0].data;
    expect(data.isCheckinLate).toBe(true);
    expect(data.notes).toMatch(/30 minutos después/);
    expect(data.notes).not.toMatch(/90 minutos/);
  });
});

describe('las notas de la comida no inventan texto', () => {
  it('un registro sin notas previas no queda empezando por "null"', async () => {
    const mx1600 = new Date('2026-09-08T22:00:00Z');
    jest.useFakeTimers().setSystemTime(mx1600);
    const { service, prisma } = build({
      lunchBreak: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, notes: null, checkoutTime: null }),
      },
    });

    await service.createCheckout(
      3,
      { checkoutTime: mx1600.toISOString(), checkoutPhotoUrl: 'foto.jpg' } as any,
      7,
    );

    const data = prisma.lunchBreak.update.mock.calls[0][0].data;
    expect(data.notes.startsWith('null')).toBe(false);
    expect(data.notes).not.toMatch(/null/);
  });
});

describe('nadie vuelve a meter setHours', () => {
  const archivos = [
    'lunch-breaks.service.ts',
    'lunch-breaks.cron.service.ts',
    'lunch-breaks.controller.ts',
  ];

  /** El código sin comentarios: aquí sí se explica el defecto por su nombre. */
  const codigoEfectivo = (nombre: string) =>
    readFileSync(join(__dirname, nombre), 'utf8')
      .split('\n')
      .filter((linea) => {
        const l = linea.trim();
        return !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*');
      })
      .join('\n');

  it.each(archivos)('%s no calcula el día con la hora del servidor', (nombre) => {
    const codigo = codigoEfectivo(nombre);
    expect(codigo).not.toMatch(/setHours/);
    expect(codigo).not.toMatch(/setMinutes/);
    expect(codigo).not.toMatch(/getTimezoneOffset/);
  });

  it('el cron dispara en la zona de la empresa, no en la del proceso', () => {
    const codigo = readFileSync(join(__dirname, 'lunch-breaks.cron.service.ts'), 'utf8');
    // Sin `timeZone`, el aviso de "tu comida es en 10 minutos" salía a las
    // 08:50 de México en vez de a las 14:50.
    const crons = codigo.match(/@Cron\([^)]*\)/g) ?? [];
    expect(crons.length).toBeGreaterThan(0);
    for (const cron of crons) {
      expect(cron).toMatch(/timeZone/);
    }
  });
});
