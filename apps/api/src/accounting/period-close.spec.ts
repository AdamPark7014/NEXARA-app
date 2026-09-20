import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PeriodCloseService } from './period-close.service.js';
import { PeriodCloseController } from './period-close.controller.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Cierre de periodo contable.
 *
 * Lo que se comprueba aquí no es que la lista salga bonita, sino las tres
 * cosas que pueden costar dinero:
 *   1. que un pendiente real marque bloqueante y no se cuele como "ok";
 *   2. que cerrar con bloqueantes se rechace, y que forzarlo exija una
 *      justificación escrita que quede en la bitácora;
 *   3. que ninguna consulta salga sin el filtro de empresa — ya hubo un
 *      incidente de datos cruzados entre usuarios.
 */

const EMPRESA = 7;
const OTRA_EMPRESA = 9;

type Conteos = {
  facturasSinXml: number;
  facturasSinPago: number;
  bancoSinConciliar: number;
  polizasBorrador: number;
  prenomina: number;
  renglonesSinCentro: number;
  polizasSinPeriodo: number;
};

const SIN_PENDIENTES: Conteos = {
  facturasSinXml: 0,
  facturasSinPago: 0,
  bancoSinConciliar: 0,
  polizasBorrador: 0,
  prenomina: 0,
  renglonesSinCentro: 0,
  polizasSinPeriodo: 0,
};

const PERIODO_ABIERTO = {
  id: 3,
  name: 'Agosto 2026',
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-08-31T00:00:00.000Z'),
  isClosed: false,
  closedAt: null as Date | null,
  closedById: null as number | null,
  companyId: EMPRESA,
};

function build(
  over: { conteos?: Partial<Conteos>; periodo?: Record<string, unknown> | null } = {},
) {
  const conteos: Conteos = { ...SIN_PENDIENTES, ...(over.conteos ?? {}) };
  const periodo = over.periodo === undefined ? { ...PERIODO_ABIERTO } : over.periodo;

  // Las consultas que comparten modelo se distinguen por su `where`, igual que
  // en el servicio: así el test rompe si alguien cambia el criterio sin querer.
  const wheres: Record<string, any[]> = {
    fiscalPeriod: [],
    invoice: [],
    bankTransaction: [],
    journalEntry: [],
    employeePayment: [],
    journalEntryLine: [],
  };

  const prisma = {
    fiscalPeriod: {
      findFirst: jest.fn(async (args: any) => {
        wheres.fiscalPeriod.push(args.where);
        return periodo;
      }),
    },
    invoice: {
      count: jest.fn(async (args: any) => {
        wheres.invoice.push(args.where);
        return args.where.paidAmount ? conteos.facturasSinPago : conteos.facturasSinXml;
      }),
    },
    bankTransaction: {
      count: jest.fn(async (args: any) => {
        wheres.bankTransaction.push(args.where);
        return conteos.bancoSinConciliar;
      }),
    },
    journalEntry: {
      count: jest.fn(async (args: any) => {
        wheres.journalEntry.push(args.where);
        return args.where.status === 'DRAFT' ? conteos.polizasBorrador : conteos.polizasSinPeriodo;
      }),
    },
    employeePayment: {
      count: jest.fn(async (args: any) => {
        wheres.employeePayment.push(args.where);
        return conteos.prenomina;
      }),
    },
    journalEntryLine: {
      count: jest.fn(async (args: any) => {
        wheres.journalEntryLine.push(args.where);
        return conteos.renglonesSinCentro;
      }),
    },
  };

  const accounting = {
    closeFiscalPeriod: jest.fn(async (id: number, userId: number) => ({
      id,
      name: PERIODO_ABIERTO.name,
      isClosed: true,
      closedAt: new Date('2026-09-01T10:00:00.000Z'),
      closedById: userId,
    })),
  };
  const audit = { log: jest.fn(async () => ({ id: 1 })) };

  const service = new PeriodCloseService(prisma as any, accounting as any, audit as any);
  return { service, prisma, accounting, audit, wheres };
}

const item = (lista: any, id: string) => lista.items.find((i: any) => i.id === id);

// ── (a) La lista marca bloqueante cuando hay pendientes ─────────────

