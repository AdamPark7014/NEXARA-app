import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service.js';
import { ESTADO, estadoDesdeDb, motivoTransicionInvalida } from '../cotizaciones/estado-cotizacion.js';
import { alcanceDePartidas, type MedioAceptacion } from '../cotizaciones/hilo-negocio.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OperationalProjectsService } from './operational-projects.service.js';
import { ProyectosProfesionalService } from './proyectos-profesional.service.js';

export type DatosGanada = {
  via?: MedioAceptacion | null;
  responsableId?: number | null;
  startDate?: string | null;
};

type Actor = { id: number };

/**
 * «La ganamos»: aprueba la cotización y le crea su proyecto con las partidas como alcance.
 *
 * Aprobar no se deshace y tiene efectos (Por facturar, borrador de compra a CT), así que va primero y
 * solo si procede. Si después falla el proyecto, la cotización ya quedó ganada: se contesta el motivo,
 * sale como «ganada sin proyecto» y esta misma llamada lo vuelve a intentar. Por eso es idempotente.
 */
@Injectable()
export class CotizacionGanadaService {
  private readonly logger = new Logger(CotizacionGanadaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cotizaciones: CotizacionesService,
    private readonly proyectos: ProyectosProfesionalService,
    private readonly operacion: OperationalProjectsService,
  ) {}

  private leer(id: number, tenantId: number) {
    return this.prisma.cotizacion.findFirst({
      where: { id, deletedAt: null, ...(companyWhere(tenantId) as object) },
      include: { items: { orderBy: { id: 'asc' } }, salesClient: true },
    });
  }

  async ganar(id: number, datos: DatosGanada, actor: Actor, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const cotizacion = await this.leer(id, tenantId);
    if (!cotizacion) throw new NotFoundException('Cotización no encontrada');

    const estado = estadoDesdeDb(cotizacion.status);
    if (estado !== ESTADO.ENVIADA && estado !== ESTADO.APROBADA) {
      throw new BadRequestException(motivoTransicionInvalida(cotizacion.status, ESTADO.APROBADA));
    }
    const responsableId = await this.responsable(datos.responsableId, cotizacion.createdById ?? actor.id, tenantId);

    if (estado === ESTADO.ENVIADA) {
      await this.cotizaciones.aprobar(id, actor.id, tenantId);
    }
    const via = datos.via ?? (cotizacion.signedAt ? 'FIRMA' : null);
    if (!cotizacion.aceptadaVia && via) {
      await this.prisma.cotizacion.update({ where: { id }, data: { aceptadaVia: via, aceptadaAt: new Date() } });
    }

    const existente = await this.prisma.operationalProject.findFirst({
      where: { cotizacionId: id, companyId: tenantId, deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true, title: true },
    });
    if (existente) return { cotizacionId: id, proyecto: existente, errorProyecto: null };

    try {
      const proyecto = await this.crearProyecto(cotizacion, responsableId, datos.startDate ?? null, actor, tenantId);
      return { cotizacionId: id, proyecto: { id: proyecto.id, title: proyecto.title }, errorProyecto: null };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'No se pudo crear el proyecto';
      this.logger.warn(`Cotización ${id} ganada sin proyecto: ${motivo}`);
      return { cotizacionId: id, proyecto: null, errorProyecto: motivo };
    }
  }

  /** Quien lo lleva: una persona activa de la empresa. Sin elegir, quien hizo la cotización. */
  private async responsable(elegido: number | null | undefined, porOmision: number, tenantId: number) {
    if (elegido == null) return porOmision;
    const persona = await this.prisma.user.findFirst({
      where: { id: elegido, isActive: true, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true },
    });
    if (!persona) throw new BadRequestException('Esa persona no está activa en esta empresa');
    return persona.id;
  }

  private async crearProyecto(
    cotizacion: NonNullable<Awaited<ReturnType<CotizacionGanadaService['leer']>>>,
    responsableId: number,
    startDate: string | null,
    actor: Actor,
    tenantId: number,
  ) {
    if (!cotizacion.salesClient) throw new BadRequestException('La cotización no tiene un cliente del padrón');
    const clientId = await this.operacion.ensureServiceClientForProject(cotizacion.salesClient, tenantId);
    const subtotal = Number(cotizacion.subtotal ?? 0);
    const titulo =
      cotizacion.projectName?.trim() || cotizacion.clientCompany?.trim() || cotizacion.clientName?.trim() || cotizacion.quoteNumber;
    // Ganar es de quien vende, y crear proyectos asignando a otros suele ser de quien coordina. El
    // responsable ya se validó arriba: aquí no se le exige alcance sobre esa persona.
    return this.proyectos.crear(
      {
        title: titulo.slice(0, 220),
        clientId,
        vendorId: cotizacion.createdById ?? actor.id,
        responsableId,
        status: 'PLANNED',
        cotizacionId: cotizacion.id,
        importarAlcanceDeCotizacion: true,
        scopeItems: alcanceDePartidas(cotizacion.items),
        ...(subtotal > 0 ? { budgetAmount: subtotal } : {}),
        ...(cotizacion.currency ? { currency: cotizacion.currency } : {}),
        ...(startDate ? { startDate } : {}),
      },
      { id: actor.id, isSuperAdmin: true },
      tenantId,
    );
  }
}
