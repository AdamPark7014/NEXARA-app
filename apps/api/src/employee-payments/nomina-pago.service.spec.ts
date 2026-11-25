import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { NominaPagoService } from './nomina-pago.service';

function armar(estado = 'BORRADOR') {
  const ajustes: any[] = [];
  const registros: any[] = [];
  const filas: any[] = [];
  const prisma: any = {
    nominaSemana: {
      findUnique: jest.fn(async () => ({
        id: 1,
        estado,
        companyId: 1,
        parametrosSnapshot: null,
        filas,
      })),
      update: jest.fn(async ({ data }: any) => data),
    },
    nominaSemanaFila: {
      upsert: jest.fn(async ({ create, update }: any) => {
        const i = filas.findIndex((f) => f.userId === create.userId);
        const previa = i >= 0 ? filas[i] : null;
        const fila = {
          id: previa?.id ?? 10,
          userId: create.userId,
          pagoSugerido:
            create.pagoSugerido ?? update?.pagoSugerido ?? previa?.pagoSugerido ?? null,
          pagoId: previa?.pagoId ?? null,
          snapshot: previa?.snapshot ?? null,
        };
        if (i >= 0) filas[i] = fila;
        else filas.push(fila);
        return fila;
      }),
    },
    nominaPagoAjuste: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: ajustes.length + 1, ...data, createdAt: new Date() };
        ajustes.push(row);
        return row;
      }),
      findMany: jest.fn(async () => ajustes),
    },
    nominaPagoRegistro: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: registros.length + 1, ...data, createdAt: new Date() };
        registros.push(row);
        return row;
      }),
      findMany: jest.fn(async () => registros),
    },
  };
  return { service: new NominaPagoService(prisma), prisma, ajustes, registros };
}

const CEO = { id: 1, email: 'gerencia@nexara.com.mx' };
const ACTOR = { id: 1, nombre: 'Direccion' };
const NO_CEO = { id: 2, email: 'coord@nexara.com.mx' };

describe('NominaPagoService', () => {
  it('ajusta pago con motivo y calcula saldo', async () => {
    const { service, prisma } = armar();
    const r = await service.ajustarPago(CEO, ACTOR, 1, {
      semana: '2026-11-17',
      userId: 5,
      monto: -100,
      motivo: 'Acuerdo de la semana',
      pagoSugerido: 1000,
    });
    expect(prisma.nominaPagoAjuste.create).toHaveBeenCalled();
    expect(r.saldo).toMatchObject({ sugerido: 1000, ajustes: -100, final: 900, saldo: 900 });
  });

  it('no ajusta semana cerrada', async () => {
    const { service } = armar('CERRADA');
    await expect(
      service.ajustarPago(CEO, ACTOR, 1, {
        semana: '2026-11-17',
        userId: 5,
        monto: 10,
        motivo: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registrar pago solo CEO; efectivo sin comprobante', async () => {
    const { service } = armar();
    await expect(
      service.registrarPago(NO_CEO, ACTOR, 1, {
        semana: '2026-11-17',
        userId: 5,
        monto: 500,
        forma: 'efectivo',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const ok = await service.registrarPago(CEO, ACTOR, 1, {
      semana: '2026-11-17',
      userId: 5,
      monto: 400,
      forma: 'efectivo',
    });
    expect(ok.registro.forma).toBe('efectivo');
    expect(ok.saldo.pagado).toBe(400);
  });

  it('como se calculo expone renglones y saldo con parcialidades', async () => {
    const { service } = armar();
    await service.ajustarPago(CEO, ACTOR, 1, {
      semana: '2026-11-17',
      userId: 5,
      monto: -50,
      motivo: 'Redondeo acordado',
      pagoSugerido: 1000,
    });
    await service.registrarPago(CEO, ACTOR, 1, {
      semana: '2026-11-17',
      userId: 5,
      monto: 300,
      forma: 'transferencia',
      comprobanteUrl: '/uploads/nomina-comprobantes/x.pdf',
    });
    const vista = await service.saldoYComoSeCalculo(CEO, 1, { semana: '2026-11-17', userId: 5 });
    expect(vista.saldo).toMatchObject({ final: 950, pagado: 300, saldo: 650 });
    expect(Array.isArray(vista.comoSeCalculo)).toBe(true);
  });
});
