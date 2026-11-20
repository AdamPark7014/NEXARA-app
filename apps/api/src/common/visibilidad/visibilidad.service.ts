import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { companyWhere } from '../tenant/tenant-scope.js';
import {
  CLAVE_INTERRUPTOR,
  fijarCompartimentada,
  reglasActivas,
  esSuperAdmin,
  puedeVerDeAutor,
  usuariosBajoMiMando,
  whereCotizacionesVisibles,
  type Actor,
} from './visibilidad.js';

/**
 * La política de `visibilidad.ts` con acceso a la base: carga el organigrama de la empresa y comprueba
 * cotizaciones por id. Todo filtra EN la consulta; lo que no se ve responde 404, no 403.
 */
@Injectable()
export class VisibilidadService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Visibilidad');
  private reloj?: ReturnType<typeof setInterval>;
  private leidoAt = 0;
  static readonly CACHE_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refrescarInterruptor();
    this.reloj = setInterval(() => void this.refrescarInterruptor(), VisibilidadService.CACHE_MS);
    this.reloj.unref?.();
  }

  onModuleDestroy() {
    if (this.reloj) clearInterval(this.reloj);
  }

  /** Lee `visibilidad.compartimentada` (cualquier renglón con valor «true» lo prende). Falla = se queda como estaba. */
  async refrescarInterruptor(): Promise<boolean> {
    try {
      const fila = await this.prisma.systemSetting.findFirst({
        where: { key: CLAVE_INTERRUPTOR, value: { in: ['true', '1', 'si', 'sí'] } },
        select: { id: true },
      });
      const antes = reglasActivas();
      fijarCompartimentada(Boolean(fila));
      if (antes !== reglasActivas()) this.logger.log(`Quién ve qué: ${reglasActivas() ? 'PRENDIDO' : 'apagado'}`);
      this.leidoAt = Date.now();
    } catch (e) {
      this.logger.warn(`No se pudo leer ${CLAVE_INTERRUPTOR}: ${String((e as Error)?.message ?? e)}`);
    }
    return reglasActivas();
  }

  /** El interruptor con caché corta (para rutas que deciden en el momento). */
  async activas(): Promise<boolean> {
    if (Date.now() - this.leidoAt > VisibilidadService.CACHE_MS) await this.refrescarInterruptor();
    return reglasActivas();
  }

  /** Ids de la gente bajo el mando del actor en la empresa (sin el actor). */
  async bajoMiMando(actor: Actor, companyId?: number | null): Promise<Set<number>> {
    if (!actor?.id) return new Set();
    const personas = await this.prisma.user.findMany({
      where: companyId != null ? { companyMemberships: { some: { companyId } } } : {},
      select: { id: true, managerId: true, roleKey: true, isActive: true },
    });
    return usuariosBajoMiMando(actor.id, personas);
  }

  /**
   * Ids de autores cuyas evidencias puede ver el actor (él y su gente), o `null` = todas (superadmin).
   */
  async autoresVisibles(actor: Actor, companyId?: number | null): Promise<number[] | null> {
    if (!(await this.activas())) return null;
    if (esSuperAdmin(actor)) return null;
    if (!actor?.id) return [];
    return [actor.id, ...(await this.bajoMiMando(actor, companyId))];
  }

  /** Filtro de Prisma por autor (`userId`) para evidencias y lo que cuelga de quien lo subió. */
  async whereAutorVisible(actor: Actor, companyId?: number | null, campo = 'userId'): Promise<Record<string, unknown>> {
    const ids = await this.autoresVisibles(actor, companyId);
    return ids === null ? {} : { [campo]: { in: ids } };
  }

  /** ¿Puede ver lo de este autor? (para filas ya leídas). */
  async puedeVerAutor(actor: Actor, autorId: number, companyId?: number | null): Promise<boolean> {
    if (esSuperAdmin(actor)) return true;
    if (!actor?.id) return false;
    if (autorId === actor.id) return true;
    return puedeVerDeAutor(actor, autorId, await this.bajoMiMando(actor, companyId));
  }

  /**
   * ¿Puede ver la evidencia de esta actividad? Superadmin, o si quien participa (responsable, equipo o
   * quien subió evidencia) es él o su gente hacia abajo. Si no, 404.
   */
  async assertEvidenciaDeActividadVisible(activityId: number, actor: Actor, companyId?: number | null): Promise<number[] | null> {
    const autores = await this.autoresVisibles(actor, companyId);
    if (autores === null) return null;
    const fila = await this.prisma.activity.findFirst({
      where: {
        id: activityId,
        ...(companyId != null ? { companyId } : {}),
        OR: [
          { responsableId: { in: autores } },
          { assignees: { some: { userId: { in: autores } } } },
          { activityEvidences: { some: { userId: { in: autores } } } },
        ],
      },
      select: { id: true },
    });
    if (!fila) throw new NotFoundException('Evidencias no encontradas');
    return autores;
  }

  whereCotizaciones(actor: Actor, companyId?: number | null): Prisma.CotizacionWhereInput {
    return { AND: [companyWhere(companyId ?? null) as Prisma.CotizacionWhereInput, whereCotizacionesVisibles(actor)] };
  }

  /** ¿Existe y la ve? Si no, 404 (no se distingue «no existe» de «no es tuya»). */
  async assertCotizacionVisible(id: number, actor: Actor, companyId?: number | null): Promise<void> {
    // Apagado: como antes, cada servicio decide (no se agrega ninguna consulta).
    if (!(await this.activas())) return;
    if (!Number.isSafeInteger(id) || id <= 0) throw new NotFoundException('Cotización no encontrada');
    const fila = await this.prisma.cotizacion.findFirst({
      where: { AND: [{ id }, this.whereCotizaciones(actor, companyId)] },
      select: { id: true },
    });
    if (!fila) throw new NotFoundException('Cotización no encontrada');
  }

  /** Ids de cotizaciones visibles (para recortar listas que vienen de otro módulo). */
  async idsCotizacionesVisibles(actor: Actor, companyId?: number | null): Promise<number[] | null> {
    if (whereCotizacionesVisibles(actor) && Object.keys(whereCotizacionesVisibles(actor)).length === 0) return null;
    const filas = await this.prisma.cotizacion.findMany({
      where: this.whereCotizaciones(actor, companyId),
      select: { id: true },
    });
    return filas.map((f) => f.id);
  }
}