describe('lista de verificación', () => {
  it('sin pendientes: todo en ok y el periodo se puede cerrar', async () => {
    const { service } = build();
    const lista = await service.getChecklist(3, EMPRESA);

    expect(lista.items.every((i) => i.estado === 'ok')).toBe(true);
    expect(lista.bloqueantes).toBe(0);
    expect(lista.puedeCerrar).toBe(true);
    expect(lista.requiereJustificacion).toBe(false);
  });

  it('marca bloqueante cada pendiente que impide cuadrar el periodo', async () => {
    const { service } = build({
      conteos: {
        facturasSinXml: 2,
        bancoSinConciliar: 5,
        polizasBorrador: 1,
        prenomina: 3,
      },
    });
    const lista = await service.getChecklist(3, EMPRESA);

    expect(item(lista, 'facturas-sin-xml')).toMatchObject({ estado: 'bloqueante', conteo: 2 });
    expect(item(lista, 'banco-sin-conciliar')).toMatchObject({ estado: 'bloqueante', conteo: 5 });
    expect(item(lista, 'polizas-borrador')).toMatchObject({ estado: 'bloqueante', conteo: 1 });
    expect(item(lista, 'prenomina-sin-cerrar')).toMatchObject({ estado: 'bloqueante', conteo: 3 });
    expect(lista.bloqueantes).toBe(4);
    expect(lista.puedeCerrar).toBe(false);
    expect(lista.requiereJustificacion).toBe(true);
  });

  it('los pendientes blandos son advertencia, no bloqueante', async () => {
    const { service } = build({
      conteos: { facturasSinPago: 4, renglonesSinCentro: 11, polizasSinPeriodo: 2 },
    });
    const lista = await service.getChecklist(3, EMPRESA);

    expect(item(lista, 'facturas-sin-pago').estado).toBe('advertencia');
    expect(item(lista, 'renglones-sin-centro-costo').estado).toBe('advertencia');
    expect(item(lista, 'polizas-sin-periodo').estado).toBe('advertencia');
    expect(lista.bloqueantes).toBe(0);
    expect(lista.puedeCerrar).toBe(true);
  });

  it('cada ítem trae etiqueta en español y a dónde ir a resolverlo', async () => {
    const { service } = build({ conteos: { facturasSinXml: 1 } });
    const lista = await service.getChecklist(3, EMPRESA);

    for (const i of lista.items) {
      expect(i.etiqueta.length).toBeGreaterThan(0);
      expect(i.descripcion.length).toBeGreaterThan(0);
      expect(i.href).toMatch(/^\/erp\//);
    }
  });

  it('un periodo ya cerrado no se puede volver a cerrar aunque esté limpio', async () => {
    const { service } = build({
      periodo: { ...PERIODO_ABIERTO, isClosed: true, closedAt: new Date('2026-09-01T00:00:00Z') },
    });
    const lista = await service.getChecklist(3, EMPRESA);
    expect(lista.puedeCerrar).toBe(false);
    expect(lista.periodo.cerrado).toBe(true);
  });

  it('el día final del periodo entra completo en el rango', async () => {
    const { service, wheres } = build();
    await service.getChecklist(3, EMPRESA);

    const rango = wheres.invoice[0].issueDate;
    expect(rango.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(rango.lte.toISOString()).toBe('2026-08-31T23:59:59.999Z');
  });
});

// ── (b) El cierre se rechaza con bloqueantes; pasa con justificación ─

describe('cierre del periodo', () => {
  it('sin bloqueantes cierra y reutiliza closeFiscalPeriod', async () => {
    const { service, accounting, audit } = build();
    const res = await service.closePeriod(3, 42, {}, EMPRESA);

    expect(accounting.closeFiscalPeriod).toHaveBeenCalledWith(3, 42, EMPRESA);
    expect(res.forzado).toBe(false);
    expect(res.periodo.cerrado).toBe(true);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      entityType: 'FiscalPeriod',
      entityId: 3,
      action: 'PERIOD_CLOSE',
      companyId: EMPRESA,
    });
  });

  it('con bloqueantes y sin justificación: rechazado y sin tocar el periodo', async () => {
    const { service, accounting } = build({ conteos: { polizasBorrador: 2, prenomina: 1 } });

    await expect(service.closePeriod(3, 42, {}, EMPRESA)).rejects.toThrow(BadRequestException);
    await expect(service.closePeriod(3, 42, {}, EMPRESA)).rejects.toThrow(
      /bloqueante\(s\) sin resolver/,
    );
    expect(accounting.closeFiscalPeriod).not.toHaveBeenCalled();
  });

  it('el mensaje de rechazo dice qué falta y cuántos', async () => {
    const { service } = build({ conteos: { bancoSinConciliar: 9 } });
    await expect(service.closePeriod(3, 42, {}, EMPRESA)).rejects.toThrow(
      /Movimientos bancarios sin conciliar: 9/,
    );
  });

  it('una justificación de relleno no alcanza para forzar el cierre', async () => {
    const { service, accounting } = build({ conteos: { polizasBorrador: 2 } });

    await expect(
      service.closePeriod(3, 42, { justificacion: 'ok' }, EMPRESA),
    ).rejects.toThrow(/mínimo 20 caracteres/);
    expect(accounting.closeFiscalPeriod).not.toHaveBeenCalled();
  });

  it('con justificación explícita cierra y la deja registrada en auditoría', async () => {
    const { service, accounting, audit } = build({ conteos: { polizasBorrador: 2 } });
    const justificacion = 'Cierre autorizado por dirección: las 2 pólizas se reponen en septiembre.';

    const res = await service.closePeriod(3, 42, { justificacion }, EMPRESA);

    expect(accounting.closeFiscalPeriod).toHaveBeenCalledWith(3, 42, EMPRESA);
    expect(res.forzado).toBe(true);
    expect(res.justificacion).toBe(justificacion);
    expect(res.bloqueantesAlCerrar).toEqual([
      { id: 'polizas-borrador', etiqueta: 'Pólizas en borrador sin contabilizar', conteo: 2 },
    ]);

    const registro = audit.log.mock.calls[0][0] as any;
    expect(registro.action).toBe('PERIOD_CLOSE_FORCED');
    expect(registro.changes.justificacion).toBe(justificacion);
    expect(registro.changes.forzado).toBe(true);
    // Antes / después: la bitácora guarda ambos lados del cambio.
    expect(registro.previousData).toMatchObject({ isClosed: false, closedAt: null });
    expect(registro.changes).toMatchObject({ isClosed: true, closedById: 42 });
  });

  it('un periodo ya cerrado se rechaza antes de tocar nada', async () => {
    const { service, accounting } = build({
      periodo: { ...PERIODO_ABIERTO, isClosed: true },
    });
    await expect(service.closePeriod(3, 42, {}, EMPRESA)).rejects.toThrow(/ya está cerrado/);
    expect(accounting.closeFiscalPeriod).not.toHaveBeenCalled();
  });

  it('si la bitácora falla, el cierre no se revierte pero tampoco se pierde', async () => {
    const { service, audit } = build();
    audit.log.mockRejectedValueOnce(new Error('bitácora caída'));

    const res = await service.closePeriod(3, 42, {}, EMPRESA);
    expect(res.periodo.cerrado).toBe(true);
  });
});

