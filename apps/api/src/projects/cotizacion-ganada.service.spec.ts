import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CotizacionGanadaService } from './cotizacion-ganada.service';
import { alcanceDePartidas, facturacionDe } from '../cotizaciones/hilo-negocio';

const COT = {
  id: 7,
  status: 'SENT',
  companyId: 1,
  createdById: 11,
  signedAt: null,
  aceptadaVia: null,
  projectName: 'Videovigilancia Plaza Norte',
  clientCompany: 'Plaza Norte',
  clientName: null,
  quoteNumber: 'NEX-0042',
  subtotal: 269379.31,
  currency: 'MXN',
  salesClient: { id: 3, name: 'Plaza Norte' },
  items: [
    { id: 1, name: 'Cámara domo 4 MP', qty: 32, unit: 'pza' },
    { id: 2, name: '  ', qty: 1, unit: null },
  ],
};

function armar(semilla: Partial<typeof COT> | null = {}, proyectoExistente: unknown = null) {
  const prisma: any = {
    cotizacion: {
      findFirst: jest.fn(async () => (semilla === null ? null : { ...COT, ...semilla })),
      update: jest.fn(async () => ({})),
    },
    operationalProject: { findFirst: jest.fn(async () => proyectoExistente) },
    user: { findFirst: jest.fn(async () => ({ id: 20 })) },
  };
  const cotizaciones: any = { aprobar: jest.fn(async () => ({})) };
  const proyectos: any = { crear: jest.fn(async (dto: any) => ({ id: 99, title: dto.title })) };
  const operacion: any = { ensureServiceClientForProject: jest.fn(async () => 55) };
  return { prisma, cotizaciones, proyectos, operacion, servicio: new CotizacionGanadaService(prisma, cotizaciones, proyectos, operacion) };
}

const ACTOR = { id: 11 };

describe('La ganamos', () => {
  it('aprueba, guarda cómo aceptó y crea el proyecto con las partidas como alcance', async () => {
    const { servicio, cotizaciones, proyectos, prisma } = armar();
    const r = await servicio.ganar(7, { via: 'WHATSAPP', responsableId: 20, startDate: '2026-11-10' }, ACTOR, 1);

    expect(cotizaciones.aprobar).toHaveBeenCalledWith(7, 11, 1);
    expect(prisma.cotizacion.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { aceptadaVia: 'WHATSAPP', aceptadaAt: expect.any(Date) },
    });
    const [dto] = proyectos.crear.mock.calls[0];
    expect(dto).toMatchObject({
      title: 'Videovigilancia Plaza Norte',
      clientId: 55,
      vendorId: 11,
      responsableId: 20,
      status: 'PLANNED',
      cotizacionId: 7,
      importarAlcanceDeCotizacion: true,
      budgetAmount: 269379.31,
      startDate: '2026-11-10',
    });
    expect(dto.scopeItems).toEqual([{ kind: 'ENTREGABLE', titulo: 'Cámara domo 4 MP', detalle: '32 pza', origenClave: 'partida:1' }]);
    expect(r).toEqual({ cotizacionId: 7, proyecto: { id: 99, title: 'Videovigilancia Plaza Norte' }, errorProyecto: null });
  });

  it('un borrador no se gana: primero tiene que salir', async () => {
    const { servicio, cotizaciones, proyectos } = armar({ status: 'DRAFT' });
    await expect(servicio.ganar(7, {}, ACTOR, 1)).rejects.toThrow(BadRequestException);
    expect(cotizaciones.aprobar).not.toHaveBeenCalled();
    expect(proyectos.crear).not.toHaveBeenCalled();
  });

  it('una perdida tampoco', async () => {
    const { servicio, cotizaciones } = armar({ status: 'REJECTED' });
    await expect(servicio.ganar(7, {}, ACTOR, 1)).rejects.toThrow(BadRequestException);
    expect(cotizaciones.aprobar).not.toHaveBeenCalled();
  });

  it('una cotización de otra empresa no existe', async () => {
    const { servicio } = armar(null);
    await expect(servicio.ganar(7, {}, ACTOR, 2)).rejects.toThrow(NotFoundException);
  });

  it('si pide autorización por monto, no aprueba ni crea nada', async () => {
    const { servicio, cotizaciones, proyectos, prisma } = armar();
    cotizaciones.aprobar.mockRejectedValue(new BadRequestException('Requiere autorización de dirección'));
    await expect(servicio.ganar(7, { via: 'CORREO' }, ACTOR, 1)).rejects.toThrow('Requiere autorización');
    expect(prisma.cotizacion.update).not.toHaveBeenCalled();
    expect(proyectos.crear).not.toHaveBeenCalled();
  });

  it('un responsable que no es de la empresa se rechaza antes de aprobar', async () => {
    const { servicio, cotizaciones, prisma } = armar();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(servicio.ganar(7, { responsableId: 500 }, ACTOR, 1)).rejects.toThrow(BadRequestException);
    expect(cotizaciones.aprobar).not.toHaveBeenCalled();
  });

  it('sin elegir responsable, lo lleva quien hizo la cotización', async () => {
    const { servicio, proyectos, prisma } = armar();
    await servicio.ganar(7, {}, { id: 30 }, 1);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(proyectos.crear.mock.calls[0][0]).toMatchObject({ responsableId: 11, vendorId: 11 });
  });

  it('si falla el proyecto, queda ganada y dice por qué', async () => {
    const { servicio, cotizaciones, proyectos } = armar();
    proyectos.crear.mockRejectedValue(new Error('Cliente no encontrado'));
    const r = await servicio.ganar(7, {}, ACTOR, 1);
    expect(cotizaciones.aprobar).toHaveBeenCalled();
    expect(r).toEqual({ cotizacionId: 7, proyecto: null, errorProyecto: 'Cliente no encontrado' });
  });

  it('ganada sin proyecto: lo crea sin volver a aprobar', async () => {
    const { servicio, cotizaciones, proyectos, prisma } = armar({ status: 'APPROVED', signedAt: new Date() as any });
    const r = await servicio.ganar(7, {}, ACTOR, 1);
    expect(cotizaciones.aprobar).not.toHaveBeenCalled();
    expect(prisma.cotizacion.update.mock.calls[0][0].data.aceptadaVia).toBe('FIRMA');
    expect(proyectos.crear).toHaveBeenCalledTimes(1);
    expect(r.proyecto?.id).toBe(99);
  });

  it('un doble toque no crea dos proyectos', async () => {
    const { servicio, cotizaciones, proyectos } = armar({ status: 'APPROVED', aceptadaVia: 'WHATSAPP' as any }, { id: 5, title: 'Ya existe' });
    const r = await servicio.ganar(7, { via: 'CORREO' }, ACTOR, 1);
    expect(cotizaciones.aprobar).not.toHaveBeenCalled();
    expect(proyectos.crear).not.toHaveBeenCalled();
    expect(r.proyecto).toEqual({ id: 5, title: 'Ya existe' });
  });
});

