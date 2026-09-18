import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CotizacionStatus, Prisma } from '@prisma/client';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto.js';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto.js';
import { SendCotizacionDto } from './dto/send-cotizacion.dto.js';
import { SignCotizacionDto } from './dto/sign-cotizacion.dto.js';
import { generateCotizacionPdf } from './cotizacion-pdf.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { VentasService } from '../ventas/ventas.service.js';
import { resolveRequiredCompanyId, companyWhere, assertCompanyAccess } from '../common/tenant/tenant-scope.js';
import { appUrls } from '../common/app-urls.js';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import {
  calculateLine,
  calculateTotals,
  maxDiscountPercent,
  normalizeItems,
  type NormalizedCotizacionItem,
  type RawCotizacionItem,
} from './cotizacion-totals.js';
import { CtPurchaseOrderService } from '../smart-quote/orders/ct-purchase-order.service.js';
import { CotizacionesCoreService } from './cotizaciones-core.service.js';
import {
  ESTADO,
  ETIQUETA_ESTADO,
  esFinal,
  estaBloqueada,
  estadoADb,
  estadoDesdeDb,
  motivoTransicionInvalida,
  puedeFirmarse,
  transicionPermitida,
} from './estado-cotizacion.js';
import { agruparPartidas, incluyeInstalacion, totalesPorGrupo } from './partidas-grupos.js';
import {
  ETIQUETA_SEGMENTO,
  diasDeVigencia,
  normalizarSegmento,
  terminosDeCotizacion,
  type Segmento,
} from './terminos-segmento.js';
import { avanceActividadPorEstado } from './estado-cotizacion.js';
import { isPdfUrl, pasoCubiertoPorCotizacion } from '../activities/evidence/evidence-flow.helpers.js';
import { generarPropuestaTecnicaPdf } from './propuesta-tecnica-pdf.js';
import { leerObjetivo, objetivoDePropuesta } from './objetivo-plantilla.js';
import { normalizarBloques, plantillasDeCotizacion } from './alcance-bloques.js';
import { ordenarPlanos } from './planos-cotizacion.js';
import {
  folioSinCadena,
  necesitaRefolio,
  nomenclaturaParaFolio,
  siglasDeNomenclatura,
  tieneNomenclatura,
} from './folio-core.js';
import {
  PAQUETES,
  bloqueAlcanceDePaquete,
  buscarPaquete,
  mezclarBloqueAlcance,
  partidasDePaquete,
} from './paquetes.js';
import { getUploadSubdir } from '../common/upload-paths.js';

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeStatus = (status?: string) => {
  if (!status) return undefined;
  const normalized = status.trim().toLowerCase();
  if (normalized === 'draft') return CotizacionStatus.DRAFT;
  if (normalized === 'sent') return CotizacionStatus.SENT;
  if (normalized === 'approved') return CotizacionStatus.APPROVED;
  if (normalized === 'rejected') return CotizacionStatus.REJECTED;
  if (normalized === 'expired') return CotizacionStatus.EXPIRED;
  // Los clientes de Core hablan en español (BORRADOR, ENVIADA, …).
  const enEspanol = status.trim().toUpperCase();
  if (['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA'].includes(enEspanol)) {
    return estadoADb(enEspanol) as CotizacionStatus;
  }
  return undefined;
};

