import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ControlNominaService, type FilaRespuesta } from './control-nomina.service.js';
import { diasDeLaSemana, filaControl, type EntradaDia, type EntradaFila } from './control-nomina.js';
import { EmployeePaymentsController } from './employee-payments.controller.js';

/**
 * Lo que hace el servicio alrededor de las cuentas: cerrar sin duplicar pagos, reabrir con
 * motivo, no editar una semana cerrada y validar lo que llega. Prisma es un doble mínimo; el
 * cálculo de las filas se sustituye (tiene sus propias pruebas en `control-nomina.spec.ts`).
 */
const LUNES = '2026-09-28';
const DOMINGO = '2026-10-04';
const VIEWER = { id: 1, roleKey: 'ceo', email: 'ceo@nexara.com.mx', isSuperAdmin: true };
const ACTOR = { id: 1, nombre: 'Christian' };

/** Lunes a viernes de 10:00 a 18:00 en la oficina; sábado y domingo sin checada. */
function semanaTrabajada(): EntradaDia[] {
  return diasDeLaSemana(LUNES).map((d, i) => {
    const base = { fecha: d.fecha, laborable: i < 5, pasado: true, oficina: 'Oficina', minutosLaborados: 0 };
    if (i >= 5) return { ...base, checadas: [], entrada: null, salida: null };
    return {
      ...base,
      checadas: [{ tipo: 'entrada', sitioNombre: 'Oficina', fueraDeSitio: false }],
      entrada: new Date(`${d.fecha}T10:00:00-06:00`).toISOString(),
      salida: new Date(`${d.fecha}T18:00:00-06:00`).toISOString(),
      minutosLaborados: 420,
    };
  });
}

function fila(userId: number, extra: Partial<EntradaFila> = {}): FilaRespuesta {
  const f = filaControl({
    userId,
    nombre: `Persona ${userId}`,
    area: 'Administrativo',
    semana: { inicio: LUNES, fin: DOMINGO },
    hoy: '2026-10-05',
    horario: { etiqueta: 'Oficina', entrada: '10:00', salida: '18:00', jornadaOrdinariaMin: 480, dias: [1, 2, 3, 4, 5], personalizado: false },
    sueldoSemanal: 2800,
    dias: semanaTrabajada(),
    viaticos: [],
    extrasMinutosAprobados: 0,
    extrasMinutosPendientes: 0,
    descuentos: [],
    ...extra,
  });
  return { ...f, pago: null };
}

