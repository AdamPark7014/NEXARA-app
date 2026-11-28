import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AsistenteChatService } from './asistente-chat.service.js';
import { IaNoDisponibleException } from '../claude/compuerta-ia.js';
import { PLATFORM_DEVELOPER_EMAIL } from '../../common/platform-accounts.js';

const GENERAL = { id: 333, members: [{ userId: 5 }] };

function armar(opts: { canal?: unknown; asignadas?: unknown[]; alcance?: { isOmniscient: boolean; reportIds: number[] } } = {}) {
  const prisma = {
    chatChannel: { findFirst: jest.fn().mockResolvedValue(opts.canal === undefined ? GENERAL : opts.canal) },
    activityAssignee: { findMany: jest.fn().mockResolvedValue(opts.asignadas ?? []) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    attendance: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const chat = {
    resolveChatScope: jest.fn().mockResolvedValue(opts.alcance ?? { isOmniscient: false, reportIds: [] }),
  } as any;
  const ligas = { resolver: jest.fn().mockResolvedValue({}) } as any;
  const claude = {
    disponible: jest.fn().mockReturnValue(true),
    json: jest.fn().mockResolvedValue({ datos: { fueraDeTema: false, tema: 'perfil', respuesta: 'Pídeselo a tu jefe.' } }),
  } as any;
  const actividades = { interpretar: jest.fn() } as any;
  const svc = new AsistenteChatService(prisma, chat, ligas, claude, actividades);
  return { svc, prisma, chat, ligas, claude, actividades };
}

const yo = { id: 5, nombre: 'Laura Méndez', email: 'laura@nexara.com.mx', roleKey: 'tecnico', permissions: [] };

describe('AsistenteChatService', () => {
  it('solo responde en #general', async () => {
    const { svc } = armar({ canal: null });
    await expect(svc.responder(yo, 1, { texto: '@asistente hola', channelId: 99 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('«mis pendientes de hoy» sale de la base, con ligas, sin IA', async () => {
    const hoy = new Date();
    const { svc, claude } = armar({
      asignadas: [
        { activity: { id: 351, anNumber: 'AN-0351', titulo: 'Apoyo Biblioteca', estatus: 'En Proceso', fechaMaxima: hoy, fechaEntregaEsperada: null } },
        { activity: { id: 352, anNumber: 'AN-0352', titulo: 'Cableado', estatus: 'Pendiente', fechaMaxima: new Date(hoy.getTime() + 5 * 864e5), fechaEntregaEsperada: null } },
      ],
    });
    const r = await svc.responder(yo, 1, { texto: '[@Asistente](user:0) mis pendientes de hoy', channelId: 333 });
    expect(r).toMatchObject({ intencion: 'pendientes', fuente: 'codigo' });
    expect(r.texto).toContain('[AN-0351 · Apoyo Biblioteca](/erp/actividades/351)');
    expect(r.texto).not.toContain('AN-0352');
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('«quién está en jornada» sin equipo no enseña a nadie', async () => {
    const { svc, prisma } = armar({ alcance: { isOmniscient: false, reportIds: [] } });
    const r = await svc.responder(yo, 1, { texto: '@asistente ¿quién está en jornada?', channelId: 333 });
    expect(r.texto).toMatch(/lo ven el CEO y los jefes con equipo/);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('fuera de tema se contesta con texto fijo, sin IA', async () => {
    const { svc, claude } = armar();
    const r = await svc.responder(yo, 1, { texto: '@asistente cuéntame un chiste', channelId: 333 });
    expect(r.fuente).toBe('codigo');
    expect(r.texto).toMatch(/Solo te ayudo con NEXARA Core/);
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('«asígnale a…» de alguien que no es el CEO no llama al asistente de actividades', async () => {
    const { svc, actividades } = armar();
    const r = await svc.responder(yo, 1, { texto: '@asistente asígnale a Raúl revisar cámaras', channelId: 333 });
    expect(r.accion).toBeNull();
    expect(r.texto).toMatch(/solo del CEO/);
    expect(actividades.interpretar).not.toHaveBeenCalled();
  });

  describe('«asígnale a…» cuando la IA no está (solo el CEO lo usa)', () => {
    const ceo = { id: 1, nombre: 'Dirección', email: PLATFORM_DEVELOPER_EMAIL, roleKey: 'admin', permissions: [] };
    const pregunta = { texto: '@asistente asígnale a Raúl revisar cámaras', channelId: 333 };
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    it('un 503 de IA (llave caída, corte, presupuesto) se contesta en el chat con su frase y no lanza', async () => {
      const { svc, actividades } = armar();
      actividades.interpretar.mockRejectedValue(
        new IaNoDisponibleException('La IA no está disponible por ahora: ya se avisó al administrador.', 'llave_puerta_invalida', true),
      );
      const r = await svc.responder(ceo, 1, pregunta);
      expect(r).toMatchObject({
        intencion: 'asignar',
        fuente: 'codigo',
        texto: 'La IA no está disponible por ahora: ya se avisó al administrador.',
        accion: null,
        sugerencias: [],
      });
      expect(actividades.interpretar).toHaveBeenCalledTimes(1);
    });

    it('cualquier ServiceUnavailableException trae su texto (por ejemplo el tope diario)', async () => {
      const { svc, actividades } = armar();
      actividades.interpretar.mockRejectedValue(new ServiceUnavailableException('La IA respondió en un formato inesperado: intenta de nuevo.'));
      const r = await svc.responder(ceo, 1, pregunta);
      expect(r).toMatchObject({ fuente: 'codigo', accion: null, texto: 'La IA respondió en un formato inesperado: intenta de nuevo.' });
    });

    it('un error común (no es de la IA) se relanza: no se esconde un fallo de verdad', async () => {
      const { svc, actividades } = armar();
      actividades.interpretar.mockRejectedValue(new Error('boom'));
      await expect(svc.responder(ceo, 1, pregunta)).rejects.toThrow('boom');
    });

    it('con IA responde como siempre: propuestas para confirmar', async () => {
      const { svc, actividades } = armar();
      actividades.interpretar.mockResolvedValue({
        propuestas: [{ resumen: 'Revisar cámaras', titulo: 'Revisar cámaras', responsable: { nombre: 'Raúl' }, payload: { titulo: 'Revisar cámaras' } }],
        aclaracion: null,
      });
      const r = await svc.responder(ceo, 1, pregunta);
      expect(r).toMatchObject({ fuente: 'ia', intencion: 'asignar', accion: { tipo: 'crear-actividades' } });
      expect(r.accion?.propuestas).toHaveLength(1);
    });
  });

  it('lo que no cae en reglas va a Claude con proceso propio y respeta el tope por persona', async () => {
    const { svc, claude } = armar();
    const pregunta = { texto: '@asistente ¿puedo cambiar de jefe directo si me cambio de área?', channelId: 333 };
    const r = await svc.responder(yo, 1, pregunta);
    expect(r).toMatchObject({ fuente: 'ia', intencion: 'ia' });
    expect(r.texto).toContain('Pídeselo a tu jefe.');
    expect(r.texto).toContain('(/erp/my-profile)');
    const llamada = claude.json.mock.calls[0][0];
    expect(llamada).toMatchObject({ proceso: 'chat-asistente', companyId: 1, modelo: 'claude-haiku-5-5', pensar: false });
    expect(llamada.usuario).not.toContain('Laura');

    for (let i = 1; i < 20; i++) await svc.responder(yo, 1, pregunta);
    const tope = await svc.responder(yo, 1, pregunta);
    expect(tope.fuente).toBe('codigo');
    expect(tope.texto).toMatch(/se acabaron las preguntas abiertas/);
    expect(claude.json).toHaveBeenCalledTimes(20);
  });
  describe('cupo de la IA cuando la IA falla', () => {
    const pregunta = { texto: '@asistente ¿puedo cambiar de jefe directo si me cambio de área?', channelId: 333 };
    const usoDe = (svc: unknown) => Object.fromEntries((svc as { usoIA: Map<string, number> }).usoIA);
    const claveDe = (uso: Record<string, number>, resto: string) => Object.entries(uso).find(([k]) => k.includes(resto))?.[1];

    it('un fallo sin costo (la puerta no cobra) deja el uso de la persona y de la empresa en 0 y responde en español, sin IA', async () => {
      const { svc, claude } = armar();
      claude.json.mockRejectedValue(
        new IaNoDisponibleException('La IA no está disponible por ahora: ya se avisó al administrador.', 'llave_puerta_invalida', true),
      );
      const r = await svc.responder(yo, 1, pregunta);
      expect(r).toMatchObject({ fuente: 'codigo', intencion: 'ia' });
      expect(r.texto).toBe('La IA no está disponible por ahora: ya se avisó al administrador.');
      const uso = usoDe(svc);
      expect(claveDe(uso, ':5:')).toBe(0);
      expect(claveDe(uso, ':*:')).toBe(0);
    });

    it('con un error cualquiera (pudo cobrarse) el uso queda en 1', async () => {
      for (const error of [
        new IaNoDisponibleException('La IA no respondió: intenta de nuevo.', 'error_servicio', false),
        new ServiceUnavailableException('La IA respondió en un formato inesperado: intenta de nuevo.'),
        new Error('boom'),
      ]) {
        const { svc, claude } = armar();
        claude.json.mockRejectedValue(error);
        const r = await svc.responder(yo, 1, pregunta);
        expect(r.fuente).toBe('codigo');
        expect(r.texto).toMatch(/^La IA /);
        const uso = usoDe(svc);
        expect(claveDe(uso, ':5:')).toBe(1);
        expect(claveDe(uso, ':*:')).toBe(1);
      }
    });

    it('veinticinco preguntas con la IA caída no gastan el tope de 20: cuando vuelve, la persona sigue pudiendo preguntar', async () => {
      const { svc, claude } = armar();
      claude.json.mockRejectedValue(new IaNoDisponibleException('Se acabó el presupuesto de IA de este mes: avísale al administrador.', 'presupuesto_agotado', true));
      for (let i = 0; i < 25; i++) {
        const r = await svc.responder(yo, 1, pregunta);
        expect(r.texto).toMatch(/presupuesto de IA/);
      }
      claude.json.mockResolvedValue({ datos: { fueraDeTema: false, tema: null, respuesta: 'Ya volví.' } });
      const r = await svc.responder(yo, 1, pregunta);
      expect(r).toMatchObject({ fuente: 'ia' });
      expect(r.texto).toContain('Ya volví.');
      expect(claveDe(usoDe(svc), ':5:')).toBe(1);
    });

    it('lo devuelto es solo de esa persona: el uso de otra persona de la empresa no se toca', async () => {
      const { svc, claude } = armar();
      await svc.responder({ ...yo, id: 7 }, 1, pregunta);
      claude.json.mockRejectedValue(new IaNoDisponibleException('x', 'llave_puerta_invalida', true));
      await svc.responder(yo, 1, pregunta);
      const uso = usoDe(svc);
      expect(claveDe(uso, ':7:')).toBe(1);
      expect(claveDe(uso, ':5:')).toBe(0);
      expect(claveDe(uso, ':*:')).toBe(1);
    });
  });
});
