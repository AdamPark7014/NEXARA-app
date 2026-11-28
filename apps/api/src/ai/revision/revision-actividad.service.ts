import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { limiteDeEntrega } from '../../activities/semaforo-actividad.js';
import {
  hechosDe,
  peticionRevision,
  salidaSegura,
  type DatosRevision,
  type Hecho,
  type SalidaRevision,
} from './revision-actividad.js';

/** Lo que lee quien pide «Revisar con IA» cuando la IA no está o no respondió: una frase, sin detalles técnicos. */
export const AVISO_SIN_IA = 'La IA no está disponible por ahora: se muestran solo los hechos.';

export type ResultadoRevision = {
  hechos: Hecho[];
  /** null si la IA no está configurada o falló: los hechos siguen sirviendo. */
  ia: SalidaRevision | null;
  avisoIa: string | null;
};

/**
 * «Revisar con IA» en la ficha de una actividad. Solo lee: ni cambia la calificación ni guarda la
 * opinión. Lo pide quien califica evidencias (la regla está en el controlador).
 */
@Injectable()
export class RevisionActividadService {
  private readonly logger = new Logger('RevisionActividad');

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async datos(activityId: number, companyId: number): Promise<DatosRevision> {
    const a = await this.prisma.activity.findFirst({
      where: { id: activityId, companyId, deletedAt: null },
      select: {
        titulo: true,
        coreKind: true,
        ticketType: true,
        ticketTypeCustom: true,
        indicaciones: true,
        estatus: true,
        fechaInicio: true,
        fechaMaxima: true,
        fechaEntregaEsperada: true,
        periodoInicio: true,
        periodoFin: true,
        fechaFinalizacion: true,
        tiempoEstimadoMin: true,
        activityEvidences: { select: { status: true, completedAt: true, evidencePhotos: true } },
        evidenceFields: { select: { nombre: true, momentos: true, fotos: { select: { momento: true } } }, orderBy: { orden: 'asc' } },
        incidents: { select: { tipo: true, severidad: true, descripcion: true, resueltoAt: true }, orderBy: { createdAt: 'asc' } },
        evidenceReviews: {
          select: { decision: true, score: true, notes: true, reviewer: { select: { nombre: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!a) throw new NotFoundException('Actividad no encontrada');
    const entregas = a.activityEvidences
      .filter((e) => e.status === 'COMPLETED' && e.completedAt)
      .map((e) => e.completedAt!.getTime());
    const entregadaAt = entregas.length ? new Date(Math.max(...entregas)) : a.fechaFinalizacion ?? null;
    const r = a.evidenceReviews[0];
    return {
      titulo: a.titulo,
      tipo: a.coreKind ?? null,
      subtipo: a.coreKind === 'tarea' ? a.ticketTypeCustom ?? null : a.coreKind === 'servicio' ? a.ticketType ?? null : null,
      indicaciones: a.indicaciones ?? null,
      estatus: a.estatus,
      limite: limiteDeEntrega(a),
      entregadaAt,
      tiempoEstimadoMin: a.tiempoEstimadoMin ?? null,
      minutosReales: null,
      campos: a.evidenceFields.map((c) => ({
        nombre: c.nombre,
        pedidos: c.momentos.length,
        subidos: new Set(c.fotos.map((f) => f.momento).filter((m) => c.momentos.includes(m))).size,
      })),
      fotosLibres: a.activityEvidences.reduce((s, e) => s + (e.evidencePhotos?.length ?? 0), 0),
      incidencias: a.incidents.map((i) => ({
        tipo: String(i.tipo),
        severidad: String(i.severidad),
        descripcion: i.descripcion ?? '',
        resuelta: Boolean(i.resueltoAt),
      })),
      revision: r ? { decision: r.decision, calificacion: r.score ?? null, nota: r.notes ?? '', revisor: r.reviewer?.nombre ?? null } : null,
    };
  }

  async revisar(activityId: number, companyId: number): Promise<ResultadoRevision> {
    const datos = await this.datos(activityId, companyId);
    const hechos = hechosDe(datos);
    if (!this.claude.disponible()) return { hechos, ia: null, avisoIa: AVISO_SIN_IA };
    try {
      const { datos: salida } = await this.claude.json<SalidaRevision>({
        proceso: 'revision-actividad',
        companyId,
        ...peticionRevision(datos, hechos),
      });
      return { hechos, ia: salidaSegura(salida), avisoIa: null };
    } catch (e) {
      // La persona lee una frase fija; el detalle de la excepción solo va al log (antes se pegaba entre paréntesis).
      this.logger.warn(`[revision-actividad] sin respuesta de la IA: ${(e as Error).message}`);
      return { hechos, ia: null, avisoIa: AVISO_SIN_IA };
    }
  }
}
