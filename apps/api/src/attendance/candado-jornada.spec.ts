import { ConflictException } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { JornadaAbiertaInterceptor } from './candado-jornada.interceptor.js';
import { CODIGO_JORNADA_NO_ABIERTA, pideJornadaAbierta, rutaExenta, rutaNormalizada } from './candado-jornada.js';

const tecnico = { id: 7, email: 'tecnico@ejemplo.test', roleKey: 'tecnico' };
const direccion = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' };
const rh = { id: 2, email: 'rh@ejemplo.test', roleKey: 'rh' };

describe('sin entrada no se trabaja: qué peticiones piden jornada abierta', () => {
  it('normaliza la ruta', () => {
    expect(rutaNormalizada('/api/me/activities/5/iniciar?x=1')).toBe('me/activities/5/iniciar');
    expect(rutaNormalizada('/api/attendance/')).toBe('attendance');
  });

  it('operar pide jornada: iniciar actividad, evidencia, cotizar, almacén', () => {
    for (const url of [
      '/api/me/activities/5/iniciar',
      '/api/activity-evidence/5/fotos',
      '/api/cotizaciones',
      '/api/warehouse/salidas',
      '/api/activities',
    ]) {
      expect(pideJornadaAbierta({ metodo: 'POST', url, usuario: tecnico, env: {} })).toBe(true);
    }
    expect(pideJornadaAbierta({ metodo: 'PATCH', url: '/api/activities/5', usuario: tecnico, env: {} })).toBe(true);
    expect(pideJornadaAbierta({ metodo: 'DELETE', url: '/api/me/pendientes/3', usuario: tecnico, env: {} })).toBe(true);
  });

  it('consultar nunca se bloquea', () => {
    expect(pideJornadaAbierta({ metodo: 'GET', url: '/api/me/activities', usuario: tecnico, env: {} })).toBe(false);
  });

  it('checar, justificar, chat, avisos, sesión y pedir permiso no piden jornada', () => {
    for (const url of [
      '/api/attendance',
      '/api/attendance/justificaciones',
      '/api/lunch-breaks/iniciar',
      '/api/gps/latido',
      '/api/chat/mensajes',
      '/api/chat/asistente',
      '/api/notifications/5/leida',
      '/api/auth/refresh',
      '/api/devices',
      '/api/hr/solicitudes-aprobacion',
      '/api/me/activities/tiempo-calculado',
    ]) {
      expect(pideJornadaAbierta({ metodo: 'POST', url, usuario: tecnico, env: {} })).toBe(false);
    }
  });

  it('una ruta que solo empieza parecido no queda exenta', () => {
    expect(rutaExenta('chat')).toBe(true);
    expect(rutaExenta('chat/mensajes')).toBe(true);
    expect(rutaExenta('chatarra')).toBe(false);
    expect(rutaExenta('attendance-x')).toBe(false);
  });

  it('dirección y RH no checan: sin candado', () => {
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: direccion, env: {} })).toBe(false);
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: rh, env: {} })).toBe(false);
  });

  it('sin usuario, portal de cliente o sucursal: no aplica', () => {
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: null, env: {} })).toBe(false);
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: { id: null, isClient: true }, env: {} })).toBe(false);
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: { id: null, isBranchUser: true }, env: {} })).toBe(false);
  });

  it('exención temporal por id (JORNADA_EXENTOS): solo esa persona', () => {
    const env = { JORNADA_EXENTOS: '7, 12' };
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: tecnico, env })).toBe(false);
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: { ...tecnico, id: 8 }, env })).toBe(true);
  });

  it('se apaga con JORNADA_OBLIGATORIA=0', () => {
    expect(pideJornadaAbierta({ metodo: 'POST', url: '/api/activities', usuario: tecnico, env: { JORNADA_OBLIGATORIA: '0' } })).toBe(false);
  });
});

describe('JornadaAbiertaInterceptor', () => {
  const contexto = (req: Record<string, unknown>) =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => req }) }) as never;
  const siguiente = { handle: jest.fn(() => of('ok')) };
  const anterior = process.env.JORNADA_OBLIGATORIA;
  beforeEach(() => {
    delete process.env.JORNADA_OBLIGATORIA;
    siguiente.handle.mockClear();
  });
  afterAll(() => {
    if (anterior === undefined) delete process.env.JORNADA_OBLIGATORIA;
    else process.env.JORNADA_OBLIGATORIA = anterior;
  });

  it('sin jornada abierta rechaza con 409 y el código estable, y no llega al controlador', async () => {
    const prisma = { attendanceDay: { findFirst: jest.fn().mockResolvedValue(null) } };
    const i = new JornadaAbiertaInterceptor(prisma as never);
    const req = { method: 'POST', originalUrl: '/api/me/activities/5/iniciar', user: tecnico };
    await expect(i.intercept(contexto(req), siguiente)).rejects.toBeInstanceOf(ConflictException);
    await i.intercept(contexto(req), siguiente).catch((e: ConflictException) => {
      expect((e.getResponse() as { code: string }).code).toBe(CODIGO_JORNADA_NO_ABIERTA);
    });
    expect(siguiente.handle).not.toHaveBeenCalled();
  });

  it('con jornada abierta (aunque sea de ayer: turno de noche) deja pasar', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 3 });
    const i = new JornadaAbiertaInterceptor({ attendanceDay: { findFirst } } as never);
    const req = { method: 'POST', originalUrl: '/api/me/activities/5/iniciar', user: tecnico };
    await expect(lastValueFrom(await i.intercept(contexto(req), siguiente))).resolves.toBe('ok');
    // No filtra por fecha: cualquier jornada abierta de la persona cuenta.
    expect(findFirst.mock.calls[0][0].where).toEqual({ userId: 7, isOpen: true });
  });

  it('checar la entrada no consulta ni bloquea', async () => {
    const findFirst = jest.fn();
    const i = new JornadaAbiertaInterceptor({ attendanceDay: { findFirst } } as never);
    const req = { method: 'POST', originalUrl: '/api/attendance', user: tecnico };
    await expect(lastValueFrom(await i.intercept(contexto(req), siguiente))).resolves.toBe('ok');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('si la consulta falla no se le impide trabajar a nadie', async () => {
    const i = new JornadaAbiertaInterceptor({
      attendanceDay: { findFirst: jest.fn().mockRejectedValue(new Error('base caída')) },
    } as never);
    const req = { method: 'POST', originalUrl: '/api/activities', user: tecnico };
    await expect(lastValueFrom(await i.intercept(contexto(req), siguiente))).resolves.toBe('ok');
  });
});
