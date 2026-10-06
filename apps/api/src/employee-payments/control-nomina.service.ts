import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { KpisEquipoService } from '../me/kpis-equipo.service.js';
import { sitioOficina } from '../attendance/asistencia-confiable.js';
import { fechaClave, fechaColumna } from '../guardias/guardias-reglas.js';
import { parseWorkDate, workDateKey, workDayEnd, workDayStart } from '../common/time/workday.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { ETIQUETA_CATEGORIA_VIATICO } from '../common/excel/etiquetas.js';
import { diaDeLaSemana } from '../me/kpis-equipo.js';
import { EmployeePaymentsService } from './employee-payments.service.js';
import { roundMoney } from './prenomina-amount.js';
import {
  LUGARES,
  MOTIVO_MIN,
  areaDe,
  conceptoPagoSemana,
  destinoDeActividad,
  diasDeActividad,
  diasDeHospedaje,
  diasDeLaSemana,
  domingoDe,
  esCiudadForanea,
  fechaValida,
  filaControl,
  formulaControl,
  lugarValido,
  lunesDe,
  notaDePago,
  ocultarMontos,
  ocultarMontosTotales,
  ordenaFilas,
  sueldoValido,
  totalesControl,
  type DescuentoNomina,
  type DiaDeSemana,
  type EntradaDia,
  type FilaControl,
  type Lugar,
  type TotalesControl,
  type ViaticoNomina,
} from './control-nomina.js';
import { excelControlNomina } from './control-nomina-excel.js';

type Viewer = { id: number; roleKey?: string | null; email?: string | null; isSuperAdmin?: boolean };
type Actor = { id: number; nombre?: string | null };

export const ESTADO_SEMANA = { BORRADOR: 'BORRADOR', REVISADO: 'REVISADO', CERRADA: 'CERRADA' } as const;

/** El pago que ya existe para esa persona y semana (lo generó el cierre o alguien a mano). */
export type PagoDeFila = { id: number; estatus: string; monto: number | null };

export type FilaRespuesta = FilaControl & { pago: PagoDeFila | null };

export type SemanaRespuesta = {
  id: number | null;
  inicio: string;
  fin: string;
  estado: string;
  cerradaPor: { id: number; nombre: string } | null;
  cerradaAt: string | null;
  reabiertaPor: { id: number; nombre: string } | null;
  reabiertaAt: string | null;
  reabiertaMotivo: string | null;
};

export type RespuestaControl = {
  semana: SemanaRespuesta;
  dias: DiaDeSemana[];
  filas: FilaRespuesta[];
  totales: TotalesControl;
  formula: ReturnType<typeof formulaControl>;
  lugares: readonly Lugar[];
  /** true: semana cerrada, las cifras son las que se congelaron al cerrar. */
  congelada: boolean;
  montosOcultos: boolean;
  puedeEditar: boolean;
  scope: 'company' | 'subtree';
  generadoAt: string;
};

const DIA_MS = 24 * 3_600_000;
const MAX_ACTIVIDADES = 5_000;

/**
 * Control de nómina semanal: junta lo que el sistema ya sabe y deja las cuentas a
 * `control-nomina.ts` (puro). Las horas y el tiempo extra vienen de `KpisEquipoService`, el
 * mismo cálculo de los indicadores y la pre-nómina, con su mismo alcance (dirección ve a toda
 * la empresa; cada jefe, su organigrama).
 *
 * Una semana sin fila está en BORRADOR y se calcula al vuelo. Se crea la fila con el primer
 * ajuste (lugar, nota, descuento) o al cerrar. Cerrada, se lee de la foto (`snapshot`).
 */
@Injectable()
export class ControlNominaService {
  private readonly logger = new Logger('ControlNomina');

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: KpisEquipoService,
    private readonly pagos: EmployeePaymentsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────── consulta

  /** `semana` (cualquier día) → su lunes. */
  resolverSemana(valor: unknown): string {
    if (!fechaValida(valor)) {
      throw new BadRequestException('semana debe ser una fecha AAAA-MM-DD (el lunes de la semana)');
    }
    return lunesDe(String(valor).trim());
  }

  async consultar(
    viewer: Viewer,
    companyId: number | null | undefined,
    semana: string,
    opciones: { verMontos: boolean; puedeEditar: boolean },
  ): Promise<RespuestaControl> {
    const tenantId = requireCompanyId(companyId);
    const lunes = this.resolverSemana(semana);
    const fila = await this.leerSemana(tenantId, lunes);

    let filas: FilaRespuesta[];
    let scope: 'company' | 'subtree' = 'company';
    let congelada = false;
    if (fila?.estado === ESTADO_SEMANA.CERRADA) {
      congelada = true;
      filas = ordenaFilas(
        fila.filas
          .filter((f) => f.snapshot && typeof f.snapshot === 'object')
          .map((f) => f.snapshot as unknown as FilaRespuesta),
      );
    } else {
      const calc = await this.calcular(viewer, tenantId, lunes, null, fila);
      filas = calc.filas;
      scope = calc.scope;
    }

    const totales = totalesControl(filas);
    return {
      semana: this.semanaDto(lunes, fila),
      dias: diasDeLaSemana(lunes),
      filas: opciones.verMontos ? filas : filas.map((f) => ({ ...ocultarMontos(f), pago: f.pago ? { ...f.pago, monto: null } : null })),
      totales: opciones.verMontos ? totales : ocultarMontosTotales(totales),
      formula: formulaControl(),
      lugares: LUGARES,
      congelada,
      montosOcultos: !opciones.verMontos,
      puedeEditar: opciones.puedeEditar && !congelada,
      scope,
      generadoAt: new Date().toISOString(),
    };
  }

