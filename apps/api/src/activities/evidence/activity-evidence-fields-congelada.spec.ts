import { ForbiddenException } from '@nestjs/common';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service';

/**
 * «Que las evidencias se queden congeladas, no se eliminen… y seguir adjuntando» (Adam, 02-10).
 * Las fotos libres ya no se podían tocar con la evidencia en revisión o aprobada; las fotos por
 * campo sí: se podían reemplazar o quitar aunque la actividad estuviera aprobada. Ahora lo que ya
 * se envió no se pisa ni se quita, y llenar un hueco vacío sigue pudiéndose siempre.
 */
function build(opts: {
  estatus?: string;
  evidencia?: { status?: string; reviewStatus?: string | null } | null;
  /** Ya hay foto en ese campo × momento. */
  yaHayFoto?: boolean;
}) {
  const upsert = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const evidencia =
    opts.evidencia === null
      ? null
      : { entryPhotoUrl: '/activities/entrada.jpg', status: 'EVIDENCE_PHOTOS', reviewStatus: 'PENDING', ...opts.evidencia };
  const prisma = {
    activity: {
      findFirst: jest.fn().mockResolvedValue({
        id: 31,
        companyId: 1,
        estatus: opts.estatus ?? 'En Proceso',
        titulo: 'Levantamiento',
        anNumber: 'AN-0031',
      }),
    },
    activityEvidence: { findFirst: jest.fn().mockResolvedValue(evidencia) },
    activityEvidenceField: {
      findFirst: jest.fn().mockResolvedValue({ id: 15, nombre: 'Cámara 1', momentos: ['ANTES', 'DESPUES'] }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    activityEvidenceFieldPhoto: {
      findFirst: jest.fn().mockResolvedValue(opts.yaHayFoto ? { id: 900 } : null),
      upsert,
      deleteMany,
    },
  };
  const service = new ActivityEvidenceFieldsService(prisma as never);
  return { service, upsert, deleteMany };
}

const foto = { activityId: 31, fieldId: 15, momento: 'ANTES', photoUrl: '/activities/nueva.jpg', userId: 39, companyId: 1 };
const quitar = { activityId: 31, fieldId: 15, momento: 'ANTES', userId: 39, companyId: 1 };

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

    // Tampoco quien no tiene evidencia propia (un encargado desde el detalle).
    const b = build({ estatus, evidencia: null, yaHayFoto: true });
    await expect(b.service.borrarFoto({ ...quitar, userId: 5 })).rejects.toBeInstanceOf(ForbiddenException);
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
