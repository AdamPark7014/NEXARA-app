import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { ClaudeService } from '../claude/claude.service.js';
import { limpiarComplejidad, peticionComplejidad, type SugerenciaComplejidad } from './complejidad-ia.js';
import { reglaDe } from '../estandar/tabla-estandar.js';
import {
  SIN_TIEMPOS,
  agruparTiempos,
  claveDeTipo,
  subtipoDeTarea,
  type FilaTiempo,
  type TiemposTipicos,
} from './tiempos-tipicos.js';

/**
 * La semana del 14-09 es la demo sembrada (lote `semana-2026-09-14`): sus tiempos no son reales.
 * Los tiempos típicos se miden desde la semana siguiente.
 */
const DESDE_OPERACION_REAL = new Date('2026-09-21T06:00:00Z');
/** Ventana de lo «típico»: los últimos 120 días. */
const VENTANA_DIAS = 120;
/** Las medianas cambian despacio: una consulta por empresa cada 10 minutos basta. */
const CACHE_MS = 10 * 60_000;

export type ConsultaTipo = { coreKind?: string | null; tipo?: string | null };
export type RespuestaTiempos = TiemposTipicos & { clave: string | null };

@Injectable()
export class ComplejidadService {
  private readonly logger = new Logger('Complejidad');
  private readonly cache = new Map<number, { hasta: number; datos: Map<string, TiemposTipicos> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /** Tiempo típico del tipo de trabajo: en total y por complejidad. */
  async tiempos(companyId: number | null, consulta: ConsultaTipo): Promise<RespuestaTiempos> {
    const tenantId = requireCompanyId(companyId);
    const clave = claveDeTipo({ coreKind: consulta.coreKind, ticketType: consulta.tipo, ticketTypeCustom: consulta.tipo });
    if (!clave) return { clave: null, ...SIN_TIEMPOS };
    const porTipo = await this.porTipo(tenantId);
    return { clave, ...(porTipo.get(clave) ?? SIN_TIEMPOS) };
  }

  /**
   * Sugerencia de la IA. Si no hay IA o falla, no hay sugerencia (la web lo calla): elegir la
   * complejidad nunca depende de que responda.
   */
  async sugerir(
    companyId: number | null,
    body: { coreKind?: string | null; tipo?: string | null; titulo?: string | null; indicaciones?: string | null },
  ): Promise<{ sugerencia: SugerenciaComplejidad | null }> {
    const tenantId = requireCompanyId(companyId);
    const titulo = String(body.titulo ?? '').trim();
    if (titulo.length < 6 || !this.claude.disponible()) return { sugerencia: null };
    try {
      const regla = reglaDe({ coreKind: body.coreKind, ticketType: body.tipo, ticketTypeCustom: body.tipo });
      const seCuenta = regla?.unidades.map((x) => x.plural).join(' o ') || null;
      const { datos } = await this.claude.json<SugerenciaComplejidad>({
        ...peticionComplejidad({ tipo: tipoLegible(body.coreKind, body.tipo), seCuenta, titulo, indicaciones: body.indicaciones }),
        proceso: 'complejidad',
        companyId: tenantId,
      });
      return { sugerencia: limpiarComplejidad(datos) };
    } catch (error) {
      this.logger.warn(`sin sugerencia: ${(error as Error).message}`);
      return { sugerencia: null };
    }
  }

  private async porTipo(companyId: number): Promise<Map<string, TiemposTipicos>> {
    const enCache = this.cache.get(companyId);
    if (enCache && enCache.hasta > Date.now()) return enCache.datos;
    const desde = new Date(Math.max(DESDE_OPERACION_REAL.getTime(), Date.now() - VENTANA_DIAS * 86_400_000));
    // Reloj de cada persona en cada actividad terminada (o por validar). Se descartan las que el
    // sistema cortó solo (tope de 12 h o cierre del día): ahí el reloj siguió sin trabajo.
    const filas = await this.prisma.$queryRaw<FilaTiempo[]>(Prisma.sql`
      WITH ses AS (
        SELECT s."activityId", s."userId",
               SUM(EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) / 60.0)::float8 AS minutos,
               BOOL_OR(s."endReason" IN ('TOPE_12H', 'CORTE_DIA')) AS cortada
        FROM activity_work_sessions s
        WHERE s."companyId" = ${companyId} AND s."endedAt" IS NOT NULL AND s."startedAt" >= ${desde}
        GROUP BY 1, 2
      )
      SELECT a."coreKind", a."ticketType"::text AS "ticketType", a."ticketTypeCustom", a."complejidad", ses.minutos
      FROM ses
      JOIN "Activity" a ON a.id = ses."activityId"
      WHERE a."companyId" = ${companyId}
        AND a."deletedAt" IS NULL
        AND a.estatus IN ('Finalizada', 'Por Validar')
        AND NOT ses.cortada
        AND ses.minutos >= 5
    `);
    const datos = agruparTiempos(filas.map((f) => ({ ...f, minutos: Number(f.minutos) })));
    this.cache.set(companyId, { hasta: Date.now() + CACHE_MS, datos });
    return datos;
  }
}

/** «Tarea · Instalación», «Servicio · CORRECTIVO», «Obra» (lo que lee la IA). */
export function tipoLegible(coreKind?: string | null, tipo?: string | null): string {
  const kind = (coreKind ?? '').trim().toLowerCase();
  const nombre = kind ? kind[0].toUpperCase() + kind.slice(1) : 'Actividad';
  const sub = kind === 'tarea' ? (subtipoDeTarea(tipo) ?? tipo?.trim()) : kind === 'servicio' ? tipo?.trim() : null;
  return sub ? `${nombre} · ${sub}` : nombre;
}
