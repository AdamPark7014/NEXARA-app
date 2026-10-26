import { GpsService } from './gps.service.js';
import {
  ESPACIADO_MINIMO_MS,
  hayPuntoCercano,
  horaDelPunto,
  necesitaLatido,
  plataformaDeOrigen,
} from './cadencia-jornada.js';
import { GpsLatidoCronService } from './gps-latido.cron.service.js';
import { minutosDespues, motivoUbicacionPosterior, puntoSirveParaEntrada } from '../attendance/ubicacion-posterior.js';

/**
 * GPS de jornada: un punto cada 30 min, sin ráfagas y sin huecos de horas (Adam, 23-10-2026).
 *
 * Caso real (Iván, 23-10): checó 07:58 con la ubicación apagada; la app mandó 08:01:55 y 08:01:59
 * (dos puntos en 4 s) y luego cada ~5 min por la actividad; a las 08:29 la rotación de contraseñas
 * le cerró la sesión y cada punto se perdió con 401 hasta que volvió a entrar a las 13:12.
 */

const min = (n: number) => n * 60_000;
const at = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00-06:00`);

describe('horaDelPunto', () => {
  const ahora = at('13:12');

  it('usa la hora del teléfono al medir', () => {
    expect(horaDelPunto(at('08:20'), ahora)).toEqual(at('08:20'));
    expect(horaDelPunto(at('08:20').toISOString(), ahora)).toEqual(at('08:20'));
  });

  it('sin hora o con una inválida: la del servidor', () => {
    expect(horaDelPunto(undefined, ahora)).toEqual(ahora);
    expect(horaDelPunto('no-es-fecha', ahora)).toEqual(ahora);
  });

  it('del futuro (reloj adelantado): la del servidor', () => {
    expect(horaDelPunto(new Date(ahora.getTime() + min(90)), ahora)).toEqual(ahora);
  });

  it('de hace más de un día: no se guarda', () => {
    expect(horaDelPunto(new Date(ahora.getTime() - min(25 * 60)), ahora)).toBeNull();
  });
});

describe('hayPuntoCercano', () => {
  it('a menos de 20 min de otro punto no se guarda (la ráfaga de las 08:01)', () => {
    expect(hayPuntoCercano(new Date('2026-10-23T14:01:59Z'), [new Date('2026-10-23T14:01:55Z')])).toBe(true);
    expect(hayPuntoCercano(at('08:14'), [at('08:01')])).toBe(true);
  });

  it('a 20 min o más sí', () => {
    expect(hayPuntoCercano(at('08:21'), [at('08:01')])).toBe(false);
    expect(hayPuntoCercano(new Date(at('08:01').getTime() + ESPACIADO_MINIMO_MS), [at('08:01')])).toBe(false);
  });

  it('también mira hacia adelante (punto rezagado de la cola)', () => {
    expect(hayPuntoCercano(at('09:50'), [at('10:00')])).toBe(true);
  });
});

describe('necesitaLatido', () => {
  const base = { entradaAt: at('07:58'), ultimoLatidoAt: null, plataforma: 'ANDROID' as const };

  it('con un punto reciente no hace falta', () => {
    expect(necesitaLatido({ ...base, ahora: at('08:30'), ultimoPuntoAt: at('08:20') })).toBe(false);
  });

  it('35 min sin punto: sí', () => {
    expect(necesitaLatido({ ...base, ahora: at('08:56'), ultimoPuntoAt: at('08:20') })).toBe(true);
  });

  it('sin ningún punto cuenta desde la entrada', () => {
    expect(necesitaLatido({ ...base, ahora: at('08:20'), ultimoPuntoAt: null })).toBe(false);
    expect(necesitaLatido({ ...base, ahora: at('08:35'), ultimoPuntoAt: null })).toBe(true);
  });

  it('Android: no más de un latido cada 30 min; iOS: un recordatorio por hora', () => {
    const p = { ...base, ahora: at('10:00'), ultimoPuntoAt: at('08:20') };
    expect(necesitaLatido({ ...p, ultimoLatidoAt: at('09:40') })).toBe(false);
    expect(necesitaLatido({ ...p, ultimoLatidoAt: at('09:25') })).toBe(true);
    expect(necesitaLatido({ ...p, plataforma: 'IOS', ultimoLatidoAt: at('09:25') })).toBe(false);
    expect(necesitaLatido({ ...p, plataforma: 'IOS', ultimoLatidoAt: at('08:55') })).toBe(true);
  });

  it('desde la web no hay a quién pedirle', () => {
    expect(necesitaLatido({ ...base, plataforma: 'OTRA', ahora: at('12:00'), ultimoPuntoAt: null })).toBe(false);
    expect(plataformaDeOrigen('WEB')).toBe('OTRA');
    expect(plataformaDeOrigen('ios')).toBe('IOS');
  });
});

describe('ubicación posterior de la entrada', () => {
  it('vale un punto de hasta 30 min después (y uno de un minuto antes)', () => {
    expect(puntoSirveParaEntrada(at('07:58'), at('08:01'))).toBe(true);
    expect(puntoSirveParaEntrada(at('07:58'), at('08:28'))).toBe(true);
    expect(puntoSirveParaEntrada(at('07:58'), at('08:29'))).toBe(false);
    expect(puntoSirveParaEntrada(at('07:58'), new Date(at('07:58').getTime() - 30_000))).toBe(true);
    expect(minutosDespues(at('07:58'), at('08:01'))).toBe(3);
  });

  it('el motivo dice cuándo y conserva la causa', () => {
    expect(motivoUbicacionPosterior(3, 'Sin ubicación: ubicación del teléfono apagada')).toBe(
      'Ubicación tomada 3 min después de checar (al checar: ubicación del teléfono apagada)',
    );
    expect(motivoUbicacionPosterior(0, 'Sin ubicación')).toBe('Ubicación tomada al minuto de checar');
  });

  it('solo cambia el motivo de «Sin ubicación»; los otros se quedan', () => {
    expect(
      motivoUbicacionPosterior(5, 'Sin ubicación: permiso de ubicación negado · Registrada sin conexión'),
    ).toBe('Ubicación tomada 5 min después de checar (al checar: permiso de ubicación negado) · Registrada sin conexión');
    expect(motivoUbicacionPosterior(5, null)).toBe('Ubicación tomada 5 min después de checar');
  });
});

describe('POST /gps con la cadencia de jornada', () => {
  function build(guardados: Date[] = []) {
    const prisma: any = {
      locationTracking: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data })),
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(
            guardados
              .filter((g) => g > where.ultimaActualizacion.gt && g < where.ultimaActualizacion.lt)
              .map((g) => ({ ultimaActualizacion: g })),
          ),
        ),
      },
      companyProfile: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      locationStatusEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const attendance = { asignarUbicacionPosterior: jest.fn().mockResolvedValue(true) };
    const service = new GpsService(prisma as any, undefined, attendance as any);
    return { service, prisma, attendance };
  }

  const punto = (over: Record<string, unknown> = {}) => ({
    usuarioId: 10,
    latitud: 19.07402,
    longitud: -98.27774,
    ...over,
  });

  it('guarda el punto con la hora del teléfono', async () => {
    const { service, prisma } = build();
    const hace5 = new Date(Date.now() - min(5));
    await service.create(punto({ ultimaActualizacion: hace5 }) as any, 7);
    expect(prisma.locationTracking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ultimaActualizacion: hace5 }) }),
    );
  });

  it('no guarda un segundo punto a segundos del primero, pero sí lo usa para la entrada', async () => {
    const ahora = new Date();
    const { service, prisma, attendance } = build([new Date(ahora.getTime() - 4_000)]);
    const res: any = await service.create(punto({ ultimaActualizacion: ahora }) as any, 7);
    expect(res.skipped).toBe(true);
    expect(prisma.locationTracking.create).not.toHaveBeenCalled();
    expect(attendance.asignarUbicacionPosterior).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, latitude: 19.07402, longitude: -98.27774 }),
    );
  });

  it('un punto con ubicación simulada no completa la entrada', async () => {
    const { service, attendance } = build();
    await service.create(punto({ mockLocation: true }) as any, 7);
    expect(attendance.asignarUbicacionPosterior).not.toHaveBeenCalled();
  });
});

describe('latido del GPS de jornada', () => {
  function build(params: { ultimoPunto: Date | null; origen: string }) {
    const prisma: any = {
      attendanceDay: {
        findMany: jest.fn().mockResolvedValue([{ userId: 10, companyId: 1, lastEntryAt: at('07:58') }]),
      },
      locationTracking: {
        groupBy: jest.fn().mockResolvedValue(
          params.ultimoPunto ? [{ usuarioId: 10, _max: { ultimaActualizacion: params.ultimoPunto } }] : [],
        ),
      },
      attendance: { findMany: jest.fn().mockResolvedValue([{ userId: 10, origen: params.origen }]) },
    };
    const push = { sendGpsLatido: jest.fn().mockResolvedValue(1) };
    return { cron: new GpsLatidoCronService(prisma as any, push as any), push };
  }

  it('Android sin punto desde las 08:20: latido de datos, sin texto, y no se repite a los 5 min', async () => {
    const { cron, push } = build({ ultimoPunto: at('08:20'), origen: 'ANDROID' });
    expect(await cron.revisarAhora(at('09:00'))).toBe(1);
    expect(push.sendGpsLatido).toHaveBeenCalledWith(10, null);
    expect(await cron.revisarAhora(at('09:05'))).toBe(0);
    expect(await cron.revisarAhora(at('09:31'))).toBe(1);
  });

  it('iOS: recordatorio visible con la hora del último punto', async () => {
    const { cron, push } = build({ ultimoPunto: at('08:20'), origen: 'IOS' });
    await cron.revisarAhora(at('09:00'));
    expect(push.sendGpsLatido).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ body: expect.stringContaining('08:20') }),
    );
  });

  it('con un punto reciente no molesta', async () => {
    const { cron, push } = build({ ultimoPunto: at('08:50'), origen: 'ANDROID' });
    expect(await cron.revisarAhora(at('09:00'))).toBe(0);
    expect(push.sendGpsLatido).not.toHaveBeenCalled();
  });
});
