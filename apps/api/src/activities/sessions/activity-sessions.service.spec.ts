import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ActivitySessionsService,
  cerrarSesionesDeUsuario,
  cerrarSesionesVencidas,
  leerSesiones,
  sesionesDe,
} from './activity-sessions.service';

/**
 * Sesiones de trabajo contra una base de mentira en memoria: lo que importa aquí es qué
 * filas quedan escritas (quién cerró, cuándo y por qué), no las cuentas —esas están en
 * `sesiones-trabajo.spec.ts`.
 *
 * Hora de México (UTC−6). «Ahora» es el martes 15-09-2026 a las 13:00.
 */
const M = (dia: string, hhmm: string) => new Date(`2026-09-${dia}T${hhmm}:00-06:00`);
const AHORA = M('15', '13:00');
const EMPRESA = 7;

const CEO = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' };
const JEFE = { id: 20, email: 'operaciones@nexara.com.mx', roleKey: 'ingeniero' };
const TECNICO = { id: 30, email: 'tecnico@nexara.com.mx', roleKey: 'ingeniero' };
const AJENO = { id: 40, email: 'ventas@nexara.com.mx', roleKey: 'ingeniero' };

type Fila = Record<string, any>;

function coincide(fila: Fila, where: Fila = {}): boolean {
  return Object.entries(where).every(([campo, esperado]) => {
    if (campo === 'OR') return (esperado as Fila[]).some((w) => coincide(fila, w));
    const valor = fila[campo];
    if (esperado === null) return valor == null;
    if (esperado instanceof Date) return valor instanceof Date && valor.getTime() === esperado.getTime();
    if (typeof esperado === 'object') {
      if ('in' in esperado) return (esperado.in as unknown[]).includes(valor);
      if ('lte' in esperado && !(valor <= esperado.lte)) return false;
      if ('gte' in esperado && !(valor >= esperado.gte)) return false;
      return true;
    }
    return valor === esperado;
  });
}