  /** El mismo control en Excel (dos hojas idénticas a los formatos + «Cómo se calcula»). */
  async excel(
    viewer: Viewer,
    companyId: number | null | undefined,
    semana: string,
    opciones: { verMontos: boolean; puedeEditar: boolean; generadoPor?: string | null },
  ): Promise<{ buffer: Buffer; lunes: string }> {
    const datos = await this.consultar(viewer, companyId, semana, opciones);
    const buffer = await excelControlNomina({
      semana: { inicio: datos.semana.inicio, fin: datos.semana.fin, estado: datos.semana.estado },
      dias: datos.dias,
      filas: datos.filas,
      verMontos: opciones.verMontos,
      formula: datos.formula,
      generadoPor: opciones.generadoPor ?? null,
      generadoEn: new Date(datos.generadoAt),
    });
    return { buffer, lunes: datos.semana.inicio };
  }

  // ─────────────────────────────────────────────────────────────── ediciones

  /** Corrige (o devuelve a automático, con `lugar: null`) el lugar de un día. */
  async ajustarDia(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null | undefined,
    dto: { semana: string; userId: number; fecha: string; lugar: string | null; nota?: string | null },
  ) {
    const tenantId = requireCompanyId(companyId);
    const lunes = this.resolverSemana(dto.semana);
    const fecha = String(dto.fecha ?? '').trim();
    if (!fechaValida(fecha) || fecha < lunes || fecha > domingoDe(lunes)) {
      throw new BadRequestException('fecha debe ser un día de esa semana (AAAA-MM-DD)');
    }
    let lugar: Lugar | null = null;
    if (dto.lugar != null) {
      lugar = lugarValido(dto.lugar);
      if (!lugar) throw new BadRequestException(`lugar debe ser uno de: ${LUGARES.join(', ')} (o null para automático)`);
    }
    await this.asegurarPersona(dto.userId, tenantId);
    const semana = await this.asegurarSemana(tenantId, lunes);
    this.exigirEditable(semana.estado);

    const anterior = await this.prisma.nominaSemanaDia.findFirst({
      where: { semanaId: semana.id, userId: dto.userId, fecha: fechaColumna(fecha), companyId: tenantId },
      select: { id: true, lugar: true, nota: true },
    });

    let entityId = anterior?.id ?? 0;
    if (lugar == null) {
      if (anterior) {
        await this.prisma.nominaSemanaDia.deleteMany({ where: { id: anterior.id, companyId: tenantId } });
      }
    } else {
      const nota = dto.nota === undefined ? (anterior?.nota ?? null) : dto.nota?.trim() || null;
      const guardado = await this.prisma.nominaSemanaDia.upsert({
        where: { semanaId_userId_fecha: { semanaId: semana.id, userId: dto.userId, fecha: fechaColumna(fecha) } },
        create: {
          semanaId: semana.id,
          companyId: tenantId,
          userId: dto.userId,
          fecha: fechaColumna(fecha),
          lugar,
          nota,
          ajustadoPorId: actor.id || null,
        },
        update: { lugar, nota, ajustadoPorId: actor.id || null, at: new Date() },
        select: { id: true },
      });
      entityId = guardado?.id ?? entityId;
    }

    await this.registrar(
      {
        entityType: 'NominaSemanaDia',
        entityId,
        action: lugar ? 'AJUSTE_LUGAR' : 'LUGAR_AUTOMATICO',
        changes: { semana: lunes, userId: dto.userId, fecha, antes: anterior?.lugar ?? null, despues: lugar },
        companyId: tenantId,
      },
      actor.id,
    );
    return { ok: true, fila: await this.filaDe(viewer, tenantId, lunes, dto.userId) };
  }

  /** Nota de la fila (null = automática) y/o sueldo semanal de RH. */
  async actualizarFila(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null | undefined,
    dto: { semana: string; userId: number; notaFila?: string | null; sueldoSemanal?: number | null },
  ) {
    const tenantId = requireCompanyId(companyId);
    const lunes = this.resolverSemana(dto.semana);
    const tocaNota = dto.notaFila !== undefined;
    const tocaSueldo = dto.sueldoSemanal !== undefined && dto.sueldoSemanal !== null;
    if (!tocaNota && !tocaSueldo) throw new BadRequestException('Manda notaFila y/o sueldoSemanal');
    await this.asegurarPersona(dto.userId, tenantId);
    const semana = await this.asegurarSemana(tenantId, lunes);
    this.exigirEditable(semana.estado);

    if (tocaNota) {
      const nota = dto.notaFila == null ? null : dto.notaFila.trim().slice(0, 500);
      const anterior = await this.prisma.nominaSemanaFila.findFirst({
        where: { semanaId: semana.id, userId: dto.userId, companyId: tenantId },
        select: { id: true, notaFila: true },
      });
      const guardada = await this.prisma.nominaSemanaFila.upsert({
        where: { semanaId_userId: { semanaId: semana.id, userId: dto.userId } },
        create: { semanaId: semana.id, companyId: tenantId, userId: dto.userId, notaFila: nota, actualizadoPorId: actor.id || null },
        update: { notaFila: nota, actualizadoPorId: actor.id || null },
        select: { id: true },
      });
      await this.registrar(
        {
          entityType: 'NominaSemanaFila',
          entityId: guardada?.id ?? anterior?.id ?? 0,
          action: nota == null ? 'NOTA_AUTOMATICA' : 'NOTA_FILA',
          changes: { semana: lunes, userId: dto.userId, antes: anterior?.notaFila ?? null, despues: nota },
          companyId: tenantId,
        },
        actor.id,
      );
    }

    if (tocaSueldo) {
      const sueldo = sueldoValido(dto.sueldoSemanal);
      if (sueldo == null) throw new BadRequestException('sueldoSemanal debe ser mayor que cero');
      const monto = roundMoney(sueldo);
      const anterior = await this.prisma.userProfile.findUnique({
        where: { userId: dto.userId },
        select: { id: true, sueldoSemanal: true },
      });
      const perfil = await this.prisma.userProfile.upsert({
        where: { userId: dto.userId },
        create: { userId: dto.userId, sueldoSemanal: new Prisma.Decimal(monto) },
        update: { sueldoSemanal: new Prisma.Decimal(monto) },
        select: { id: true },
      });
      await this.registrar(
        {
          entityType: 'UserProfile',
          entityId: perfil.id,
          action: 'SUELDO_SEMANAL',
          changes: {
            userId: dto.userId,
            antes: anterior?.sueldoSemanal != null ? Number(anterior.sueldoSemanal) : null,
            despues: monto,
            origen: 'control-nomina',
            semana: lunes,
          },
          companyId: tenantId,
        },
        actor.id,
      );
    }
    return { ok: true, fila: await this.filaDe(viewer, tenantId, lunes, dto.userId) };
  }

