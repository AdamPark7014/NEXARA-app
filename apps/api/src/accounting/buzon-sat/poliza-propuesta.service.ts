import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../../ai/claude/claude.service.js';
import { AccountingService } from '../accounting.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { CUENTAS, cents, type RenglonPoliza } from '../mesa-contable/polizas-mesa.js';
import { coincideImporte, dentroDeDias } from './ingest-cfdi.js';
import { normalizarRfc } from './lista-69b.js';
import { proponerPolizaRecibido, type LigaDetectada } from './poliza-propuesta.js';
import { workDateKey } from '../../common/time/workday.js';

/**
 * Freno propio de la póliza para no gastar el cupo de IA de la empresa.
 *
 * `sugerirCuentaConIa` manda el `companyId` real (antes mandaba 0 y su gasto no tocaba a nadie), así que cada CFDI
 * recibido sin regla del proveedor gasta UNA llamada del cupo diario de la empresa (`ClaudeService`, 300). El ingest
 * del buzón SAT llama a esto factura por factura: una descarga de varios cientos de recibidos vaciaba el cupo y dejaba
 * sin IA, el resto del día, a la complejidad, el chat, la revisión y a todos los demás. Con el freno, pasado el límite
 * la factura se propone sin IA (confianza «baja», «Sin historial ni IA…») y la contadora la corrige a mano; al aceptarla
 * se aprende la regla del proveedor y la siguiente ya no necesita IA.
 *
 * Dos límites por empresa, los dos se cuentan al INTENTAR la llamada (aunque falle: un 5xx también gasta cupo):
 *   - por minuto: lo que una descarga masiva puede pedir de golpe;
 *   - por día de México: lo que la póliza puede quitarle al cupo de 300 entre todas las corridas del día.
 * Es un freno de la póliza, no un tope por función de la IA: ese llega con C10.
 */
export const MAX_SUGERENCIAS_IA_POR_MINUTO = 20;
export const MAX_SUGERENCIAS_IA_POR_DIA = 60;
const VENTANA_SUGERENCIAS_MS = 60_000;

type FrenoEmpresa = {
  ventanaDesde: number;
  enVentana: number;
  dia: string;
  enDia: number;
  avisoVentana: boolean;
  avisoDia: boolean;
};

