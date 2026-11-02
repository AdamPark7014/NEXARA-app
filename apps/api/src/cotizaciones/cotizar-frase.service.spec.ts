import { CotizarFraseService } from './cotizar-frase.service';

const USO = { modelo: 'claude-haiku-5-5', tokensEntrada: 400, tokensSalida: 60, tokensCacheLeidos: 0, tokensCacheEscritos: 0, tokensPensamiento: 0, usdAprox: 0.0001 };

function armar(cambios: { disponible?: boolean; json?: jest.Mock; buscar?: jest.Mock; queryRaw?: jest.Mock } = {}) {
  const prisma = {
    $queryRaw: cambios.queryRaw ?? jest.fn(async () => []),
    supplierCatalogSyncRun: { findFirst: jest.fn(async () => ({ finishedAt: new Date() })) },
    salesClient: { findMany: jest.fn(async () => [{ id: 1, name: 'A QUIEN CORRESPONDA' }, { id: 2, name: 'Hotel Aurora' }]) },
    cotizacion: {
      findMany: jest.fn(async () => [{ clientName: 'Hotel Aurora', salesClientId: 2 }]),
      findFirst: jest.fn(async () => ({ id: 47, quoteNumber: 'COT-47', clientName: 'Hotel Aurora', projectName: 'Accesos' })),
    },
    cotizacionItem: {
      findMany: jest.fn(async () => [
        { id: 1, cotizacionId: 47, name: 'Impresora Zebra de tarjetas', brand: 'Zebra', model: 'ZC32', unit: 'Pieza', unitCost: 22000, unitPrice: 26000, createdAt: new Date('2026-10-27') },
        { id: 2, cotizacionId: 47, name: 'Kit de limpieza Zebra', brand: 'Zebra', model: '105999', unit: 'Pieza', unitCost: 400, unitPrice: 490, createdAt: new Date('2026-10-27') },
      ]),
    },
  };
  const json = cambios.json ?? jest.fn(async () => ({ datos: { cliente: null, proyecto: null, lineas: [{ cant: 3, unidad: null, concepto: 'Impresora Zebra de tarjetas' }] }, uso: USO }));
  const claude = { disponible: () => cambios.disponible ?? true, json };
  const productos = { search: cambios.buscar ?? jest.fn(async () => ({ data: [] })) };
  return { service: new CotizarFraseService(prisma as any, claude as any, productos as any), prisma, json, productos };
}

