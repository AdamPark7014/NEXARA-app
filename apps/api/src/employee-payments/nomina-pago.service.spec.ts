import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NominaPagoService, extensionComprobante } from './nomina-pago.service';

const ACCESO = { verMontos: true, puedeEditar: true };
const CEO = { id: 1, email: 'gerencia@nexara.com.mx' };
const RH = { id: 2, email: 'rh@ejemplo.test', roleKey: 'rh' };
const ACTOR = { id: 1, nombre: 'Dirección' };
const SEM = '2026-11-16';

function armar(op: { total?: number; cerrada?: boolean; ocultos?: boolean; enLista?: any[]; borrador?: any; markPagado?: any; puedeEditar?: boolean } = {}) {
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
    horasNetasTotales: 40,
    // La foto del cierre se queda con el estatus viejo: no debe mandar.
    pago: { id: 9, estatus: 'Borrador', monto: 2540 },
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
        const r = { id: registros.length + 1, employeePaymentId: null, ...data, createdAt: new Date() };
        registros.push(r);
        return r;
      }),
      findMany: jest.fn(async ({ where }: any) => ('employeePaymentId' in where ? registros.filter((r) => r.employeePaymentId === null) : registros)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        registros.filter((r) => where.id.in.includes(r.id)).forEach((r) => Object.assign(r, data));
        return { count: where.id.in.length };
      }),
    },
    employeePayment: {
      findMany: jest.fn(async () => op.enLista ?? []),
      findFirst: jest.fn(async () => op.borrador ?? null),
      update: jest.fn(async ({ where }: any) => ({ id: where.id })),
      create: jest.fn(async () => ({ id: 50 })),
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
  const lista: any = { markPagado: op.markPagado ?? jest.fn(async () => ({})) };
  return { service: new NominaPagoService(prisma, control, lista), prisma, lista, ajustes, registros };
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

  it('lo pagado en la lista cuenta aunque la foto del cierre diga Borrador', async () => {
    const enLista = [{ id: 9, userId: 5, amount: 2540, paidAt: new Date(), createdAt: new Date() }];
    const { service } = armar({ enLista, cerrada: true });
    expect((await service.semana(CEO, 1, SEM, ACCESO)).filas[0].estado).toBe('pagado');
    await expect(pagar(service, 100)).rejects.toBeInstanceOf(ConflictException);
    const d = await service.detalle(CEO, 1, { semana: SEM, userId: 5 }, ACCESO);
    expect(d.movimientos).toEqual([expect.objectContaining({ tipo: 'pago', forma: 'lista', monto: 2540 })]);
  });

  it('al completar marca una sola línea en la lista, por lo pagado, y la liga a los registros', async () => {
    const { service, prisma, lista, registros } = armar();
    await pagar(service, 1500);
    expect(lista.markPagado).not.toHaveBeenCalled();
    const r = await pagar(service, 1040);
    expect(prisma.employeePayment.create).toHaveBeenCalledTimes(1);
    expect(Number(prisma.employeePayment.create.mock.calls[0][0].data.amount)).toBe(2540);
    expect(prisma.employeePayment.create.mock.calls[0][0].data.status).toBe('Borrador');
    expect(lista.markPagado).toHaveBeenCalledWith(50, 1, 1);
    expect(registros.map((x) => x.employeePaymentId)).toEqual([50, 50]);
    expect(r).toMatchObject({ pagoId: 50, aviso: null });
  });

  it('si el cierre ya dejó su Borrador, usa ese', async () => {
    const { service, prisma, lista } = armar({ cerrada: true, borrador: { id: 9 } });
    await pagar(service, 2540);
    expect(prisma.employeePayment.create).not.toHaveBeenCalled();
    expect(lista.markPagado).toHaveBeenCalledWith(9, 1, 1);
  });

  it('si la póliza falla, el pago queda registrado y se avisa', async () => {
    const { service, registros } = armar({ markPagado: jest.fn(async () => { throw new Error('Periodo cerrado'); }) });
    const r = await pagar(service, 2540);
    expect(r.aviso).toContain('falta su póliza');
    expect(registros).toHaveLength(1);
    await expect(pagar(service, 1)).rejects.toBeInstanceOf(ConflictException);
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