  async crearDescuento(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null | undefined,
    dto: { semana: string; userId: number; concepto: string; monto: number },
  ) {
    const tenantId = requireCompanyId(companyId);
    const lunes = this.resolverSemana(dto.semana);
    const concepto = String(dto.concepto ?? '').trim();
    if (concepto.length < 2) throw new BadRequestException('concepto es obligatorio');
    const monto = roundMoney(Number(dto.monto));
    if (!Number.isFinite(monto) || monto <= 0) throw new BadRequestException('monto debe ser mayor que cero');
    await this.asegurarPersona(dto.userId, tenantId);
    const semana = await this.asegurarSemana(tenantId, lunes);
    this.exigirEditable(semana.estado);

    const creado = await this.prisma.nominaDescuento.create({
      data: {
        semanaId: semana.id,
        companyId: tenantId,
        userId: dto.userId,
        concepto: concepto.slice(0, 200),
        monto: new Prisma.Decimal(monto),
        sugerido: false,
        creadoPorId: actor.id || null,
      },
      select: { id: true, concepto: true, monto: true, sugerido: true, fecha: true },
    });
    await this.registrar(
      {
        entityType: 'NominaDescuento',
        entityId: creado.id,
        action: 'CREATE',
        changes: { semana: lunes, userId: dto.userId, concepto: creado.concepto, monto },
        companyId: tenantId,
      },
      actor.id,
    );
    return {
      ok: true,
      descuento: { ...this.descuentoDto(creado), aceptado: true },
      fila: await this.filaDe(viewer, tenantId, lunes, dto.userId),
    };
  }

