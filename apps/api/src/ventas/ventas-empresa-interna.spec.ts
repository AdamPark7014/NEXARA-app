import { VentasService } from './ventas.service';

/**
 * Llamadas internas de Ventas que no pasaban la empresa.
 *
 * `getClient`, `loadSalesProject` y `CotizacionesService.findOne` exigen la empresa: sin ella
 * responden 403 «Empresa requerida» o 404. Varios métodos se llamaban entre sí sin pasarla, así
 * que fallaban siempre aunque el controlador sí la traía:
 *  - el resumen del proyecto comercial (`GET ventas/proyectos/:id/resumen`),
 *  - crear el proyecto de una oportunidad cuyo cliente todavía no existe en operación,
 *  - desplegar el proyecto en campo con un cliente así,
 *  - adjuntar a la oportunidad una cotización hecha en la plataforma.
 */

const EMPRESA = 7;
const ALTO = new Error('alto: hasta aquí llega la prueba');
const usuario = { id: 21, isSuperAdmin: true, roleKey: 'ceo' };

function servicio(extra: Record<string, unknown> = {}) {
  const svc = Object.create(VentasService.prototype) as any;
  svc.prisma = {};
  Object.assign(svc, extra);
  return svc as VentasService & Record<string, any>;
}

describe('Ventas: la empresa viaja en las llamadas internas', () => {
  it('el resumen del proyecto calcula los costos con la empresa de la petición', async () => {
    const svc = servicio({
      prisma: { activity: { findMany: jest.fn().mockResolvedValue([]) } },
    });
    jest.spyOn(svc as any, 'loadSalesProject').mockResolvedValue({
      id: 4,
      companyId: EMPRESA,
      opportunity: { ownerId: usuario.id },
      operationalProject: { id: 40 },
    });
    const costos = jest.spyOn(svc, 'calculateProjectCosts').mockRejectedValue(ALTO);

    await expect(svc.getProjectSummary(4, usuario, EMPRESA)).rejects.toBe(ALTO);

    expect(costos).toHaveBeenCalledWith(4, usuario, EMPRESA);
  });

  it('sin la empresa, calcular costos responde 403: por eso el resumen no abría', async () => {
    const svc = servicio({ prisma: { salesProject: { findFirst: jest.fn() } } });
    await expect(svc.calculateProjectCosts(4, usuario)).rejects.toThrow('Empresa requerida');
  });

  it('crear el proyecto da de alta al cliente en operación dentro de la empresa de la oportunidad', async () => {
    const svc = servicio();
    jest.spyOn(svc, 'getOpportunity').mockResolvedValue({
      id: 9,
      companyId: EMPRESA,
      client: { id: 55, name: 'Cliente Demo', serviceClientId: null },
    } as any);
    const alta = jest.spyOn(svc, 'provisionServiceClient').mockRejectedValue(ALTO);

    await expect(svc.createProject({ opportunityId: 9, name: 'Proyecto Demo' } as any, usuario, EMPRESA)).rejects.toBe(ALTO);

    expect(alta).toHaveBeenCalledWith(55, usuario, EMPRESA);
  });

  it('desplegar en campo da de alta al cliente dentro de la empresa del proyecto', async () => {
    const svc = servicio({
      prisma: { operationalProject: { findUnique: jest.fn().mockResolvedValue(null) } },
    });
    jest.spyOn(svc as any, 'loadSalesProject').mockResolvedValue({
      id: 4,
      companyId: EMPRESA,
      opportunity: { ownerId: usuario.id, client: { id: 55, name: 'Cliente Demo', serviceClientId: null } },
    });
    const alta = jest.spyOn(svc, 'provisionServiceClient').mockRejectedValue(ALTO);

    await expect(svc.provisionOperationalProject(4, usuario, EMPRESA)).rejects.toBe(ALTO);

    expect(alta).toHaveBeenCalledWith(55, usuario, EMPRESA);
  });

  it('al ganar una oportunidad, el alta del cliente en operación lleva la empresa de la oportunidad', async () => {
    const svc = servicio({
      prisma: {
        salesOpportunity: {
          findUnique: jest.fn().mockResolvedValue({
            id: 9,
            stage: 'WON',
            clientId: 55,
            companyId: EMPRESA,
            projects: [{ id: 4, name: 'Proyecto Demo' }],
          }),
        },
      },
    });
    const alta = jest.spyOn(svc, 'provisionServiceClient').mockResolvedValue({} as any);
    jest.spyOn(svc as any, 'ensureProjectSalesOrder').mockResolvedValue(undefined);
    jest.spyOn(svc, 'provisionOperationalProject').mockResolvedValue({} as any);

    await svc.autoEnsureSalesProjectFromWonOpportunity(9, usuario.id);

    expect(alta).toHaveBeenCalledWith(55, { id: usuario.id }, EMPRESA);
  });

  it('adjuntar una cotización de la plataforma genera su PDF con la empresa de la oportunidad', async () => {
    const generatePdfFile = jest.fn().mockResolvedValue({ pdfUrl: '/uploads/cotizaciones/demo.pdf' });
    const create = jest.fn().mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));
    const svc = servicio({
      prisma: { salesOpportunityQuote: { count: jest.fn().mockResolvedValue(0), create } },
      cotizacionesService: { generatePdfFile },
    });
    jest.spyOn(svc, 'getOpportunity').mockResolvedValue({ id: 9, companyId: EMPRESA } as any);

    const cotizacion = await svc.addOpportunityQuote(9, { cotizacionId: 33 } as any, usuario, EMPRESA);

    expect(generatePdfFile).toHaveBeenCalledWith(33, EMPRESA);
    expect(cotizacion.pdfUrl).toBe('/uploads/cotizaciones/demo.pdf');
    expect(cotizacion.versionLabel).toBe('V1');
  });
});