function armar(
  over: {
    asignacion?: Fila | null;
    actividad?: Fila;
    sesiones?: Fila[];
    ultimaChecada?: Fila | null;
  } = {},
) {
  const actividad = { titulo: 'Instalar cámaras', estatus: 'En Proceso', assignmentCharge: 'ejecucion', deletedAt: null, ...over.actividad };
  const asignacion =
    over.asignacion === null
      ? null
      : {
          id: 9,
          companyId: EMPRESA,
          rol: 'TECNICO',
          retiradoAt: null,
          inicioRealAt: M('15', '09:00'),
          finRealAt: null,
          activity: actividad,
          ...over.asignacion,
        };
  const sesiones: Fila[] = (over.sesiones ?? []).map((s, i) => ({
    id: i + 1,
    activityId: 10,
    userId: TECNICO.id,
    companyId: EMPRESA,
    endedAt: null,
    endReason: null,
    endedById: null,
    nota: null,
    ...s,
  }));
  const usuarios = [
    { id: CEO.id, email: CEO.email, managerId: null, nombre: 'Christian Del Pozo' },
    { id: JEFE.id, email: JEFE.email, managerId: CEO.id, nombre: 'David Operaciones' },
    { id: TECNICO.id, email: TECNICO.email, managerId: JEFE.id, nombre: 'Joan Sánchez' },
    { id: AJENO.id, email: AJENO.email, managerId: CEO.id, nombre: 'Otra Área' },
  ];
  const conQuien = (s: Fila) => ({
    ...s,
    endedBy: s.endedById ? usuarios.find((u) => u.id === s.endedById) ?? null : null,
  });

  const prisma: any = {
    activityWorkSession: {
      findMany: jest.fn(async ({ where }: any) =>
        sesiones
          .filter((s) => coincide(s, where))
          .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
          .map(conQuien),
      ),
      count: jest.fn(async ({ where }: any) => sesiones.filter((s) => coincide(s, where)).length),
      create: jest.fn(async ({ data }: any) => {
        const fila = { id: sesiones.length + 1, endedAt: null, endReason: null, endedById: null, nota: null, ...data };
        sesiones.push(fila);
        return fila;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const tocadas = sesiones.filter((s) => coincide(s, where));
        tocadas.forEach((s) => Object.assign(s, data));
        return { count: tocadas.length };
      }),
    },
    activityAssignee: {
      findFirst: jest.fn(async () => asignacion),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    activity: { findFirst: jest.fn(async () => null) },
    attendance: { findFirst: jest.fn(async () => over.ultimaChecada ?? null) },
    user: {
      findMany: jest.fn(async () => usuarios),
      findFirst: jest.fn(async ({ where }: any) => usuarios.find((u) => u.id === where.id) ?? null),
    },
  };
  const avisos = { createNotification: jest.fn().mockResolvedValue(undefined) };
  const service = new ActivitySessionsService(prisma, avisos as any);
  return { service, prisma, sesiones, avisos };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(AHORA);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('abrir la sesión', () => {
  it('al iniciar queda una sesión corriendo, de su empresa', async () => {
    const { service, sesiones } = armar({ asignacion: { inicioRealAt: AHORA } });
    expect(await service.abrir({ activityId: 10, userId: TECNICO.id, at: AHORA })).toEqual({ abierta: true });
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).toMatchObject({
      activityId: 10,
      userId: TECNICO.id,
      companyId: EMPRESA,
      startedAt: AHORA,
      endedAt: null,
    });
  });

  it('es idempotente: tocar «Iniciar» dos veces no abre dos', async () => {
    const { service, sesiones } = armar({ asignacion: { inicioRealAt: AHORA } });
    await service.abrir({ activityId: 10, userId: TECNICO.id, at: AHORA });
    await service.abrir({ activityId: 10, userId: TECNICO.id, at: AHORA });
    expect(sesiones).toHaveLength(1);
  });

  it('no abre para quien solo reparte un despacho, ni si ya entregó o está cerrada', async () => {
    const reparte = armar({ asignacion: { rol: 'LEAD' }, actividad: { assignmentCharge: 'despacho' } });
    const entregada = armar({ asignacion: { finRealAt: M('15', '11:00') } });
    const cerrada = armar({ actividad: { estatus: 'Finalizada' } });
    for (const caso of [reparte, entregada, cerrada]) {
      expect(await caso.service.abrir({ activityId: 10, userId: TECNICO.id, at: AHORA })).toEqual({ abierta: false });
      expect(caso.sesiones).toHaveLength(0);
    }
  });

  it('una actividad iniciada hoy antes de la regla sigue como una sola sesión desde su inicio', async () => {
    const { service, sesiones } = armar({ asignacion: { inicioRealAt: M('15', '09:00') } });
    await service.abrir({ activityId: 10, userId: TECNICO.id, at: AHORA });
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).toMatchObject({ startedAt: M('15', '09:00'), endedAt: null });
  });

  it('una iniciada hace días guarda su intervalo viejo con tope y abre la de hoy', async () => {
    const { service, sesiones } = armar({ asignacion: { inicioRealAt: M('10', '09:00') } });
    await service.abrir({ activityId: 10, userId: TECNICO.id, at: AHORA });
    expect(sesiones).toHaveLength(2);
    // Lo de antes no se pierde, pero tampoco cuenta cinco días: 12 horas.
    expect(sesiones[0]).toMatchObject({ startedAt: M('10', '09:00'), endedAt: M('10', '21:00'), endReason: 'TOPE_12H' });
    expect(sesiones[1]).toMatchObject({ startedAt: AHORA, endedAt: null });
  });

  it('si quedó una abierta desde ayer, primero la corta y luego abre la de hoy', async () => {
    const { service, sesiones } = armar({ sesiones: [{ startedAt: M('14', '17:00') }] });
    await service.abrir({ activityId: 10, userId: TECNICO.id, at: AHORA });
    expect(sesiones[0].endReason).toBe('CORTE_DIA');
    expect(sesiones[0].endedAt.getTime()).toBe(M('15', '00:00').getTime() - 1);
    expect(sesiones[1]).toMatchObject({ startedAt: AHORA, endedAt: null });
  });
});

describe('checada de salida', () => {
  it('cierra todo lo que la persona tenga corriendo, a la hora de su salida y con SALIDA', async () => {
    const { prisma, sesiones } = armar({
      sesiones: [
        { startedAt: M('15', '09:00') },
        { startedAt: M('15', '11:00'), activityId: 11 },
        { startedAt: M('15', '10:00'), userId: AJENO.id },
      ],
    });
    const salida = M('15', '18:00');
    expect(await cerrarSesionesDeUsuario(prisma, { userId: TECNICO.id, at: salida, companyId: EMPRESA })).toBe(2);
    expect(sesiones[0]).toMatchObject({ endedAt: salida, endReason: 'SALIDA' });
    expect(sesiones[1]).toMatchObject({ endedAt: salida, endReason: 'SALIDA' });
    // La de otra persona sigue corriendo.
    expect(sesiones[2].endedAt).toBeNull();
  });

  it('una que ya había pasado sus 12 horas se cierra en su tope, no a la hora de salida', async () => {
    const { prisma, sesiones } = armar({ sesiones: [{ startedAt: M('15', '05:00') }] });
    await cerrarSesionesDeUsuario(prisma, { userId: TECNICO.id, at: M('15', '19:00'), companyId: EMPRESA });
    expect(sesiones[0]).toMatchObject({ endedAt: M('15', '17:00'), endReason: 'TOPE_12H' });
  });

  it('un cliente Prisma sin la tabla (pruebas viejas, arranque sin migración) no tumba la checada', async () => {
    await expect(cerrarSesionesDeUsuario({} as any, { userId: 3, at: AHORA })).resolves.toBe(0);
  });
});

