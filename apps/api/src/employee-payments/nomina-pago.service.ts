/**
 * Pago semanal: lo sugerido (el total del Control semanal, con la extra autorizada y los descuentos
 * aceptados), lo ajustado (movimientos con motivo) y lo pagado (parcialidades, solo dirección).
 *
 * Lo sugerido lo calcula siempre el servidor con la misma fila que ve Control semanal; nunca viene
 * del cliente. El alcance (quién ve a quién, montos ocultos, modo «totales» de la contadora) también
 * es el de Control semanal.
 */

import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { parseWorkDate, workDateColumn, workDateKey } from '../common/time/workday.js';
import { isCeoEquivalentEmail } from '../common/platform-accounts.js';
import { resolveUploadsDir } from '../common/uploads-path.js';
import { ControlNominaService, ESTADO_SEMANA, type FilaRespuesta } from './control-nomina.service.js';
import { conceptoPagoSemana, domingoDe, fechaValida } from './control-nomina.js';
import { EmployeePaymentsService } from './employee-payments.service.js';
import { REGISTRO_VIGENTE, candadoPagoSemana } from './pago-candado.js';
import {
  comoSeCalculoDeFila,
  estadoDePago,
  saldoPagoSemanal,
  validarAjustePago,
  validarRegistroPagoCeo,
  type SaldoPagoSemanal,
} from './pago-semanal.js';

type Viewer = { id: number; roleKey?: string | null; email?: string | null; isSuperAdmin?: boolean };
type Actor = { id: number; nombre?: string | null };
type Acceso = { verMontos: boolean; puedeEditar: boolean };
type Cliente = Pick<Prisma.TransactionClient, 'nominaPagoAjuste' | 'nominaPagoRegistro' | 'employeePayment'>;
/** Lo que suma y resta de una persona en la semana. `lista`: lo pagado solo en «Pagos a empleados». */
type Movimientos = { ajustes: number[]; pagos: number[]; lista: number[] };

/** Archivo ya leído en memoria por multer. */
export type ArchivoComprobante = { originalname?: string; mimetype?: string; size?: number; buffer?: Buffer };

const CARPETA = 'nomina-comprobantes';
const COMPROBANTE_MAX = 10 * 1024 * 1024;
const MIME: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Extensión según los primeros bytes, no según el nombre que mandó el cliente. */
export function extensionComprobante(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 4).toString('latin1') === '%PDF') return '.pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

@Injectable()
export class NominaPagoService {
  private readonly logger = new Logger('NominaPago');

