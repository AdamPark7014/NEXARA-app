import { BadRequestException } from '@nestjs/common';
import { AsistenteChatService } from './asistente-chat.service.js';

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
});
