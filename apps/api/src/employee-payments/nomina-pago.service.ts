/**
 * Parte D: pago semanal editable (sugerido + ajuste) y registro de pago (solo CEO).
 * Reutiliza NominaSemana / NominaSemanaFila / EmployeePayment.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { parseWorkDate, workDateColumn } from '../common/time/workday.js';
import { isCeoEquivalentEmail } from '../common/platform-accounts.js';
import {
  comoSeCalculoRenglones,
  saldoPagoSemanal,
  snapshotParametrosAlCerrar,
  validarAjustePago,
  validarRegistroPagoCeo,
  type FormaPagoNomina,
} from './pago-semanal.js';

type PrismaX = PrismaService & {
  nominaPagoAjuste: any;
  nominaPagoRegistro: any;
};

type Viewer = { id: number; email?: string | null; isSuperAdmin?: boolean };
type Actor = { id: number; nombre?: string | null };

@Injectable()
export class NominaPagoService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private get db(): PrismaX {
    return this.prisma as PrismaX;
  }

  private async semanaDe(companyId: number, lunesIso: string) {
    const inicio = workDateColumn(parseWorkDate(lunesIso.slice(0, 10)));
    const semana = await this.prisma.nominaSemana.findUnique({
      where: { companyId_inicio: { companyId, inicio } },
      include: { filas: true },
    });
    if (!semana) throw new NotFoundException('Semana de nómina no encontrada');
    return semana;
  }

  async ajustarPago(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null,
    body: { semana: string; userId: number; monto: number; motivo: string; pagoSugerido?: number },
  ) {
    const tenantId = requireCompanyId(companyId);
    const semana = await this.semanaDe(tenantId, body.semana);
    const v = validarAjustePago({
      monto: Number(body.monto),
      motivo: body.motivo,
      semanaCerrada: semana.estado === 'CERRADA',
    });
    if (!v.ok) throw new BadRequestException(v.error);

    const userId = Number(body.userId);
    if (!userId) throw new BadRequestException('userId inválido');

    const fila = await this.prisma.nominaSemanaFila.upsert({
      where: { semanaId_userId: { semanaId: semana.id, userId } },
      create: {
        semanaId: semana.id,
        companyId: tenantId,
        userId,
        pagoSugerido:
          body.pagoSugerido != null ? new Prisma.Decimal(body.pagoSugerido) : undefined,
        actualizadoPorId: actor.id,
      },
      update: {
        ...(body.pagoSugerido != null
          ? { pagoSugerido: new Prisma.Decimal(body.pagoSugerido) }
          : {}),
        actualizadoPorId: actor.id,
      },
    });

    const ajuste = await this.db.nominaPagoAjuste.create({
      data: {
        semanaId: semana.id,
        companyId: tenantId,
        userId,
        monto: new Prisma.Decimal(body.monto),
        motivo: body.motivo.trim(),
        autorId: actor.id,
      },
    });

    await this.audit
      ?.log(
        {
          entityType: 'NominaPagoAjuste',
          entityId: ajuste.id,
          action: 'CREATE',
          changes: { userId, monto: body.monto, motivo: body.motivo, semana: body.semana },
        },
        viewer.id,
      )
      .catch(() => undefined);

    const saldo = await this.saldoDeFila(tenantId, semana.id, userId, fila.pagoSugerido);
    return { ok: true, ajuste, filaId: fila.id, saldo };
  }

  async registrarPago(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null,
    body: {
      semana: string;
      userId: number;
      monto: number;
      fecha?: string;
      forma: FormaPagoNomina | string;
      comprobanteUrl?: string | null;
    },
  ) {
    const tenantId = requireCompanyId(companyId);
    const v = validarRegistroPagoCeo({
      esCeo: isCeoEquivalentEmail(viewer.email) || !!viewer.isSuperAdmin,
      monto: Number(body.monto),
      forma: body.forma,
      comprobanteUrl: body.comprobanteUrl,
    });
    if (!v.ok) {
      if (v.error.includes('Solo la dirección')) throw new ForbiddenException(v.error);
      throw new BadRequestException(v.error);
    }

    const semana = await this.semanaDe(tenantId, body.semana);
    const userId = Number(body.userId);
    if (!userId) throw new BadRequestException('userId inválido');

    const fechaPago = body.fecha
      ? workDateColumn(parseWorkDate(body.fecha.slice(0, 10)))
      : workDateColumn(new Date());

    const fila = await this.prisma.nominaSemanaFila.upsert({
      where: { semanaId_userId: { semanaId: semana.id, userId } },
      create: {
        semanaId: semana.id,
        companyId: tenantId,
        userId,
        actualizadoPorId: actor.id,
      },
      update: { actualizadoPorId: actor.id },
    });

    const registro = await this.db.nominaPagoRegistro.create({
      data: {
        semanaId: semana.id,
        companyId: tenantId,
        userId,
        monto: new Prisma.Decimal(body.monto),
        fecha: fechaPago,
        forma: v.forma,
        comprobanteUrl: body.comprobanteUrl?.trim() || null,
        creadoPorId: actor.id,
        employeePaymentId: fila.pagoId ?? null,
      },
    });

    await this.audit
      ?.log(
        {
          entityType: 'NominaPagoRegistro',
          entityId: registro.id,
          action: 'CREATE',
          changes: {
            userId,
            monto: body.monto,
            forma: v.forma,
            semana: body.semana,
            comprobante: Boolean(body.comprobanteUrl),
          },
        },
        viewer.id,
      )
      .catch(() => undefined);

    const saldo = await this.saldoDeFila(tenantId, semana.id, userId, fila.pagoSugerido);
    return { ok: true, registro, saldo };
  }

  async saldoYComoSeCalculo(
    _viewer: Viewer,
    companyId: number | null,
    q: { semana: string; userId: number },
  ) {
    const tenantId = requireCompanyId(companyId);
    const semana = await this.semanaDe(tenantId, q.semana);
    const userId = Number(q.userId);
    const fila = semana.filas.find((f) => f.userId === userId) ?? null;
    const saldo = await this.saldoDeFila(tenantId, semana.id, userId, fila?.pagoSugerido ?? null);

    const snap = (fila?.snapshot && typeof fila.snapshot === 'object' ? fila.snapshot : {}) as Record<
      string,
      unknown
    >;
    const renglones = comoSeCalculoRenglones({
      horasOrdinarias: Number(snap.horasOrdinarias ?? snap.horas ?? 0),
      tarifaHora: Number(snap.tarifaHora ?? 0),
      horasExtra: Number(snap.horasExtra ?? 0),
      factorExtra: Number(snap.factorExtra ?? 2),
      bonoProductividad: Number(snap.bonoProductividad ?? 0),
      descuentos: Number(snap.descuentos ?? 0),
      ajusteManual: saldo.ajustes,
      ajusteMotivo: typeof snap.ajusteMotivo === 'string' ? snap.ajusteMotivo : null,
      ajusteAutor: typeof snap.ajusteAutor === 'string' ? snap.ajusteAutor : null,
    });

    return {
      semana: q.semana.slice(0, 10),
      userId,
      estadoSemana: semana.estado,
      saldo,
      parametrosSnapshot: snap.parametros ?? semana.parametrosSnapshot ?? null,
      comoSeCalculo: renglones,
      movimientos: await this.movimientosDe(semana.id, userId),
    };
  }

  /** Al cerrar semana: guarda snapshot de parámetros (no altera historial vigente). */
  async guardarSnapshotCierre(
    semanaId: number,
    companyId: number,
    parametros: Record<string, unknown>,
  ) {
    const foto = snapshotParametrosAlCerrar(parametros);
    try {
      await this.prisma.nominaSemana.update({
        where: { id: semanaId },
        data: { parametrosSnapshot: foto as Prisma.InputJsonValue },
      });
    } catch {
      // Columna aún no migrada: no truene el cierre.
      void companyId;
    }
    return foto;
  }

  private async saldoDeFila(
    companyId: number,
    semanaId: number,
    userId: number,
    pagoSugerido: Prisma.Decimal | number | null | undefined,
  ) {
    let ajustes: Array<{ monto: Prisma.Decimal | number }> = [];
    let pagos: Array<{ monto: Prisma.Decimal | number }> = [];
    try {
      ajustes = await this.db.nominaPagoAjuste.findMany({
        where: { companyId, semanaId, userId },
        select: { monto: true },
      });
      pagos = await this.db.nominaPagoRegistro.findMany({
        where: { companyId, semanaId, userId },
        select: { monto: true },
      });
    } catch {
      ajustes = [];
      pagos = [];
    }
    return saldoPagoSemanal({
      sugerido: Number(pagoSugerido ?? 0),
      ajustes: ajustes.map((a) => Number(a.monto)),
      pagos: pagos.map((p) => Number(p.monto)),
    });
  }

  private async movimientosDe(semanaId: number, userId: number) {
    try {
      const [ajustes, pagos] = await Promise.all([
        this.db.nominaPagoAjuste.findMany({
          where: { semanaId, userId },
          orderBy: { createdAt: 'asc' },
          include: { autor: { select: { id: true, nombre: true } } },
        }),
        this.db.nominaPagoRegistro.findMany({
          where: { semanaId, userId },
          orderBy: { createdAt: 'asc' },
          include: { creadoPor: { select: { id: true, nombre: true } } },
        }),
      ]);
      return [
        ...ajustes.map((a: any) => ({
          tipo: 'ajuste' as const,
          monto: Number(a.monto),
          motivo: a.motivo,
          autorId: a.autorId,
          autorNombre: a.autor?.nombre ?? null,
          at: a.createdAt?.toISOString?.() ?? null,
        })),
        ...pagos.map((p: any) => ({
          tipo: 'pago' as const,
          monto: Number(p.monto),
          forma: p.forma,
          autorId: p.creadoPorId,
          autorNombre: p.creadoPor?.nombre ?? null,
          at: p.createdAt?.toISOString?.() ?? null,
          comprobanteUrl: p.comprobanteUrl,
        })),
      ];
    } catch {
      return [];
    }
  }
}