  constructor(
    private readonly prisma: PrismaService,
    private readonly control: ControlNominaService,
    private readonly lista: EmployeePaymentsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private puedeRegistrar(viewer: Viewer): boolean {
    return isCeoEquivalentEmail(viewer.email) || Boolean(viewer.isSuperAdmin);
  }

  /** La semana completa: una fila por persona con sugerido, ajuste, a pagar, pagado y saldo. */
  async semana(viewer: Viewer, companyId: number | null, semana: string, acceso: Acceso) {
    const tenantId = requireCompanyId(companyId);
    const datos = await this.control.consultar(viewer, tenantId, semana, acceso);
    const ver = !datos.montosOcultos;
    const ids = datos.filas.map((f) => f.userId);
    const movs = ver ? await this.movimientos(this.prisma, tenantId, datos.semana.id, datos.semana.inicio, ids) : new Map<number, Movimientos>();
    const filas = datos.filas.map((f) => {
      const saldo = ver ? this.saldoDe(f, movs.get(f.userId)) : null;
      return {
        userId: f.userId,
        nombre: f.nombre,
        puesto: f.puesto,
        area: f.area,
        extraPendienteMin: f.extrasMinutosPendientes,
        saldo,
        estado: saldo ? estadoDePago(saldo) : null,
      };
    });
    const suma = (k: keyof SaldoPagoSemanal) => Math.round(filas.reduce((a, f) => a + (f.saldo?.[k] ?? 0), 0) * 100) / 100;
    return {
      semana: datos.semana,
      montosOcultos: !ver,
      puedeAjustar: ver && datos.puedeEditar,
      puedeRegistrar: ver && this.puedeRegistrar(viewer),
      filas,
      totales: ver
        ? {
            sugerido: suma('sugerido'),
            ajustes: suma('ajustes'),
            final: suma('final'),
            pagado: suma('pagado'),
            saldo: suma('saldo'),
            porPagar: filas.filter((f) => (f.saldo?.saldo ?? 0) > 0).length,
            completas: filas.filter((f) => f.estado === 'pagado').length,
            parciales: filas.filter((f) => f.estado === 'parcial').length,
          }
        : null,
    };
  }

  /** «Cómo se calculó»: renglones, saldo y movimientos de una persona. */
  async detalle(viewer: Viewer, companyId: number | null, q: { semana: string; userId: number }, acceso: Acceso) {
    const tenantId = requireCompanyId(companyId);
    const { datos, fila } = await this.filaVisible(viewer, tenantId, q.semana, q.userId, acceso);
    const where = { companyId: tenantId, semanaId: datos.semana.id ?? 0, userId: fila.userId };
    const [ajustes, pagos, enLista] = await Promise.all([
      this.prisma.nominaPagoAjuste.findMany({ where, orderBy: { createdAt: 'asc' }, include: { autor: { select: { nombre: true } } } }),
      this.prisma.nominaPagoRegistro.findMany({
        where: { ...where, ...REGISTRO_VIGENTE },
        orderBy: { createdAt: 'asc' },
        include: { creadoPor: { select: { nombre: true } } },
      }),
      this.pagosDeLista(this.prisma, tenantId, datos.semana.inicio, [fila.userId]),
    ]);
    const saldo = this.saldoDe(fila, {
      ajustes: ajustes.map((a) => Number(a.monto)),
      pagos: pagos.map((p) => Number(p.monto)),
      lista: enLista.map((p) => Number(p.amount)),
    });
    return {
      semana: datos.semana.inicio,
      fin: datos.semana.fin,
      userId: fila.userId,
      nombre: fila.nombre,
      estadoSemana: datos.semana.estado,
      puedeAjustar: datos.puedeEditar,
      puedeRegistrar: this.puedeRegistrar(viewer),
      saldo,
      estado: estadoDePago(saldo),
      extraPendienteMin: fila.extrasMinutosPendientes,
      comoSeCalculo: comoSeCalculoDeFila(fila),
      movimientos: [
        ...ajustes.map((a) => ({
          id: `a${a.id}`,
          tipo: 'ajuste' as const,
          monto: Number(a.monto),
          motivo: a.motivo,
          autorNombre: a.autor?.nombre ?? null,
          at: a.createdAt.toISOString(),
        })),
        ...pagos.map((p) => ({
          id: `p${p.id}`,
          registroId: p.id,
          tipo: 'pago' as const,
          monto: Number(p.monto),
          forma: p.forma,
          fecha: p.fecha.toISOString().slice(0, 10),
          conComprobante: Boolean(p.comprobanteUrl),
          autorNombre: p.creadoPor?.nombre ?? null,
          at: p.createdAt.toISOString(),
        })),
        ...enLista.map((p) => ({
          id: `l${p.id}`,
          tipo: 'pago' as const,
          monto: Number(p.amount),
          forma: 'lista',
          fecha: workDateKey(p.paidAt ?? p.createdAt),
          conComprobante: false,
          autorNombre: null,
          at: (p.paidAt ?? p.createdAt).toISOString(),
        })),
      ],
    };
  }

  async ajustar(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null,
    body: { semana: string; userId: number; monto: number; motivo: string },
    acceso: Acceso,
  ) {
    const tenantId = requireCompanyId(companyId);
    const { datos, fila } = await this.filaVisible(viewer, tenantId, body.semana, body.userId, acceso);
    const monto = Math.round(Number(body.monto) * 100) / 100;
    const v = validarAjustePago({ monto, motivo: body.motivo, semanaCerrada: datos.congelada });
    if (!v.ok) throw new BadRequestException(v.error);
    if (!datos.puedeEditar) throw new ForbiddenException('No puedes ajustar pagos');

    const semanaId = await this.asegurarSemana(tenantId, datos.semana.inicio);
    const ajuste = await this.prisma.$transaction(async (tx) => {
      await candadoPagoSemana(tx, tenantId, datos.semana.inicio, fila.userId);
      const m = await this.movimientosDe(tx, tenantId, semanaId, datos.semana.inicio, fila.userId);
      const despues = this.saldoDe(fila, { ...m, ajustes: [...m.ajustes, monto] });
      if (despues.final < 0) throw new BadRequestException('El ajuste deja el pago en negativo');
      if (despues.saldo < 0) throw new BadRequestException('Ya se pagó más de lo que quedaría con ese ajuste');
      return tx.nominaPagoAjuste.create({
        data: {
          semanaId,
          companyId: tenantId,
          userId: fila.userId,
          monto: new Prisma.Decimal(monto),
          motivo: body.motivo.trim().slice(0, 500),
          autorId: actor.id || null,
        },
      });
    });
    await this.auditar('NominaPagoAjuste', ajuste.id, { userId: fila.userId, monto, motivo: body.motivo.trim(), semana: datos.semana.inicio }, actor.id, tenantId);
    return { ok: true, id: ajuste.id };
  }

  async registrar(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null,
    body: { semana: string; userId: number; monto: number; fecha?: string; forma: string },
    acceso: Acceso,
    archivo?: ArchivoComprobante | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const esCeo = this.puedeRegistrar(viewer);
    const monto = Math.round(Number(body.monto) * 100) / 100;
    const v = validarRegistroPagoCeo({ esCeo, monto, forma: body.forma });
    if (!v.ok) {
      if (!esCeo) throw new ForbiddenException(v.error);
      throw new BadRequestException(v.error);
    }
    const hoy = workDateKey(new Date());
    const fecha = body.fecha ? String(body.fecha).slice(0, 10) : hoy;
    if (!fechaValida(fecha) || fecha > hoy) throw new BadRequestException('La fecha del pago no es válida');

    const { datos, fila } = await this.filaVisible(viewer, tenantId, body.semana, body.userId, acceso);
    const semanaId = await this.asegurarSemana(tenantId, datos.semana.inicio);
    const comprobante = archivo ? await this.guardarComprobante(tenantId, archivo) : null;
    let registro: { id: number };
    let porMarcar: number | null = null;
    try {
      ({ registro, porMarcar } = await this.prisma.$transaction(async (tx) => {
        // Doble toque, dos pestañas o la lista de pagos: el segundo espera al primero y ya ve el saldo nuevo.
        await candadoPagoSemana(tx, tenantId, datos.semana.inicio, fila.userId);
        const m = await this.movimientosDe(tx, tenantId, semanaId, datos.semana.inicio, fila.userId);
        const saldo = this.saldoDe(fila, m).saldo;
        if (monto > saldo + 0.004) {
          throw new ConflictException(saldo > 0 ? `Solo faltan $${saldo.toFixed(2)} por pagar` : 'Esa persona ya no tiene saldo por pagar');
        }
        const nuevo = await tx.nominaPagoRegistro.create({
          data: {
            semanaId,
            companyId: tenantId,
            userId: fila.userId,
            monto: new Prisma.Decimal(monto),
            fecha: workDateColumn(parseWorkDate(fecha)),
            forma: v.forma,
            comprobanteUrl: comprobante,
            creadoPorId: actor.id || null,
          },
          select: { id: true },
        });
        // Con el último pago queda una sola línea en la lista, por lo que de verdad se pagó.
        const termino = Math.round((saldo - monto) * 100) <= 0;
        return { registro: nuevo, porMarcar: termino ? await this.ligarALista(tx, tenantId, semanaId, datos.semana.inicio, fila, fecha, actor) : null };
      }));
    } catch (e) {
      if (comprobante) await unlink(join(resolveUploadsDir(CARPETA, String(tenantId)), comprobante)).catch(() => undefined);
      throw e;
    }
    await this.auditar('NominaPagoRegistro', registro.id, { userId: fila.userId, monto, forma: v.forma, fecha, semana: datos.semana.inicio, comprobante: Boolean(comprobante) }, actor.id, tenantId);
    let aviso: string | null = null;
    if (porMarcar != null) {
      try {
        await this.lista.markPagado(porMarcar, actor.id, tenantId);
      } catch (e) {
        // El dinero ya salió y quedó registrado: no se deshace. La póliza se reintenta desde la lista.
        this.logger.warn(`Póliza pendiente del pago #${porMarcar}: ${(e as Error)?.message ?? e}`);
        aviso = `El pago quedó registrado, pero falta su póliza. Márcalo pagado en la lista (pago #${porMarcar}).`;
      }
    }
    return { ok: true, id: registro.id, pagoId: porMarcar, aviso };
  }

  /** El comprobante solo sale por aquí, con el mismo alcance; `/uploads` no sirve esa carpeta. */
  async comprobante(viewer: Viewer, companyId: number | null, registroId: number, acceso: Acceso) {
    const tenantId = requireCompanyId(companyId);
    const r = await this.prisma.nominaPagoRegistro.findFirst({
      where: { id: Number(registroId) || 0, companyId: tenantId },
      include: { semana: { select: { inicio: true } } },
    });
    if (!r?.comprobanteUrl) throw new NotFoundException('Ese pago no tiene comprobante');
    await this.filaVisible(viewer, tenantId, r.semana.inicio.toISOString().slice(0, 10), r.userId, acceso);
    const nombre = r.comprobanteUrl;
    if (!/^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(nombre)) throw new NotFoundException('Comprobante no disponible');
    const ruta = join(resolveUploadsDir(CARPETA, String(tenantId)), nombre);
    await stat(ruta).catch(() => {
      throw new NotFoundException('Comprobante no disponible');
    });
    return { flujo: createReadStream(ruta), mime: MIME[extname(nombre)], nombre: `comprobante-${r.id}${extname(nombre)}` };
  }

  // ───────────────────────────────────────────────────────────────── internos

  private async filaVisible(viewer: Viewer, tenantId: number, semana: string, userId: number, acceso: Acceso) {
    const datos = await this.control.consultar(viewer, tenantId, semana, acceso);
    if (datos.montosOcultos) throw new ForbiddenException('Los montos los ven dirección y contabilidad');
    const fila = datos.filas.find((f) => f.userId === Number(userId));
    if (!fila) throw new NotFoundException('Esa persona no está en la nómina de la semana');
    return { datos, fila };
  }

  private saldoDe(fila: FilaRespuesta, m?: Movimientos): SaldoPagoSemanal {
    return saldoPagoSemanal({
      sugerido: fila.total ?? 0,
      ajustes: m?.ajustes ?? [],
      pagos: [...(m?.pagos ?? []), ...(m?.lista ?? [])],
    });
  }

  private async movimientosDe(db: Cliente, companyId: number, semanaId: number, lunes: string, userId: number): Promise<Movimientos> {
    return (await this.movimientos(db, companyId, semanaId, lunes, [userId])).get(userId) ?? { ajustes: [], pagos: [], lista: [] };
  }

  private async movimientos(db: Cliente, companyId: number, semanaId: number | null, lunes: string, userIds: number[]) {
    const where = { companyId, semanaId: semanaId ?? 0, userId: { in: userIds } };
    const [ajustes, pagos, lista] = await Promise.all([
      db.nominaPagoAjuste.findMany({ where, select: { userId: true, monto: true } }),
      db.nominaPagoRegistro.findMany({ where: { ...where, ...REGISTRO_VIGENTE }, select: { userId: true, monto: true } }),
      this.pagosDeLista(db, companyId, lunes, userIds),
    ]);
    const out = new Map<number, Movimientos>();
    const de = (id: number) => {
      const m = out.get(id) ?? { ajustes: [], pagos: [], lista: [] };
      out.set(id, m);
      return m;
    };
    for (const a of ajustes) de(a.userId).ajustes.push(Number(a.monto));
    for (const p of pagos) de(p.userId).pagos.push(Number(p.monto));
    for (const l of lista) de(l.userId).lista.push(Number(l.amount));
    return out;
  }

  /**
   * Lo pagado solo en «Pagos a empleados» para esa semana, leído ahora (la foto del cierre se queda con
   * el estatus de ese día). Los que nacieron de aquí tienen registros y ya se cuentan por ellos.
   */
  private pagosDeLista(db: Cliente, companyId: number, lunes: string, userIds: number[]) {
    return db.employeePayment.findMany({
      where: {
        companyId,
        userId: { in: userIds },
        deletedAt: null,
        status: 'Pagado',
        periodFrom: workDateColumn(parseWorkDate(lunes)),
        periodTo: workDateColumn(parseWorkDate(domingoDe(lunes))),
        nominaPagos: { none: {} },
      },
      select: { id: true, userId: true, amount: true, paidAt: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
  }

  /** Junta los registros sueltos en el Borrador de la semana (o en uno nuevo) y devuelve cuál marcar pagado. */
  private async ligarALista(
    tx: Prisma.TransactionClient,
    companyId: number,
    semanaId: number,
    lunes: string,
    fila: FilaRespuesta,
    fecha: string,
    actor: Actor,
  ): Promise<number> {
    const sueltos = await tx.nominaPagoRegistro.findMany({
      where: { companyId, semanaId, userId: fila.userId, employeePaymentId: null },
      select: { id: true, monto: true },
    });
    const amount = new Prisma.Decimal(sueltos.reduce((s, r) => s + Math.round(Number(r.monto) * 100), 0)).div(100);
    const periodo = { periodFrom: workDateColumn(parseWorkDate(lunes)), periodTo: workDateColumn(parseWorkDate(domingoDe(lunes))) };
    // Mediodía de México: el día del pago no se recorre al leerlo.
    const paidAt = new Date(`${fecha}T18:00:00.000Z`);
    const borrador = await tx.employeePayment.findFirst({
      where: { companyId, userId: fila.userId, deletedAt: null, status: 'Borrador', ...periodo, nominaPagos: { none: {} } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const pago = borrador
      ? await tx.employeePayment.update({ where: { id: borrador.id }, data: { amount, paidAt }, select: { id: true } })
      : await tx.employeePayment.create({
          data: {
            userId: fila.userId,
            companyId,
            ...periodo,
            totalMinutes: Math.round(fila.horasNetasTotales * 60) + fila.extrasMinutosAprobados,
            amount,
            concepto: conceptoPagoSemana(lunes).slice(0, 255),
            status: 'Borrador',
            paidAt,
            createdById: actor.id || null,
          },
          select: { id: true },
        });
    await tx.nominaPagoRegistro.updateMany({ where: { id: { in: sueltos.map((r) => r.id) }, companyId }, data: { employeePaymentId: pago.id } });
    return pago.id;
  }

  private async asegurarSemana(companyId: number, lunes: string): Promise<number> {
    const inicio = workDateColumn(parseWorkDate(lunes));
    try {
      const s = await this.prisma.nominaSemana.upsert({
        where: { companyId_inicio: { companyId, inicio } },
        create: { companyId, inicio, fin: workDateColumn(parseWorkDate(domingoDe(lunes))), estado: ESTADO_SEMANA.BORRADOR },
        update: {},
        select: { id: true },
      });
      return s.id;
    } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
      const s = await this.prisma.nominaSemana.findFirst({ where: { companyId, inicio }, select: { id: true } });
      if (!s) throw e;
      return s.id;
    }
  }

  private async guardarComprobante(companyId: number, archivo: ArchivoComprobante): Promise<string> {
    const b = archivo.buffer;
    if (!b?.length) throw new BadRequestException('El comprobante llegó vacío');
    if (b.length > COMPROBANTE_MAX) throw new BadRequestException('El comprobante pesa más de 10 MB');
    const ext = extensionComprobante(b);
    if (!ext) throw new BadRequestException('El comprobante debe ser PDF o imagen (JPG, PNG o WebP)');
    const carpeta = resolveUploadsDir(CARPETA, String(companyId));
    await mkdir(carpeta, { recursive: true });
    const nombre = `${randomUUID()}${ext}`;
    await writeFile(join(carpeta, nombre), b, { mode: 0o600 });
    return nombre;
  }

  private async auditar(entityType: string, entityId: number, changes: Record<string, unknown>, actorId: number, companyId: number) {
    await this.audit?.log({ entityType, entityId, action: 'CREATE', changes, companyId }, actorId).catch(() => undefined);
  }
}