function crear(opciones: { estado?: string; previaFilas?: Array<{ userId: number; pagoId: number | null }> } = {}) {
  const semana = { id: 10, estado: opciones.estado ?? 'BORRADOR', cerradaPorId: null, cerradaAt: null };
  const previa = {
    ...semana,
    inicio: new Date(Date.UTC(2026, 8, 28)),
    cerradaPor: null,
    reabiertaPor: null,
    reabiertaAt: null,
    reabiertaMotivo: null,
    dias: [],
    descuentos: [],
    filas: (opciones.previaFilas ?? []).map((f) => ({ ...f, notaFila: null, snapshot: null })),
  };
  const prisma: any = {
    nominaSemana: {
      upsert: jest.fn().mockResolvedValue(semana),
      findFirst: jest.fn().mockResolvedValue(previa),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    nominaSemanaFila: { upsert: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.create.userId })) },
    nominaSemanaDia: { findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn(), deleteMany: jest.fn() },
    employeePayment: {
      findMany: jest.fn().mockResolvedValue([
        { id: 77, userId: 3, status: 'Borrador' },
        { id: 80, userId: 4, status: 'Pagado' },
      ]),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
    $transaction: jest.fn().mockImplementation((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
  };
  const pagos = {
    create: jest.fn().mockResolvedValue({ id: 101 }),
    update: jest.fn().mockResolvedValue({ id: 77 }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ControlNominaService(prisma, {} as any, pagos as any, audit as any);
  return { service, prisma, pagos, audit };
}

describe('ControlNominaService.cerrar', () => {
  const filas = [
    fila(1, { viaticos: [{ id: 1, concepto: 'Alimentación', monto: 120, estatus: 'Aprobado' }] }),
    fila(2, { sueldoSemanal: null }),
    fila(3),
    fila(4),
    fila(5, { descuentos: [{ id: 9, concepto: 'Préstamo', monto: 2800, sugerido: false }] }),
  ];

  it('un pago en Borrador por persona, sin duplicar ni tocar lo pagado', async () => {
    const { service, prisma, pagos, audit } = crear({ previaFilas: [{ userId: 3, pagoId: 77 }] });
    jest.spyOn(service as any, 'calcular').mockResolvedValue({ filas, scope: 'company' });

    const r = await service.cerrar(VIEWER, ACTOR, 1, { semana: '2026-10-01' });

    // Se reclama el cierre antes de crear pagos.
    expect(prisma.nominaSemana.updateMany).toHaveBeenCalledWith({
      where: { id: 10, companyId: 1, estado: { not: 'CERRADA' } },
      data: expect.objectContaining({ estado: 'CERRADA', cerradaPorId: 1 }),
    });
    expect(pagos.create).toHaveBeenCalledTimes(1);
    expect(pagos.create).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({
        userId: 1,
        periodFrom: LUNES,
        periodTo: DOMINGO,
        amount: 2920,
        concepto: 'Nómina semana 28/09–04/10',
        status: 'Borrador',
      }),
      [],
      1,
    );
    expect(pagos.create.mock.calls[0][1].note).toContain('Total: $2,920.00');
    // El Borrador que generó un cierre anterior de esta semana se actualiza.
    expect(pagos.update).toHaveBeenCalledWith(77, expect.objectContaining({ amount: 2800 }), undefined, 1, 1);
    expect(r).toMatchObject({ creados: 1, actualizados: 1, omitidos: 3, errores: 0 });
    expect(r.pagos.creados).toEqual([{ userId: 1, nombre: 'Persona 1', pagoId: 101, monto: 2920 }]);
    expect(r.pagos.actualizados).toEqual([{ userId: 3, nombre: 'Persona 3', pagoId: 77, monto: 2800 }]);
    expect(r.pagos.omitidos).toEqual([
      { userId: 2, nombre: 'Persona 2', motivo: 'Sin sueldo semanal capturado' },
      { userId: 4, nombre: 'Persona 4', motivo: 'Ya existe el pago #80 (Pagado) para esa semana', pagoId: 80 },
      { userId: 5, nombre: 'Persona 5', motivo: 'Total en $0.00' },
    ]);
    // La foto de cada fila queda guardada, con el pago que le toca.
    expect(prisma.nominaSemanaFila.upsert).toHaveBeenCalledTimes(5);
    const foto1 = prisma.nominaSemanaFila.upsert.mock.calls.find((c: any[]) => c[0].create.userId === 1)[0];
    expect(foto1.create.pagoId).toBe(101);
    expect(foto1.create.snapshot.total).toBe(2920);
    expect(foto1.create.snapshot.pago).toEqual({ id: 101, estatus: 'Borrador', monto: 2920 });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'NominaSemana', action: 'CERRAR' }), 1);
  });

  it('una semana ya cerrada no se vuelve a cerrar', async () => {
    const { service, pagos } = crear({ estado: 'CERRADA' });
    await expect(service.cerrar(VIEWER, ACTOR, 1, { semana: LUNES })).rejects.toBeInstanceOf(ConflictException);
    expect(pagos.create).not.toHaveBeenCalled();
  });

  it('si otro cierre ganó la carrera, no crea pagos', async () => {
    const { service, prisma, pagos } = crear();
    jest.spyOn(service as any, 'calcular').mockResolvedValue({ filas, scope: 'company' });
    prisma.nominaSemana.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.cerrar(VIEWER, ACTOR, 1, { semana: LUNES })).rejects.toBeInstanceOf(ConflictException);
    expect(pagos.create).not.toHaveBeenCalled();
  });

  it('si no se puede guardar la foto, la semana vuelve a como estaba', async () => {
    const { service, prisma } = crear();
    jest.spyOn(service as any, 'calcular').mockResolvedValue({ filas: [fila(1)], scope: 'company' });
    prisma.employeePayment.findMany.mockResolvedValueOnce([]);
    prisma.$transaction.mockRejectedValueOnce(new Error('se cayó la base'));
    await expect(service.cerrar(VIEWER, ACTOR, 1, { semana: LUNES })).rejects.toThrow('se cayó la base');
    expect(prisma.nominaSemana.updateMany).toHaveBeenLastCalledWith({
      where: { id: 10, companyId: 1 },
      data: { estado: 'BORRADOR', cerradaPorId: null, cerradaAt: null },
    });
  });
});

