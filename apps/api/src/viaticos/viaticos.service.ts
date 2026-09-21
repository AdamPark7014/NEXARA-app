import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import {
  appendTrail,
  buildApprovalChain,
  canActOnStep,
  isTerminalApproved,
  stepRoleAt,
  type TrailEntry,
} from '../common/rbac/hierarchical-approval.js';
import { ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { generateViaticsReportPdf } from './viatics-report-pdf.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { AuditService } from '../audit/audit.service.js';
import { assertCompanyAccess, resolveRequiredCompanyId, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import {
  aCentavos,
  normalizarPartes,
  resumenLiquidacion,
  validarReparto,
  type Parte,
  repartirEnPartesIguales,
} from './viatico-reparto.js';

/** Cap list endpoints when the client omits limit (mobile dashboard was unbounded). */
const DEFAULT_LIST_TAKE = 200;

export const VIATIC_CATEGORIES = [
  'COMBUSTIBLE',
  'CASETA',
  'HOSPEDAJE',
  'ALIMENTACION',
  'TRANSPORTE',
  'OTROS',
] as const;

export type ViaticCategory = (typeof VIATIC_CATEGORIES)[number];

const CEO_NO_REQUEST = new Set<RoleKey>([ROLES.CEO, ROLES.SUPER_ADMIN]);

@Injectable()
export class ViaticosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly domainEvents: DomainEventBusService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
  ) {}

  private resolveActorRole(actor: any): RoleKey | null {
    if (actor?.isSuperAdmin) return ROLES.SUPER_ADMIN;
    const key = actor?.roleKey ?? actor?.role?.orgRoleKey;
    return key ?? null;
  }

  private amountOf(viatico: { montoSolicitado: unknown }) {
    return typeof viatico.montoSolicitado === 'object' &&
      viatico.montoSolicitado &&
      'toNumber' in (viatico.montoSolicitado as object)
      ? (viatico.montoSolicitado as { toNumber: () => number }).toNumber()
      : Number(viatico.montoSolicitado) || 0;
  }

  /** Scope de listado/detalle/reportes según rol del actor. */
  private buildListWhere(currentUser?: any, companyId?: number | null): Record<string, unknown> {
    const tenant = companyWhere(companyId ?? null);
    if (!currentUser || currentUser.isSuperAdmin) {
      return { deletedAt: null, ...tenant };
    }
    if (
      currentUser.permissions?.includes('CONSOLE_ADMIN') ||
      currentUser.permissions?.includes('viatics.manage')
    ) {
      const role = this.resolveActorRole(currentUser);
      if (!currentUser.departmentId || role === ROLES.CEO || role === ROLES.DIR_ADMIN || role === ROLES.CONTABILIDAD) {
        return { deletedAt: null, ...tenant };
      }
      return {
        deletedAt: null,
        ...tenant,
        User: {
          AND: [
            { departmentId: currentUser.departmentId },
            { role: { accesoConsoleAdmin: false } },
          ],
        },
      };
    }
    return { deletedAt: null, usuarioId: currentUser.id, ...tenant };
  }

  private assertCanRequest(actor: any) {
    const role = this.resolveActorRole(actor);
    if (actor?.isSuperAdmin || (role && CEO_NO_REQUEST.has(role))) {
      throw new ForbiddenException(
        'El CEO no solicita viáticos — solo autoriza el cierre del flujo.',
      );
    }
  }

  private normalizeCategory(raw?: string | null): ViaticCategory {
    const value = String(raw || 'OTROS')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if ((VIATIC_CATEGORIES as readonly string[]).includes(value)) {
      return value as ViaticCategory;
    }
    return 'OTROS';
  }

  /**
   * Comprueba el reparto sin tocar la base: limpia la entrada y exige el cuadre.
   *
   * Se llama antes de dar de alta el viático para que un reparto descuadrado no
   * deje una solicitud huérfana ya creada que nadie pidió.
   */
  private revisarPartes(partesRaw: unknown, total: unknown): Parte[] {
    let partes: Parte[];
    try {
      partes = normalizarPartes(partesRaw);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const veredicto = validarReparto(partes, total);
    if (!veredicto.ok) throw new BadRequestException(veredicto.mensaje);
    return partes;
  }

  /**
   * Guarda el reparto de un viático entre varias actividades.
   *
   * La suma de las partes tiene que ser exactamente el total: un reparto que no
   * cuadra es costo que se pierde o se duplica en el P&L por proyecto, y nadie
   * se entera hasta el cierre. Por eso se valida aquí, en el servidor, aunque
   * la pantalla ya lo enseñe mientras se captura.
   *
   * Las actividades se comprueban contra la empresa activa: repartir hacia la
   * actividad de otra empresa sería una fuga de datos disfrazada de contabilidad.
   */
  private async persistirReparto(
    viaticoId: number,
    partesRaw: unknown,
    total: unknown,
    companyId: number,
  ): Promise<Parte[]> {
    const partes = this.revisarPartes(partesRaw, total);

    if (partes.length > 0) {
      const ids = [...new Set(partes.map((p) => p.actividadId))];
      const existentes = await this.prisma.activity.findMany({
        where: { id: { in: ids }, ...companyWhere(companyId) },
        select: { id: true },
      });
      const encontradas = new Set(existentes.map((a) => a.id));
      const faltantes = ids.filter((id) => !encontradas.has(id));
      if (faltantes.length > 0) {
        throw new BadRequestException(
          `No encontramos ${faltantes.length === 1 ? 'la actividad' : 'las actividades'} ` +
            `${faltantes.map((id) => `#${id}`).join(', ')} en tu empresa. ` +
            'Elige actividades de tu propia operación para repartir el gasto.',
        );
      }
    }

    // Reemplazo completo en una transacción: un reparto a medias (las viejas
    // borradas, las nuevas sin escribir) dejaría el costo sin dueño.
    await this.prisma.$transaction([
      this.prisma.viaticoReparto.deleteMany({ where: { viaticoId, ...companyWhere(companyId) } }),
      ...partes.map((parte) =>
        this.prisma.viaticoReparto.create({
          data: {
            viaticoId,
            actividadId: parte.actividadId,
            monto: parte.monto,
            nota: parte.nota,
            companyId,
          },
        }),
      ),
    ]);

    return partes;
  }

  /** Resuelve SalesProject desde actividad OPS (vía OperationalProject.salesProjectId). */
  private async resolveSalesProjectId(
    actividadId?: number | null,
    projectId?: number | null,
  ): Promise<number | null> {
    if (projectId) return projectId;
    if (!actividadId) return null;
    const activity = await this.prisma.activity.findUnique({
      where: { id: actividadId },
      select: { project: { select: { salesProjectId: true } } },
    });
    return activity?.project?.salesProjectId ?? null;
  }

  toCSV(viatics: any[]): string {
    if (!viatics.length) return '';
    const fields = Object.keys(viatics[0]);
    const csvRows = [fields.join(',')];
    for (const row of viatics) {
      csvRows.push(
        fields
          .map((f) => {
            let val = row[f];
            if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
            if (typeof val === 'string' && val.includes(',')) val = '"' + val.replace(/"/g, '""') + '"';
            return val ?? '';
          })
          .join(','),
      );
    }
    return csvRows.join('\n');
  }

  importMany(rows: any[], companyId?: number | null) {
    requireCompanyId(companyId);
    if (!Array.isArray(rows) || !rows.length) {
      throw new BadRequestException('No hay filas para importar');
    }
    throw new BadRequestException(
      'Importación masiva de viáticos deshabilitada — usa el flujo de solicitud con evidencia.',
    );
  }

  async create(dto: any, actor?: any, companyId?: number | null) {
    if (actor) this.assertCanRequest(actor);
    if (!dto.ticketEvidenciaUrl) {
      throw new BadRequestException('Debes adjuntar el ticket o comprobante de gasto');
    }
    const actividadId = dto.actividadId ? Number(dto.actividadId) : null;
    let projectId = dto.projectId ? Number(dto.projectId) : null;
    projectId = await this.resolveSalesProjectId(actividadId, projectId);
    if (!actividadId && !projectId) {
      throw new BadRequestException(
        'La solicitud debe ligarse a una actividad o a un proyecto.',
      );
    }
    const vehicleId = dto.vehicleId ? Number(dto.vehicleId) : null;
    const categoria = this.normalizeCategory(dto.categoria);
    const resolvedCompanyId = await resolveRequiredCompanyId(
      this.prisma,
      companyId ?? (dto.companyId ? Number(dto.companyId) : null),
    );
    // Antes de crear nada: un reparto que no cuadra dejaría una solicitud
    // huérfana, ya registrada, que nadie pidió así.
    if (dto.partes != null) this.revisarPartes(dto.partes, dto.montoSolicitado);

    const viatico = await this.prisma['viatico'].create({
      data: {
        usuarioId: Number(dto.usuarioId),
        actividadId,
        projectId,
        vehicleId,
        companyId: resolvedCompanyId,
        categoria,
        origen: 'SOLICITUD',
        montoSolicitado: dto.montoSolicitado,
        motivo: dto.motivo ?? null,
        ticketEvidenciaUrl: dto.ticketEvidenciaUrl,
        approvalStep: 0,
        approvalTrail: [],
        estatus: 'Pendiente',
      },
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true, id: true } },
        project: { select: { id: true, name: true } },
      },
    });

    // El reparto se guarda después del alta porque necesita el id del viático.
    // Si no cuadra, la excepción deja la solicitud sin partes en vez de a medias.
    if (dto.partes != null) {
      await this.persistirReparto(viatico.id, dto.partes, viatico.montoSolicitado, resolvedCompanyId);
    }

    const amount = this.amountOf(viatico);
    this.domainEvents.publishEntityLifecycle('created', {
      entityType: 'VIATIC',
      entityId: viatico.id,
      companyId: viatico.companyId ?? resolvedCompanyId,
      userId: viatico.usuarioId ?? undefined,
      payload: {
        estatus: viatico.estatus,
        categoria: viatico.categoria,
        montoSolicitado: amount,
        actividadId: viatico.actividadId,
        projectId: viatico.projectId,
      },
    });

    if (viatico.usuarioId && viatico.User) {
      await this.notificationHierarchy.notifyViaticRequested(
        viatico.usuarioId,
        viatico.id,
        viatico.User.nombre || 'Usuario',
        amount,
      );
      this.domainEvents.requestAutoApproval({
        entityType: 'VIATIC',
        entityId: viatico.id,
        userId: viatico.usuarioId,
        companyId: viatico.companyId ?? resolvedCompanyId,
        payload: { amount, outOfPolicy: Boolean(dto?.outOfPolicy) },
      });
    }
    return viatico;
  }

  /**
   * Asigna un viático a un usuario para una actividad/proyecto.
   * No requiere evidencia (presupuesto anticipado); entra al mismo flujo de aprobación.
   */
  async assign(dto: any, actor: any, companyId?: number | null) {
    if (!actor?.id) {
      throw new ForbiddenException('Se requiere autenticación para asignar viáticos');
    }
    const usuarioId = Number(dto.usuarioId);
    if (!usuarioId) {
      throw new BadRequestException('Debes indicar el usuario beneficiario');
    }
    const actividadId = dto.actividadId ? Number(dto.actividadId) : null;
    let projectId = dto.projectId ? Number(dto.projectId) : null;
    projectId = await this.resolveSalesProjectId(actividadId, projectId);
    if (!actividadId && !projectId) {
      throw new BadRequestException(
        'La asignación debe ligarse a una actividad o a un proyecto.',
      );
    }

    const beneficiary = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: { id: true, nombre: true, isActive: true },
    });
    if (!beneficiary || beneficiary.isActive === false) {
      throw new BadRequestException('El usuario beneficiario no existe o está inactivo');
    }

    const vehicleId = dto.vehicleId ? Number(dto.vehicleId) : null;
    const categoria = this.normalizeCategory(dto.categoria);
    const resolvedCompanyId = await resolveRequiredCompanyId(
      this.prisma,
      companyId ?? (dto.companyId ? Number(dto.companyId) : null),
    );
    const motivo =
      dto.motivo ??
      dto.concepto ??
      `Viático asignado${actividadId ? ` · OT #${actividadId}` : ''}`;
    if (dto.partes != null) this.revisarPartes(dto.partes, dto.montoSolicitado);

    const viatico = await this.prisma['viatico'].create({
      data: {
        usuarioId,
        actividadId,
        projectId,
        vehicleId,
        companyId: resolvedCompanyId,
        categoria,
        origen: 'ASIGNACION',
        asignadoPorId: Number(actor.id),
        montoSolicitado: dto.montoSolicitado,
        motivo,
        ticketEvidenciaUrl: null,
        approvalStep: 0,
        approvalTrail: [],
        estatus: 'Pendiente',
      },
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true, id: true } },
        project: { select: { id: true, name: true } },
        asignadoPor: { select: { id: true, nombre: true } },
      },
    });

    if (dto.partes != null) {
      await this.persistirReparto(viatico.id, dto.partes, viatico.montoSolicitado, resolvedCompanyId);
    }

    const amount = this.amountOf(viatico);
    const assignerName = actor?.nombre || 'Administración';
    await this.notificationHierarchy.notifyViaticAssignedToUser(
      usuarioId,
      viatico.id,
      assignerName,
      amount,
      motivo,
    );
    await this.notificationHierarchy.notifyViaticRequested(
      usuarioId,
      viatico.id,
      `${beneficiary.nombre} (asignado por ${assignerName})`,
      amount,
    );
    this.domainEvents.requestAutoApproval({
      entityType: 'VIATIC',
      entityId: viatico.id,
      userId: usuarioId,
      companyId: viatico.companyId ?? resolvedCompanyId,
      payload: { amount, outOfPolicy: false, origen: 'ASIGNACION' },
    });

    return viatico;
  }

  /**
   * Asigna el mismo viático a varias personas de una vez.
   *
   * Así se asigna de verdad: la cuadrilla sale el lunes a cubrir las
   * actividades de la semana y se le da gasolina y casetas a los cuatro de
   * golpe. Con el endpoint de uno en uno había que repetir la misma captura
   * una vez por persona, y cada repetición es una ocasión de teclear mal el
   * monto.
   *
   * Dos ejes distintos, que se confunden fácil:
   *   - **beneficiarios** → un viático por cabeza; `montoPorPersona` es lo que
   *     recibe cada uno, no el total del lote.
   *   - **actividades** → un solo viático repartido entre ellas, que es lo que
   *     mantiene honesto el costo por proyecto.
   *
   * Se valida TODO antes de crear nada. Un lote a medias deja a unos con
   * dinero y a otros sin él, y nadie se entera de a quién le faltó hasta que
   * reclama.
   */
  async assignLote(dto: any, actor: any, companyId?: number | null) {
    if (!actor?.id) {
      throw new ForbiddenException('Se requiere autenticación para asignar viáticos');
    }

    const soloIdsValidos = (raw: unknown): number[] => [
      ...new Set((Array.isArray(raw) ? raw : []).map((v) => Number(v))),
    ].filter((id) => Number.isInteger(id) && id > 0);

    const usuarioIds = soloIdsValidos(dto?.usuarioIds);
    if (usuarioIds.length === 0) {
      throw new BadRequestException('Elige al menos un beneficiario.');
    }

    const actividadIds = soloIdsValidos(dto?.actividadIds);
    const projectId = dto?.projectId ? Number(dto.projectId) : null;
    if (actividadIds.length === 0 && !projectId) {
      throw new BadRequestException(
        'La asignación debe ligarse a al menos una actividad o a un proyecto.',
      );
    }

    const tenantId = await resolveRequiredCompanyId(
      this.prisma,
      companyId ?? (dto?.companyId ? Number(dto.companyId) : null),
    );

    // Beneficiarios: que existan, que estén activos y que sean de esta empresa.
    const beneficiarios = await this.prisma.user.findMany({
      where: { id: { in: usuarioIds } },
      select: { id: true, nombre: true, isActive: true },
    });
    const porId = new Map(beneficiarios.map((u) => [u.id, u]));
    const inexistentes = usuarioIds.filter((id) => !porId.has(id));
    if (inexistentes.length > 0) {
      throw new BadRequestException(
        `No encontramos ${inexistentes.length === 1 ? 'al beneficiario' : 'a los beneficiarios'} ` +
          `${inexistentes.map((id) => `#${id}`).join(', ')}.`,
      );
    }
    const inactivos = beneficiarios.filter((u) => u.isActive === false);
    if (inactivos.length > 0) {
      throw new BadRequestException(
        `${inactivos.map((u) => u.nombre).join(', ')} ` +
          `${inactivos.length === 1 ? 'está inactivo' : 'están inactivos'}: ` +
          'quítalo de la lista antes de asignar.',
      );
    }

    // Actividades: de esta empresa. Repartir hacia la actividad de otra
    // empresa sería una fuga de datos disfrazada de contabilidad.
    if (actividadIds.length > 0) {
      const existentes = await this.prisma.activity.findMany({
        where: { id: { in: actividadIds }, ...companyWhere(tenantId) },
        select: { id: true },
      });
      const encontradas = new Set(existentes.map((a) => a.id));
      const faltantes = actividadIds.filter((id) => !encontradas.has(id));
      if (faltantes.length > 0) {
        throw new BadRequestException(
          `No encontramos ${faltantes.length === 1 ? 'la actividad' : 'las actividades'} ` +
            `${faltantes.map((id) => `#${id}`).join(', ')} en tu empresa.`,
        );
      }
    }

    const montoPorPersona = Number(dto?.montoPorPersona);
    if (!Number.isFinite(montoPorPersona) || montoPorPersona <= 0) {
      throw new BadRequestException('El monto por persona debe ser mayor que cero.');
    }

    // Con una sola actividad el viático cuelga de ella, como siempre. Con
    // varias, `actividadId` queda como ancla y el reparto es quien manda.
    const actividadId = actividadIds[0] ?? null;
    const partes =
      actividadIds.length > 1
        ? repartirEnPartesIguales(montoPorPersona, actividadIds)
        : undefined;

    const motivo = this.motivoDeLote(dto, actividadIds.length);

    const creados: any[] = [];
    for (const usuarioId of usuarioIds) {
      creados.push(
        await this.assign(
          {
            usuarioId,
            actividadId,
            projectId,
            vehicleId: dto?.vehicleId ? Number(dto.vehicleId) : null,
            categoria: dto?.categoria,
            montoSolicitado: montoPorPersona,
            motivo,
            partes,
          },
          actor,
          tenantId,
        ),
      );
    }

    return {
      creados: creados.length,
      montoPorPersona,
      montoTotal: Number((montoPorPersona * creados.length).toFixed(2)),
      actividadesCubiertas: actividadIds.length,
      viaticos: creados,
    };
  }

  /**
   * El texto que verá quien lo reciba y quien lo apruebe. Un viático semanal
   * sin decir de qué semana es imposible de conciliar tres meses después.
   */
  private motivoDeLote(dto: any, cuantasActividades: number): string {
    const base = String(dto?.motivo ?? '').trim();
    const periodo = this.periodoLegible(dto?.desde, dto?.hasta);
    const cobertura =
      cuantasActividades > 1 ? `${cuantasActividades} actividades` : null;
    const partes = [base || 'Viático asignado', periodo, cobertura].filter(Boolean);
    return partes.join(' · ').slice(0, 255);
  }

  private periodoLegible(desde?: string, hasta?: string): string | null {
    const dia = (v?: string) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const a = dia(desde);
    const b = dia(hasta);
    if (!a && !b) return null;
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    if (a && b) return `del ${fmt(a)} al ${fmt(b)}`;
    return a ? `desde el ${fmt(a)}` : `hasta el ${fmt(b!)}`;
  }

  /**
   * Sustituye el reparto de un viático. Una lista vacía lo deja sin repartir:
   * vuelve a ser el viático de una sola actividad de toda la vida.
   *
   * Solo hasta que se paga. Después el asiento contable ya salió y mover la
   * imputación cambiaría un P&L que alguien ya firmó.
   */
  async setReparto(id: number, partesRaw: unknown, actor: any, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const viatico = await this.prisma['viatico'].findFirst({
      where: { id, deletedAt: null, ...companyWhere(tenantId) },
      select: { id: true, usuarioId: true, estatus: true, montoSolicitado: true, companyId: true },
    });
    assertCompanyAccess(viatico, tenantId, 'Viático');

    this.assertPuedeTocarSuViatico(viatico, actor, 'repartir');

    if (viatico.estatus === 'Pagado') {
      throw new BadRequestException(
        'Este viático ya se pagó y su costo ya está en la contabilidad. ' +
          'Para cambiar el reparto, pídele a contabilidad una corrección del asiento.',
      );
    }

    const partes = await this.persistirReparto(id, partesRaw, viatico.montoSolicitado, tenantId);
    await this.audit
      .log(
        {
          entityType: 'Viatico',
          entityId: id,
          action: 'SET_REPARTO',
          changes: { partes: partes.length, actividades: partes.map((p) => p.actividadId) },
        },
        actor?.id,
      )
      .catch(() => undefined);

    return this.findOne(id, undefined, tenantId);
  }

  /**
   * Cierra el círculo del anticipo: se entregó un monto, se comprueba con
   * tickets y queda un saldo a favor o en contra.
   *
   * Sin esto solo existía «monto solicitado»: nadie sabía si el dinero volvió.
   */
  async comprobar(
    id: number,
    dto: { montoComprobado: unknown; ticketEvidenciaUrl?: string | null; nota?: string | null },
    actor: any,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const viatico = await this.prisma['viatico'].findFirst({
      where: { id, deletedAt: null, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(viatico, tenantId, 'Viático');

    this.assertPuedeTocarSuViatico(viatico, actor, 'comprobar');

    if (!['Aprobado', 'Pagado'].includes(viatico.estatus)) {
      throw new BadRequestException(
        `Este viático está en «${viatico.estatus}»: todavía no se ha entregado dinero que comprobar. ` +
          'Espera a que se autorice y vuelve a intentarlo.',
      );
    }

    const comprobadoCent = aCentavos(dto.montoComprobado);
    if (!Number.isFinite(comprobadoCent) || comprobadoCent < 0) {
      throw new BadRequestException(
        'Captura cuánto se comprobó con tickets. Si no se gastó nada, captura 0.',
      );
    }

    const entregadoCent = aCentavos(viatico.montoAprobado ?? viatico.montoSolicitado);
    if (comprobadoCent > entregadoCent * 2) {
      throw new BadRequestException(
        'Lo comprobado supera al doble de lo entregado. Revisa la cifra; si de verdad se gastó ' +
          'tanto de más, levanta un viático nuevo por la diferencia en vez de inflar este.',
      );
    }

    const evidencia = typeof dto.ticketEvidenciaUrl === 'string' ? dto.ticketEvidenciaUrl.trim() : '';
    const trailEntry: TrailEntry = {
      role: this.resolveActorRole(actor) ?? 'comprobacion',
      userId: actor?.id ?? 0,
      userName: actor?.nombre ?? 'Comprobación',
      action: 'comprobar',
      at: new Date().toISOString(),
      note:
        (typeof dto.nota === 'string' && dto.nota.trim()) ||
        `Comprobado ${(comprobadoCent / 100).toFixed(2)} de ${(entregadoCent / 100).toFixed(2)}`,
    };
    const trail = appendTrail(viatico.approvalTrail as TrailEntry[] | null, trailEntry);

    const updated = await this.prisma['viatico'].update({
      where: { id },
      data: {
        montoComprobado: comprobadoCent / 100,
        fechaComprobacion: new Date(),
        comprobadoPorId: actor?.id ?? null,
        approvalTrail: trail,
        ...(evidencia ? { ticketEvidenciaUrl: evidencia } : {}),
      },
      include: {
        User: { select: { id: true, nombre: true } },
        repartos: { select: { id: true, actividadId: true, monto: true, nota: true } },
      },
    });

    await this.audit
      .log(
        {
          entityType: 'Viatico',
          entityId: id,
          action: 'COMPROBAR',
          changes: { montoComprobado: comprobadoCent / 100 },
        },
        actor?.id,
      )
      .catch(() => undefined);

    return { ...updated, liquidacion: resumenLiquidacion(updated) };
  }

  /**
   * Quien no administra viáticos solo puede tocar los suyos.
   *
   * No añade permisos: `viatics.manage` sigue siendo lo que habilita operar
   * sobre los de terceros; esto solo evita que `viatics.create` sirva para
   * repartir o comprobar el viático de otra persona.
   */
  private assertPuedeTocarSuViatico(
    viatico: { usuarioId: number },
    actor: any,
    accion: 'repartir' | 'comprobar',
  ) {
    const administra =
      actor?.isSuperAdmin ||
      actor?.permissions?.includes('viatics.manage') ||
      actor?.permissions?.includes('CONSOLE_ADMIN');
    if (administra) return;
    if (Number(viatico.usuarioId) === Number(actor?.id)) return;
    throw new ForbiddenException(
      `Solo puedes ${accion} tus propios viáticos. Este es de otra persona: ` +
        'pídeselo a quien administra viáticos.',
    );
  }

  async findAll(currentUser?: any, query?: PaginationQueryDto, companyId?: number | null) {
    const include = {
      Activity: true,
      User: true,
      project: { select: { id: true, name: true } },
      vehicle: { select: { id: true, nombre: true, placas: true } },
      repartos: {
        select: { id: true, actividadId: true, monto: true, nota: true },
        orderBy: { id: 'asc' as const },
      },
    };
    const where = this.buildListWhere(currentUser, companyId);

    const mapRow = (row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
      liquidacion: resumenLiquidacion(row),
    });

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['viatico'].findMany({
          where,
          include,
          orderBy: { fechaSolicitud: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma['viatico'].count({ where }),
      ]);
      return buildPaginatedResponse(data.map(mapRow), total, query);
    }

    const data = await this.prisma['viatico'].findMany({
      where,
      include,
      orderBy: { fechaSolicitud: 'desc' },
      take: DEFAULT_LIST_TAKE,
    });
    return data.map(mapRow);
  }

  /**
   * Viáticos de una actividad: los que cuelgan de ella y los repartidos que le
   * cargan una parte. Sin lo segundo, una actividad que comparte el viaje se
   * vería «sin viáticos» aunque esté pagando la mitad de la gasolina.
   */
  async findByActivity(actividadId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const data = await this.prisma['viatico'].findMany({
      where: {
        deletedAt: null,
        ...companyWhere(tenantId),
        OR: [{ actividadId }, { repartos: { some: { actividadId } } }],
      },
      include: {
        Activity: true,
        User: true,
        repartos: {
          select: { id: true, actividadId: true, monto: true, nota: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { fechaSolicitud: 'desc' },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
      liquidacion: resumenLiquidacion(row),
      /** Lo que carga ESTA actividad: su parte del reparto, o el total si no hay reparto. */
      montoEnEstaActividad:
        row.repartos?.length > 0
          ? Number(row.repartos.find((p: any) => p.actividadId === actividadId)?.monto ?? 0)
          : this.amountOf(row),
    }));
  }

  async findByAllowedUsers(userIds: number[], companyId?: number | null) {
    if (!userIds?.length) return [];
    const tenantId = requireCompanyId(companyId);
    const data = await this.prisma['viatico'].findMany({
      where: { usuarioId: { in: userIds }, deletedAt: null, ...companyWhere(tenantId) },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
      liquidacion: resumenLiquidacion(row),
    }));
  }

  async findOne(id: number, currentUser?: any, companyId?: number | null) {
    const where = { id, ...this.buildListWhere(currentUser, companyId) };
    const row = await this.prisma['viatico'].findFirst({
      where,
      include: {
        Activity: true,
        User: true,
        project: { select: { id: true, name: true } },
        vehicle: { select: { id: true, nombre: true, placas: true } },
        repartos: {
          select: {
            id: true,
            actividadId: true,
            monto: true,
            nota: true,
            actividad: { select: { id: true, anNumber: true, titulo: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!row && currentUser) {
      const exists = await this.prisma['viatico'].findUnique({ where: { id }, select: { id: true } });
      if (exists) throw new ForbiddenException('No tienes acceso a este viático');
    }
    if (row) assertCompanyAccess(row, companyId, 'Viático');
    return row ? { ...row, liquidacion: resumenLiquidacion(row) } : row;
  }

  async approveOrReject(
    id: number,
    actor: any,
    action: 'approve' | 'reject',
    note?: string,
    companyId?: number | null,
    montoAprobado?: unknown,
  ) {
    const viatico = await this.findOne(id, undefined, companyId);
    if (!viatico) throw new BadRequestException('Viático no encontrado');
    if (['Rechazado', 'Aprobado', 'Pagado'].includes(viatico.estatus)) {
      throw new BadRequestException('Este viático ya fue cerrado');
    }

    const amount = this.amountOf(viatico);

    // Quien autoriza puede recortar la cifra —«te doy 800, no 1,200»—, nunca
    // subirla: eso sería aprobar un gasto que nadie pidió ni revisó.
    let aprobadoCent: number | null = null;
    if (action === 'approve' && montoAprobado != null && montoAprobado !== '') {
      aprobadoCent = aCentavos(montoAprobado);
      const solicitadoCent = aCentavos(amount);
      if (!Number.isFinite(aprobadoCent) || aprobadoCent <= 0) {
        throw new BadRequestException(
          'El monto autorizado tiene que ser mayor que cero. Si no vas a autorizar nada, rechaza la solicitud.',
        );
      }
      if (aprobadoCent > solicitadoCent) {
        throw new BadRequestException(
          `No puedes autorizar más de lo solicitado (${(solicitadoCent / 100).toFixed(2)}). ` +
            'Si hace falta más dinero, que la persona levante otro viático por la diferencia.',
        );
      }
    }
    const chain = buildApprovalChain('viaticos', amount);
    const step = viatico.approvalStep ?? 0;
    const actorRole = this.resolveActorRole(actor);
    const canAct = actor?.isSuperAdmin || canActOnStep(actorRole, step, chain);

    if (!canAct) {
      throw new ForbiddenException('No tienes permisos para autorizar en este paso del flujo');
    }

    const recorte =
      aprobadoCent != null && aprobadoCent !== aCentavos(amount)
        ? `Autoriza ${(aprobadoCent / 100).toFixed(2)} de ${amount.toFixed(2)} solicitados`
        : null;
    const trailEntry: TrailEntry = {
      role: stepRoleAt(chain, step) ?? actorRole ?? 'unknown',
      userId: actor.id,
      userName: actor.nombre,
      action,
      at: new Date().toISOString(),
      note: [note?.trim(), recorte].filter(Boolean).join(' · ') || undefined,
    };
    const trail = appendTrail(viatico.approvalTrail as TrailEntry[] | null, trailEntry);

    // Reclama el registro condicionado a su estatus/paso ya leídos: si otra
    // aprobación/rechazo concurrente ya lo movió, esta actualización afecta 0
    // filas en vez de aplicarse igual sobre un estado obsoleto y duplicar el
    // avance del flujo (p. ej. dos clics rápidos en "Aprobar").
    const claimWhere = { id, estatus: viatico.estatus, approvalStep: viatico.approvalStep };

    if (action === 'reject') {
      const claim = await this.prisma['viatico'].updateMany({
        where: claimWhere,
        data: { estatus: 'Rechazado', approvalTrail: trail },
      });
      if (claim.count === 0) throw new BadRequestException('Este viático ya fue actualizado por otra solicitud');
      const updated = await this.prisma['viatico'].findUnique({
        where: { id },
        include: { User: { select: { id: true, nombre: true } } },
      });
      if (updated?.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'rejected', 0);
      }
      await this.audit
        .log({ entityType: 'Viatico', entityId: id, action: 'REJECT', changes: { note } }, actor?.id)
        .catch(() => undefined);
      return updated;
    }

    const nextStep = step + 1;
    if (isTerminalApproved(nextStep, chain)) {
      const contabilidadRef = `VIAT-${id}-${new Date().toISOString().slice(0, 10)}`;
      const claim = await this.prisma['viatico'].updateMany({
        where: claimWhere,
        data: {
          approvalStep: nextStep,
          approvalTrail: trail,
          estatus: 'Aprobado',
          contabilidadRef,
          // Se sella lo entregado. Sin esto no hay contra qué comprobar los
          // tickets después: solo quedaría lo que alguien pidió, no lo que se dio.
          montoAprobado: (aprobadoCent ?? aCentavos(amount)) / 100,
        },
      });
      if (claim.count === 0) throw new BadRequestException('Este viático ya fue actualizado por otra solicitud');
      const updated = await this.prisma['viatico'].findUnique({
        where: { id },
        include: {
          User: { select: { id: true, nombre: true } },
          Activity: { select: { anNumber: true } },
        },
      });
      if (updated?.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'approved', amount);
      }
      await this.audit
        .log({ entityType: 'Viatico', entityId: id, action: 'APPROVE', changes: { contabilidadRef } }, actor?.id)
        .catch(() => undefined);
      return updated;
    }

    const claim = await this.prisma['viatico'].updateMany({
      where: claimWhere,
      data: { approvalStep: nextStep, approvalTrail: trail, estatus: 'Pendiente' },
    });
    if (claim.count === 0) throw new BadRequestException('Este viático ya fue actualizado por otra solicitud');
    await this.audit
      .log(
        { entityType: 'Viatico', entityId: id, action: 'APPROVE_STEP', changes: { nextStep } },
        actor?.id,
      )
      .catch(() => undefined);
    return this.prisma['viatico'].findUnique({
      where: { id },
      include: { User: { select: { id: true, nombre: true } } },
    });
  }

  async markPagado(id: number, actorId?: number, companyId?: number | null) {
    const viatico = await this.findOne(id, undefined, companyId);
    if (!viatico || viatico.estatus !== 'Aprobado') {
      throw new BadRequestException('Solo viáticos aprobados por CEO pueden marcarse como pagados');
    }

    let journalEntryId = viatico.journalEntryId as number | null | undefined;
    let contabilidadRef = viatico.contabilidadRef as string | null | undefined;
    if (!journalEntryId && actorId) {
      const entry = await this.accounting.postOperationalDisbursement({
        kind: 'viatic',
        entityId: id,
        // Se contabiliza lo autorizado, no lo pedido: si el jefe recortó la
        // cifra, la póliza tiene que salir por lo que de verdad se entregó.
        amount: this.amountOf({
          montoSolicitado: viatico.montoAprobado ?? viatico.montoSolicitado,
        }),
        date: viatico.fechaSolicitud,
        description: `Pago viático #${id}: ${viatico.motivo || viatico.categoria || 'Viático'}`,
        userId: actorId,
        // Sin la empresa, la póliza automática fallaba con 403 al contabilizarse
        // y "marcar pagado" reventaba entero.
        companyId: companyId ?? viatico.companyId,
      });
      journalEntryId = entry.id;
      contabilidadRef = entry.entryNumber;
    }

    const updated = await this.prisma['viatico'].update({
      where: { id },
      data: {
        estatus: 'Pagado',
        journalEntryId: journalEntryId ?? undefined,
        contabilidadRef: contabilidadRef || `VIAT-${id}-${new Date().toISOString().slice(0, 10)}`,
      },
      include: { User: { select: { id: true, nombre: true } }, journalEntry: true },
    });
    await this.audit
      .log(
        {
          entityType: 'Viatico',
          entityId: id,
          action: 'MARK_PAID',
          changes: { journalEntryId, contabilidadRef },
        },
        actorId,
      )
      .catch(() => undefined);
    return updated;
  }

  async update(id: number, dto: any, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const currentViatico = await this.prisma['viatico'].findFirst({
      where: { id, deletedAt: null, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(currentViatico, tenantId, 'Viático');

    // Solo campos editables — estatus/approval/usuarioId solo vía approve/pagado.
    const allowed = [
      'categoria',
      'motivo',
      'montoSolicitado',
      'ticketEvidenciaUrl',
      'projectId',
      'actividadId',
      'vehicleId',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (data.categoria !== undefined) {
      data.categoria = this.normalizeCategory(data.categoria as string | null | undefined);
    }
    if (data.vehicleId !== undefined) {
      data.vehicleId = data.vehicleId ? Number(data.vehicleId) : null;
    }
    if (data.projectId !== undefined) {
      data.projectId = data.projectId ? Number(data.projectId) : null;
    }
    if (data.actividadId !== undefined) {
      data.actividadId = data.actividadId ? Number(data.actividadId) : null;
    }

    const nextActividadId =
      data.actividadId !== undefined
        ? (data.actividadId as number | null)
        : currentViatico.actividadId;
    const nextProjectId =
      data.projectId !== undefined
        ? (data.projectId as number | null)
        : currentViatico.projectId;
    if (!nextActividadId && !nextProjectId) {
      throw new BadRequestException(
        'La solicitud debe ligarse a una actividad o a un proyecto.',
      );
    }

    // Cambiar el total deja el reparto descuadrado. Antes de escribir nada, o
    // llega un reparto nuevo que cuadre, o se avisa: si no, el costo repartido
    // dejaría de sumar lo que cuesta el viaje y nadie lo notaría hasta el cierre.
    const nuevoTotal =
      data.montoSolicitado !== undefined ? data.montoSolicitado : currentViatico.montoSolicitado;
    if (dto.partes !== undefined) {
      // Se valida antes de tocar nada para que un reparto malo no deje el monto
      // ya cambiado y el reparto viejo colgando.
      this.revisarPartes(dto.partes, nuevoTotal);
    } else if (data.montoSolicitado !== undefined) {
      const repartos = await this.prisma.viaticoReparto.findMany({
        where: { viaticoId: id, ...companyWhere(tenantId) },
        select: { actividadId: true, monto: true, nota: true },
      });
      if (repartos.length > 0) {
        const veredicto = validarReparto(
          repartos.map((r) => ({
            actividadId: r.actividadId,
            monto: Number(r.monto),
            nota: r.nota,
          })),
          nuevoTotal,
        );
        if (!veredicto.ok) {
          throw new BadRequestException(
            `${veredicto.mensaje} Este viático está repartido entre ${repartos.length} actividades: ` +
              'ajusta el reparto en el mismo guardado.',
          );
        }
      }
    }

    const actualizado = await this.prisma['viatico'].update({
      where: { id },
      data,
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true } },
      },
    });

    if (dto.partes !== undefined) {
      await this.persistirReparto(id, dto.partes, nuevoTotal, tenantId);
    }

    return actualizado;
  }

  async remove(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.prisma['viatico'].findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(existing, tenantId, 'Viático');
    return this.prisma['viatico'].delete({ where: { id } });
  }

  async analytics(
    filters: { from?: string; to?: string; projectId?: number },
    currentUser?: any,
    companyId?: number | null,
  ) {
    // `buildListWhere` sin empresa cae en deny-all (`companyId: -1`) y el
    // panel salía en ceros para todo el mundo. La empresa viaja desde el
    // controlador como en el resto del módulo.
    const where: Record<string, unknown> = { ...this.buildListWhere(currentUser, companyId) };
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.from || filters.to) {
      where.fechaSolicitud = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }

    const rows = await this.prisma['viatico'].findMany({
      where,
      include: {
        User: { select: { id: true, nombre: true } },
        project: { select: { id: true, name: true } },
        repartos: { select: { actividadId: true, monto: true } },
      },
      orderBy: { fechaSolicitud: 'desc' },
      take: 5000,
    });

    // Los repartos apuntan a actividades; el desglose por proyecto habla de
    // proyectos comerciales. Se resuelve el puente de una vez para todas las
    // filas en lugar de una consulta por viático.
    const idsActividadRepartida = [
      ...new Set(
        rows.flatMap((r: any) => (r.repartos ?? []).map((p: any) => p.actividadId as number)),
      ),
    ];
    const proyectoDeActividad = new Map<number, { id: number; name: string }>();
    if (idsActividadRepartida.length > 0) {
      const actividades = await this.prisma.activity.findMany({
        where: {
          id: { in: idsActividadRepartida },
          ...companyWhere(companyId ?? null),
        },
        select: {
          id: true,
          project: { select: { salesProject: { select: { id: true, name: true } } } },
        },
      });
      for (const a of actividades) {
        const sp = a.project?.salesProject;
        if (sp) proyectoDeActividad.set(a.id, { id: sp.id, name: sp.name });
      }
    }

    const sumMap = () => new Map<string, { name: string; total: number; count: number }>();
    const byProject = sumMap();
    const byPerson = sumMap();
    const byCategory = sumMap();
    let totalSolicitado = 0;
    let totalAprobado = 0;
    let totalPagado = 0;
    let pendientes = 0;

    for (const row of rows) {
      const amount = this.amountOf(row);
      totalSolicitado += amount;
      if (row.estatus === 'Aprobado') totalAprobado += amount;
      if (row.estatus === 'Pagado') {
        totalPagado += amount;
        totalAprobado += amount;
      }
      if (row.estatus === 'Pendiente') pendientes += 1;

      const spendStatuses = ['Aprobado', 'Pagado', 'Pendiente'];
      if (!spendStatuses.includes(row.estatus)) continue;

      // Un viático repartido no es de un proyecto: es de varios, en la
      // proporción que se pactó. Cargarlo entero al primero era la mentira que
      // este reparto viene a arreglar.
      const tramos: { key: string; name: string; monto: number }[] =
        row.repartos?.length > 0
          ? row.repartos.map((parte: any) => {
              const proyecto = proyectoDeActividad.get(parte.actividadId);
              return {
                key: proyecto ? String(proyecto.id) : 'sin-proyecto',
                name: proyecto?.name || 'Sin proyecto',
                monto: Number(parte.monto) || 0,
              };
            })
          : [
              {
                key: row.projectId ? String(row.projectId) : 'sin-proyecto',
                name: row.project?.name || 'Sin proyecto',
                monto: amount,
              },
            ];
      for (const tramo of tramos) {
        const p = byProject.get(tramo.key) ?? { name: tramo.name, total: 0, count: 0 };
        p.total += tramo.monto;
        p.count += 1;
        byProject.set(tramo.key, p);
      }

      const uKey = String(row.usuarioId);
      const uName = row.User?.nombre || `Usuario #${row.usuarioId}`;
      const u = byPerson.get(uKey) ?? { name: uName, total: 0, count: 0 };
      u.total += amount;
      u.count += 1;
      byPerson.set(uKey, u);

      const cKey = row.categoria || 'OTROS';
      const c = byCategory.get(cKey) ?? { name: cKey, total: 0, count: 0 };
      c.total += amount;
      c.count += 1;
      byCategory.set(cKey, c);
    }

    const sortDesc = (a: { total: number }, b: { total: number }) => b.total - a.total;

    return {
      from: filters.from ?? null,
      to: filters.to ?? null,
      projectId: filters.projectId ?? null,
      totals: {
        count: rows.length,
        pendientes,
        totalSolicitado,
        totalAprobado,
        totalPagado,
      },
      byProject: [...byProject.values()].sort(sortDesc),
      byPerson: [...byPerson.values()].sort(sortDesc),
      byCategory: [...byCategory.values()].sort(sortDesc),
    };
  }

  async reportPdf(
    filters: { from?: string; to?: string; projectId?: number },
    preparedBy?: string | null,
    currentUser?: any,
    companyId?: number | null,
  ) {
    const analytics = await this.analytics(filters, currentUser, companyId);
    const where: Record<string, unknown> = { ...this.buildListWhere(currentUser, companyId) };
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.from || filters.to) {
      where.fechaSolicitud = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }
    const rows = await this.prisma['viatico'].findMany({
      where,
      include: {
        User: { select: { nombre: true } },
        project: { select: { name: true } },
      },
      orderBy: { fechaSolicitud: 'desc' },
      take: 200,
    });

    const periodLabel =
      filters.from || filters.to
        ? `Periodo: ${filters.from || '…'} → ${filters.to || '…'}`
        : 'Periodo: todos los registros';

    return generateViaticsReportPdf({
      title: 'Control de viáticos',
      periodLabel,
      generatedAt: new Date().toLocaleString('es-MX'),
      preparedBy,
      currency: 'MXN',
      totalSolicitado: analytics.totals.totalSolicitado,
      totalAprobado: analytics.totals.totalAprobado,
      totalPagado: analytics.totals.totalPagado,
      byProject: analytics.byProject,
      byPerson: analytics.byPerson,
      byCategory: analytics.byCategory,
      rows: rows.map((r) => ({
        id: r.id,
        fecha: r.fechaSolicitud
          ? new Date(r.fechaSolicitud).toLocaleDateString('es-MX')
          : '—',
        solicitante: r.User?.nombre || '—',
        proyecto: r.project?.name || '—',
        categoria: r.categoria || 'OTROS',
        monto: this.amountOf(r),
        estatus: r.estatus,
        contabilidadRef: r.contabilidadRef || '—',
        motivo: r.motivo || '',
      })),
    });
  }

  /** Aprobación vía workflow — idempotente si ya no está pendiente. */
  async onWorkflowApproved(id: number, companyId: number, actorId?: number) {
    const viatico = await this.prisma['viatico'].findFirst({
      where: { id, estatus: 'Pendiente', ...companyWhere(companyId) },
    });
    if (!viatico) return;

    const contabilidadRef = `VIAT-${id}-${new Date().toISOString().slice(0, 10)}`;
    const claim = await this.prisma['viatico'].updateMany({
      where: { id, estatus: 'Pendiente' },
      data: {
        estatus: 'Aprobado',
        contabilidadRef,
        // Igual que en la aprobación manual: sin monto aprobado no hay contra
        // qué comprobar los tickets.
        montoAprobado: viatico.montoAprobado ?? viatico.montoSolicitado,
      },
    });
    if (claim.count === 0) return;

    const updated = await this.prisma['viatico'].findUnique({
      where: { id },
      include: { User: { select: { id: true, nombre: true } } },
    });
    if (updated?.usuarioId) {
      const amount = this.amountOf(updated);
      await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'approved', amount);
    }
    await this.audit
      .log({ entityType: 'Viatico', entityId: id, action: 'APPROVE_WORKFLOW' }, actorId)
      .catch(() => undefined);
  }

  async onWorkflowRejected(id: number, companyId: number, actorId?: number, note?: string) {
    const viatico = await this.findOne(id, undefined, companyId);
    if (!viatico || ['Rechazado', 'Aprobado', 'Pagado'].includes(viatico.estatus)) return;

    const trailEntry: TrailEntry = {
      role: 'workflow',
      userId: actorId ?? 0,
      userName: 'Workflow',
      action: 'reject',
      at: new Date().toISOString(),
      note: note?.trim() || 'Rechazado en flujo de aprobación',
    };
    const trail = appendTrail(viatico.approvalTrail as TrailEntry[] | null, trailEntry);

    const claim = await this.prisma['viatico'].updateMany({
      where: { id, estatus: viatico.estatus },
      data: { estatus: 'Rechazado', approvalTrail: trail },
    });
    if (claim.count === 0) return;

    if (viatico.usuarioId) {
      void this.notificationHierarchy
        .notifyViaticReview(viatico.usuarioId, id, 'rejected', 0)
        .catch(() => undefined);
    }
    await this.audit
      .log({ entityType: 'Viatico', entityId: id, action: 'REJECT', changes: { note } }, actorId)
      .catch(() => undefined);
  }
}