  async borrarDescuento(viewer: Viewer, actor: Actor, companyId: number | null | undefined, id: number) {
    const tenantId = requireCompanyId(companyId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Descuento inválido');
    const descuento = await this.prisma.nominaDescuento.findFirst({
      where: { id, companyId: tenantId },
      select: {
        id: true,
        userId: true,
        concepto: true,
        monto: true,
        sugerido: true,
        fecha: true,
        semana: { select: { id: true, inicio: true, estado: true } },
      },
    });
    if (!descuento) throw new NotFoundException('Descuento no encontrado');
    this.exigirEditable(descuento.semana.estado);
    await this.prisma.nominaDescuento.deleteMany({ where: { id, companyId: tenantId } });
    const lunes = fechaClave(descuento.semana.inicio);
    await this.registrar(
      {
        entityType: 'NominaDescuento',
        entityId: id,
        action: 'DELETE',
        previousData: {
          semana: lunes,
          userId: descuento.userId,
          concepto: descuento.concepto,
          monto: Number(descuento.monto),
          sugerido: descuento.sugerido,
          fecha: descuento.fecha ? fechaClave(descuento.fecha) : null,
        },
        companyId: tenantId,
      },
      actor.id,
    );
    return { ok: true, fila: await this.filaDe(viewer, tenantId, lunes, descuento.userId) };
  }

  /** Convierte en descuentos las faltas injustificadas sugeridas (todas o las de `fechas`). */
  async aceptarSugeridos(
    viewer: Viewer,
    actor: Actor,
    companyId: number | null | undefined,
    dto: { semana: string; userId: number; fechas?: string[] },
  ) {
    const tenantId = requireCompanyId(companyId);
    const lunes = this.resolverSemana(dto.semana);
    await this.asegurarPersona(dto.userId, tenantId);
    const semana = await this.asegurarSemana(tenantId, lunes);
    this.exigirEditable(semana.estado);

    const fila = await this.filaDe(viewer, tenantId, lunes, dto.userId);
    if (!fila) throw new NotFoundException('Usuario fuera de tu alcance');
    const pedidas = dto.fechas?.length ? new Set(dto.fechas) : null;
    const sugeridos = fila.descuentosSugeridos.filter((s) => !pedidas || pedidas.has(s.fecha));
    if (!sugeridos.length) return { ok: true, aceptados: 0, fila };

    // Dos clics seguidos no aceptan dos veces la misma falta.
    const creados = await this.prisma.$transaction(async (tx) => {
      const ya = await tx.nominaDescuento.findMany({
        where: { semanaId: semana.id, userId: dto.userId, sugerido: true, companyId: tenantId },
        select: { fecha: true },
      });
      const yaFechas = new Set(ya.filter((x) => x.fecha).map((x) => fechaClave(x.fecha!)));
      const nuevos = sugeridos.filter((s) => !yaFechas.has(s.fecha));
      if (nuevos.length) {
        await tx.nominaDescuento.createMany({
          data: nuevos.map((s) => ({
            semanaId: semana.id,
            companyId: tenantId,
            userId: dto.userId,
            concepto: s.concepto,
            monto: new Prisma.Decimal(s.monto),
            sugerido: true,
            fecha: fechaColumna(s.fecha),
            creadoPorId: actor.id || null,
          })),
        });
      }
      return nuevos;
    });
    if (creados.length) {
      await this.registrar(
        {
          entityType: 'NominaSemana',
          entityId: semana.id,
          action: 'ACEPTAR_DESCUENTOS_SUGERIDOS',
          changes: { semana: lunes, userId: dto.userId, descuentos: creados },
          companyId: tenantId,
        },
        actor.id,
      );
    }
    return { ok: true, aceptados: creados.length, fila: await this.filaDe(viewer, tenantId, lunes, dto.userId) };
  }

  // ─────────────────────────────────────────────────────────── cierre y reapertura

  /**
   * Cierra la semana: congela cada fila (`snapshot`) y genera un pago en Borrador por persona en
   * «Pagos a empleados». No duplica: si ya hay un pago de esa persona para ese periodo, se deja
   * (y si es el Borrador que generó un cierre anterior de esta misma semana, se actualiza).
   */
  async cerrar(viewer: Viewer, actor: Actor, companyId: number | null | undefined, dto: { semana: string }) {
    const tenantId = requireCompanyId(companyId);
    const lunes = this.resolverSemana(dto.semana);
    const fin = domingoDe(lunes);
    const semana = await this.asegurarSemana(tenantId, lunes);
    if (semana.estado === ESTADO_SEMANA.CERRADA) throw new ConflictException('La semana ya está cerrada');

    const previa = await this.leerSemana(tenantId, lunes);
    const { filas } = await this.calcular(viewer, tenantId, lunes, null, previa);

    // Se reclama el cierre antes de crear pagos: dos «Cerrar» a la vez no generan dos tandas.
    const ahora = new Date();
    const reclamo = await this.prisma.nominaSemana.updateMany({
      where: { id: semana.id, companyId: tenantId, estado: { not: ESTADO_SEMANA.CERRADA } },
      data: { estado: ESTADO_SEMANA.CERRADA, cerradaPorId: actor.id || null, cerradaAt: ahora },
    });
    if (!reclamo?.count) throw new ConflictException('La semana ya está cerrada');

    const creados: Array<{ userId: number; nombre: string; pagoId: number; monto: number }> = [];
    const actualizados: Array<{ userId: number; nombre: string; pagoId: number; monto: number }> = [];
    const omitidos: Array<{ userId: number; nombre: string; motivo: string; pagoId?: number }> = [];
    const errores: Array<{ userId: number; nombre: string; error: string }> = [];

    try {
      const ids = filas.map((f) => f.userId);
      const existentes = ids.length
        ? await this.prisma.employeePayment.findMany({
            where: {
              userId: { in: ids },
              companyId: tenantId,
              deletedAt: null,
              status: { not: 'Anulado' },
              periodFrom: fechaColumna(lunes),
              periodTo: fechaColumna(fin),
            },
            select: { id: true, userId: true, status: true },
            orderBy: { id: 'asc' },
          })
        : [];
      const filaPrevia = new Map((previa?.filas ?? []).map((f) => [f.userId, f]));
      const pagoIdPor = new Map<number, number | null>();
      const concepto = conceptoPagoSemana(lunes);

      for (const f of filas) {
        const propio = filaPrevia.get(f.userId)?.pagoId ?? null;
        pagoIdPor.set(f.userId, propio);
        const total = f.total ?? 0;
        if (f.sueldo == null) {
          omitidos.push({ userId: f.userId, nombre: f.nombre, motivo: 'Sin sueldo semanal capturado' });
          continue;
        }
        if (total <= 0) {
          omitidos.push({ userId: f.userId, nombre: f.nombre, motivo: 'Total en $0.00' });
          continue;
        }
        const suyos = existentes.filter((p) => p.userId === f.userId);
        const generado = suyos.find((p) => p.id === propio) ?? null;
        const totalMinutes = Math.round(f.horasNetasTotales * 60) + f.extrasMinutosAprobados;
        try {
          if (generado && generado.status === 'Borrador') {
            await this.pagos.update(
              generado.id,
              { amount: total, totalMinutes, concepto, note: notaDePago(f, lunes) },
              undefined,
              actor.id,
              tenantId,
            );
            actualizados.push({ userId: f.userId, nombre: f.nombre, pagoId: generado.id, monto: total });
          } else if (suyos.length) {
            const otro = generado ?? suyos[0];
            omitidos.push({
              userId: f.userId,
              nombre: f.nombre,
              motivo: `Ya existe el pago #${otro.id} (${otro.status}) para esa semana`,
              pagoId: otro.id,
            });
          } else {
            const pago = await this.pagos.create(
              { id: actor.id },
              {
                userId: f.userId,
                periodFrom: lunes,
                periodTo: fin,
                amount: total,
                totalMinutes,
                concepto,
                note: notaDePago(f, lunes),
                status: 'Borrador',
              },
              [],
              tenantId,
            );
            pagoIdPor.set(f.userId, pago.id);
            creados.push({ userId: f.userId, nombre: f.nombre, pagoId: pago.id, monto: total });
          }
        } catch (err) {
          errores.push({ userId: f.userId, nombre: f.nombre, error: (err as Error)?.message ?? 'Error al crear el pago' });
        }
      }

      // La foto de cada fila: una semana cerrada se lee de aquí, no se recalcula.
      const pagoPor = new Map<number, PagoDeFila>();
      for (const c of creados) pagoPor.set(c.userId, { id: c.pagoId, estatus: 'Borrador', monto: c.monto });
      for (const c of actualizados) pagoPor.set(c.userId, { id: c.pagoId, estatus: 'Borrador', monto: c.monto });
      // Transacción interactiva (no la de arreglo): el aislamiento por empresa convierte cada
      // upsert en lectura + escritura, y eso solo cabe en una transacción que corre consulta a
      // consulta.
      await this.prisma.$transaction(async (tx) => {
        for (const f of filas) {
          const snapshot = { ...f, pago: pagoPor.get(f.userId) ?? f.pago ?? null } as unknown as Prisma.InputJsonValue;
          const pagoId = pagoIdPor.get(f.userId) ?? null;
          await tx.nominaSemanaFila.upsert({
            where: { semanaId_userId: { semanaId: semana.id, userId: f.userId } },
            create: {
              semanaId: semana.id,
              companyId: tenantId,
              userId: f.userId,
              snapshot,
              pagoId,
              actualizadoPorId: actor.id || null,
            },
            update: { snapshot, pagoId },
            select: { id: true },
          });
        }
      }, { timeout: 30_000 });
    } catch (err) {
      // Sin la foto la semana no puede quedar cerrada: vuelve a como estaba. Los pagos que sí se
      // crearon no se duplican al reintentar (ya existen para ese periodo).
      await this.prisma.nominaSemana
        .updateMany({
          where: { id: semana.id, companyId: tenantId },
          data: { estado: semana.estado, cerradaPorId: semana.cerradaPorId ?? null, cerradaAt: semana.cerradaAt ?? null },
        })
        .catch(() => undefined);
      throw err;
    }

    const resumen = { creados, actualizados, omitidos, errores };
    await this.registrar(
      {
        entityType: 'NominaSemana',
        entityId: semana.id,
        action: 'CERRAR',
        changes: { semana: lunes, personas: filas.length, ...resumen },
        companyId: tenantId,
      },
      actor.id,
    );
    const cerrada = await this.leerSemana(tenantId, lunes);
    return {
      ok: true,
      semana: this.semanaDto(lunes, cerrada),
      // Conteos para el aviso de la pantalla; el detalle, persona por persona, en `pagos`.
      creados: creados.length,
      actualizados: actualizados.length,
      omitidos: omitidos.length,
      errores: errores.length,
      pagos: resumen,
    };
  }

  /** Reabre una semana cerrada. El motivo es obligatorio y queda en la semana y en auditoría. */
  async reabrir(actor: Actor, companyId: number | null | undefined, dto: { semana: string; motivo: string }) {
    const tenantId = requireCompanyId(companyId);
    const lunes = this.resolverSemana(dto.semana);
    const motivo = String(dto.motivo ?? '').trim();
    if (motivo.length < MOTIVO_MIN) {
      throw new BadRequestException(`El motivo es obligatorio (al menos ${MOTIVO_MIN} caracteres)`);
    }
    const semana = await this.leerSemana(tenantId, lunes);
    if (!semana || semana.estado !== ESTADO_SEMANA.CERRADA) throw new ConflictException('La semana no está cerrada');

    const ahora = new Date();
    const r = await this.prisma.nominaSemana.updateMany({
      where: { id: semana.id, companyId: tenantId, estado: ESTADO_SEMANA.CERRADA },
      data: {
        estado: ESTADO_SEMANA.BORRADOR,
        reabiertaPorId: actor.id || null,
        reabiertaAt: ahora,
        reabiertaMotivo: motivo.slice(0, 1000),
      },
    });
    if (!r?.count) throw new ConflictException('La semana no está cerrada');

    // Lo que ya se pagó no se toca: se avisa para que nadie pague dos veces.
    const pagoIds = semana.filas.map((f) => f.pagoId).filter((id): id is number => typeof id === 'number');
    const pagados = pagoIds.length
      ? await this.prisma.employeePayment.findMany({
          where: { id: { in: pagoIds }, companyId: tenantId, status: 'Pagado', deletedAt: null },
          select: { id: true, userId: true },
        })
      : [];
    await this.registrar(
      {
        entityType: 'NominaSemana',
        entityId: semana.id,
        action: 'REABRIR',
        changes: { semana: lunes, motivo, pagosYaPagados: pagados.map((p) => p.id) },
        companyId: tenantId,
      },
      actor.id,
    );
    const avisos = pagados.length
      ? [
          `${pagados.length} pago(s) de esta semana ya están marcados como Pagado (#${pagados.map((p) => p.id).join(', #')}): al volver a cerrar no se modifican.`,
        ]
      : [];
    return { ok: true, semana: this.semanaDto(lunes, await this.leerSemana(tenantId, lunes)), avisos };
  }

  // ───────────────────────────────────────────────────────────────── internos

  private async filaDe(viewer: Viewer, tenantId: number, lunes: string, userId: number): Promise<FilaRespuesta | null> {
    try {
      const previa = await this.leerSemana(tenantId, lunes);
      const { filas } = await this.calcular(viewer, tenantId, lunes, userId, previa);
      return filas[0] ?? null;
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  private exigirEditable(estado: string | null | undefined): void {
    if (estado === ESTADO_SEMANA.CERRADA) {
      throw new ConflictException('La semana está cerrada: reábrela (con motivo) para editarla');
    }
  }

  private async asegurarPersona(userId: number, tenantId: number): Promise<void> {
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('userId inválido');
    const u = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true },
    });
    if (!u) throw new NotFoundException('Persona no encontrada en esta empresa');
  }