describe('CotizarFraseService', () => {
  it('sin texto no gasta nada', async () => {
    const { service, json } = armar();
    await expect(service.interpretar('   ', 1)).rejects.toThrow('Escribe qué hay que cotizar');
    expect(json).not.toHaveBeenCalled();
  });

  it('sin empresa no entra', async () => {
    const { service } = armar();
    await expect(service.interpretar('3 impresoras', null)).rejects.toThrow('Empresa requerida');
  });

  it('solo lee la empresa activa y no crea nada', async () => {
    const { service, prisma } = armar();
    await service.interpretar('3 impresoras Zebra de tarjetas, 1 kit de limpieza Zebra para Hotel Aurora', 7, { excluir: 9 });
    expect(prisma.cotizacionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cotizacion: { companyId: 7, deletedAt: null, id: { not: 9 } } } }),
    );
    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 7, deletedAt: null } }));
    expect(Object.keys(prisma.cotizacion)).not.toContain('create');
  });

  it('una frase que el código reconoce completa no llama a la IA', async () => {
    const { service, json } = armar();
    const r = await service.interpretar('3 impresoras Zebra de tarjetas, 1 kit de limpieza Zebra para Hotel Aurora', 1);
    expect(json).not.toHaveBeenCalled();
    expect(r.via).toBe('codigo');
    expect(r.uso).toBeNull();
    expect(r.cliente).toMatchObject({ salesClientId: 2, nombre: 'Hotel Aurora', seguridad: 'alta' });
    expect(r.partidas[0]).toMatchObject({ cantidad: 3, model: 'ZC32', unitPrice: 26000 });
    expect(r.parecida).toMatchObject({ id: 47, folio: 'COT-47', enComun: 2, deLineas: 2 });
    expect(r.margenPorOmision).toBe(20);
  });

  it('cuando va a la IA manda solo la frase, con su proceso', async () => {
    const { service, json } = armar();
    const r = await service.interpretar('tres impresoras de esas de tarjetas', 1);
    expect(json).toHaveBeenCalledTimes(1);
    const peticion = json.mock.calls[0]![0];
    expect(peticion).toMatchObject({ proceso: 'cotizar-frase', companyId: 1, usuario: 'tres impresoras de esas de tarjetas', esfuerzo: 'low', pensar: false });
    expect(JSON.stringify(peticion.sistema)).not.toContain('Hotel Aurora');
    expect(JSON.stringify(peticion.sistema)).not.toContain('Zebra');
    expect(r.via).toBe('ia');
    expect(r.uso).toEqual(USO);
  });

  it('sin IA configurada o con error, queda lo que leyó el código', async () => {
    const apagada = armar({ disponible: false });
    const r = await apagada.service.interpretar('3 piezas de algo nuevo', 1);
    expect(apagada.json).not.toHaveBeenCalled();
    expect(r.via).toBe('codigo');
    expect(r.avisos[0]).toContain('La IA no respondió');

    const conError = armar({ json: jest.fn(async () => { throw new Error('429'); }) });
    const r2 = await conError.service.interpretar('3 piezas de algo nuevo', 1);
    expect(r2.partidas[0]).toMatchObject({ cantidad: 3 });
  });

  it('si el catálogo del mayorista falla se sigue sin él', async () => {
    const { service } = armar({ buscar: jest.fn(async () => { throw new Error('sin catálogo'); }) });
    const r = await service.interpretar('2 reguladores 2000 VA\n1 gabinete 6U', 1);
    expect(r.via).toBe('lista');
    expect(r.partidas).toHaveLength(2);
  });

  it('lo del mayorista llega con costo y el precio con margen', async () => {
    const buscar = jest.fn(async () => ({ data: [{ id: 9, nombre: 'Regulador 2000 VA', marca: 'CyberPower', modelo: 'CL2000VR', costMxn: 700, stockTotal: 4, descripcion: null, imagen: null }] }));
    const { service } = armar({ buscar });
    const r = await service.interpretar('2 reguladores 2000 VA\n1 cosa rara', 1);
    expect(buscar).toHaveBeenCalled();
    expect(r.partidas[0]).toMatchObject({ fuente: 'catalogo', unitCost: 700, unitPrice: 840, productCtId: 9, stock: 4 });
  });

  describe('costo de hoy en CT', () => {
    const ZC32 = { clave: 'IMP1', modelo: 'ZC300', numParte: 'ZC32', precio: 1200, moneda: 'USD', tipoCambio: 20, existencia: { '14A': 3 }, tipoDelDia: 20 };
    const FRASE = '3 impresoras Zebra de tarjetas, 1 kit de limpieza Zebra para Hotel Aurora';

    it('avisa en lo ya cotizado sin cambiar costo ni precio, y sin llamar a la IA', async () => {
      const { service, json } = armar({ queryRaw: jest.fn(async () => [ZC32]) });
      const r = await service.interpretar(FRASE, 1);
      expect(json).not.toHaveBeenCalled();
      expect(r.partidas[0]).toMatchObject({ unitCost: 22000, unitPrice: 26000, costoDeHoy: { costo: 24000, clave: 'IMP1', piezas: 3, alDia: true } });
      expect(r.partidas[1]).not.toHaveProperty('costoDeHoy');
    });

    it('a la IA no le llega nada de CT', async () => {
      const queryRaw = jest.fn(async () => [ZC32]);
      const { service, json } = armar({ queryRaw });
      await service.interpretar('seis domos de cuatro megas, algo raro para un cliente nuevo', 1);
      const peticion = JSON.stringify(json.mock.calls[0]);
      expect(peticion).not.toContain('IMP1');
      expect(peticion).not.toContain('24000');
    });

    it('es una sola consulta y solo con modelos ya cotizados', async () => {
      const queryRaw = jest.fn(async () => [ZC32]);
      const { service } = armar({ queryRaw });
      await service.interpretar(FRASE, 1);
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(queryRaw.mock.calls[0].slice(1)[0]).toEqual(expect.arrayContaining(['ZC32', '105999']));
    });

    it('si la consulta falla, la propuesta sale sin aviso', async () => {
      const { service } = armar({ queryRaw: jest.fn(async () => { throw new Error('sin base'); }) });
      const r = await service.interpretar(FRASE, 1);
      expect(r.partidas[0]).toMatchObject({ unitCost: 22000, unitPrice: 26000 });
      expect(r.partidas[0]).not.toHaveProperty('costoDeHoy');
    });

    it('en dólares no se compara con CT, y lo cotizado en otra moneda no se ofrece', async () => {
      const queryRaw = jest.fn(async () => [ZC32]);
      const { service, prisma } = armar({ queryRaw });
      await service.interpretar(FRASE, 7, { moneda: 'usd' });
      expect(queryRaw).not.toHaveBeenCalled();
      expect(prisma.cotizacionItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cotizacion: { companyId: 7, deletedAt: null, currency: { equals: 'USD', mode: 'insensitive' } } } }),
      );
    });
  });
});
