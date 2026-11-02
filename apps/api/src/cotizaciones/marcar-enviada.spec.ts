import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CotizacionesService } from './cotizaciones.service.js';
import { MarcarEnviadaDto } from './dto/marcar-enviada.dto.js';

/**
 * Adam (01-11-2026): las cotizaciones «que se lleve un estatus». 56 de 56 seguían en borrador y nadie
 * usó el envío por correo: el PDF sale por WhatsApp. «Ya la envié» hace lo mismo menos mandar el correo.
 */
function armar(quote: Record<string, unknown>) {
  const update = jest.fn(async ({ data }: any) => ({ id: 4, ...quote, ...data, items: quote.items }));
  const prisma: any = {
    cotizacion: { findFirst: jest.fn(async () => quote), update },
    salesOpportunityQuote: { findMany: jest.fn(async () => []) },
    activity: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
  };
  const core = {
    registrarParticipante: jest.fn().mockResolvedValue(undefined),
    folioParaEnvio: jest.fn().mockResolvedValue('NEX-LJ-0007-LJ-R1'),
    avisar: jest.fn().mockResolvedValue(undefined),
  };
  const aprobacion = { exigir: jest.fn().mockResolvedValue(undefined) };
  const service = new CotizacionesService(
    prisma,
    { requestAutoApproval: jest.fn(), publishEntityLifecycle: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    core as any,
    aprobacion as any,
  );
  return { service, update, core, aprobacion, prisma };
}

const borrador = (extra: Record<string, unknown> = {}) => ({
  id: 4,
  companyId: 1,
  status: 'DRAFT',
  quoteNumber: 'NEX-LJ-0007',
  folioNomenclatura: 'LJ',
  sentAt: null,
  revision: 1,
  publicToken: null,
  salesClientId: 8,
  total: 1000,
  createdById: 15,
  clientCompany: 'Hotel Sol',
  items: [{ id: 1 }],
  ...extra,
});

describe('«Ya la envié»', () => {
  it('queda enviada, con su folio y el medio, sin mandar correo', async () => {
    const { service, update, core } = armar(borrador());
    const sendEmail = jest.spyOn(service as any, 'sendEmail');
    const r: any = await service.marcarEnviada(4, { medio: 'WHATSAPP' }, 15, 1);
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: 'SENT',
      quoteNumber: 'NEX-LJ-0007-LJ-R1',
      folioEnviado: 'NEX-LJ-0007-LJ-R1',
      enviadaPor: 'WHATSAPP',
      seguimientoEtapa: 0,
      revision: 1,
    });
    expect(r.sentAt).toBeInstanceOf(Date);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(core.registrarParticipante).toHaveBeenCalledWith(4, 15, 'ENVIO');
    expect(core.avisar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'QUOTE_SENT', mensaje: expect.stringContaining('Hotel Sol') }));
  });

  it('sin cliente del padrón o sin partidas no sale, igual que por correo', async () => {
    await expect(armar(borrador({ salesClientId: null })).service.marcarEnviada(4, { medio: 'OTRO' }, 15, 1)).rejects.toThrow(
      'Elige o crea el cliente',
    );
    await expect(armar(borrador({ items: [] })).service.marcarEnviada(4, { medio: 'OTRO' }, 15, 1)).rejects.toThrow(
      'al menos una partida',
    );
  });

  it('una aprobada no se puede volver a marcar', async () => {
    await expect(armar(borrador({ status: 'APPROVED' })).service.marcarEnviada(4, { medio: 'OTRO' }, 15, 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('respeta el tope de aprobación por monto', async () => {
    const { service, aprobacion } = armar(borrador());
    await service.marcarEnviada(4, { medio: 'EN_PERSONA' }, 15, 1);
    expect(aprobacion.exigir).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'COTIZACION', entityId: 4, monto: 1000 }));
  });

  it('un doble toque no crea otra revisión', async () => {
    const { service, update } = armar(borrador({ status: 'SENT', sentAt: new Date() }));
    await service.marcarEnviada(4, { medio: 'WHATSAPP' }, 15, 1);
    expect(update).not.toHaveBeenCalled();
  });

  it('solo acepta los medios conocidos', async () => {
    expect(await validate(plainToInstance(MarcarEnviadaDto, { medio: 'WHATSAPP' }))).toHaveLength(0);
    expect(await validate(plainToInstance(MarcarEnviadaDto, { medio: 'CORREO_CORE' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(MarcarEnviadaDto, {}))).not.toHaveLength(0);
  });
});