  private async asegurarSemana(tenantId: number, lunes: string) {
    const where = { companyId_inicio: { companyId: tenantId, inicio: fechaColumna(lunes) } };
    const select = { id: true, estado: true, cerradaPorId: true, cerradaAt: true } as const;
    try {
      return await this.prisma.nominaSemana.upsert({
        where,
        create: { companyId: tenantId, inicio: fechaColumna(lunes), fin: fechaColumna(domingoDe(lunes)) },
        update: {},
        select,
      });
    } catch (err) {
      // Dos pestañas creando la misma semana a la vez: gana una, la otra la lee.
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      const existente = await this.prisma.nominaSemana.findFirst({
        where: { companyId: tenantId, inicio: fechaColumna(lunes) },
        select,
      });
      if (!existente) throw err;
      return existente;
    }
  }

  private leerSemana(tenantId: number, lunes: string) {
    return this.prisma.nominaSemana.findFirst({
      where: { companyId: tenantId, inicio: fechaColumna(lunes) },
      include: {
        cerradaPor: { select: { id: true, nombre: true } },
        reabiertaPor: { select: { id: true, nombre: true } },
        dias: { include: { ajustadoPor: { select: { id: true, nombre: true } } } },
        filas: true,
        descuentos: { orderBy: { id: 'asc' } },
      },
    });
  }

