import { BadRequestException } from '@nestjs/common';
import { GestionViaticosController } from './gestion-viaticos.controller.js';

describe('GestionViaticosController', () => {
  const service = { revisarTicket: jest.fn(), facturarTicket: jest.fn(), crearTicket: jest.fn() };
  const controller = new GestionViaticosController(service as any);
  beforeEach(() => jest.clearAllMocks());

  it('no convierte una acción ausente en aprobación', () => {
    expect(() => controller.revisar({ id: 7 }, 1, 5, {})).toThrow(BadRequestException);
    expect(service.revisarTicket).not.toHaveBeenCalled();
  });

  it('no convierte una acción desconocida en facturado', () => {
    expect(() => controller.facturar({ id: 90 }, 1, 5, { accion: 'error' as any })).toThrow(BadRequestException);
    expect(service.facturarTicket).not.toHaveBeenCalled();
  });

  it('solo toma las facturas del archivo subido, nunca de una URL enviada en el cuerpo', () => {
    controller.facturar({ id: 90 }, 1, 5, { accion: 'facturado', facturaXmlUrl: 'https://otro.example/f.xml' });
    expect(service.facturarTicket).toHaveBeenCalledWith({ id: 90 }, 1, 5, {
      accion: 'facturado', notas: undefined, facturaXmlUrl: undefined, facturaPdfUrl: undefined,
    });
  });

  it('requiere foto para subir un ticket', () => {
    expect(() => controller.crearTicket({ id: 22 }, 1, { monto: 10 })).toThrow(BadRequestException);
    expect(service.crearTicket).not.toHaveBeenCalled();
  });
});
