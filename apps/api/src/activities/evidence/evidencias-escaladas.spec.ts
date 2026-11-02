import { armarEscaladas, textoEscalada } from './evidencias-escaladas.js';
import { EvidenciasEscaladasService } from './evidencias-escaladas.service.js';

const p = (id: number, managerId: number | null, nombre: string, isActive = true) => ({ id, managerId, nombre, isActive });
const CHRISTIAN = 1;
const DAVID = 2;
const ANTONIO = 3;
const personas = [
  p(CHRISTIAN, null, 'Christian Del Pozo'),
  p(DAVID, CHRISTIAN, 'David Morales Zenón'),
  p(ANTONIO, CHRISTIAN, 'José Antonio Ramírez Salazar'),
  p(10, DAVID, 'Técnico A'),
  p(11, DAVID, 'Técnico B'),
  p(20, ANTONIO, 'Soporte A'),
  p(30, CHRISTIAN, 'Contadora'),
  p(40, null, 'Sin jefe'),
];
const ev = (duenoId: number) => ({ duenoId, companyId: 7 });

describe('armarEscaladas', () => {
  it('avisa al jefe directo y a quien está arriba, con una sola tarjeta por persona', () => {
    const r = armarEscaladas([ev(10), ev(11), ev(20), ev(30)], personas);
    expect(r.find((t) => t.userId === DAVID)).toMatchObject({ tuyas: 2, deOtros: [] });
    expect(r.find((t) => t.userId === ANTONIO)).toMatchObject({ tuyas: 1, deOtros: [] });
    expect(r.find((t) => t.userId === CHRISTIAN)).toMatchObject({
      tuyas: 1,
      deOtros: [
        { jefe: 'David Morales Zenón', n: 2 },
        { jefe: 'José Antonio Ramírez Salazar', n: 1 },
      ],
    });
  });

  it('sin jefe, o con jefe dado de baja, no hay a quién escalar', () => {
    expect(armarEscaladas([ev(40)], personas)).toEqual([]);
    expect(armarEscaladas([ev(10)], [p(DAVID, null, 'David', false), p(10, DAVID, 'T')])).toEqual([]);
  });
});

describe('textoEscalada', () => {
  it('cuenta todo y dice de quién es', () => {
    const t = textoEscalada({ userId: 1, companyId: 7, tuyas: 1, deOtros: [{ jefe: 'David Morales Zenón', n: 2 }] });
    expect(t.title).toBe('3 evidencias llevan más de 24 h sin revisar');
    expect(t.message).toBe('1 de tu gente · 2 de David Morales');
  });
  it('singular', () => {
    expect(textoEscalada({ userId: 1, companyId: 7, tuyas: 1, deOtros: [] }).title).toBe(
      '1 evidencia lleva más de 24 h sin revisar',
    );
  });
});

describe('EvidenciasEscaladasService', () => {
  // Jueves 12-11, 10:30 de México.
  const AHORA = new Date('2026-11-12T16:30:00Z');
  const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);
  const fila = (userId: number, horas: number, extra: Record<string, unknown> = {}) => ({
    userId,
    companyId: 7,
    status: 'COMPLETED',
    reviewStatus: 'PENDING',
    completedAt: hace(horas),
    correctionSubmittedAt: null,
    activity: { estatus: 'Por Validar' },
    ...extra,
  });

  function armar(filas: unknown[]) {
    const prisma: any = {
      activityEvidence: { findMany: jest.fn().mockResolvedValue(filas) },
      user: { findMany: jest.fn().mockResolvedValue(personas) },
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
    return { service: new EvidenciasEscaladasService(prisma, notifications as never), notifications };
  }

  it('lo reciente no sube; lo de más de 24 h sí, y la tarjeta lleva a la cola de revisión', async () => {
    const { service, notifications } = armar([fila(10, 30), fila(11, 3)]);
    expect(await service.revisar(AHORA)).toBe(2);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: DAVID,
        type: 'WORKFLOW_ESCALATION',
        title: '1 evidencia lleva más de 24 h sin revisar',
        relatedUrl: '/erp/pizarra?vista=revision',
        dedupeSeconds: 72000,
      }),
    );
  });

  it('una corrección cuenta desde que se reenvió', async () => {
    const { service, notifications } = armar([fila(10, 40, { correctionSubmittedAt: hace(2) })]);
    expect(await service.revisar(AHORA)).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('sin nada pendiente no manda nada', async () => {
    const { service, notifications } = armar([]);
    expect(await service.revisar(AHORA)).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
