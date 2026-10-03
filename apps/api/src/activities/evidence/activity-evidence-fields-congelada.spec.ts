import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service';

/**
 * «Que las evidencias se queden congeladas, no se eliminen… y seguir adjuntando» (Adam, 02-10).
 * Las fotos libres ya no se podían tocar con la evidencia en revisión o aprobada; las fotos por
 * campo sí: se podían reemplazar o quitar aunque la actividad estuviera aprobada. Ahora lo que ya
 * se envió no se pisa ni se quita, y llenar un hueco vacío sigue pudiéndose siempre.
 *
 * Revisión de seguridad (02-10, M2): la congelación se decidía con la evidencia de QUIEN LLAMA,
 * no con la de quien subió la foto. Un empleado sin evidencia propia (o un compañero con la suya
 * sin enviar) podía borrar o pisar la foto aprobada de otro. Ahora manda la evidencia del autor
 * de la foto, y además solo tocan fotos de campo los asignados vigentes, el responsable o quien
 * revisa evidencias.
 */
type Evidencia = { status?: string; reviewStatus?: string | null; entryPhotoUrl?: string | null } | null;

function build(opts: {
  estatus?: string;
  /** Evidencia de quien llama (userId 39 por defecto). `null` = no tiene fila. */
  evidencia?: Evidencia;
  /** Evidencia de otras personas, por userId. */
  evidenciasDeOtros?: Record<number, Evidencia>;
  /** Ya hay foto en ese campo × momento; `fotoDe` dice quién la subió (39 por defecto). */
  yaHayFoto?: boolean;
  fotoDe?: number;
  /** Quiénes están asignados y vigentes (39 por defecto). */
  asignados?: number[];
  responsableId?: number | null;
}) {
  const upsert = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const completa = (e: Evidencia | undefined): Evidencia =>
    e === null
      ? null
      : { entryPhotoUrl: '/activities/entrada.jpg', status: 'EVIDENCE_PHOTOS', reviewStatus: 'PENDING', ...e };
  const evidencias = new Map<number, Evidencia>([[39, completa(opts.evidencia)]]);
  for (const [id, e] of Object.entries(opts.evidenciasDeOtros ?? {})) evidencias.set(Number(id), completa(e));
  const asignados = new Set(opts.asignados ?? [39]);
  const prisma = {
    activity: {
      findFirst: jest.fn().mockResolvedValue({
        id: 31,
        companyId: 1,
        estatus: opts.estatus ?? 'En Proceso',
        titulo: 'Levantamiento',
        anNumber: 'AN-0031',
        responsableId: opts.responsableId ?? null,
      }),
    },
    activityEvidence: {
      findFirst: jest.fn(async ({ where }: any) => evidencias.get(Number(where.userId)) ?? null),
    },
    activityAssignee: {
      findFirst: jest.fn(async ({ where }: any) =>
        asignados.has(Number(where.userId)) && where.retiradoAt === null && where.companyId === 1 ? { id: 70 } : null,
      ),
    },
    activityEvidenceField: {
      findFirst: jest.fn().mockResolvedValue({ id: 15, nombre: 'Cámara 1', momentos: ['ANTES', 'DESPUES'] }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    activityEvidenceFieldPhoto: {
      findFirst: jest.fn().mockResolvedValue(opts.yaHayFoto ? { id: 900, userId: opts.fotoDe ?? 39 } : null),
      upsert,
      deleteMany,
    },
  };
  const service = new ActivityEvidenceFieldsService(prisma as never);
  return { service, prisma, upsert, deleteMany };
}

const foto = { activityId: 31, fieldId: 15, momento: 'ANTES', photoUrl: '/activities/nueva.jpg', userId: 39, companyId: 1 };
const quitar = { activityId: 31, fieldId: 15, momento: 'ANTES', userId: 39, companyId: 1 };
const REVISOR = { permissions: [PERMISSIONS.EVIDENCES_REVIEW] };

const EN_REVISION = { status: 'COMPLETED', reviewStatus: 'PENDING' };
const APROBADA = { status: 'COMPLETED', reviewStatus: 'APPROVED' };
const DEVUELTA = { status: 'EVIDENCE_PHOTOS', reviewStatus: 'REJECTED' };

describe('fotos por campo: lo ya enviado queda congelado', () => {
  it('mientras captura, puede volver a tomar la foto de un campo o quitarla', async () => {
    const a = build({ yaHayFoto: true });
    await a.service.guardarFoto(foto);
    expect(a.upsert).toHaveBeenCalled();

    const b = build({ yaHayFoto: true });
    await b.service.borrarFoto(quitar);
    expect(b.deleteMany).toHaveBeenCalled();
  });

  it.each([
    ['en revisión', EN_REVISION],
    ['aprobada', APROBADA],
  ])('con la evidencia %s no se reemplaza la foto que ya está', async (_nombre, evidencia) => {
    const { service, upsert } = build({ evidencia, yaHayFoto: true });
    await expect(service.guardarFoto(foto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['en revisión', EN_REVISION],
    ['aprobada', APROBADA],
  ])('con la evidencia %s tampoco se quita', async (_nombre, evidencia) => {
    const { service, deleteMany } = build({ evidencia, yaHayFoto: true });
    await expect(service.borrarFoto(quitar)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it.each(['Finalizada', 'Aprobada', 'Cancelada'])('actividad %s: nadie reemplaza ni quita', async (estatus) => {
    const a = build({ estatus, yaHayFoto: true });
    await expect(a.service.guardarFoto(foto)).rejects.toThrow(/cerrada/);
    expect(a.upsert).not.toHaveBeenCalled();

    // Tampoco quien no tiene evidencia propia (un encargado que revisa, desde el detalle).
    const b = build({ estatus, evidencia: null, yaHayFoto: true });
    await expect(b.service.borrarFoto({ ...quitar, userId: 5, requester: REVISOR })).rejects.toThrow(/cerrada/);
    expect(b.deleteMany).not.toHaveBeenCalled();
  });

  it('seguir adjuntando: un hueco vacío se llena aunque la evidencia esté en revisión', async () => {
    const { service, upsert } = build({ evidencia: EN_REVISION, yaHayFoto: false });
    await service.guardarFoto(foto);
    expect(upsert).toHaveBeenCalled();
  });

  it('si se la devolvieron a corregir, vuelve a poder reemplazar y quitar', async () => {
    const a = build({ evidencia: DEVUELTA, yaHayFoto: true });
    await a.service.guardarFoto(foto);
    expect(a.upsert).toHaveBeenCalled();

    const b = build({ evidencia: DEVUELTA, yaHayFoto: true });
    await b.service.borrarFoto(quitar);
    expect(b.deleteMany).toHaveBeenCalled();
  });
});

describe('fotos por campo: la congela la evidencia de quien la subió, no la de quien llama', () => {
  // Antonio (39) y Joan (40) van en equipo; la foto de «Cámara 1 × antes» la subió Joan.
  const deJoan = { yaHayFoto: true, fotoDe: 40, asignados: [39, 40] };

  it('un compañero sin evidencia propia no quita la foto de otro cuya evidencia está aprobada', async () => {
    const { service, deleteMany } = build({ ...deJoan, evidencia: null, evidenciasDeOtros: { 40: APROBADA } });
    await expect(service.borrarFoto(quitar)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ['en revisión', EN_REVISION],
    ['aprobada', APROBADA],
  ])('con la evidencia del autor %s, un compañero con la suya abierta tampoco la pisa ni la quita', async (_n, e) => {
    const a = build({ ...deJoan, evidenciasDeOtros: { 40: e } });
    await expect(a.service.guardarFoto(foto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(a.upsert).not.toHaveBeenCalled();

    const b = build({ ...deJoan, evidenciasDeOtros: { 40: e } });
    await expect(b.service.borrarFoto(quitar)).rejects.toBeInstanceOf(ForbiddenException);
    expect(b.deleteMany).not.toHaveBeenCalled();
  });

  it('un revisor sin evidencia propia tampoco quita lo aprobado: primero la devuelve', async () => {
    const { service, deleteMany } = build({ ...deJoan, evidenciasDeOtros: { 40: APROBADA } });
    await expect(service.borrarFoto({ ...quitar, userId: 5, requester: REVISOR })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('mientras la evidencia del autor sigue abierta, el compañero sí puede retomarla o quitarla', async () => {
    const a = build({ ...deJoan, evidenciasDeOtros: { 40: DEVUELTA } });
    await a.service.guardarFoto(foto);
    expect(a.upsert).toHaveBeenCalled();

    const b = build({ ...deJoan });
    await b.service.borrarFoto(quitar);
    expect(b.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 900 }) }));
  });

  it('la evidencia del autor se busca en la misma empresa de la actividad', async () => {
    const { service, prisma } = build({ ...deJoan, evidenciasDeOtros: { 40: APROBADA } });
    await expect(service.borrarFoto(quitar)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.activityEvidence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activityId: 31, userId: 40, companyId: 1 } }),
    );
  });
});

describe('fotos por campo: solo las tocan asignados vigentes, el responsable o quien revisa', () => {
  const ajeno = { ...quitar, userId: 77 };

  it('un empleado del tenant que no está en la actividad no sube ni quita fotos', async () => {
    const a = build({ yaHayFoto: false });
    await expect(a.service.guardarFoto({ ...foto, userId: 77 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(a.upsert).not.toHaveBeenCalled();

    const b = build({ yaHayFoto: true });
    await expect(b.service.borrarFoto(ajeno)).rejects.toBeInstanceOf(ForbiddenException);
    expect(b.deleteMany).not.toHaveBeenCalled();
    // Ni siquiera llegó a preguntar por la foto: el corte es antes.
    expect(b.prisma.activityEvidenceFieldPhoto.findFirst).not.toHaveBeenCalled();
  });

  it('un asignado que ya fue retirado de la actividad tampoco', async () => {
    const { service, prisma, deleteMany } = build({ yaHayFoto: true, asignados: [] });
    await expect(service.borrarFoto(quitar)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.activityAssignee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activityId: 31, userId: 39, retiradoAt: null, companyId: 1 } }),
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('sin usuario no se quita nada', async () => {
    const { service, deleteMany } = build({ yaHayFoto: true });
    await expect(service.borrarFoto({ ...quitar, userId: null })).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('el responsable sin fila de equipo sí, aunque no esté en ActivityAssignee', async () => {
    const { service, deleteMany } = build({ yaHayFoto: true, asignados: [], responsableId: 39 });
    await service.borrarFoto(quitar);
    expect(deleteMany).toHaveBeenCalled();
  });

  it('quien revisa evidencias (o dirección) quita una foto abierta sin estar asignado', async () => {
    const a = build({ yaHayFoto: true });
    await a.service.borrarFoto({ ...ajeno, requester: REVISOR });
    expect(a.deleteMany).toHaveBeenCalled();

    const b = build({ yaHayFoto: true });
    await b.service.borrarFoto({ ...ajeno, requester: { isSuperAdmin: true } });
    expect(b.deleteMany).toHaveBeenCalled();
  });

  it('sin foto que quitar no borra nada y devuelve los campos', async () => {
    const { service, deleteMany } = build({ yaHayFoto: false });
    await expect(service.borrarFoto(quitar)).resolves.toEqual([]);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