@Injectable()
export class PolizaPropuestaService {
  private readonly logger = new Logger('PolizaPropuesta');
  private readonly frenos = new Map<number, FrenoEmpresa>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly accounting: AccountingService,
  ) {}

  async listarPendientes(companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const rows = await this.prisma.polizaPropuesta.findMany({
      where: { companyId, estado: { in: ['PENDIENTE', 'CORREGIDA'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            totalAmount: true,
            emisorRfc: true,
            emisorName: true,
            cfdiUuid: true,
          },
        },
      },
    });
    return {
      total: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        estado: r.estado,
        confianza: r.confianza,
        explicacion: r.explicacion,
        cuentaGastoCodigo: r.cuentaGastoCodigo,
        centroCosto: r.centroCosto,
        renglones: r.renglones,
        ligas: r.ligas,
        invoice: {
          ...r.invoice,
          totalAmount: Number(r.invoice.totalAmount),
        },
      })),
    };
  }

  async proponerParaInvoice(companyId: number, invoiceId: number) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, deletedAt: null, type: 'ACCOUNTS_PAYABLE' },
    });
    if (!inv) return null;

    const rfc = normalizarRfc(inv.emisorRfc);
    const regla = rfc
      ? await this.prisma.proveedorContabilizacionRegla.findUnique({
          where: { companyId_supplierRfc: { companyId, supplierRfc: rfc } },
        })
      : null;

    const ligas = await this.buscarLigas(companyId, inv);
    let sugerenciaIa: { codigo: string; porque: string } | null = null;
    // Orden a propósito: sin IA no se gasta el freno, y el freno se cuenta justo antes de preguntar.
    if (!regla && this.claude.disponible() && this.permiteSugerenciaIa(companyId)) {
      sugerenciaIa = await this.sugerirCuentaConIa(companyId, inv.notes || inv.emisorName || '', inv.emisorRfc);
    }

    const propuesta = proponerPolizaRecibido({
      total: Number(inv.totalAmount),
      iva: Number(inv.taxAmount),
      ivaRetenido: inv.ivaRetenido != null ? Number(inv.ivaRetenido) : 0,
      isrRetenido: inv.isrRetenido != null ? Number(inv.isrRetenido) : 0,
      cuentaGastoCodigo: regla?.cuentaCodigo,
      cuentaDesdeHistorial: Boolean(regla),
      sugerenciaIa,
      ligas,
    });

    return this.prisma.polizaPropuesta.upsert({
      where: { invoiceId },
      create: {
        companyId,
        invoiceId,
        estado: 'PENDIENTE',
        confianza: propuesta.confianza,
        explicacion: propuesta.explicacion.slice(0, 500),
        renglones: propuesta.renglones as unknown as Prisma.InputJsonValue,
        ligas: propuesta.ligas as unknown as Prisma.InputJsonValue,
        cuentaGastoCodigo: propuesta.cuentaGastoCodigo,
        centroCosto: regla?.centroCosto ?? null,
        activityId: ligas.find((l) => l.tipo === 'actividad')?.id ?? null,
      },
      update: {
        estado: 'PENDIENTE',
        confianza: propuesta.confianza,
        explicacion: propuesta.explicacion.slice(0, 500),
        renglones: propuesta.renglones as unknown as Prisma.InputJsonValue,
        ligas: propuesta.ligas as unknown as Prisma.InputJsonValue,
        cuentaGastoCodigo: propuesta.cuentaGastoCodigo,
      },
    });
  }

  private async buscarLigas(
    companyId: number,
    inv: { emisorRfc: string | null; totalAmount: Prisma.Decimal; issueDate: Date },
  ): Promise<LigaDetectada[]> {
    const ligas: LigaDetectada[] = [];
    const total = Number(inv.totalAmount);
    const fecha = inv.issueDate.toISOString().slice(0, 10);
    const rfc = normalizarRfc(inv.emisorRfc);

    const tickets = await this.prisma.viaticoTicket.findMany({
      where: {
        companyId,
        estado: { in: ['APROBADO', 'FACTURADO', 'PENDIENTE'] },
        ...(rfc ? { OR: [{ rfcEmisor: rfc }, { rfcEmisor: null }] } : {}),
      },
      take: 40,
      orderBy: { fechaHora: 'desc' },
      select: { id: true, monto: true, fechaHora: true, tipo: true, actividadId: true, estacionComercio: true },
    });
    for (const t of tickets) {
      if (
        coincideImporte(Number(t.monto), total) &&
        dentroDeDias(t.fechaHora.toISOString().slice(0, 10), fecha, 7)
      ) {
        ligas.push({
          tipo: 'ticket',
          id: t.id,
          etiqueta: `Ticket #${t.id}${t.estacionComercio ? ` de ${t.estacionComercio}` : ''} (${t.tipo})`,
        });
        if (t.actividadId) {
          const act = await this.prisma.activity.findFirst({
            where: { id: t.actividadId },
            select: { id: true, titulo: true },
          });
          if (act) {
            ligas.push({ tipo: 'actividad', id: act.id, etiqueta: `Actividad ${act.titulo}` });
          }
        }
        break;
      }
    }

    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId,
        ...(rfc
          ? { supplier: { rfc: { equals: rfc, mode: 'insensitive' } } }
          : {}),
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true, totalAmount: true, createdAt: true, poNumber: true },
    }).catch(() => []);
    for (const po of pos) {
      if (
        coincideImporte(Number(po.totalAmount ?? 0), total) &&
        dentroDeDias(po.createdAt.toISOString().slice(0, 10), fecha, 7)
      ) {
        ligas.push({
          tipo: 'orden_compra',
          id: po.id,
          etiqueta: `OC ${po.poNumber ?? po.id}`,
        });
        break;
      }
    }

    return ligas;
  }

  /**
   * ¿Se le puede preguntar a la IA por esta factura? Si sí, ya cuenta la consulta contra los dos límites de la empresa
   * (por minuto y por día de México). Síncrono y sin esperas entre revisar y contar, así que dos facturas a la vez no
   * se cuelan. Al pasar el límite escribe UN aviso por ventana (no uno por factura: una descarga trae cientos).
   */
  private permiteSugerenciaIa(companyId: number): boolean {
    const ahora = Date.now();
    const dia = workDateKey(new Date(ahora));
    let freno = this.frenos.get(companyId);
    if (!freno) {
      freno = { ventanaDesde: Number.NEGATIVE_INFINITY, enVentana: 0, dia, enDia: 0, avisoVentana: false, avisoDia: false };
      this.frenos.set(companyId, freno);
    }
    if (freno.dia !== dia) {
      freno.dia = dia;
      freno.enDia = 0;
      freno.avisoDia = false;
    }
    if (ahora - freno.ventanaDesde >= VENTANA_SUGERENCIAS_MS) {
      freno.ventanaDesde = ahora;
      freno.enVentana = 0;
      freno.avisoVentana = false;
    }

    if (freno.enDia >= MAX_SUGERENCIAS_IA_POR_DIA) {
      if (!freno.avisoDia) {
        freno.avisoDia = true;
        this.logger.warn(
          `Empresa ${companyId}: ya se usaron ${MAX_SUGERENCIAS_IA_POR_DIA} sugerencias de IA para pólizas hoy; las demás facturas quedan en confianza «baja» para revisar a mano.`,
        );
      }
      return false;
    }
    if (freno.enVentana >= MAX_SUGERENCIAS_IA_POR_MINUTO) {
      if (!freno.avisoVentana) {
        freno.avisoVentana = true;
        this.logger.warn(
          `Empresa ${companyId}: tope de ${MAX_SUGERENCIAS_IA_POR_MINUTO} sugerencias de IA por minuto para pólizas; las facturas que sigan en este minuto quedan en confianza «baja» para revisar a mano.`,
        );
      }
      return false;
    }
    freno.enVentana += 1;
    freno.enDia += 1;
    return true;
  }

  /**
   * Cuenta de gasto que sugiere la IA. Si la IA no responde devuelve null: sin sugerencia, el motor deja la propuesta en
   * confianza «baja» con «Sin historial ni IA…». Antes devolvía «gastos de administración» con un porqué, y el motor lo
   * tomaba como una sugerencia de IA con confianza «media».
   */
  private async sugerirCuentaConIa(
    companyId: number,
    concepto: string,
    rfc: string | null,
  ): Promise<{ codigo: string; porque: string } | null> {
    try {
      const { datos } = await this.claude.json<{ codigo?: string; porque?: string }>({
        sistema: [
          'Eres contador mexicano. Elige UNA cuenta del catálogo NEXARA (códigos tipo 601.01 gastos, 601.02 viáticos, 501.01 costo de ventas). Responde JSON {codigo, porque} en una línea de porque.',
        ],
        usuario: `RFC ${rfc ?? 'N/A'}. Concepto/notas: ${concepto.slice(0, 400)}`,
        esquema: {
          type: 'object',
          additionalProperties: false,
          required: ['codigo', 'porque'],
          properties: { codigo: { type: 'string' }, porque: { type: 'string' } },
        },
        modelo: 'claude-haiku-5-5',
        esfuerzo: 'low',
        proceso: 'contadora-poliza',
        companyId,
        pensar: false,
      });
      const codigo = String(datos.codigo ?? '').trim();
      if (!codigo) return null;
      return { codigo, porque: String(datos.porque ?? '').slice(0, 200) };
    } catch (error) {
      // Sin ruido por factura (la sincronización puede traer cientos): el aviso por motivo ya lo escribe ClaudeService.
      this.logger.debug(`sin sugerencia de cuenta con IA: ${(error as Error).message}`);
      return null;
    }
  }

  async aceptar(
    companyIdRaw: number | null,
    id: number,
    userId: number,
    body?: { cuentaGastoCodigo?: string; centroCosto?: string; renglones?: RenglonPoliza[] },
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const prop = await this.prisma.polizaPropuesta.findFirst({
      where: { id, companyId },
      include: { invoice: true },
    });
    if (!prop) throw new NotFoundException('No encontramos esa propuesta.');
    if (prop.estado === 'ACEPTADA' && prop.journalEntryId) {
      return { id: prop.id, journalEntryId: prop.journalEntryId, yaAceptada: true };
    }

    const renglones = (body?.renglones ?? (prop.renglones as unknown as RenglonPoliza[])).map((r) => ({
      ...r,
      debe: cents(r.debe),
      haber: cents(r.haber),
    }));
    const cuenta = body?.cuentaGastoCodigo?.trim() || prop.cuentaGastoCodigo || CUENTAS.gastosAdministracion;

    const fecha = prop.invoice.issueDate.toISOString().slice(0, 10);
    const entry = await this.accounting.registrarPolizaMesa(
      `SAT-CFDI-${prop.invoiceId}`,
      `Contabilización CFDI ${prop.invoice.cfdiUuid ?? prop.invoice.invoiceNumber}`,
      fecha,
      renglones,
      userId,
      companyId,
    );

    const updated = await this.prisma.polizaPropuesta.update({
      where: { id: prop.id },
      data: {
        estado: 'ACEPTADA',
        cuentaGastoCodigo: cuenta,
        centroCosto: body?.centroCosto ?? prop.centroCosto,
        renglones: renglones as unknown as Prisma.InputJsonValue,
        aceptadaPorId: userId,
        aceptadaAt: new Date(),
        journalEntryId: entry.id,
      },
    });

    const rfc = normalizarRfc(prop.invoice.emisorRfc);
    if (rfc) {
      await this.prisma.proveedorContabilizacionRegla.upsert({
        where: { companyId_supplierRfc: { companyId, supplierRfc: rfc } },
        create: {
          companyId,
          supplierRfc: rfc,
          cuentaCodigo: cuenta,
          centroCosto: body?.centroCosto ?? null,
          explicacion: 'Aceptada desde bandeja Por contabilizar',
        },
        update: {
          cuentaCodigo: cuenta,
          centroCosto: body?.centroCosto ?? undefined,
          updatedAt: new Date(),
        },
      });
    }

    return { id: updated.id, journalEntryId: updated.journalEntryId, yaAceptada: false };
  }

  async aceptarAltaConfianza(companyIdRaw: number | null, userId: number) {
    const companyId = requireCompanyId(companyIdRaw);
    const altas = await this.prisma.polizaPropuesta.findMany({
      where: { companyId, estado: 'PENDIENTE', confianza: 'alta' },
      select: { id: true },
      take: 100,
    });
    const out = [];
    for (const p of altas) {
      out.push(await this.aceptar(companyId, p.id, userId));
    }
    return { aceptadas: out.length, items: out };
  }

  async corregir(
    companyIdRaw: number | null,
    id: number,
    userId: number,
    body: { cuentaGastoCodigo: string; centroCosto?: string; renglones?: RenglonPoliza[]; explicacion?: string },
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const prop = await this.prisma.polizaPropuesta.findFirst({
      where: { id, companyId },
      include: { invoice: { select: { emisorRfc: true } } },
    });
    if (!prop) throw new NotFoundException('No encontramos esa propuesta.');
    if (!body.cuentaGastoCodigo?.trim()) throw new BadRequestException('Indica la cuenta de gasto.');

    const rfc = normalizarRfc(prop.invoice.emisorRfc);
    if (rfc) {
      await this.prisma.proveedorContabilizacionRegla.upsert({
        where: { companyId_supplierRfc: { companyId, supplierRfc: rfc } },
        create: {
          companyId,
          supplierRfc: rfc,
          cuentaCodigo: body.cuentaGastoCodigo.trim(),
          centroCosto: body.centroCosto ?? null,
          explicacion: body.explicacion?.slice(0, 400) || 'Corregida por la contadora',
        },
        update: {
          cuentaCodigo: body.cuentaGastoCodigo.trim(),
          centroCosto: body.centroCosto ?? undefined,
          explicacion: body.explicacion?.slice(0, 400),
          updatedAt: new Date(),
        },
      });
    }

    const propuesta = proponerPolizaRecibido({
      total: 0,
      iva: 0,
      cuentaGastoCodigo: body.cuentaGastoCodigo.trim(),
      cuentaDesdeHistorial: true,
      ligas: (prop.ligas as LigaDetectada[] | null) ?? [],
    });
    // Rehacer con importes reales
    const inv = await this.prisma.invoice.findFirstOrThrow({ where: { id: prop.invoiceId } });
    const real = proponerPolizaRecibido({
      total: Number(inv.totalAmount),
      iva: Number(inv.taxAmount),
      ivaRetenido: inv.ivaRetenido != null ? Number(inv.ivaRetenido) : 0,
      isrRetenido: inv.isrRetenido != null ? Number(inv.isrRetenido) : 0,
      cuentaGastoCodigo: body.cuentaGastoCodigo.trim(),
      cuentaDesdeHistorial: true,
      ligas: (prop.ligas as LigaDetectada[] | null) ?? [],
    });

    return this.prisma.polizaPropuesta.update({
      where: { id: prop.id },
      data: {
        estado: 'CORREGIDA',
        confianza: 'alta',
        cuentaGastoCodigo: body.cuentaGastoCodigo.trim(),
        centroCosto: body.centroCosto ?? null,
        explicacion: (body.explicacion || real.explicacion).slice(0, 500),
        renglones: (body.renglones ?? real.renglones) as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }
}