// ── (c) Aislamiento por empresa ─────────────────────────────────────

describe('aislamiento por empresa', () => {
  it('sin empresa activa no se consulta nada', async () => {
    const { service, prisma } = build();
    await expect(service.getChecklist(3, null)).rejects.toThrow(ForbiddenException);
    await expect(service.closePeriod(3, 42, {}, undefined)).rejects.toThrow(ForbiddenException);
    expect(prisma.fiscalPeriod.findFirst).not.toHaveBeenCalled();
  });

  it('todas las consultas llevan el filtro de empresa', async () => {
    const { service, wheres } = build();
    await service.getChecklist(3, EMPRESA);

    expect(wheres.fiscalPeriod[0]).toMatchObject({ id: 3, companyId: EMPRESA });
    for (const modelo of ['invoice', 'bankTransaction', 'journalEntry', 'employeePayment']) {
      expect(wheres[modelo].length).toBeGreaterThan(0);
      for (const where of wheres[modelo]) {
        expect(where.companyId).toBe(EMPRESA);
      }
    }
    // JournalEntryLine no tiene companyId propio: se filtra por su póliza.
    expect(wheres.journalEntryLine[0].journalEntry.companyId).toBe(EMPRESA);
  });

  it('un periodo de otra empresa no existe para mí', async () => {
    const { service } = build({ periodo: null });
    await expect(service.getChecklist(3, EMPRESA)).rejects.toThrow(NotFoundException);
  });

  it('una fila marcada con otra empresa se rechaza aunque la consulta la devuelva', async () => {
    const { service, accounting } = build({
      periodo: { ...PERIODO_ABIERTO, companyId: OTRA_EMPRESA },
    });
    await expect(service.closePeriod(3, 42, {}, EMPRESA)).rejects.toThrow(NotFoundException);
    expect(accounting.closeFiscalPeriod).not.toHaveBeenCalled();
  });

  it('el cierre pasa la empresa activa, nunca la del cuerpo de la petición', async () => {
    const { service, accounting } = build();
    await service.closePeriod(3, 42, { justificacion: undefined }, EMPRESA);
    expect(accounting.closeFiscalPeriod).toHaveBeenCalledWith(3, 42, EMPRESA);
  });
});

// ── (d) Contrato de autorización ────────────────────────────────────

describe('contrato de autorización', () => {
  const rbacDe = (metodo: 'checklist' | 'cerrar') =>
    Reflect.getMetadata('rbac', PeriodCloseController.prototype[metodo]) as {
      permissions?: string[];
      anyPermissions?: string[];
    };

  it('ver la lista es de contabilidad o de quien cierra', () => {
    const rbac = rbacDe('checklist');
    expect(rbac.anyPermissions).toEqual(
      expect.arrayContaining([
        PERMISSIONS.ACCOUNTING_VIEW,
        PERMISSIONS.CONTABILIDAD_VIEW,
        PERMISSIONS.ACCOUNTING_CLOSE_PERIOD,
        PERMISSIONS.CONSOLE_ADMIN,
      ]),
    );
  });

  it('cerrar exige accounting.close_period, no basta con ver contabilidad', () => {
    const rbac = rbacDe('cerrar');
    expect(rbac.permissions).toEqual([PERMISSIONS.ACCOUNTING_CLOSE_PERIOD]);
    expect(rbac.anyPermissions).toBeUndefined();

    const soloLectura = [PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.CONTABILIDAD_VIEW];
    const cumple = (rbac.permissions ?? []).every((p) => soloLectura.includes(p as never));
    expect(cumple).toBe(false);
  });

  it('cerrar usa el mismo permiso que el cierre viejo de periodos fiscales', () => {
    expect(PERMISSIONS.ACCOUNTING_CLOSE_PERIOD).toBe('accounting.close_period');
  });
});
