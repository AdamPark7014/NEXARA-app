import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NominaPagoService, extensionComprobante } from './nomina-pago.service';

const ACCESO = { verMontos: true, puedeEditar: true };
const CEO = { id: 1, email: 'gerencia@nexara.com.mx' };
const RH = { id: 2, email: 'rh@ejemplo.test', roleKey: 'rh' };
const ACTOR = { id: 1, nombre: 'Dirección' };
const SEM = '2026-11-16';

function armar(op: { total?: number; cerrada?: boolean; ocultos?: boolean; pago?: any; puedeEditar?: boolean } = {}) {
  const ajustes: any[] = [];
  const registros: any[] = [];
  const fila = {
    userId: 5,
    nombre: 'Efraín Quiroz',
    puesto: 'Instalador',
    area: 'Operación',
    sueldoPeriodo: 2400,
    sueldoPeriodoExplicacion: 'Semana completa',
    viaticos: 0,
    extrasMonto: 240,
    extrasMinutosAprobados: 120,
    extrasMinutosPendientes: 45,
    festivosMonto: 0,
    festivosTrabajados: [],
    descuentos: [{ concepto: 'Uniforme', monto: 100, aceptado: true }, { concepto: 'Falta', monto: 342, aceptado: false }],
    subtotal: 2640,
    total: op.total ?? 2540,
    pago: op.pago ?? null,
  };
  const prisma: any = {
    nominaSemana: { upsert: jest.fn(async () => ({ id: 1 })) },
    nominaPagoAjuste: {
      create: jest.fn(async ({ data }: any) => {
        const r = { id: ajustes.length + 1, ...data, createdAt: new Date() };
        ajustes.push(r);
        return r;
      }),
      findMany: jest.fn(async () => ajustes),
    },
    nominaPagoRegistro: {
      create: jest.fn(async ({ data }: any) => {
        const r = { id: registros.length + 1, ...data, createdAt: new Date() };
        registros.push(r);
        return r;
      }),
      findMany: jest.fn(async () => registros),
    },
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const control: any = {
    consultar: jest.fn(async () => ({
      semana: { id: 1, inicio: SEM, fin: '2026-11-22', estado: op.cerrada ? 'CERRADA' : 'BORRADOR' },
      filas: [fila],
      congelada: Boolean(op.cerrada),
      montosOcultos: Boolean(op.ocultos),
      puedeEditar: op.puedeEditar ?? !op.cerrada,
    })),
  };
  return { service: new NominaPagoService(prisma, control), prisma, ajustes, registros };
}

const pagar = (s: NominaPagoService, monto: number, extra: any = {}) =>
  s.registrar(CEO, ACTOR, 1, { semana: SEM, userId: 5, monto, forma: 'transferencia', fecha: '2026-11-23', ...extra }, ACCESO);

describe('pago semanal', () => {
  it('lo sugerido es el total del Control semanal; un sugerido del cliente no cuenta', async () => {
    const { service } = armar();
    await service.ajustar(CEO, ACTOR, 1, { semana: SEM, userId: 5, monto: 150, motivo: 'Cubrió guardia', pagoSugerido: 99999 } as any, ACCESO);
    const r = await service.semana(CEO, 1, SEM, ACCESO);
    expect(r.filas[0].saldo).toEqual({ sugerido: 2540, ajustes: 150, final: 2690, pagado: 0, saldo: 2690 });
    expect(r.totales).toMatchObject({ final: 2690, porPagar: 1 });
  });

  it('los renglones suman el total y no cuentan el descuento sin aceptar', async () => {
    const { service } = armar();
    const d = await service.detalle(CEO, 1, { semana: SEM, userId: 5 }, ACCESO);
    expect(d.comoSeCalculo.reduce((a, x) => a + x.monto, 0)).toBe(2540);
    expect(d.comoSeCalculo.map((x) => x.titulo)).not.toContain('Falta');
    expect(d.extraPendienteMin).toBe(45);
  });

  it('parcialidades: baja el saldo, cambia el estado y no deja pagar de más', async () => {
    const { service, prisma } = armar();
    await pagar(service, 1500);
    expect((await service.semana(CEO, 1, SEM, ACCESO)).filas[0]).toMatchObject({ estado: 'parcial', saldo: { saldo: 1040 } });
    await expect(pagar(service, 1040.01)).rejects.toBeInstanceOf(ConflictException);
    await pagar(service, 1040);
    expect((await service.semana(CEO, 1, SEM, ACCESO)).filas[0].estado).toBe('pagado');
    // Doble toque: ya no hay saldo.
    await expect(pagar(service, 1040)).rejects.toThrow('ya no tiene saldo');
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('solo dirección registra; forma, monto y fecha se revisan', async () => {
    const { service } = armar();
    await expect(
      service.registrar(RH, { id: 2 }, 1, { semana: SEM, userId: 5, monto: 10, forma: 'efectivo' }, ACCESO),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(pagar(service, 10, { forma: 'bitcoin' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pagar(service, -5)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pagar(service, 10, { fecha: '2999-01-01' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('si ya se marcó Pagado en la lista de pagos, no se paga otra vez ni sale pendiente', async () => {
    const { service } = armar({ pago: { id: 9, estatus: 'Pagado', monto: 2540 } });
    expect((await service.semana(CEO, 1, SEM, ACCESO)).filas[0].estado).toBe('pagado');
    await expect(pagar(service, 100)).rejects.toBeInstanceOf(ConflictException);
  });

  it('semana cerrada no se ajusta, pero sí se paga', async () => {
    const { service } = armar({ cerrada: true });
    await expect(
      service.ajustar(CEO, ACTOR, 1, { semana: SEM, userId: 5, monto: 50, motivo: 'Acuerdo' }, ACCESO),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(pagar(service, 100)).resolves.toMatchObject({ ok: true });
  });

  it('un ajuste no deja el pago en negativo ni debajo de lo ya pagado', async () => {
    const { service } = armar();
    const aj = (monto: number) => service.ajustar(CEO, ACTOR, 1, { semana: SEM, userId: 5, monto, motivo: 'Corrección' }, ACCESO);
    await expect(aj(-3000)).rejects.toBeInstanceOf(BadRequestException);
    await pagar(service, 2500);
    await expect(aj(-100)).rejects.toThrow('Ya se pagó');
  });

  it('con montos ocultos no salen cifras ni detalle; otra persona no aparece', async () => {
    const { service } = armar({ ocultos: true });
    const r = await service.semana(CEO, 1, SEM, ACCESO);
    expect(r).toMatchObject({ montosOcultos: true, totales: null, puedeRegistrar: false });
    expect(r.filas[0].saldo).toBeNull();
    await expect(service.detalle(CEO, 1, { semana: SEM, userId: 5 }, ACCESO)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(armar().service.detalle(CEO, 1, { semana: SEM, userId: 77 }, ACCESO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el comprobante se reconoce por su contenido, no por su nombre', () => {
    expect(extensionComprobante(Buffer.from('%PDF-1.7 contenido'))).toBe('.pdf');
    expect(extensionComprobante(Buffer.from('<html><script>alert(1)'))).toBeNull();
    expect(extensionComprobante(Buffer.from('%PDF'))).toBeNull();
  });
});