describe('cierre perezoso', () => {
  it('escribe TOPE_12H o CORTE_DIA en las que quedaron abiertas y deja las que aún corren', async () => {
    const { prisma, sesiones } = armar({
      sesiones: [
        { startedAt: M('14', '08:00') },
        { startedAt: M('14', '18:00'), activityId: 11 },
        { startedAt: M('15', '12:00'), activityId: 12 },
      ],
    });
    expect(await cerrarSesionesVencidas(prisma, { userIds: [TECNICO.id], companyId: EMPRESA }, AHORA)).toBe(2);
    expect(sesiones[0]).toMatchObject({ endedAt: M('14', '20:00'), endReason: 'TOPE_12H' });
    expect(sesiones[1].endReason).toBe('CORTE_DIA');
    expect(sesiones[2].endedAt).toBeNull();
  });

  it('si la escritura falla, la lectura sigue', async () => {
    const { prisma } = armar({ sesiones: [{ startedAt: M('14', '08:00') }] });
    prisma.activityWorkSession.updateMany.mockRejectedValue(new Error('sin conexión'));
    await expect(cerrarSesionesVencidas(prisma, { userIds: [TECNICO.id] }, AHORA)).resolves.toBe(0);
  });
});

describe('reanudar sola (apps publicadas, sin botón «Reanudar»)', () => {
  const pausadaAyer = [{ startedAt: M('14', '09:00'), endedAt: M('14', '18:00'), endReason: 'SALIDA' }];

  it('tocar su evidencia con el reloj detenido abre una sesión nueva', async () => {
    const { service, sesiones } = armar({ sesiones: pausadaAyer });
    expect(await service.asegurarAbierta({ activityId: 10, userId: TECNICO.id })).toEqual({ abierta: true });
    expect(sesiones[1]).toMatchObject({ startedAt: AHORA, endedAt: null });
  });

  it('después de su salida de hoy ya no: lo que suba se guarda, pero el reloj no vuelve a correr', async () => {
    const { service, sesiones } = armar({ sesiones: pausadaAyer, ultimaChecada: { type: 'salida' } });
    expect(await service.asegurarAbierta({ activityId: 10, userId: TECNICO.id })).toEqual({ abierta: false });
    expect(sesiones).toHaveLength(1);
  });

  it('sin haberla iniciado no abre nada (eso es de la foto de entrada)', async () => {
    const { service, sesiones } = armar({ asignacion: { inicioRealAt: null } });
    expect(await service.asegurarAbierta({ activityId: 10, userId: TECNICO.id })).toEqual({ abierta: false });
    expect(sesiones).toHaveLength(0);
  });
});

describe('foto de salida', () => {
  it('cierra con FIN y deja las horas reales como la suma de sus sesiones', async () => {
    const { service, prisma, sesiones } = armar({
      sesiones: [
        { startedAt: M('14', '09:00'), endedAt: M('14', '12:00'), endReason: 'SALIDA' },
        { startedAt: M('15', '10:00') },
      ],
    });
    await service.terminar({ activityId: 10, userId: TECNICO.id, at: M('15', '11:30') });
    expect(sesiones[1]).toMatchObject({ endedAt: M('15', '11:30'), endReason: 'FIN' });
    // 3 h + 1.5 h, no «las 26.5 h de corrido».
    expect(prisma.activityAssignee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { horasReales: 4.5 } }),
    );
  });
});