  private semanaDto(lunes: string, s: Awaited<ReturnType<ControlNominaService['leerSemana']>>): SemanaRespuesta {
    return {
      id: s?.id ?? null,
      inicio: lunes,
      fin: domingoDe(lunes),
      estado: s?.estado ?? ESTADO_SEMANA.BORRADOR,
      cerradaPor: s?.cerradaPor ? { id: s.cerradaPor.id, nombre: s.cerradaPor.nombre } : null,
      cerradaAt: s?.cerradaAt ? s.cerradaAt.toISOString() : null,
      reabiertaPor: s?.reabiertaPor ? { id: s.reabiertaPor.id, nombre: s.reabiertaPor.nombre } : null,
      reabiertaAt: s?.reabiertaAt ? s.reabiertaAt.toISOString() : null,
      reabiertaMotivo: s?.reabiertaMotivo ?? null,
    };
  }

  private descuentoDto(d: { id: number; concepto: string; monto: unknown; sugerido: boolean; fecha: Date | null }): DescuentoNomina {
    return {
      id: d.id,
      concepto: d.concepto,
      monto: roundMoney(Number(d.monto) || 0),
      sugerido: d.sugerido,
      fecha: d.fecha ? fechaClave(d.fecha) : null,
    };
  }

  private async registrar(entrada: Parameters<AuditService['log']>[0], actorId?: number): Promise<void> {
    await this.audit.log({ source: 'control-nomina', ...entrada }, actorId).catch((err) => {
      this.logger.warn(`No se pudo auditar ${entrada.action} de ${entrada.entityType}: ${(err as Error)?.message}`);
    });
  }