describe('ControlNominaService.reabrir', () => {
  it('exige un motivo de al menos 10 caracteres', async () => {
    const { service } = crear({ estado: 'CERRADA' });
    await expect(service.reabrir(ACTOR, 1, { semana: LUNES, motivo: 'error' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo reabre una semana cerrada y deja quién, cuándo y por qué', async () => {
    const abierta = crear();
    await expect(
      abierta.service.reabrir(ACTOR, 1, { semana: LUNES, motivo: 'Faltó un viático de Tehuacán' }),
    ).rejects.toBeInstanceOf(ConflictException);

    const { service, prisma, audit } = crear({ estado: 'CERRADA', previaFilas: [{ userId: 3, pagoId: 77 }] });
    prisma.employeePayment.findMany.mockResolvedValueOnce([{ id: 77, userId: 3 }]);
    const r = await service.reabrir(ACTOR, 1, { semana: LUNES, motivo: 'Faltó un viático de Tehuacán' });
    expect(prisma.nominaSemana.updateMany).toHaveBeenCalledWith({
      where: { id: 10, companyId: 1, estado: 'CERRADA' },
      data: expect.objectContaining({ estado: 'BORRADOR', reabiertaPorId: 1, reabiertaMotivo: 'Faltó un viático de Tehuacán' }),
    });
    expect(r.avisos[0]).toContain('#77');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REABRIR', changes: expect.objectContaining({ motivo: 'Faltó un viático de Tehuacán' }) }),
      1,
    );
  });
});

describe('ControlNominaService · ediciones', () => {
  it('una semana cerrada no se edita', async () => {
    const { service } = crear({ estado: 'CERRADA' });
    await expect(
      service.ajustarDia(VIEWER, ACTOR, 1, { semana: LUNES, userId: 5, fecha: '2026-09-29', lugar: 'Oficina' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.crearDescuento(VIEWER, ACTOR, 1, { semana: LUNES, userId: 5, concepto: 'Préstamo', monto: 100 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('valida el lugar y que la fecha sea de esa semana', async () => {
    const { service } = crear();
    await expect(
      service.ajustarDia(VIEWER, ACTOR, 1, { semana: LUNES, userId: 5, fecha: '2026-09-29', lugar: 'Home office' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.ajustarDia(VIEWER, ACTOR, 1, { semana: LUNES, userId: 5, fecha: '2026-10-05', lugar: 'Oficina' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guarda el ajuste con quién lo hizo y lo audita con el antes y el después', async () => {
    const { service, prisma, audit } = crear();
    prisma.nominaSemanaDia.upsert.mockResolvedValue({ id: 44 });
    jest.spyOn(service as any, 'calcular').mockResolvedValue({ filas: [fila(5)], scope: 'company' });
    const r = await service.ajustarDia(VIEWER, ACTOR, 1, { semana: LUNES, userId: 5, fecha: '2026-09-29', lugar: 'foraneo' });
    expect(prisma.nominaSemanaDia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lugar: 'Foráneo', ajustadoPorId: 1, companyId: 1, userId: 5 }),
        update: expect.objectContaining({ lugar: 'Foráneo', ajustadoPorId: 1 }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AJUSTE_LUGAR', changes: expect.objectContaining({ antes: null, despues: 'Foráneo' }) }),
      1,
    );
    expect(r.fila?.userId).toBe(5);
  });

  it('semana inválida → 400', () => {
    const { service } = crear();
    expect(() => service.resolverSemana('2026-13-01')).toThrow(BadRequestException);
    expect(service.resolverSemana('2026-10-02')).toBe(LUNES);
  });
});

describe('Pagos a empleados · la política del módulo también en preview-period y prenomina/batch', () => {
  const policy = {
    exigir: jest.fn().mockRejectedValue(new ForbiddenException('«Pagos a personal» está restringido')),
    puedeUsar: jest.fn(),
  };
  const service = { previewPeriod: jest.fn(), createBorradorBatch: jest.fn() };
  const controller = new EmployeePaymentsController(service as any, {} as any, policy as any);
  const rh = { id: 9, roleKey: 'rh' };

  it('preview-period responde 403 si la empresa reservó el módulo', async () => {
    await expect(controller.previewPeriod(rh, 1, LUNES, DOMINGO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.previewPeriod).not.toHaveBeenCalled();
    expect(policy.exigir).toHaveBeenCalledWith('employee-payments', rh, 1);
  });

  it('prenomina/batch tampoco crea pagos por esa puerta', async () => {
    await expect(controller.createPrenominaBatch(rh, 1, { from: LUNES, to: DOMINGO })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.createBorradorBatch).not.toHaveBeenCalled();
  });
});