describe('pausar', () => {
  const corriendo = [{ startedAt: M('15', '09:00') }];
  const pedir = (actor: any, motivo?: string) => ({
    actor,
    userId: TECNICO.id,
    activityId: 10,
    motivo,
    companyId: EMPRESA,
  });

  it('el jefe pausa la de su gente: queda quién, cuándo y por qué, y la persona recibe aviso', async () => {
    const { service, sesiones, avisos } = armar({ sesiones: corriendo });
    const estado = await service.pausar(pedir(JEFE, 'Atiende la falla urgente de Pádel del Arte'));

    expect(sesiones[0]).toMatchObject({
      endedAt: AHORA,
      endReason: 'PAUSA',
      endedById: JEFE.id,
      nota: 'Atiende la falla urgente de Pádel del Arte',
    });
    expect(estado).toMatchObject({
      enCurso: false,
      enPausa: true,
      pausaTipo: 'PAUSA',
      pausadaPor: { id: JEFE.id },
      motivoPausa: 'Atiende la falla urgente de Pádel del Arte',
      minutosReales: 240,
    });
    await Promise.resolve();
    expect(avisos.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TECNICO.id, triggerUserId: JEFE.id, relatedEntityId: 10 }),
    );
  });

  it('el jefe no pausa sin motivo (mínimo 10 caracteres)', async () => {
    const { service, sesiones } = armar({ sesiones: corriendo });
    await expect(service.pausar(pedir(JEFE, 'urgente'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.pausar(pedir(JEFE))).rejects.toThrow(/por qué la pausas/);
    expect(sesiones[0].endedAt).toBeNull();
  });

  it('quien no es su jefe no puede pausarla', async () => {
    const { service, sesiones } = armar({ sesiones: corriendo });
    await expect(service.pausar(pedir(AJENO, 'Necesito que haga otra cosa'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(sesiones[0].endedAt).toBeNull();
  });

  it('dirección pausa la de cualquiera', async () => {
    const { service, sesiones } = armar({ sesiones: corriendo });
    await service.pausar(pedir(CEO, 'Cambio de prioridad del día'));
    expect(sesiones[0]).toMatchObject({ endReason: 'PAUSA', endedById: CEO.id });
  });

  it('la propia persona pausa la suya sin motivo y sin aviso', async () => {
    const { service, sesiones, avisos } = armar({ sesiones: corriendo });
    const estado = await service.pausar(pedir(TECNICO));
    expect(sesiones[0]).toMatchObject({ endReason: 'PAUSA', endedById: TECNICO.id, nota: null });
    expect(estado.enPausa).toBe(true);
    expect(avisos.createNotification).not.toHaveBeenCalled();
  });

  it('con el reloj ya detenido no hay nada que pausar', async () => {
    const { service } = armar({
      sesiones: [{ startedAt: M('14', '09:00'), endedAt: M('14', '18:00'), endReason: 'SALIDA' }],
    });
    await expect(service.pausar(pedir(JEFE, 'Atiende la falla urgente'))).rejects.toThrow(/ya está detenido/);
  });

  it('una iniciada hoy antes de la regla (sin sesiones) también se puede pausar', async () => {
    const { service, sesiones } = armar({ asignacion: { inicioRealAt: M('15', '09:00') } });
    await service.pausar(pedir(JEFE, 'Atiende la falla urgente'));
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).toMatchObject({ startedAt: M('15', '09:00'), endedAt: AHORA, endReason: 'PAUSA' });
  });

  it('no existe para quien no la tiene asignada, ni sin empresa', async () => {
    const { service } = armar({ asignacion: null });
    await expect(service.pausar(pedir(JEFE, 'Atiende la falla urgente'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.pausar({ ...pedir(JEFE, 'Atiende la falla urgente'), companyId: null })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('reanudar', () => {
  it('abre una sesión nueva y su reloj vuelve a correr', async () => {
    const { service, sesiones } = armar({
      sesiones: [{ startedAt: M('15', '09:00'), endedAt: M('15', '11:00'), endReason: 'PAUSA', endedById: JEFE.id }],
    });
    const estado = await service.reanudar({ userId: TECNICO.id, activityId: 10, companyId: EMPRESA });
    expect(sesiones[1]).toMatchObject({ startedAt: AHORA, endedAt: null });
    expect(estado).toMatchObject({ enCurso: true, enPausa: false, minutosReales: 120 });
  });

  it('sin haberla iniciado pide iniciarla primero', async () => {
    const { service } = armar({ asignacion: { inicioRealAt: null } });
    await expect(service.reanudar({ userId: TECNICO.id, activityId: 10, companyId: EMPRESA })).rejects.toThrow(
      /Primero inicia/,
    );
  });

  it('ya entregada no se reanuda', async () => {
    const { service } = armar({ asignacion: { finRealAt: M('15', '12:00') } });
    await expect(
      service.reanudar({ userId: TECNICO.id, activityId: 10, companyId: EMPRESA }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('leer sesiones', () => {
  it('las agrupa por persona y actividad', async () => {
    const { prisma } = armar({
      sesiones: [
        { startedAt: M('15', '09:00'), endedAt: M('15', '10:00') },
        { startedAt: M('15', '11:00') },
        { startedAt: M('15', '09:30'), activityId: 11 },
      ],
    });
    const mapa = await leerSesiones(prisma, { userIds: [TECNICO.id], companyId: EMPRESA });
    expect(sesionesDe(mapa, TECNICO.id, 10)).toHaveLength(2);
    expect(sesionesDe(mapa, TECNICO.id, 11)).toHaveLength(1);
    expect(sesionesDe(mapa, TECNICO.id, 99)).toEqual([]);
  });

  it('sin la tabla devuelve vacío: todo se mide como antes', async () => {
    expect((await leerSesiones({} as any, { userIds: [1] })).size).toBe(0);
  });
});