  /**
   * Lo que el sistema ya sabe de la semana, persona por persona, convertido en filas.
   * `soloUserId` recalcula una sola fila (tras un ajuste).
   */
  private async calcular(
    viewer: Viewer,
    tenantId: number,
    lunes: string,
    soloUserId: number | null,
    semana: Awaited<ReturnType<ControlNominaService['leerSemana']>>,
  ): Promise<{ filas: FilaRespuesta[]; scope: 'company' | 'subtree' }> {
    const fin = domingoDe(lunes);
    const dias = diasDeLaSemana(lunes).map((d) => d.fecha);
    const datos = await this.kpis.getEquipo(viewer, tenantId, { desde: lunes, hasta: fin }, soloUserId, { conDias: true });
    const ids = datos.personas.map((p) => p.persona.id);
    if (!ids.length) return { filas: [], scope: datos.scope };

    const hoy = workDateKey(new Date(datos.generadoAt));
    const inicioSemana = workDayStart(parseWorkDate(lunes));
    const finSemana = workDayEnd(parseWorkDate(fin));
    const ventana = { gte: new Date(inicioSemana.getTime() - DIA_MS), lte: new Date(finSemana.getTime() + DIA_MS) };
    const enSemana = { gte: inicioSemana, lte: finSemana };
    const colLunes = fechaColumna(lunes);
    const colFin = fechaColumna(fin);
    const inIds = { in: ids };

    const [usuarios, checadas, guardias, justificaciones, permisos, viaticos, hospedajes, actividades, pagos] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { id: inIds },
          select: {
            id: true,
            employeeNumber: true,
            fechaIngreso: true,
            roleKey: true,
            department: { select: { nombre: true } },
            perfil: { select: { sueldoSemanal: true } },
          },
        }),
        this.prisma.attendance.findMany({
          where: { userId: inIds, timestamp: ventana, companyId: tenantId },
          select: { userId: true, type: true, timestamp: true, sitioNombre: true, fueraDeSitio: true },
        }),
        this.prisma.guardia.findMany({
          where: { userId: inIds, companyId: tenantId, fecha: { gte: colLunes, lte: colFin } },
          select: { userId: true, fecha: true },
        }),
        this.prisma.attendanceJustification.findMany({
          where: { userId: inIds, companyId: tenantId, date: { gte: colLunes, lte: colFin } },
          select: { userId: true, date: true, reason: true },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            userId: inIds,
            companyId: tenantId,
            status: 'APPROVED',
            startDate: { lte: colFin },
            endDate: { gte: colLunes },
          },
          select: { userId: true, type: true, startDate: true, endDate: true },
        }),
        // VIÁTICOS: aprobados o pagados, por la fecha en que se solicitaron.
        this.prisma.viatico.findMany({
          where: {
            usuarioId: inIds,
            companyId: tenantId,
            deletedAt: null,
            estatus: { in: ['Aprobado', 'Pagado'] },
            fechaSolicitud: enSemana,
          },
          select: {
            id: true,
            usuarioId: true,
            categoria: true,
            motivo: true,
            estatus: true,
            montoAprobado: true,
            montoSolicitado: true,
            fechaSolicitud: true,
          },
          orderBy: { fechaSolicitud: 'asc' },
        }),
        // Hospedaje que pueda cubrir algún día de la semana (se pide antes de viajar).
        this.prisma.viatico.findMany({
          where: {
            usuarioId: inIds,
            companyId: tenantId,
            deletedAt: null,
            categoria: 'HOSPEDAJE',
            estatus: { notIn: ['Rechazado', 'Cancelado'] },
            fechaSolicitud: { gte: new Date(inicioSemana.getTime() - 31 * DIA_MS), lte: finSemana },
          },
          select: {
            usuarioId: true,
            fechaSolicitud: true,
            Activity: { select: { periodoInicio: true, periodoFin: true } },
            repartos: { select: { actividad: { select: { periodoInicio: true, periodoFin: true } } } },
          },
        }),
        // Actividades del día (misma regla que la geocerca al checar).
        this.prisma.activity.findMany({
          where: {
            companyId: tenantId,
            deletedAt: null,
            AND: [
              {
                OR: [
                  { responsableId: inIds },
                  { assignees: { some: { userId: inIds, retiradoAt: null } } },
                ],
              },
              {
                OR: [
                  { fechaAsignacion: enSemana },
                  { fechaInicio: enSemana },
                  { fechaMaxima: enSemana },
                  { fechaEntregaEsperada: enSemana },
                  { periodoInicio: { lte: colFin }, periodoFin: { gte: colLunes } },
                ],
              },
            ],
          },
          select: {
            id: true,
            titulo: true,
            responsableId: true,
            fechaAsignacion: true,
            fechaInicio: true,
            fechaMaxima: true,
            fechaEntregaEsperada: true,
            periodoInicio: true,
            periodoFin: true,
            branchName: true,
            branchCity: true,
            branchState: true,
            client: { select: { name: true, city: true, state: true } },
            assignees: { where: { userId: inIds, retiradoAt: null }, select: { userId: true } },
          },
          take: MAX_ACTIVIDADES,
        }),
        this.prisma.employeePayment.findMany({
          where: {
            userId: inIds,
            companyId: tenantId,
            deletedAt: null,
            status: { not: 'Anulado' },
            periodFrom: colLunes,
            periodTo: colFin,
          },
          select: { id: true, userId: true, status: true, amount: true },
          orderBy: { id: 'asc' },
        }),
      ]);

    const clave = (userId: number, fecha: string) => `${userId}:${fecha}`;
    const oficina = sitioOficina().nombre;
    const usuarioPor = new Map(usuarios.map((u) => [u.id, u]));

    const checadasPor = new Map<string, EntradaDia['checadas']>();
    for (const c of checadas) {
      const k = clave(c.userId, workDateKey(c.timestamp));
      const lista = checadasPor.get(k) ?? [];
      lista.push({ tipo: c.type, sitioNombre: c.sitioNombre ?? null, fueraDeSitio: Boolean(c.fueraDeSitio) });
      checadasPor.set(k, lista);
    }
    const guardiaEn = new Set(guardias.map((g) => clave(g.userId, fechaClave(g.fecha))));
    const justificadaEn = new Set(justificaciones.map((j) => clave(j.userId, fechaClave(j.date))));
    const permisoEn = new Map<string, 'Vacaciones' | 'Permiso'>();
    for (const p of permisos) {
      const ini = fechaClave(p.startDate);
      const finP = fechaClave(p.endDate);
      for (const d of dias) {
        if (d >= ini && d <= finP) permisoEn.set(clave(p.userId, d), p.type === 'VACATION' ? 'Vacaciones' : 'Permiso');
      }
    }
    const hospedajeEn = new Set<string>();
    for (const h of hospedajes) {
      const periodos = [
        h.Activity ? { inicio: h.Activity.periodoInicio, fin: h.Activity.periodoFin } : null,
        ...h.repartos.map((r) => ({ inicio: r.actividad?.periodoInicio ?? null, fin: r.actividad?.periodoFin ?? null })),
      ]
        .filter((p): p is { inicio: Date | null; fin: Date | null } => p != null)
        .map((p) => ({ inicio: p.inicio ? fechaClave(p.inicio) : null, fin: p.fin ? fechaClave(p.fin) : null }));
      for (const d of diasDeHospedaje({ fechaSolicitud: h.fechaSolicitud, periodos }, dias)) {
        hospedajeEn.add(clave(h.usuarioId, d));
      }
    }
    const foraneaEn = new Set<string>();
    const destinosEn = new Map<string, string[]>();
    for (const a of actividades) {
      const personas = new Set<number>([a.responsableId, ...a.assignees.map((x) => x.userId)].filter((id) => ids.includes(id)));
      if (!personas.size) continue;
      const delDia = diasDeActividad(
        {
          fechas: [a.fechaAsignacion, a.fechaInicio, a.fechaMaxima, a.fechaEntregaEsperada],
          periodoInicio: a.periodoInicio ? fechaClave(a.periodoInicio) : null,
          periodoFin: a.periodoFin ? fechaClave(a.periodoFin) : null,
        },
        dias,
      );
      if (!delDia.length) continue;
      const foranea = esCiudadForanea({
        ciudad: a.branchCity ?? a.client?.city ?? null,
        estado: a.branchState ?? a.client?.state ?? null,
      });
      const destino = destinoDeActividad({
        id: a.id,
        titulo: a.titulo,
        cliente: a.client?.name ?? null,
        sucursal: a.branchName,
      });
      for (const userId of personas) {
        for (const d of delDia) {
          const k = clave(userId, d);
          if (foranea) foraneaEn.add(k);
          if (destino) destinosEn.set(k, [...(destinosEn.get(k) ?? []), destino]);
        }
      }
    }
    const viaticosPor = new Map<number, ViaticoNomina[]>();
    for (const v of viaticos) {
      const lista = viaticosPor.get(v.usuarioId) ?? [];
      const categoria = v.categoria ? (ETIQUETA_CATEGORIA_VIATICO[v.categoria] ?? v.categoria) : null;
      lista.push({
        id: v.id,
        concepto: [categoria, v.motivo?.trim()].filter(Boolean).join(' · ') || `Viático #${v.id}`,
        monto: roundMoney(Number(v.montoAprobado ?? v.montoSolicitado) || 0),
        estatus: v.estatus,
        categoria: v.categoria ?? null,
        fecha: workDateKey(v.fechaSolicitud),
      });
      viaticosPor.set(v.usuarioId, lista);
    }
    const pagoPor = new Map<number, PagoDeFila>();
    for (const p of pagos) {
      if (!pagoPor.has(p.userId)) pagoPor.set(p.userId, { id: p.id, estatus: p.status, monto: roundMoney(Number(p.amount) || 0) });
    }
    const ajustePor = new Map((semana?.dias ?? []).map((d) => [clave(d.userId, fechaClave(d.fecha)), d]));
    const notaPor = new Map((semana?.filas ?? []).map((f) => [f.userId, f.notaFila]));
    const pagoPropioPor = new Map((semana?.filas ?? []).map((f) => [f.userId, f.pagoId]));
    const descuentosPor = new Map<number, DescuentoNomina[]>();
    for (const d of semana?.descuentos ?? []) {
      const lista = descuentosPor.get(d.userId) ?? [];
      lista.push(this.descuentoDto(d));
      descuentosPor.set(d.userId, lista);
    }

    const filas = datos.personas.map((p): FilaRespuesta => {
      const id = p.persona.id;
      const u = usuarioPor.get(id);
      const ingreso = u?.fechaIngreso ? workDateKey(u.fechaIngreso) : null;
      const diasKpi = new Map((p.dias ?? []).map((d) => [d.fecha, d]));
      const entradas: EntradaDia[] = dias.map((fecha) => {
        const k = clave(id, fecha);
        const kpi = diasKpi.get(fecha);
        const ajuste = ajustePor.get(k);
        const lugarManual = ajuste ? lugarValido(ajuste.lugar) : null;
        return {
          fecha,
          laborable: p.horario.dias.includes(diaDeLaSemana(fecha)),
          pasado: fecha < hoy,
          antesDeIngreso: ingreso != null && fecha < ingreso,
          checadas: checadasPor.get(k) ?? [],
          oficina,
          guardia: guardiaEn.has(k),
          justificada: justificadaEn.has(k),
          permiso: permisoEn.get(k) ?? null,
          actividadForanea: foraneaEn.has(k),
          hospedaje: hospedajeEn.has(k),
          destinos: destinosEn.get(k) ?? [],
          entrada: kpi?.entrada ?? null,
          salida: kpi?.salida ?? null,
          minutosLaborados: kpi?.minutosLaborados ?? 0,
          manual:
            ajuste && lugarManual
              ? {
                  lugar: lugarManual,
                  nota: ajuste.nota,
                  porId: ajuste.ajustadoPorId,
                  por: ajuste.ajustadoPor?.nombre ?? null,
                  at: ajuste.at,
                }
              : null,
        };
      });
      const fila = filaControl({
        userId: id,
        nombre: p.persona.nombre,
        puesto: p.persona.puesto,
        numeroEmpleado: u?.employeeNumber ?? null,
        area: areaDe({ roleKey: u?.roleKey ?? null, departamento: u?.department?.nombre ?? null }),
        semana: { inicio: lunes, fin },
        hoy,
        fechaIngreso: ingreso,
        horario: {
          etiqueta: p.horario.etiqueta,
          entrada: p.horario.entrada,
          salida: p.horario.salida,
          jornadaOrdinariaMin: p.horario.jornadaOrdinariaMin,
          dias: p.horario.dias,
          personalizado: p.horario.personalizado,
        },
        sueldoSemanal: u?.perfil?.sueldoSemanal != null ? Number(u.perfil.sueldoSemanal) : null,
        dias: entradas,
        viaticos: viaticosPor.get(id) ?? [],
        extrasMinutosAprobados: p.totales.minutosExtraAprobados,
        extrasMinutosPendientes: p.totales.minutosExtraPendientes,
        extrasDiasPendientes: p.totales.diasExtraPendientes,
        descuentos: descuentosPor.get(id) ?? [],
        notaManual: notaPor.has(id) ? notaPor.get(id) : null,
      });
      const propio = pagoPropioPor.get(id);
      const pago = (propio != null ? pagos.find((x) => x.id === propio) : null) ?? null;
      return {
        ...fila,
        pago: pago ? { id: pago.id, estatus: pago.status, monto: roundMoney(Number(pago.amount) || 0) } : (pagoPor.get(id) ?? null),
      };
    });

    return { filas: ordenaFilas(filas), scope: datos.scope };
  }
}