/**
 * Texto de cliente dentro del HTML del correo.
 *
 * El mensaje que escribe quien envía la cotización se interpolaba tal cual en el cuerpo del correo:
 * cualquier `<` o comilla rompía el HTML, y una etiqueta pegada desde otro lado viajaba al buzón del
 * cliente firmada por NEXARA.
 */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEvents: DomainEventBusService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    @Inject(forwardRef(() => VentasService)) private readonly ventasService: VentasService,
    @Inject(forwardRef(() => CtPurchaseOrderService))
    private readonly ctPurchaseOrders: CtPurchaseOrderService,
    private readonly core: CotizacionesCoreService,
  ) {}

  private get db() {
    return this.prisma;
  }

  /**
   * Devuelve el descuento máximo (en %) entre todas las líneas de una cotización.
   * Sirve para evaluar la política de descuentos: si supera 15% se dispara el
   * workflow "Aprobación de descuento en cotización".
   */
  private maxDiscountPercent(items: Array<{ discount: number }>): number {
    return maxDiscountPercent(items);
  }

  private parseDate(value?: string) {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private normalizeItems(items: CreateCotizacionDto['items']) {
    return normalizeItems(items as RawCotizacionItem[]);
  }

  private calculateTotals(items: NormalizedCotizacionItem[]) {
    return calculateTotals(items);
  }

  private buildItemData(items: ReturnType<CotizacionesService['normalizeItems']>) {
    // Mismo cálculo que los totales de la cotización: antes estaba duplicado
    // aquí y cualquier cambio en uno dejaba al otro descuadrado.
    return items.map((item) => ({
      ...item,
      lineTotal: round2(calculateLine(item).total),
    }));
  }

  private async ensureUniqueQuoteNumber(base: string, companyId: number) {
    let candidate = base;
    let counter = 1;
    while (
      await this.db.cotizacion.findFirst({
        where: { quoteNumber: candidate, ...companyWhere(companyId) },
      })
    ) {
      candidate = `${base}-${String(counter).padStart(3, '0')}`;
      counter += 1;
      if (counter > 999) {
        throw new BadRequestException('No se pudo generar un folio unico');
      }
    }
    return candidate;
  }

  async create(dto: CreateCotizacionDto, createdById?: number, companyId?: number | null) {
    // El editor de Core guarda el borrador en cuanto hay cliente, antes de la primera partida: una
    // cotización sin partidas es un borrador válido (lo que no puede es enviarse así).
    const items = dto.items?.length ? this.normalizeItems(dto.items) : [];
    const totals = this.calculateTotals(items);
    const status = normalizeStatus(dto.status) || CotizacionStatus.DRAFT;
    const segmento = normalizarSegmento(dto.segmento);

    /**
     * Folio del servidor. El cliente ya no lo arma: se emite con la nomenclatura de quien cotiza y
     * su propio contador, en transacción. `dto.quoteNumber` se sigue aceptando para importaciones y
     * para el CRM viejo, que lo mandaba hecho.
     */
    const folioManual = dto.quoteNumber?.trim();
    const emitido = folioManual
      ? null
      : createdById
        ? await this.core.siguienteFolio(createdById)
        : null;
    const baseQuoteNumber = folioManual || emitido?.folio;
    if (!baseQuoteNumber) {
      throw new BadRequestException('No se pudo emitir el folio: la cotización necesita un autor.');
    }

    let salesClientId = dto.salesClientId ? Number(dto.salesClientId) : null;
    let opportunityId = dto.opportunityId ? Number(dto.opportunityId) : null;
    let clientName = dto.clientName?.trim() || null;
    let clientCompany = dto.clientCompany?.trim() || null;
    let clientEmail = dto.clientEmail?.trim() || null;
    let clientPhone = dto.clientPhone?.trim() || null;
    let clientAddress = dto.clientAddress?.trim() || null;

    const resolvedCompanyId = await resolveRequiredCompanyId(this.db, companyId);

    if (opportunityId) {
      const opportunity = await this.db.salesOpportunity.findFirst({
        where: { id: opportunityId, ...companyWhere(resolvedCompanyId) },
        include: { client: true },
      });
      assertCompanyAccess(opportunity, resolvedCompanyId, 'Oportunidad');
      if (!salesClientId && opportunity.clientId) salesClientId = opportunity.clientId;
      if (!clientName && opportunity.client) {
        clientName = opportunity.client.name;
        clientCompany = clientCompany || opportunity.client.legalName || opportunity.client.name;
        clientEmail = clientEmail || opportunity.client.billingEmail;
        clientPhone = clientPhone || opportunity.client.billingPhone;
        clientAddress = clientAddress || opportunity.client.fiscalAddress;
      }
    }

    if (salesClientId) {
      const salesClient = await this.db.salesClient.findFirst({
        where: { id: salesClientId, ...companyWhere(resolvedCompanyId) },
      });
      assertCompanyAccess(salesClient, resolvedCompanyId, 'Cliente comercial');
      clientName = clientName || salesClient.name;
      clientCompany = clientCompany || salesClient.legalName || salesClient.name;
      clientEmail = clientEmail || salesClient.billingEmail;
      clientPhone = clientPhone || salesClient.billingPhone;
      clientAddress = clientAddress || salesClient.fiscalAddress;
    }

    const quoteNumber = await this.ensureUniqueQuoteNumber(baseQuoteNumber, resolvedCompanyId);

    // Toda cotización debe quedar ligada a un cliente comercial (maestro CRM),
    // no solo a texto libre: si no vino salesClientId ni oportunidad, se
    // busca o crea el SalesClient a partir del nombre capturado.
    if (!salesClientId) {
      if (!clientName) {
        throw new BadRequestException('La cotización requiere un cliente: selecciona uno existente o captura al menos el nombre.');
      }
      const existingByName = await this.db.salesClient.findFirst({
        where: { companyId: resolvedCompanyId, name: clientName },
      });
      const salesClient =
        existingByName ??
        (await this.db.salesClient.create({
          data: {
            name: clientName,
            legalName: clientCompany || clientName,
            billingEmail: clientEmail,
            billingPhone: clientPhone,
            fiscalAddress: clientAddress,
            companyId: resolvedCompanyId,
          },
        }));
      salesClientId = salesClient.id;
    }

    const data: Prisma.CotizacionUncheckedCreateInput = {
      quoteNumber,
      issueDate: this.parseDate(dto.issueDate) || new Date(),
      validUntil: this.parseDate(dto.validUntil),
      status,
      segmento: segmento as any,
      folioNomenclatura: emitido?.nomenclatura ?? null,
      folioConsecutivo: emitido?.consecutivo ?? null,
      objetivo: dto.objetivo?.trim() || null,
      alcanceBloques: dto.alcanceBloques
        ? (normalizarBloques(dto.alcanceBloques) as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      planos: (dto.planos as Prisma.InputJsonValue) ?? Prisma.DbNull,
      salesClientId,
      opportunityId,
      clientName,
      clientCompany,
      clientEmail,
      clientPhone,
      clientAddress,
      projectName: dto.projectName?.trim() || null,
      scope: dto.scope?.trim() || null,
      paymentTerms: dto.paymentTerms?.trim() || null,
      deliveryTime: dto.deliveryTime?.trim() || null,
      preparedBy: dto.preparedBy?.trim() || null,
      preparedRole: dto.preparedRole?.trim() || null,
      currency: dto.currency?.trim() || 'MXN',
      depositPercent: dto.depositPercent ?? 0,
      note: dto.note?.trim() || null,
      subtotal: round2(totals.subtotal),
      discountTotal: round2(totals.discountTotal),
      taxTotal: round2(totals.taxTotal),
      iepsTotal: round2(totals.iepsTotal),
      retentionTotal: round2(totals.retentionTotal),
      total: round2(totals.total),
      createdById: createdById || null,
      companyId: resolvedCompanyId,
      items: { create: this.buildItemData(items) },
    };

    let created: Awaited<ReturnType<typeof this.db.cotizacion.create>>;
    try {
      created = await this.db.cotizacion.create({
        data,
        include: { items: true, salesClient: true, opportunity: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fallback = await this.ensureUniqueQuoteNumber(
          `${baseQuoteNumber}-${String(Date.now()).slice(-4)}`,
          resolvedCompanyId,
        );
        created = await this.db.cotizacion.create({
          data: { ...data, quoteNumber: fallback },
          include: { items: true, salesClient: true, opportunity: true },
        });
      } else {
        throw error;
      }
    }

    // Quien la hizo queda registrado solo: de aquí sale la cadena de siglas del folio al enviar.
    await this.core.registrarParticipante(created.id, createdById, 'ELABORO');

    if (dto.activityId) {
      await this.ligarActividad(created.id, Number(dto.activityId), resolvedCompanyId).catch((error) => {
        console.error('No se pudo ligar la actividad a la cotización:', error);
      });
    }

    if (opportunityId && createdById) {
      await this.db.salesOpportunityQuote.create({
        data: {
          opportunityId,
          cotizacionId: created.id,
          versionLabel: created.quoteNumber,
          createdById,
        },
      }).catch(() => undefined);
    }

    if (createdById) {
      const maxDiscount = this.maxDiscountPercent(items);
      this.domainEvents.requestAutoApproval({
          entityType: 'COTIZACION',
          entityId: created.id,
          userId: createdById,
          companyId: created.companyId,
          payload: { maxDiscountPercent: maxDiscount, total: created.total },
        });
    }

    this.domainEvents.publishEntityLifecycle('created', {
      entityType: 'COTIZACION',
      entityId: created.id,
      companyId: created.companyId,
      userId: createdById ?? undefined,
      payload: {
        status: created.status,
        quoteNumber: created.quoteNumber,
        total: Number(created.total),
        clientName: created.clientName,
      },
    });

    return created;
  }

  async findAll(query?: PaginationQueryDto, companyId?: number | null) {
    const include = { items: true, createdBy: true };
    const tenant = companyWhere(companyId ?? null);
    if (query?.limit) {
      const where = {
        ...tenant,
        ...(query.search
          ? {
              OR: [
                { quoteNumber: { contains: query.search, mode: 'insensitive' as const } },
                { clientName: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        this.db.cotizacion.findMany({ where, orderBy: { createdAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.db.cotizacion.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.db.cotizacion.findMany({
      where: tenant,
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: { items: true, createdBy: true, company: true },
    });
    assertCompanyAccess(quote, companyId, 'Cotizacion');
    return quote;
  }

  /** Partidas en la forma que entienden los grupos de la propuesta técnica. */
  private partidasParaGrupos(items: any[]) {
    return (items ?? []).map((item) => ({
      grupo: item.grupo ?? null,
      category: item.category ?? null,
      name: item.name ?? null,
      description: item.description ?? null,
      unit: item.unit ?? null,
      qty: Number(item.qty ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
      laborHours: Number(item.laborHours ?? 0),
      laborRate: Number(item.laborRate ?? 0),
      lineTotal: Number(item.lineTotal ?? 0),
      paqueteClave: item.paqueteClave ?? null,
      paqueteCantidad: item.paqueteCantidad ?? null,
      id: item.id,
    }));
  }

  /**
   * Cotización como la leen Core y las apps: estado y segmento en español, folio con su cadena,
   * términos que corresponden a lo que se cobra y partidas agrupadas.
   */
  async presentar(quote: any) {
    const partidas = this.partidasParaGrupos(quote.items ?? []);
    const instalacion = incluyeInstalacion(partidas);
    const estado = estadoDesdeDb(quote.status);
    const segmento = normalizarSegmento(quote.segmento);

    const [participantes, actividades, cadena, planos, autor] = await Promise.all([
      this.core.participantesParaApi(quote.id),
      this.actividadesLigadas(quote.id),
      this.core.cadenaDeParticipantes(quote.id, quote.createdById ?? null),
      this.planosDePropuesta(quote),
      quote.createdById ? this.core.claveDePersona(quote.createdById) : Promise.resolve(null),
    ]);
    const vigenciaDias = diasDeVigencia(quote.issueDate, quote.validUntil);
    const conNomenclatura = Boolean(quote.folioNomenclatura) && tieneNomenclatura(quote.quoteNumber);
    const claveAutor = quote.folioNomenclatura || autor?.clave || null;

    return {
      ...quote,
      folio: quote.quoteNumber,
      folioBase: conNomenclatura ? folioSinCadena(quote.quoteNumber) : quote.quoteNumber,
      conNomenclatura,
      // Borrador viejo (folio sin nomenclatura) que nunca salió: el editor ofrece darle folio.
      necesitaRefolio: necesitaRefolio(quote),
      elaboro: quote.createdById
        ? {
            id: quote.createdById,
            nombre: autor?.nombre ?? quote.createdBy?.nombre ?? '',
            clave: claveAutor,
            siglas: claveAutor ? siglasDeNomenclatura(claveAutor) : null,
          }
        : null,
      cadenaParticipantes: cadena,
      // 01 Objetivo en sus tres partes (el texto guardado lleva marcas) y lo que el PDF pondría solo.
      objetivoPartes: leerObjetivo(quote.objetivo),
      objetivoSugerido: objetivoDePropuesta({
        segmento,
        partidas,
        proyecto: quote.projectName,
        objetivoLibre: null,
        vigenciaDias,
      }),
      alcanceBloques: normalizarBloques(quote.alcanceBloques),
      estado,
      estadoEtiqueta: ETIQUETA_ESTADO[estado],
      bloqueada: estaBloqueada(quote.status),
      segmento,
      segmentoEtiqueta: ETIQUETA_SEGMENTO[segmento as Segmento],
      incluyeInstalacion: instalacion,
      // Los que salen en el PDF (con lo que reescribió quien cotiza, guardado en `note`)…
      terminos: terminosDeCotizacion({
        segmento,
        incluyeInstalacion: instalacion,
        anticipoPct: quote.depositPercent,
        vigenciaDias,
        personalizados: quote.note,
      }),
      // …y los del segmento sin tocar, para que el editor pueda «Restablecer».
      terminosBase: terminosDeCotizacion({
        segmento,
        incluyeInstalacion: instalacion,
        anticipoPct: quote.depositPercent,
        vigenciaDias,
      }),
      grupos: agruparPartidas(partidas),
      totalesPorGrupo: totalesPorGrupo(partidas),
      participantes,
      actividades,
      // 03 Planos: los propios más la evidencia de la actividad comercial ligada.
      planos,
    };
  }

  /** Detalle para Core (lista/editor): igual que `findOne`, pero presentado. */
  async detalleCore(id: number, companyId?: number | null) {
    const quote = await this.findOne(id, companyId);
    return this.presentar(quote);
  }

  /** Lista para Core: folio, cliente, segmento, estado, total y quién intervino. */
  async listaCore(query: PaginationQueryDto | undefined, companyId?: number | null) {
    const where = {
      ...companyWhere(companyId ?? null),
      ...(query?.search
        ? {
            OR: [
              { quoteNumber: { contains: query.search, mode: 'insensitive' as const } },
              { clientName: { contains: query.search, mode: 'insensitive' as const } },
              { clientCompany: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const filas = await this.db.cotizacion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query?.take ?? 200,
      skip: query?.skip ?? 0,
      include: {
        createdBy: {
          select: {
            id: true,
            nombre: true,
            employeeNumber: true,
            fechaIngreso: true,
            perfil: { select: { curp: true, fechaNacimiento: true } },
          },
        },
        participantes: {
          orderBy: { at: 'asc' },
          include: { user: { select: { id: true, nombre: true } } },
        },
        actividades: { select: { id: true, anNumber: true }, take: 3 },
      },
    });

    return filas.map((quote) => {
      const estado = estadoDesdeDb(quote.status);
      const segmento = normalizarSegmento(quote.segmento);
      // Clave de quien la hizo: la congelada en el folio o, en los borradores viejos, la que tendría
      // hoy (misma regla que al emitir). Así la lista dice de quién es aunque nadie más haya intervenido.
      const autor = quote.createdBy;
      const claveAutor =
        quote.folioNomenclatura ||
        (autor
          ? nomenclaturaParaFolio({
              nombre: autor.nombre,
              employeeNumber: autor.employeeNumber,
              curp: autor.perfil?.curp ?? null,
              fechaNacimiento: autor.perfil?.fechaNacimiento ?? null,
              fechaIngreso: autor.fechaIngreso ?? null,
            })
          : null);
      return {
        id: quote.id,
        folio: quote.quoteNumber,
        conNomenclatura: Boolean(quote.folioNomenclatura) && tieneNomenclatura(quote.quoteNumber),
        necesitaRefolio: necesitaRefolio(quote),
        folioNomenclatura: quote.folioNomenclatura,
        folioConsecutivo: quote.folioConsecutivo,
        projectName: quote.projectName,
        createdAt: quote.createdAt,
        updatedAt: quote.updatedAt,
        clienteNombre: quote.clientName,
        clienteEmpresa: quote.clientCompany,
        segmento,
        segmentoEtiqueta: ETIQUETA_SEGMENTO[segmento as Segmento],
        estado,
        estadoEtiqueta: ETIQUETA_ESTADO[estado],
        total: Number(quote.total),
        currency: quote.currency,
        issueDate: quote.issueDate,
        validUntil: quote.validUntil,
        sentAt: quote.sentAt,
        revision: quote.revision,
        elaboro: autor
          ? {
              id: autor.id,
              nombre: autor.nombre,
              clave: claveAutor,
              siglas: claveAutor ? siglasDeNomenclatura(claveAutor) : null,
            }
          : null,
        intervinieron: quote.participantes.map((p) => ({
          userId: p.userId,
          nombre: p.user?.nombre ?? '',
          siglas: p.siglas,
          rol: p.rol,
        })),
        actividades: quote.actividades,
      };
    });
  }

  async update(id: number, dto: UpdateCotizacionDto, updatedById?: number, companyId?: number | null) {
    const existing = await this.db.cotizacion.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: { items: true },
    });
    assertCompanyAccess(existing, companyId, 'Cotizacion');

    /**
     * Enviada = bloqueada. Editarla no reescribe lo que ya vio el cliente: se guarda la versión
     * enviada y la cotización vuelve a borrador, para salir después como -R2.
     * Una aprobada no se toca: es el compromiso firmado.
     */
    if (esFinal(existing.status)) {
      throw new BadRequestException(motivoTransicionInvalida(existing.status, ESTADO.BORRADOR));
    }
    const veniaBloqueada = estaBloqueada(existing.status);
    if (veniaBloqueada) {
      await this.guardarVersion(existing, updatedById, `Edición sobre ${ETIQUETA_ESTADO[estadoDesdeDb(existing.status)]}`);
    }

    const tenantId = existing.companyId ?? companyId ?? null;

    if (dto.opportunityId) {
      const opportunity = await this.db.salesOpportunity.findFirst({
        where: { id: Number(dto.opportunityId), ...companyWhere(tenantId) },
      });
      assertCompanyAccess(opportunity, tenantId, 'Oportunidad');
    }
    if (dto.salesClientId) {
      const salesClient = await this.db.salesClient.findFirst({
        where: { id: Number(dto.salesClientId), ...companyWhere(tenantId) },
      });
      assertCompanyAccess(salesClient, tenantId, 'Cliente comercial');
    }

    const updateData: Record<string, any> = {
      // El folio lo emite el servidor; solo se deja reescribir donde nunca lo emitió (CRM legacy).
      quoteNumber: existing.folioNomenclatura ? undefined : dto.quoteNumber?.trim(),
      segmento: dto.segmento ? (normalizarSegmento(dto.segmento) as any) : undefined,
      objetivo: dto.objetivo?.trim(),
      alcanceBloques: dto.alcanceBloques
        ? (normalizarBloques(dto.alcanceBloques) as unknown as Prisma.InputJsonValue)
        : undefined,
      // Solo reordena y renombra los planos que ya están (agregar = subir; quitar = su endpoint).
      planos: dto.planos
        ? (ordenarPlanos(existing.planos, dto.planos) as unknown as Prisma.InputJsonValue)
        : undefined,
      issueDate: this.parseDate(dto.issueDate),
      validUntil: this.parseDate(dto.validUntil),
      salesClientId: dto.salesClientId !== undefined ? (dto.salesClientId ? Number(dto.salesClientId) : null) : undefined,
      opportunityId: dto.opportunityId !== undefined ? (dto.opportunityId ? Number(dto.opportunityId) : null) : undefined,
      clientName: dto.clientName?.trim(),
      clientCompany: dto.clientCompany?.trim(),
      clientEmail: dto.clientEmail?.trim(),
      clientPhone: dto.clientPhone?.trim(),
      clientAddress: dto.clientAddress?.trim(),
      projectName: dto.projectName?.trim(),
      scope: dto.scope?.trim(),
      paymentTerms: dto.paymentTerms?.trim(),
      deliveryTime: dto.deliveryTime?.trim(),
      preparedBy: dto.preparedBy?.trim(),
      preparedRole: dto.preparedRole?.trim(),
      currency: dto.currency?.trim(),
      depositPercent: dto.depositPercent,
      note: dto.note?.trim(),
    };

    const status = normalizeStatus(dto.status);
    if (status) {
      if (!transicionPermitida(existing.status, status)) {
        throw new BadRequestException(motivoTransicionInvalida(existing.status, status));
      }
      updateData['status'] = status;
    }
    // Editar una enviada la devuelve a borrador: lo que sale al cliente siempre es una versión
    // cerrada, no el documento que alguien está tocando.
    if (veniaBloqueada && !status) updateData['status'] = CotizacionStatus.DRAFT;

    let result: Awaited<ReturnType<typeof this.db.cotizacion.update>>;
    let finalItems: Array<{ discount: number }>;

    if (dto.items) {
      // Quitar la última partida deja el borrador sin partidas, no es un error.
      const items = dto.items.length ? this.normalizeItems(dto.items) : [];
      const totals = this.calculateTotals(items);
      const itemData = this.buildItemData(items);

      updateData['subtotal'] = round2(totals.subtotal);
      updateData['discountTotal'] = round2(totals.discountTotal);
      updateData['taxTotal'] = round2(totals.taxTotal);
      updateData['iepsTotal'] = round2(totals.iepsTotal);
      updateData['retentionTotal'] = round2(totals.retentionTotal);
      updateData['total'] = round2(totals.total);

      result = await this.db.$transaction(async (tx) => {
        await tx.cotizacionItem.deleteMany({ where: { cotizacionId: id } });
        return tx.cotizacion.update({
          where: { id },
          data: {
            ...Object.fromEntries(Object.entries(updateData).filter(([, value]) => value !== undefined)),
            items: { create: itemData },
          },
          include: { items: true, createdBy: true },
        });
      });
      finalItems = items;
    } else {
      result = await this.db.cotizacion.update({
        where: { id },
        data: Object.fromEntries(Object.entries(updateData).filter(([, value]) => value !== undefined)),
        include: { items: true, createdBy: true },
      });
      // Sin items en el payload reutilizamos los existentes para evaluar política
      // de descuentos: así detectamos si el descuento previo (1%) ya rebasaba
      // los umbrales aunque el PATCH actual sólo cambió status/cliente/etc.
      finalItems = existing.items.map((it) => ({ discount: Number(it.discount) }));
    }

    const requesterId = updatedById ?? existing.createdById ?? undefined;
    if (requesterId) {
      const maxDiscount = this.maxDiscountPercent(finalItems);
      // Siempre re-evaluamos en update (parcial o total). El servicio de
      // auto-approval es idempotente: no creará un workflow nuevo si ya hay
      // uno activo para la misma entidad.
      this.domainEvents.requestAutoApproval({
          entityType: 'COTIZACION',
          entityId: id,
          userId: requesterId,
          companyId: result.companyId ?? existing.companyId,
          payload: { maxDiscountPercent: maxDiscount, total: result.total },
        });
    }

    if (status === CotizacionStatus.APPROVED) {
      void this.applyQuoteApprovedSideEffects({
        id,
        quoteNumber: result.quoteNumber,
        companyId: result.companyId,
      });
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'COTIZACION',
      entityId: id,
      companyId: result.companyId ?? existing.companyId,
      userId: requesterId,
      payload: {
        status: result.status,
        quoteNumber: result.quoteNumber,
        total: Number(result.total),
        maxDiscountPercent: maxDiscountPercent(finalItems),
      },
    });

    return result;
  }

  async getPdfBuffer(id: number, companyId?: number | null, internal = false) {
    const quote = await this.findOne(id, companyId);
    return this.buildPdf(quote, internal);
  }

  async getInternalPdfBuffer(id: number, companyId?: number | null) {
    return this.getPdfBuffer(id, companyId, true);
  }

  async generatePdfFile(id: number, companyId?: number | null) {
    const quote = await this.findOne(id, companyId);
    const pdf = await this.buildPdf(quote);
    const dir = path.resolve(process.cwd(), 'uploads', 'cotizaciones');
    await fs.mkdir(dir, { recursive: true });
    const filename = `cotizacion-${quote.quoteNumber}-${Date.now()}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.writeFile(outPath, pdf);
    return { pdfUrl: `/uploads/cotizaciones/${filename}` };
  }

  async getPublicByToken(token: string) {
    const quote = await this.db.cotizacion.findUnique({
      where: { publicToken: token },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      issueDate: quote.issueDate,
      validUntil: quote.validUntil,
      status: quote.status,
      clientName: quote.clientName,
      clientCompany: quote.clientCompany,
      clientEmail: quote.clientEmail,
      projectName: quote.projectName,
      currency: quote.currency,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxTotal: quote.taxTotal,
      iepsTotal: quote.iepsTotal,
      retentionTotal: quote.retentionTotal,
      total: quote.total,
      items: quote.items,
    };
  }

  async signByToken(token: string, dto: SignCotizacionDto) {
    const quote = await this.db.cotizacion.findUnique({ where: { publicToken: token } });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');

    if (quote.status === CotizacionStatus.APPROVED) {
      return this.db.cotizacion.findUnique({
        where: { id: quote.id },
        include: { items: true },
      });
    }

    /**
     * Antes bastaba con tener el enlace: se firmaba una cotización vencida, una rechazada o una que
     * nunca se envió. La vigencia y el estado se revisan aquí, que es donde el cliente aprieta.
     */
    const permiso = puedeFirmarse({ estado: quote.status, validUntil: quote.validUntil });
    if (!permiso.ok) throw new BadRequestException(permiso.motivo);

    const updated = await this.db.cotizacion.update({
      where: { id: quote.id },
      data: {
        status: CotizacionStatus.APPROVED,
        signedByName: dto.name.trim(),
        signedByEmail: dto.email.trim(),
        signedAt: new Date(),
      },
      include: { items: true },
    });

    void this.applyQuoteSignedSideEffects(updated, dto).catch((error) => {
      console.error('Error applying quote signed side effects:', error);
    });
    void this.sincronizarActividad(updated.id, updated.status).catch(() => undefined);
    void this.core
      .avisar({
        cotizacionId: updated.id,
        quoteNumber: updated.quoteNumber,
        tipo: 'QUOTE_SIGNED',
        titulo: 'Cotización aprobada por el cliente',
        mensaje: `${updated.quoteNumber}: ${dto.name.trim()} la firmó.`,
        autorId: updated.createdById,
        companyId: updated.companyId,
      })
      .catch(() => undefined);

    return updated;
  }

  private async applyQuoteApprovedSideEffects(
    quote: { id: number; quoteNumber: string; companyId: number },
  ) {
    try {
      const draft = await this.ctPurchaseOrders.createDraftOnApproval(quote.id, quote.companyId);
      if (draft) {
        await this.notificationsService.notifyCtOrderDraftReady(quote.id, quote.quoteNumber);
      }
    } catch (error) {
      console.error('CT draft on approval:', error);
    }
  }

  /**
   * Workflow de descuento completado — la cotización puede enviarse al cliente.
   * No cambia el estatus (APPROVED = firma del cliente); publica evento de dominio.
   */
  async onWorkflowDiscountApproved(quoteId: number, companyId: number, actorId?: number) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id: quoteId, ...companyWhere(companyId) },
    });
    if (!quote) return;

    const notifyUserId = actorId ?? quote.createdById;
    if (notifyUserId) {
      void this.notificationsService
        .createNotification({
          userId: notifyUserId,
          type: 'QUOTE_DISCOUNT_APPROVED',
          category: 'sales',
          title: '✅ Descuento aprobado',
          message: `La cotización ${quote.quoteNumber} tiene descuento autorizado. Ya puedes enviarla al cliente.`,
          entityType: 'COTIZACION',
          relatedEntityId: quote.id,
          relatedUrl: appUrls.crmQuote(quote.id),
        } as any)
        .catch(() => undefined);
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'COTIZACION',
      entityId: quoteId,
      companyId,
      userId: actorId ?? quote.createdById ?? undefined,
      payload: {
        status: quote.status,
        quoteNumber: quote.quoteNumber,
        total: Number(quote.total),
        discountApproved: true,
      },
    });
  }

  /** Descuento rechazado en workflow — notifica al vendedor. */
  async onWorkflowDiscountRejected(
    quoteId: number,
    companyId: number,
    actorId?: number,
    comments?: string | null,
  ) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id: quoteId, ...companyWhere(companyId) },
    });
    if (!quote) return;

    const notifyUserId = quote.createdById ?? actorId;
    if (notifyUserId) {
      void this.notificationsService
        .createNotification({
          userId: notifyUserId,
          type: 'QUOTE_DISCOUNT_REJECTED',
          category: 'sales',
          title: '❌ Descuento no autorizado',
          message: `La cotización ${quote.quoteNumber} no obtuvo aprobación de descuento.${comments ? ` Motivo: ${comments}` : ''}`,
          entityType: 'COTIZACION',
          relatedEntityId: quote.id,
          relatedUrl: appUrls.crmQuote(quote.id),
        } as any)
        .catch(() => undefined);
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'COTIZACION',
      entityId: quoteId,
      companyId,
      userId: actorId ?? quote.createdById ?? undefined,
      payload: {
        status: quote.status,
        quoteNumber: quote.quoteNumber,
        discountRejected: true,
        comments: comments?.trim() || null,
      },
    });
  }

  /** Firma → notificar vendedor, marcar oportunidad vinculada como WON. */
  private async applyQuoteSignedSideEffects(
    quote: {
      id: number;
      quoteNumber: string;
      total: unknown;
      companyId: number;
      createdById?: number | null;
    },
    signer: SignCotizacionDto,
  ) {
    await this.notificationsService.notifyQuoteSigned(quote.id, signer.name.trim(), signer.email.trim());
    void this.applyQuoteApprovedSideEffects(quote);

    const links = await this.db.salesOpportunityQuote.findMany({
      where: { cotizacionId: quote.id },
      include: { opportunity: true },
    });

    const quoteTotal = Number(quote.total ?? 0);
    for (const link of links) {
      const opp = link.opportunity;
      if (!opp || opp.stage === 'WON' || opp.stage === 'LOST') continue;

      const prevStage = opp.stage;
      const actorId = quote.createdById || opp.ownerId || link.createdById;
      const closedAt = new Date();

      await this.db.salesOpportunity.update({
        where: { id: opp.id },
        data: {
          stage: 'WON',
          closedAt,
          probability: 100,
          ...(quoteTotal > 0 ? { value: quoteTotal } : {}),
        },
      });

      await this.db.salesOpportunityNote.create({
        data: {
          opportunityId: opp.id,
          message: `Cotización ${quote.quoteNumber} firmada por ${signer.name.trim()} (${signer.email.trim()}). Oportunidad marcada como ganada automáticamente.`,
          createdById: actorId,
        },
      });

      if (actorId) {
        void this.notificationHierarchy
          .notifySalesOpportunityStageChanged(
            actorId,
            opp.id,
            opp.title,
            String(prevStage),
            'WON',
            'Cliente',
          )
          .catch(() => undefined);
      }

      void this.ventasService
        .autoEnsureSalesProjectFromWonOpportunity(opp.id, actorId || undefined)
        .catch(() => undefined);
    }
  }

  /** Envío → mover oportunidad vinculada a etapa Cotización (PROPOSAL). */
  private async applyQuoteSentSideEffects(quoteId: number) {
    const links = await this.db.salesOpportunityQuote.findMany({
      where: { cotizacionId: quoteId },
      include: { opportunity: true },
    });

    const bumpFrom = new Set(['DISCOVERY', 'QUALIFICATION']);
    for (const link of links) {
      const opp = link.opportunity;
      if (!opp || opp.stage === 'WON' || opp.stage === 'LOST') continue;
      if (!bumpFrom.has(opp.stage)) continue;

      const prevStage = opp.stage;
      const actorId = opp.ownerId || link.createdById;
      await this.db.salesOpportunity.update({
        where: { id: opp.id },
        data: { stage: 'PROPOSAL' },
      });

      if (actorId) {
        void this.notificationHierarchy
          .notifySalesOpportunityStageChanged(
            actorId,
            opp.id,
            opp.title,
            String(prevStage),
            'PROPOSAL',
            'Sistema',
          )
          .catch(() => undefined);
      }
    }
  }

  async send(id: number, dto: SendCotizacionDto, senderId?: number, companyId?: number | null) {
    const quote = await this.db.cotizacion.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: { items: true },
    });
    assertCompanyAccess(quote, companyId, 'Cotizacion');

    const email = dto.email?.trim() || quote.clientEmail?.trim();
    if (!email) throw new BadRequestException('Email de cliente requerido');

    if (!transicionPermitida(quote.status, ESTADO.ENVIADA)) {
      throw new BadRequestException(motivoTransicionInvalida(quote.status, ESTADO.ENVIADA));
    }
    if (!quote.items?.length) {
      throw new BadRequestException('Agrega al menos una partida antes de enviar la cotización.');
    }

    // Copias: sin repetir al destinatario principal.
    const copias = [...new Set((dto.cc ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))].filter(
      (c) => c !== email.toLowerCase(),
    );

    const token = quote.publicToken || randomBytes(24).toString('hex');

    // Quien envía queda registrado antes de armar el folio: su sigla tiene que aparecer en la cadena.
    await this.core.registrarParticipante(id, senderId ?? quote.createdById, 'ENVIO');

    // Primer envío = revisión 1; cada envío posterior agrega -R2, -R3 al folio.
    const revision = quote.sentAt ? (quote.revision || 1) + 1 : 1;
    // Al enviar, `quoteNumber` se queda con el folio con cadena: el reenvío parte de la base, o la
    // cadena se pegaría dos veces (`…-0007-JA-JA.CE-R2`). Los folios viejos se envían tal cual.
    const base = quote.folioNomenclatura ? folioSinCadena(quote.quoteNumber) : quote.quoteNumber;
    const folio = quote.folioNomenclatura
      ? await this.core.folioParaEnvio(id, base, quote.createdById, revision)
      : quote.quoteNumber;

    /**
     * El correo va **antes** de marcarla enviada.
     *
     * Antes se guardaba `SENT` y después se intentaba mandar el correo: si el SMTP fallaba, la
     * cotización quedaba bloqueada como enviada y el cliente nunca la recibió. Ahora, si el correo
     * no sale, el estado no se toca y se puede reintentar.
     */
    const pdf = await this.buildPdf({ ...quote, quoteNumber: folio, revision, status: CotizacionStatus.SENT });
    await this.sendEmail({ ...quote, quoteNumber: folio }, email, dto.message, pdf, token, copias);

    const updated = await this.db.cotizacion.update({
      where: { id },
      data: {
        status: CotizacionStatus.SENT,
        quoteNumber: folio,
        folioEnviado: folio,
        revision,
        publicToken: token,
        sentToEmail: email,
        sentAt: new Date(),
        updatedAt: new Date(),
        createdBy: quote.createdById || senderId ? { connect: { id: quote.createdById || senderId! } } : undefined,
      },
      include: { items: true },
    });

    void this.applyQuoteSentSideEffects(updated.id).catch((error) => {
      console.error('Error applying quote sent side effects:', error);
    });
    void this.sincronizarActividad(updated.id, updated.status).catch(() => undefined);
    void this.core
      .avisar({
        cotizacionId: updated.id,
        quoteNumber: updated.quoteNumber,
        tipo: 'QUOTE_SENT',
        titulo: 'Cotización enviada',
        mensaje: `${updated.quoteNumber} salió a ${updated.clientName || email}.`,
        autorId: updated.createdById,
        actorId: senderId,
        companyId: updated.companyId,
      })
      .catch(() => undefined);

    return updated;
  }

  /**
   * Sube un plano o anexo a la cotización (03 Planos).
   *
   * Los que vienen de la actividad comercial no se suben: ya están. Esto es para el plano CAD o el
   * PDF que hace quien cotiza.
   */
  async agregarPlano(
    id: number,
    archivo: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
    nombre: string | undefined,
    companyId?: number | null,
  ) {
    const quote = await this.findOne(id, companyId);
    if (estaBloqueada(quote.status)) {
      throw new BadRequestException(
        'Esta cotización ya salió al cliente: edítala para crear una versión nueva antes de cambiar sus anexos.',
      );
    }
    if (!archivo?.buffer?.length) throw new BadRequestException('Archivo requerido');

    const tipoMime = String(archivo.mimetype || '');
    const esImagen = tipoMime.startsWith('image/');
    const esPdf = tipoMime === 'application/pdf';
    if (!esImagen && !esPdf) {
      throw new BadRequestException('El anexo debe ser una imagen o un PDF.');
    }
    if (archivo.buffer.length > 20 * 1024 * 1024) {
      throw new BadRequestException('El anexo no puede pasar de 20 MB.');
    }

    const carpeta = getUploadSubdir(__dirname, 'cotizaciones-planos');
    const extension =
      path.extname(String(archivo.originalname || '')).toLowerCase() || (esPdf ? '.pdf' : '.png');
    const nombreArchivo = `${id}-${Date.now()}${extension}`;
    await fs.writeFile(path.join(carpeta, nombreArchivo), archivo.buffer);

    const plano = {
      url: `/uploads/cotizaciones-planos/${nombreArchivo}`,
      nombre: nombre?.trim() || archivo.originalname || 'Plano',
      tipo: esPdf ? 'pdf' : 'imagen',
      origen: 'cotizacion',
      at: new Date().toISOString(),
    };

    const previos = Array.isArray(quote.planos) ? (quote.planos as any[]) : [];
    await this.db.cotizacion.update({
      where: { id },
      data: { planos: [...previos, plano] as Prisma.InputJsonValue },
    });

    return this.detalleCore(id, companyId);
  }

  /** Quita un anexo propio de la cotización (los heredados de la actividad viven en la actividad). */
  async quitarPlano(id: number, url: string, companyId?: number | null) {
    const quote = await this.findOne(id, companyId);
    if (estaBloqueada(quote.status)) {
      throw new BadRequestException('Esta cotización ya salió al cliente: edítala para crear una versión nueva.');
    }
    const previos = Array.isArray(quote.planos) ? (quote.planos as any[]) : [];
    await this.db.cotizacion.update({
      where: { id },
      data: { planos: previos.filter((p: any) => String(p?.url ?? '') !== url) as Prisma.InputJsonValue },
    });
    return this.detalleCore(id, companyId);
  }

  /** Catálogo de paquetes («Cámara bala instalada» = cámara + balún + adaptador + caja + instalación). */
  paquetes() {
    return PAQUETES.map((paquete) => ({
      clave: paquete.clave,
      titulo: paquete.titulo,
      descripcion: paquete.descripcion,
      bloqueAlcance: paquete.bloqueAlcance ?? null,
      partidas: paquete.partidas,
    }));
  }

  /** Puntos de partida del editor por segmento: objetivo (entrada y cierre) y subsecciones de alcance. */
  plantillas() {
    return plantillasDeCotizacion();
  }

  /**
   * Da folio con nomenclatura a un borrador viejo (`NXR-2026-763366`) que nunca salió.
   *
   * El folio es de quien la hizo (su nomenclatura y su contador), no de quien aprieta el botón. El
   * folio anterior queda en el historial de versiones, y quien la hizo queda como «Elaboró» para
   * que la lista diga quién intervino. Es la misma lógica que `scripts/refoliar-borradores.js`.
   */
  async refoliar(id: number, userId?: number, companyId?: number | null) {
    const quote = await this.findOne(id, companyId);
    if (!necesitaRefolio(quote)) {
      throw new BadRequestException(
        quote.sentAt || quote.folioEnviado
          ? 'Esta cotización ya salió al cliente con ese folio: no se cambia.'
          : quote.createdById
            ? 'Esta cotización ya tiene folio con nomenclatura.'
            : 'No se sabe quién hizo esta cotización: no hay nomenclatura de la cual sacar el folio.',
      );
    }

    const anterior = quote.quoteNumber;
    await this.guardarVersion(quote, userId, `Refoliado: antes ${anterior}`);
    const emitido = await this.core.siguienteFolio(quote.createdById!);
    const quoteNumber = await this.ensureUniqueQuoteNumber(emitido.folio, quote.companyId);

    await this.db.cotizacion.update({
      where: { id },
      data: {
        quoteNumber,
        folioNomenclatura: emitido.nomenclatura,
        folioConsecutivo: emitido.consecutivo,
      },
    });
    await this.core.registrarParticipante(id, quote.createdById, 'ELABORO');

    return this.detalleCore(id, companyId);
  }

  /**
   * Agrega N paquetes a una cotización: genera sus partidas y **deja cuadrado el alcance**.
   *
   * Cotizar un paquete a mano es de donde salen las propuestas con 15 cámaras y 14 instalaciones.
   */
  async agregarPaquete(id: number, clave: string, cantidad: number, userId?: number, companyId?: number | null) {
    const existing = await this.findOne(id, companyId);
    if (estaBloqueada(existing.status)) {
      throw new BadRequestException(
        'Esta cotización ya salió al cliente: edítala para crear una versión nueva antes de agregar paquetes.',
      );
    }

    const paquete = buscarPaquete(clave);
    if (!paquete) throw new BadRequestException('Ese paquete no existe.');

    const n = Math.max(1, Math.trunc(Number(cantidad) || 0));
    // Las partidas del mismo paquete se reemplazan: dos pasadas de «15 cámaras» no son 30.
    const conservadas = existing.items.filter((item: any) => item.paqueteClave !== paquete.clave);
    const generadas = partidasDePaquete(paquete, n);

    const items = [
      ...conservadas.map((item: any) => ({
        grupo: item.grupo,
        paqueteClave: item.paqueteClave,
        paqueteCantidad: item.paqueteCantidad,
        category: item.category,
        name: item.name,
        description: item.description,
        unit: item.unit,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        tax: Number(item.tax),
        laborHours: Number(item.laborHours || 0),
        laborRate: Number(item.laborRate || 0),
      })),
      ...generadas,
    ];

    const bloques = mezclarBloqueAlcance(
      (Array.isArray(existing.alcanceBloques) ? (existing.alcanceBloques as any[]) : []) as Array<{ clave: string }>,
      bloqueAlcanceDePaquete(paquete, n) as unknown as { clave: string },
    );

    await this.update(
      id,
      { items: items as any, alcanceBloques: bloques as unknown as unknown[] },
      userId,
      companyId,
    );
    return this.detalleCore(id, companyId);
  }

  /** Guarda la foto de la cotización tal como está, para poder volver a ella. */
  private async guardarVersion(quote: any, createdById?: number, note?: string) {
    const ultima = await this.db.cotizacionVersion.findFirst({
      where: { cotizacionId: quote.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (ultima?.version ?? 0) + 1;
    return this.db.cotizacionVersion
      .create({
        data: {
          cotizacionId: quote.id,
          version,
          snapshot: JSON.parse(JSON.stringify(quote)) as Prisma.InputJsonValue,
          note: note?.slice(0, 255) ?? null,
          createdById: createdById ?? quote.createdById ?? null,
        },
      })
      .catch((error) => {
        console.error('No se pudo guardar la versión de la cotización:', error);
        return null;
      });
  }

  /** Versiones guardadas (para la línea de tiempo de la web). */
  async versiones(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    const filas = await this.db.cotizacionVersion.findMany({
      where: { cotizacionId: id },
      orderBy: { version: 'desc' },
      include: { createdBy: { select: { id: true, nombre: true } } },
    });
    return filas.map((v) => ({
      version: v.version,
      note: v.note,
      at: v.createdAt,
      por: v.createdBy ? { id: v.createdBy.id, nombre: v.createdBy.nombre } : null,
      folio: (v.snapshot as any)?.quoteNumber ?? null,
      total: Number((v.snapshot as any)?.total ?? 0),
    }));
  }

  /** Quién intervino, con su papel. */
  async participantes(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.core.participantesParaApi(id);
  }

  /** Deja constancia de que alguien la revisó (sin cambiar el estado). */
  async revisar(id: number, userId?: number, companyId?: number | null) {
    const quote = await this.findOne(id, companyId);
    await this.core.registrarParticipante(id, userId, 'REVISO');
    return this.presentar(quote);
  }

  /** Aprobación interna (dirección): deja participante APROBO y aprueba la cotización. */
  async aprobar(id: number, userId?: number, companyId?: number | null) {
    const quote = await this.findOne(id, companyId);
    if (!transicionPermitida(quote.status, ESTADO.APROBADA)) {
      throw new BadRequestException(motivoTransicionInvalida(quote.status, ESTADO.APROBADA));
    }
    await this.core.registrarParticipante(id, userId, 'APROBO');
    const updated = await this.db.cotizacion.update({
      where: { id },
      data: { status: CotizacionStatus.APPROVED },
      include: { items: true },
    });
    void this.applyQuoteApprovedSideEffects(updated);
    void this.sincronizarActividad(updated.id, updated.status).catch(() => undefined);
    void this.core
      .avisar({
        cotizacionId: updated.id,
        quoteNumber: updated.quoteNumber,
        tipo: 'QUOTE_SIGNED',
        titulo: 'Cotización aprobada',
        mensaje: `${updated.quoteNumber} quedó aprobada.`,
        autorId: updated.createdById,
        actorId: userId,
        companyId: updated.companyId,
      })
      .catch(() => undefined);
    return this.presentar(updated);
  }

  /** Rechazo (interno o del cliente) con motivo. */
  async rechazar(
    id: number,
    motivo: string,
    opciones: { porNombre?: string | null; userId?: number; companyId?: number | null } = {},
  ) {
    const quote = await this.findOne(id, opciones.companyId ?? null);
    if (!transicionPermitida(quote.status, ESTADO.RECHAZADA)) {
      throw new BadRequestException(motivoTransicionInvalida(quote.status, ESTADO.RECHAZADA));
    }
    const limpio = (motivo || '').trim();
    if (limpio.length < 5) {
      throw new BadRequestException('Escribe el motivo del rechazo (al menos 5 caracteres).');
    }

    const updated = await this.db.cotizacion.update({
      where: { id },
      data: {
        status: CotizacionStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedReason: limpio.slice(0, 1000),
        rejectedByName: opciones.porNombre?.trim()?.slice(0, 180) || null,
      },
      include: { items: true },
    });

    void this.sincronizarActividad(updated.id, updated.status).catch(() => undefined);
    void this.core
      .avisar({
        cotizacionId: updated.id,
        quoteNumber: updated.quoteNumber,
        tipo: 'QUOTE_REJECTED',
        titulo: 'Cotización rechazada',
        mensaje: `${updated.quoteNumber}: ${limpio.slice(0, 160)}`,
        autorId: updated.createdById,
        actorId: opciones.userId,
        companyId: updated.companyId,
      })
      .catch(() => undefined);

    return this.presentar(updated);
  }

  /** El cliente rechaza desde el enlace público, con motivo. */
  async rechazarPorToken(token: string, motivo: string, nombre?: string) {
    const quote = await this.db.cotizacion.findUnique({ where: { publicToken: token } });
    if (!quote) throw new NotFoundException('Cotizacion no encontrada');
    return this.rechazar(quote.id, motivo, { porNombre: nombre ?? null, companyId: quote.companyId });
  }

  /**
   * Liga una actividad comercial con su cotización (en los dos sentidos).
   *
   * La evidencia de la actividad —fotos del levantamiento y planos— pasa a ser anexo de la
   * propuesta sin volver a subirla.
   */
  async ligarActividad(cotizacionId: number, activityId: number, companyId?: number | null) {
    const actividad = await this.db.activity.findFirst({
      where: { id: activityId, deletedAt: null, ...companyWhere(companyId ?? null) },
      select: { id: true, coreKind: true, cotizacionId: true, companyId: true },
    });
    assertCompanyAccess(actividad, companyId, 'Actividad');

    await this.db.activity.update({
      where: { id: activityId },
      data: { cotizacionId, coreKind: actividad.coreKind || 'comercial' },
    });
    return { activityId, cotizacionId };
  }

  /** Actividades comerciales ligadas a la cotización. */
  async actividadesLigadas(cotizacionId: number) {
    return this.db.activity.findMany({
      where: { cotizacionId, deletedAt: null },
      select: { id: true, anNumber: true, titulo: true, estatus: true, coreKind: true },
      orderBy: { id: 'desc' },
    });
  }

  /**
   * El avance de la actividad comercial sigue el estado de su cotización.
   *
   * ENVIADA → «Por Validar» (la cotización sustituye a la hoja de servicio); APROBADA →
   * «Finalizada»; rechazada o vencida no la cierran: la revisa un superior.
   */
  private async sincronizarActividad(cotizacionId: number, status: unknown) {
    const estatus = avanceActividadPorEstado(status);
    if (!estatus) return;

    const actividades = await this.db.activity.findMany({
      where: { cotizacionId, deletedAt: null, estatus: { notIn: ['Finalizada', 'Cancelada'] } },
      select: { id: true, coreKind: true },
    });
    if (!actividades.length) return;

    await this.db.activity.updateMany({
      where: { id: { in: actividades.map((a) => a.id) } },
      data: {
        estatus,
        ...(estatus === 'Finalizada' ? { fechaFinalizacion: new Date() } : {}),
      },
    });

    if (estadoDesdeDb(status) === ESTADO.ENVIADA) {
      const quote = await this.db.cotizacion.findUnique({
        where: { id: cotizacionId },
        select: { quoteNumber: true, sentAt: true },
      });
      for (const actividad of actividades) {
        if (!pasoCubiertoPorCotizacion(actividad.coreKind)) continue;
        // La cotización enviada **es** la hoja de servicio de una actividad comercial: el paso del
        // formulario se da por cubierto y el flujo salta a la foto de salida.
        await this.db.activityEvidence
          .updateMany({
            where: { activityId: actividad.id, status: 'SERVICE_SHEET_DATA' },
            data: {
              serviceSheetData: {
                tipo: 'cotizacion',
                cotizacionId,
                folio: quote?.quoteNumber ?? null,
                enviadaAt: quote?.sentAt ?? new Date(),
              } as Prisma.InputJsonValue,
              serviceSheetCompletedAt: new Date(),
              status: 'EXIT_PHOTO',
            },
          })
          .catch(() => undefined);
      }
    }
  }

  /**
   * Anexos de la propuesta (03 Planos): los que se subieron a la cotización más la evidencia de la
   * actividad comercial —fotos del levantamiento y planos de quien la atendió— sin volver a subirla.
   */
  async planosDePropuesta(quote: { id: number; planos?: unknown }) {
    const propios = Array.isArray(quote.planos) ? (quote.planos as any[]) : [];
    const evidencias = await this.db.activityEvidence.findMany({
      where: { activity: { cotizacionId: quote.id, deletedAt: null } },
      select: {
        activityId: true,
        evidencePhotos: true,
        serviceSheetPdfUrl: true,
        evidencePhotosUploadedAt: true,
        user: { select: { nombre: true } },
      },
    });

    const heredados: Array<Record<string, unknown>> = [];
    for (const ev of evidencias) {
      for (const [i, url] of (ev.evidencePhotos ?? []).entries()) {
        if (!url) continue;
        heredados.push({
          url,
          nombre: `Levantamiento ${i + 1}${ev.user?.nombre ? ` · ${ev.user.nombre}` : ''}`,
          tipo: isPdfUrl(url) ? 'pdf' : 'imagen',
          origen: 'actividad',
          activityId: ev.activityId,
          at: ev.evidencePhotosUploadedAt,
        });
      }
      if (ev.serviceSheetPdfUrl) {
        heredados.push({
          url: ev.serviceSheetPdfUrl,
          nombre: 'Plano del levantamiento',
          tipo: 'pdf',
          origen: 'actividad',
          activityId: ev.activityId,
        });
      }
    }

    const vistos = new Set<string>();
    return [...propios, ...heredados].filter((p: any) => {
      const url = String(p?.url ?? '');
      if (!url || vistos.has(url)) return false;
      vistos.add(url);
      return true;
    });
  }

  /**
   * PDF que ve el cliente: la «Propuesta técnica» del contrato.
   *
   * El PDF viejo (una tabla y un párrafo de términos fijo) se conserva para la vista interna, que
   * es la única que lleva costo de proveedor y margen.
   */
  private async buildPropuesta(quote: any): Promise<Buffer> {
    const partidas = this.partidasParaGrupos(quote.items ?? []);
    const segmento = normalizarSegmento(quote.segmento);
    const instalacion = incluyeInstalacion(partidas);
    const vigenciaDias = diasDeVigencia(quote.issueDate, quote.validUntil);

    let company = quote.company;
    if (!company && quote.companyId) {
      company = await this.db.companyProfile.findUnique({ where: { id: quote.companyId } });
    }

    const [planos, participantes] = await Promise.all([
      this.planosDePropuesta(quote),
      this.core.participantesParaApi(quote.id),
    ]);

    // Sin bloques vacíos (en el PDF saldrían como un número sin nada) y con viñetas limpias.
    const bloques = normalizarBloques(quote.alcanceBloques) as any[];
    const fecha = (valor: unknown) => {
      if (!valor) return null;
      const d = new Date(valor as string);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    };

    // Términos por partes: los del segmento, con lo que reescribió quien cotiza (`note`).
    const terminos = terminosDeCotizacion({
      segmento,
      incluyeInstalacion: instalacion,
      anticipoPct: quote.depositPercent,
      vigenciaDias,
      personalizados: quote.note,
    });

    /**
     * Lo que el editor de Core captura y `PropuestaPayload` todavía no declara. Va con spread para no
     * tocar el tipo del generador desde aquí; el generador lo imprime cuando lo conoce:
     *  - version: «1.0», «2.0»… (portada; sale de la revisión enviada)
     *  - alcanceTitulo: encabezado de 02 (el título del proyecto)
     *  - alcanceIntro: párrafo de entrada de 02, debajo del título (`Cotizacion.scope`)
     *  - anticipoPct / vigenciaDias: cifras de los términos, por si el PDF las quiere aparte
     * Además `terminos.partes` trae los términos con título (`{ clave, titulo, texto, personalizado }`).
     */
    // Un borrador que ya salió antes es la siguiente revisión en preparación (la vista previa
    // dice 2.0 mientras se edita la R2); al enviarse, `send` pasa la revisión nueva y el estado.
    const enPreparacion = Boolean(quote.sentAt) && estadoDesdeDb(quote.status) === ESTADO.BORRADOR;
    const extras = {
      version: `${Math.max(1, Number(quote.revision || 1) + (enPreparacion ? 1 : 0))}.0`,
      alcanceTitulo: quote.projectName?.trim() || null,
      alcanceIntro: quote.scope?.trim() || null,
      anticipoPct: Number(quote.depositPercent ?? 0) || null,
      vigenciaDias,
    };

    return generarPropuestaTecnicaPdf({
      ...extras,
      folio: quote.quoteNumber,
      revision: Number(quote.revision || 1),
      issueDate: fecha(quote.issueDate) ?? new Date().toISOString().slice(0, 10),
      validUntil: fecha(quote.validUntil),
      segmentoEtiqueta: ETIQUETA_SEGMENTO[segmento as Segmento],
      cliente: {
        nombre: quote.clientName,
        empresa: quote.clientCompany,
        telefono: quote.clientPhone,
        correo: quote.clientEmail,
        direccion: quote.clientAddress,
      },
      proyecto: quote.projectName,
      objetivo: objetivoDePropuesta({
        segmento,
        partidas,
        proyecto: quote.projectName,
        objetivoLibre: quote.objetivo,
        vigenciaDias,
      }),
      alcance: bloques.map((b) => ({
        titulo: String(b?.titulo ?? b?.clave ?? 'Alcance'),
        texto: b?.texto ?? null,
        vinetas: Array.isArray(b?.vinetas) ? b.vinetas.map(String) : [],
        parametros: b?.parametros ?? null,
      })),
      planos: planos.map((p: any) => ({
        url: String(p?.url ?? ''),
        nombre: p?.nombre ?? null,
        tipo: p?.tipo ?? null,
      })),
      grupos: agruparPartidas(partidas).map((g) => ({
        grupo: g.grupo,
        etiqueta: g.etiqueta,
        subtotal: g.subtotal,
        partidas: g.partidas.map((p) => ({
          name: String(p.name ?? ''),
          description: p.description ?? null,
          unit: p.unit ?? null,
          qty: Number(p.qty ?? 0),
          unitPrice: Number(p.unitPrice ?? 0),
          lineTotal: Number(p.lineTotal ?? 0),
        })),
      })),
      subtotal: Number(quote.subtotal ?? 0),
      iva: Number(quote.taxTotal ?? 0),
      total: Number(quote.total ?? 0),
      currency: quote.currency || 'MXN',
      terminos,
      participantes: participantes.map((p) => ({
        nombre: p.nombre,
        rolEtiqueta: p.rolEtiqueta,
        siglas: p.siglas,
      })),
      empresa: company
        ? {
            legalName: company.legalName,
            tradeName: company.tradeName,
            contactEmail: company.contactEmail,
            contactPhone: company.contactPhone,
            websiteUrl: company.websiteUrl,
            fiscalAddress: company.fiscalAddress,
          }
        : null,
    });
  }

  private async buildPdf(quote: any, internal = false) {
    // Lo que sale al cliente es la propuesta técnica; la vista interna conserva el formato viejo,
    // que es el único con costo de proveedor y margen.
    if (!internal) {
      try {
        return await this.buildPropuesta(quote);
      } catch (error) {
        console.error('No se pudo armar la propuesta técnica; se usa el formato anterior:', error);
      }
    }

    const items = quote.items.map((item: any) => ({
      category: item.category,
      name: item.name,
      description: item.description,
      brand: item.brand,
      model: item.model,
      sku: item.sku,
      partNumber: item.partNumber,
      batchReference: item.batchReference,
      unit: item.unit,
      qty: item.qty,
      unitPrice: Number(item.unitPrice),
      unitCost: item.unitCost != null ? Number(item.unitCost) : null,
      marginPercent: item.marginPercent != null ? Number(item.marginPercent) : null,
      discount: item.discount,
      tax: item.tax,
      ieps: item.ieps,
      retention: item.retention,
      laborHours: Number(item.laborHours || 0),
      laborRate: Number(item.laborRate || 0),
      warrantyMonths: item.warrantyMonths,
      lineTotal: Number(item.lineTotal),
    }));

    let company = quote.company;
    if (!company && quote.companyId) {
      company = await this.db.companyProfile.findUnique({ where: { id: quote.companyId } });
    }

    return generateCotizacionPdf(
      {
      quoteNumber: quote.quoteNumber,
      issueDate: quote.issueDate.toISOString().slice(0, 10),
      validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
      status: quote.status,
      clientName: quote.clientName,
      clientCompany: quote.clientCompany,
      clientEmail: quote.clientEmail,
      clientPhone: quote.clientPhone,
      clientAddress: quote.clientAddress,
      projectName: quote.projectName,
      scope: quote.scope,
      paymentTerms: quote.paymentTerms,
      deliveryTime: quote.deliveryTime,
      preparedBy: quote.preparedBy,
      preparedRole: quote.preparedRole,
      currency: quote.currency,
      depositPercent: quote.depositPercent,
      note: quote.note,
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      taxTotal: Number(quote.taxTotal),
      iepsTotal: Number(quote.iepsTotal || 0),
      retentionTotal: Number(quote.retentionTotal || 0),
      total: Number(quote.total),
      company: company
        ? {
            legalName: company.legalName || 'NEXARA',
            tradeName: company.tradeName,
            rfc: company.rfc,
            fiscalAddress: company.fiscalAddress,
            fiscalPostalCode: company.fiscalPostalCode,
            contactEmail: company.contactEmail,
            contactPhone: company.contactPhone,
            websiteUrl: company.websiteUrl,
          }
        : null,
      items,
    },
    { internal },
    );
  }

  private buildTransporter() {
    const host = process.env['SMTP_HOST'];
    const port = Number(process.env['SMTP_PORT'] || 587);
    const user = process.env['SMTP_VENTAS_USER'] || process.env['SMTP_USER'];
    const pass = process.env['SMTP_VENTAS_PASS'] || process.env['SMTP_PASS'];

    if (!host || !user || !pass) {
      throw new InternalServerErrorException('SMTP no configurado');
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async sendEmail(
    quote: any,
    email: string,
    message: string | undefined,
    pdf: Buffer,
    token: string,
    cc: string[] = [],
  ) {
    const transporter = this.buildTransporter();
    const from = process.env['SMTP_VENTAS_USER'] || process.env['SMTP_FROM'] || 'ventas@nexara.com.mx';
    const baseUrl = process.env['PUBLIC_WEB_URL'] || 'http://localhost:3000';
    const signUrl = `${baseUrl.replace(/\/+$/, '')}/cotizaciones/firmar/${token}`;

    // Todo lo que viene de una persona se escapa: el mensaje libre y el nombre del cliente.
    const saludo = escaparHtml(String(quote.clientName || 'cliente'));
    const folio = escaparHtml(String(quote.quoteNumber));
    const cuerpo = message?.trim()
      ? `<p>${escaparHtml(message.trim()).replace(/\r?\n/g, '<br />')}</p>`
      : '';
    const htmlMessage = `
      <p>Hola ${saludo},</p>
      <p>Adjuntamos la propuesta técnica ${folio}.</p>
      ${cuerpo}
      <p>Para revisarla y firmarla: <a href="${signUrl}">${signUrl}</a></p>
    `;

    try {
      await transporter.sendMail({
        from,
        to: email,
        ...(cc.length ? { cc } : {}),
        subject: `Cotizacion ${quote.quoteNumber}`,
        html: htmlMessage,
        attachments: [
          {
            filename: `cotizacion-${quote.quoteNumber}.pdf`,
            content: pdf,
          },
        ],
      });
    } catch {
      throw new InternalServerErrorException('No se pudo enviar el correo');
    }
  }
}
