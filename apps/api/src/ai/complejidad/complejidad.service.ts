import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { ClaudeService } from '../claude/claude.service.js';
import { IaNoDisponibleException } from '../claude/compuerta-ia.js';
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

/** Por qué no hay sugerencia: título corto (no es fallo), la IA no está o no dio un nivel válido. */
export type MotivoSinSugerencia = 'titulo_corto' | 'ia_no_disponible' | 'sin_respuesta';

/**
 * Lo que responde `sugerir`. `sugerencia` es lo de siempre; los otros tres campos son nuevos y opcionales para que
 * una web o una app vieja, que solo lee `sugerencia`, se vea igual que hoy.
 */
export type RespuestaSugerencia = {
  sugerencia: SugerenciaComplejidad | null;
  /** `false` solo cuando la IA no está (llave caída, corte, presupuesto): ahí el nivel se elige a mano. */
  disponible: boolean;
  motivo?: MotivoSinSugerencia;
  /** Una frase en español para mostrar tal cual. Falta cuando no hay nada que decir (título corto) o hubo sugerencia. */
  mensaje?: string;
};

export const MENSAJE_SIN_IA = 'Sugerencia no disponible por ahora: elige tú el nivel.';
export const MENSAJE_SIN_RESPUESTA = 'No pude sugerir esta vez: elige tú el nivel.';

@Injectable()
export class ComplejidadService {
  private readonly logger = new Logger('Complejidad');
  private readonly cache = new Map<number, { hasta: number; datos: Map<string, TiemposTipicos> }>();
  /** Ya se avisó en el log que la IA no está; se vuelve a avisar solo después de que responda otra vez. */
  private iaCaidaAvisada = false;

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

  /** La mediana real de cada tipo («tarea:Instalación» → minutos), con la misma caché. */
  async medianas(companyId: number | null): Promise<Map<string, number>> {
    const porTipo = await this.porTipo(requireCompanyId(companyId));
    const salida = new Map<string, number>();
    for (const [clave, t] of porTipo) if (t.total.medianaMin) salida.set(clave, t.total.medianaMin);
    return salida;
  }

  /**
   * Sugerencia de la IA. Elegir la complejidad nunca depende de que responda, pero tampoco se calla: cuando no hay
   * sugerencia, la respuesta dice por qué y trae una frase para mostrarla (`disponible`, `motivo`, `mensaje`). Los
   * campos nuevos son opcionales para quien ya lee solo `sugerencia`. `opciones.proceso` cambia el `x-proceso` que ve
   * la puerta (el relleno de actividades viejas usa `complejidad-relleno`).
   */
  async sugerir(
    companyId: number | null,
    body: { coreKind?: string | null; tipo?: string | null; titulo?: string | null; indicaciones?: string | null },
    opciones: { proceso?: string } = {},
  ): Promise<RespuestaSugerencia> {
    const tenantId = requireCompanyId(companyId);
    const titulo = String(body.titulo ?? '').trim();
    // Un título corto no es un fallo de la IA: ni se le pregunta ni se avisa de nada.
    if (titulo.length < 6) return { sugerencia: null, disponible: true, motivo: 'titulo_corto' };
    if (!this.claude.disponible()) return this.sinIa();
    try {
      const regla = reglaDe({ coreKind: body.coreKind, ticketType: body.tipo, ticketTypeCustom: body.tipo });
      // La jornada en sitio no se lee del título: es lo que se supone cuando no dice cuántas piezas.
      const seCuenta = regla?.unidades.filter((x) => !x.sinBase).map((x) => x.plural).join(' o ') || null;
      const { datos } = await this.claude.json<SugerenciaComplejidad>({
        ...peticionComplejidad({ tipo: tipoLegible(body.coreKind, body.tipo), seCuenta, titulo, indicaciones: body.indicaciones }),
        proceso: opciones.proceso || 'complejidad',
        companyId: tenantId,
      });
      this.avisarVuelta();
      const sugerencia = limpiarComplejidad(datos);
      // La IA respondió pero sin un nivel válido: tampoco es un hueco, se dice.
      return sugerencia
        ? { sugerencia, disponible: true }
        : { sugerencia: null, disponible: true, motivo: 'sin_respuesta', mensaje: MENSAJE_SIN_RESPUESTA };
    } catch (error) {
      if (error instanceof IaNoDisponibleException) return this.sinIa();
      this.avisarVuelta();
      this.logger.warn(`sin sugerencia: ${(error as Error).message}`);
      return { sugerencia: null, disponible: true, motivo: 'sin_respuesta', mensaje: MENSAJE_SIN_RESPUESTA };
    }
  }

  /** La IA no está: se avisa en el log al caerse y al volver, no una vez por llamada (en 32 h fueron 97 avisos iguales). */
  private sinIa(): RespuestaSugerencia {
    if (!this.iaCaidaAvisada) {
      this.iaCaidaAvisada = true;
      this.logger.warn('sin sugerencia de complejidad: la IA no está disponible (se avisa una vez hasta que vuelva)');
    }
    return { sugerencia: null, disponible: false, motivo: 'ia_no_disponible', mensaje: MENSAJE_SIN_IA };
  }

  private avisarVuelta(): void {
    if (!this.iaCaidaAvisada) return;
    this.iaCaidaAvisada = false;
    this.logger.log('la sugerencia de complejidad volvió a responder');
  }

  private async porTipo(companyId: number): Promise<Map<string, TiemposTipicos>> {
    const enCache = this.cache.get(companyId);
    if (enCache && enCache.hasta > Date.now()) return enCache.datos;
    const desde = new Date(Math.max(DESDE_OPERACION_REAL.getTime(), Date.now() - VENTANA_DIAS * 86_400_000));
    // Reloj de cada persona en cada actividad terminada (o por validar). Se descartan las que el
    // sistema cortó solo (tope de 12 h o cierre del día): ahí el reloj siguió sin trabajo. Lo que
    // dijo quien la ejecutó manda sobre su reloj, y lo de varios días no enseña cuánto toma una vez.
    const filas = await this.prisma.$queryRaw<FilaTiempo[]>(Prisma.sql`
      WITH ses AS (
        SELECT s."activityId", s."userId",
               SUM(EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) / 60.0)::float8 AS minutos,
               BOOL_OR(s."endReason" IN ('TOPE_12H', 'CORTE_DIA')) AS cortada
        FROM activity_work_sessions s
        WHERE s."companyId" = ${companyId} AND s."endedAt" IS NOT NULL AND s."startedAt" >= ${desde}
        GROUP BY 1, 2
      )
      SELECT a."coreKind", a."ticketType"::text AS "ticketType", a."ticketTypeCustom", a."complejidad",
             COALESCE(CASE WHEN ses."userId" = a."responsableId" THEN d.minutos::float8 END, ses.minutos) AS minutos
      FROM ses
      JOIN "Activity" a ON a.id = ses."activityId"
      LEFT JOIN actividad_tiempo_dicho d ON d."activityId" = a.id AND d."companyId" = a."companyId"
      WHERE a."companyId" = ${companyId}
        AND a."deletedAt" IS NULL
        AND a.estatus IN ('Finalizada', 'Por Validar')
        AND NOT (a."periodoInicio" IS NOT NULL AND a."periodoFin" IS NOT NULL)
        AND ((d.minutos IS NOT NULL AND ses."userId" = a."responsableId") OR (NOT ses.cortada AND ses.minutos >= 5))
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
