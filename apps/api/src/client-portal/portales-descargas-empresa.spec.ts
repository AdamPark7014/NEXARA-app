import { NotFoundException } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvidenceService } from '../activities/evidence/activity-evidence.service';
import { BranchPortalController } from '../branch-portal/branch-portal.controller';
import { ClientPortalController } from './client-portal.controller';

/**
 * Descargas de los portales (cliente y sucursal) y el reporte propio del técnico.
 *
 * El generador busca el registro con la empresa: sin ella, `companyWhere(null)` no encuentra nada
 * y responde 404. Estas rutas ya habían comprobado que el registro es de quien lo pide, pero
 * llamaban al generador sin la empresa, así que el reporte del ticket, la factura (PDF y XML) y la
 * cotización nunca bajaban. Ahora viaja la empresa del propio registro.
 */

const EMPRESA = 7;

function respuesta() {
  const res: any = { cabeceras: {} as Record<string, string>, estado: 200, cuerpo: undefined as unknown };
  res.setHeader = (k: string, v: string) => { res.cabeceras[k] = v; return res; };
  res.status = (n: number) => { res.estado = n; return res; };
  res.send = (c: unknown) => { res.cuerpo = c; return res; };
  res.redirect = (u: string) => { res.redirigido = u; return res; };
  return res;
}

describe('el generador exige la empresa', () => {
  it('sin empresa no encuentra la actividad (404); con empresa la busca en esa empresa', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const svc = Object.create(ActivitiesService.prototype) as any;
    svc.prisma = { activity: { findFirst } };

    await expect(svc.generateTicketReport(55)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: 55, companyId: -1 });

    await expect(svc.generateTicketReport(55, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst.mock.calls[1][0].where).toMatchObject({ id: 55, companyId: EMPRESA });
  });
});

describe('portal del cliente', () => {
  const cliente = { clientId: 3, isClient: true };

  function controlador(prisma: any, servicios: { actividades?: any; contabilidad?: any; cotizaciones?: any } = {}) {
    return new ClientPortalController(
      prisma,
      {} as any,
      servicios.actividades ?? ({} as any),
      {} as any,
      servicios.contabilidad ?? ({} as any),
      servicios.cotizaciones ?? ({} as any),
      {} as any,
    );
  }

  it('el reporte del ticket se genera con la empresa de la actividad', async () => {
    const generateTicketReport = jest.fn().mockResolvedValue({ pdf: Buffer.from('%PDF') });
    const findFirst = jest.fn().mockResolvedValue({ id: 55, companyId: EMPRESA });
    const ctrl = controlador({ activity: { findFirst } }, { actividades: { generateTicketReport } });
    const res = respuesta();

    await ctrl.ticketReport(cliente, 55, res);

    // La actividad se busca dentro de las del cliente, y de ahí sale la empresa.
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 55, clientId: 3 });
    expect(generateTicketReport).toHaveBeenCalledWith(55, EMPRESA);
    expect(res.cabeceras['Content-Type']).toBe('application/pdf');
    expect(String(res.cuerpo)).toBe('%PDF');
  });

  it('un ticket de otro cliente sigue respondiendo 404 sin generar nada', async () => {
    const generateTicketReport = jest.fn();
    const ctrl = controlador(
      { activity: { findFirst: jest.fn().mockResolvedValue(null) } },
      { actividades: { generateTicketReport } },
    );
    const res = respuesta();

    await ctrl.ticketReport(cliente, 99, res);

    expect(res.estado).toBe(404);
    expect(generateTicketReport).not.toHaveBeenCalled();
  });

  it('el PDF y el XML de la factura se piden con la empresa de la factura', async () => {
    const getInvoicePdf = jest.fn().mockResolvedValue({ body: Buffer.from('%PDF'), filename: 'F-1.pdf' });
    const getInvoiceXml = jest.fn().mockResolvedValue({ body: '<cfdi/>', filename: 'F-1.xml', contentType: 'application/xml' });
    const findFirst = jest.fn().mockResolvedValue({ id: 8, companyId: EMPRESA });
    const ctrl = controlador({ invoice: { findFirst } }, { contabilidad: { getInvoicePdf, getInvoiceXml } });

    const pdf = respuesta();
    await ctrl.invoicePdf(cliente, 8, pdf);
    const xml = respuesta();
    await ctrl.invoiceXml(cliente, 8, xml);

    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 8,
      type: 'ACCOUNTS_RECEIVABLE',
      client: { serviceClientId: 3 },
    });
    expect(getInvoicePdf).toHaveBeenCalledWith(8, EMPRESA);
    expect(getInvoiceXml).toHaveBeenCalledWith(8, EMPRESA);
    expect(String(pdf.cuerpo)).toBe('%PDF');
    expect(xml.cuerpo).toBe('<cfdi/>');
  });

  it('la cotización se descarga con la empresa de la cotización', async () => {
    const getPdfBuffer = jest.fn().mockResolvedValue(Buffer.from('%PDF'));
    const findFirst = jest.fn().mockResolvedValue({ id: 12, quoteNumber: 'COT-0012', companyId: EMPRESA });
    const ctrl = controlador({ cotizacion: { findFirst } }, { cotizaciones: { getPdfBuffer } });
    const res = respuesta();

    await ctrl.quotePdf(cliente, 12, res);

    expect(getPdfBuffer).toHaveBeenCalledWith(12, EMPRESA);
    expect(res.cabeceras['Content-Disposition']).toBe('attachment; filename=COT-0012.pdf');
  });
});

describe('portal de sucursal', () => {
  it('el reporte del ticket se genera con la empresa de la actividad', async () => {
    const generateTicketReport = jest.fn().mockResolvedValue({ pdf: Buffer.from('%PDF') });
    const prisma = {
      serviceClientBranch: { findFirst: jest.fn().mockResolvedValue({ name: 'Sucursal Demo', branchNumber: '014' }) },
      activity: { findFirst: jest.fn().mockResolvedValue({ id: 55, companyId: EMPRESA }) },
    };
    const ctrl = new BranchPortalController(prisma as any, {} as any, { generateTicketReport } as any, {} as any, {} as any);
    const res = respuesta();

    await ctrl.ticketReport({ clientId: 3, branchId: 4, isBranchUser: true }, 55, res);

    expect(generateTicketReport).toHaveBeenCalledWith(55, EMPRESA);
    expect(String(res.cuerpo)).toBe('%PDF');
  });
});

describe('reporte propio del técnico', () => {
  it('se genera con la empresa de la actividad', async () => {
    const generateTicketReport = jest.fn().mockResolvedValue({ pdf: Buffer.from('%PDF') });
    const svc = Object.create(ActivityEvidenceService.prototype) as any;
    svc.prisma = {
      activityEvidence: {
        findFirst: jest.fn().mockResolvedValue({ userId: 21, activity: { responsableId: 21, companyId: EMPRESA } }),
      },
    };
    svc.activitiesService = { generateTicketReport };

    const resultado = await svc.generateOwnTicketReport(55, 21);

    expect(generateTicketReport).toHaveBeenCalledWith(55, EMPRESA);
    expect(String(resultado.pdf)).toBe('%PDF');
  });
});