describe('factura y cobro de la cadena', () => {
  const f = (status: string, extra: object = {}) => ({ id: 1, status, invoiceNumber: 'F-1', ...extra });

  it('sin facturas no hay nada', () => {
    expect(facturacionDe([])).toEqual({ factura: { estado: 'SIN_FACTURA', id: null, folio: null }, cobro: { estado: 'PENDIENTE' } });
  });

  it('un borrador todavía no es factura', () => {
    expect(facturacionDe([f('DRAFT')]).factura.estado).toBe('BORRADOR');
  });

  it('una cancelada o acreditada no cuenta', () => {
    expect(facturacionDe([f('CANCELLED'), f('CREDITED'), f('SENT', { isCancelled: true })]).factura.estado).toBe('SIN_FACTURA');
  });

  it('el folio fiscal manda sobre el interno', () => {
    expect(facturacionDe([f('SENT', { cfdiSerie: 'A', cfdiFolio: '12' })]).factura.folio).toBe('A-12');
    expect(facturacionDe([f('SENT')]).factura.folio).toBe('F-1');
  });

  it('el cobro: pendiente, parcial y pagada', () => {
    expect(facturacionDe([f('SENT')]).cobro.estado).toBe('PENDIENTE');
    expect(facturacionDe([f('PARTIALLY_PAID')]).cobro.estado).toBe('PARCIAL');
    expect(facturacionDe([f('SENT', { paidAmount: 100 })]).cobro.estado).toBe('PARCIAL');
    expect(facturacionDe([f('PAID')]).cobro.estado).toBe('PAGADA');
  });

  it('con anticipo: se cobró cuando se cobraron todas', () => {
    expect(facturacionDe([f('PAID'), { ...f('SENT'), id: 2 }]).cobro.estado).toBe('PARCIAL');
    expect(facturacionDe([f('PAID'), { ...f('PAID'), id: 2 }]).cobro.estado).toBe('PAGADA');
  });
});

describe('partidas como alcance', () => {
  it('sin nombre no entran; sin cantidad queda la unidad', () => {
    expect(alcanceDePartidas([{ id: 1, name: '' }, { id: 2, name: 'Cable', qty: 0, unit: 'lote' }])).toEqual([
      { kind: 'ENTREGABLE', titulo: 'Cable', detalle: 'lote', origenClave: 'partida:2' },
    ]);
  });

  it('un nombre larguísimo se recorta al límite de la columna', () => {
    expect(alcanceDePartidas([{ id: 1, name: 'x'.repeat(500), qty: 1 }])[0]!.titulo).toHaveLength(240);
  });
});
