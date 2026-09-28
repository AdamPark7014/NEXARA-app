import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService, esAprobadorDeRespaldo } from './workflow.service.js';
import {
  APPROVAL_THRESHOLDS_SETTING_KEY,
  ENTITY_TYPE_DE_TOPE,
  ETIQUETA_TOPE,
  mensajeDeAutorizacion,
  parsearUmbrales,
  requiereAutorizacion,
  type TipoConTope,
  type UmbralesAprobacion,
} from './approval-thresholds.js';

const TTL_MS = 30_000;

export type PeticionTope = {
  tipo: TipoConTope;
  entityId: number;
  monto: number;
  /** Quien intenta enviar/aprobar. Sin él (tareas del sistema) no se exige nada. */
  actorId?: number | null;
  companyId: number;
};

/**
 * Exige la autorización de dirección cuando el monto supera el tope de la empresa.
 *
 *  · Sin tope configurado, o monto menor: no hace nada.
 *  · Si quien actúa ya es de dirección (puede decidir cualquier paso): tampoco; para eso es dirección.
 *  · Si la autorización ya se dio: pasa.
 *  · Si no: pide la autorización (aviso a dirección con el importe, pendiente en su bandeja) y responde
 *    409 con un mensaje claro. Pedirla dos veces no duplica solicitudes.
 */
@Injectable()
export class ApprovalThresholdService {
  private readonly logger = new Logger(ApprovalThresholdService.name);
  private readonly cache = new Map<number, { at: number; umbrales: UmbralesAprobacion }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
  ) {}

  async umbrales(companyId: number): Promise<UmbralesAprobacion> {
    const previo = this.cache.get(companyId);
    if (previo && Date.now() - previo.at < TTL_MS) return previo.umbrales;
    const filas = await this.prisma.systemSetting.findMany({
      where: { key: APPROVAL_THRESHOLDS_SETTING_KEY, OR: [{ companyId: null }, { companyId }] },
      select: { companyId: true, value: true },
    });
    const propia = filas.find((f) => f.companyId === companyId) ?? filas.find((f) => f.companyId == null);
    const umbrales = parsearUmbrales(propia?.value);
    this.cache.set(companyId, { at: Date.now(), umbrales });
    return umbrales;
  }

  invalidar(companyId?: number): void {
    if (companyId == null) this.cache.clear();
    else this.cache.delete(companyId);
  }

  async exigir(p: PeticionTope): Promise<void> {
    if (p.actorId == null || !Number.isFinite(Number(p.actorId))) return;
    const umbrales = await this.umbrales(p.companyId);
    if (!requiereAutorizacion(umbrales, p.tipo, p.monto)) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: Number(p.actorId) },
      select: { roleKey: true, role: { select: { nombre: true, accesoConsoleAdmin: true } } },
    });
    if (esAprobadorDeRespaldo(actor)) return;

    const entityType = ENTITY_TYPE_DE_TOPE[p.tipo];

    // ¿Ya la autorizó dirección?
    const autorizada = await this.prisma.workflowInstance.findFirst({
      where: { companyId: p.companyId, entityType, entityId: p.entityId, isComplete: true, isCancelled: false },
      select: { id: true },
    });
    if (autorizada) return;

    // ¿Ya hay una solicitud abierta? (`requestApproval` no duplica; esto solo cambia el mensaje.)
    const abierta = await this.prisma.workflowInstance.findFirst({
      where: { companyId: p.companyId, entityType, entityId: p.entityId, isComplete: false, isCancelled: false },
      select: { id: true },
    });

    if (!abierta) {
      try {
        await this.asegurarDefinicion(p.tipo, entityType, p.companyId);
        await this.workflow.requestApproval({
          entityType,
          entityId: p.entityId,
          startedById: Number(p.actorId),
          companyId: p.companyId,
        });
      } catch (error) {
        // Sin poder pedirla, igual no se deja pasar: el mensaje dice qué hacer.
        this.logger.warn(
          `No se pudo pedir la autorización de ${p.tipo} #${p.entityId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new ConflictException(
          `${ETIQUETA_TOPE[p.tipo]} supera el tope de aprobación de esta empresa y no se pudo pedir la autorización a dirección. Avísale a dirección.`,
        );
      }
    }

    throw new ConflictException(mensajeDeAutorizacion(p.tipo, p.monto, Boolean(abierta)));
  }

  /** El flujo de OC ya viene sembrado; el de cotizaciones por monto se crea la primera vez. */
  private async asegurarDefinicion(tipo: TipoConTope, entityType: string, companyId: number): Promise<void> {
    const existente = await this.prisma.workflowDefinition.findFirst({
      where: { companyId, entityType, status: 'ACTIVE' },
      select: { id: true },
    });
    if (existente || tipo === 'PURCHASE_ORDER') return;
    await this.workflow.createDefinition(
      {
        name: 'Autorización de dirección por monto · Cotización',
        description: 'Se crea sola cuando una cotización supera el tope de aprobación de la empresa.',
        entityType,
        steps: [{ stepNumber: 1, name: 'Autorización de dirección' }],
      },
      companyId,
    );
  }
}
