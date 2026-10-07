import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ActivityAttachmentsService,
  EXTENSIONES_ADJUNTO,
  mimeDeExtension,
  nombreEnDisco,
  nombreOriginal,
} from './activity-attachments.service';

const ACT = { id: 9, companyId: 1, responsableId: 20, creadoPorId: 7, assignees: [{ userId: 21 }] };

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    activity: { findFirst: jest.fn().mockResolvedValue(ACT) },
    activityAttachment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 1, createdAt: new Date(), user: { id: data.userId, nombre: 'X' }, ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    ...over,
  };
  return { service: new ActivityAttachmentsService(prisma), prisma };
}

describe('adjuntos de actividades', () => {
  it('recupera el nombre con acentos que multer entrega como latin1', () => {
    expect(nombreOriginal(Buffer.from('Cotización Toks.xlsx', 'utf8').toString('latin1'))).toBe('Cotización Toks.xlsx');
    expect(nombreOriginal('Propuesta.pdf')).toBe('Propuesta.pdf');
  });

  it('el nombre en disco conserva solo la extensión', () => {
    expect(nombreEnDisco('../../etc/passwd.XLSX')).toMatch(/^\d+-[a-z0-9]+\.xlsx$/);
    expect(nombreEnDisco('sin-extension')).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it('acepta oficina, PDF e imágenes; no ejecutables', () => {
    for (const ext of ['pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc', 'pptx', 'jpg', 'png']) expect(EXTENSIONES_ADJUNTO.has(ext)).toBe(true);
    for (const ext of ['exe', 'js', 'html', 'svg', 'apk', 'sh']) expect(EXTENSIONES_ADJUNTO.has(ext)).toBe(false);
    expect(mimeDeExtension('a.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('adjunta quien es del equipo; el tipo sale de la extensión, no del navegador', async () => {
    const { service, prisma } = build();
    const [dto] = await service.agregar(
      9,
      [{ nombre: 'Minuta.docx', filename: '1-a.docx', mimeType: 'application/octet-stream', size: 1200 }],
      { id: 21 },
      1,
    );
    expect(prisma.activityAttachment.create.mock.calls[0][0].data).toMatchObject({
      activityId: 9,
      companyId: 1,
      userId: 21,
      nombre: 'Minuta.docx',
      fileUrl: '/uploads/actividades-adjuntos/1-a.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(dto).toMatchObject({ tipo: 'word', vistaPrevia: true, puedeQuitar: true });
  });

  it('alguien ajeno no adjunta; dirección o quien gestiona actividades sí', async () => {
    const { service } = build();
    const archivo = [{ nombre: 'a.pdf', filename: '1.pdf' }];
    await expect(service.agregar(9, archivo, { id: 99 }, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.agregar(9, archivo, { id: 99, roleKey: 'ceo' }, 1)).resolves.toHaveLength(1);
    await expect(service.agregar(9, archivo, { id: 99, permissions: ['activities.manage'] }, 1)).resolves.toBeDefined();
  });

  it('quitar: quien lo subió, el responsable o quien gestiona; nadie más', async () => {
    const fila = { id: 5, activityId: 9, userId: 21, companyId: 1, nombre: 'a.pdf', fileUrl: '/uploads/actividades-adjuntos/1.pdf' };
    const { service, prisma } = build();
    prisma.activityAttachment.findFirst.mockResolvedValue(fila);
    await expect(service.quitar(9, 5, { id: 33 }, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.quitar(9, 5, { id: 21 }, 1)).resolves.toEqual({ ok: true });
    await expect(service.quitar(9, 5, { id: 20 }, 1)).resolves.toEqual({ ok: true });
    expect(prisma.activityAttachment.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { deletedAt: expect.any(Date) } });
  });

  it('una actividad de otra empresa no existe', async () => {
    const { service } = build({ activity: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(service.listar(9, { id: 21 }, 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});
