import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { ClaudeService } from '../ai/claude/claude.service.js';
import { redondear } from './calculos/numeros.js';
import { horasEfectivas } from './calculos/libro-costos.js';
import {
  TIPOS_LIGA,
  candidatosParaIa,
  limpiarLiga,
  peticionLiga,
  sugerirPorReglas,
  type ActividadSuelta,
  type Candidato,
  type RespuestaLiga,
  type Sugerencia,
  type TipoLiga,
} from './calculos/sugerir-liga.js';

export const PERIODOS = ['semana', 'mes', 'todo'] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Cuántas actividades se le mandan a la IA por vez. Cada una cuesta unos centavos de centavo. */
const LOTE_IA = 25;
/** La bandeja enseña lo que más pesa; el resto se ve conforme se liga lo de arriba. */
const TOPE_FILAS = 200;

function desdePeriodo(periodo: Periodo, ahora: Date): Date | null {
  if (periodo === 'todo') return null;
  return new Date(ahora.getTime() - (periodo === 'semana' ? 7 : 30) * 86_400_000);
}

export type FilaPorLigar = {
  activityId: number;
  folio: string;
  titulo: string;
  coreKind: string | null;
  cliente: string | null;
  horas: number;
  personas: number;
  dias: number;
  sugerencia: Sugerencia | null;
};

@Injectable()
export class CostosLigaService {
  private readonly logger = new Logger('CostosLiga');

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /** Proyectos y cotizaciones a los que se puede ligar. La cotización con proyecto no se ofrece: va su proyecto. */
  async candidatos(companyId: number | null): Promise<Candidato[]> {
    const tenantId = requireCompanyId(companyId);
    const [proyectos, cotizaciones] = await Promise.all([
      this.prisma.operationalProject.findMany({
        where: { companyId: tenantId, status: { not: 'CANCELLED' } },
        select: { id: true, title: true, clientId: true, cotizacionId: true, client: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cotizacion.findMany({
        where: { companyId: tenantId, status: { notIn: ['REJECTED', 'EXPIRED'] } },
        select: {
          id: true,
          quoteNumber: true,
          projectName: true,
          clientCompany: true,
          clientName: true,
          salesClient: { select: { serviceClientId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);
    const conProyecto = new Set(proyectos.map((p) => p.cotizacionId).filter(Boolean));
    return [
      ...proyectos.map((p) => ({
        tipo: 'PROYECTO' as const,
        id: p.id,
        nombre: p.title,
        clientId: p.clientId,
        cliente: p.client?.name ?? null,
      })),
      ...cotizaciones
        .filter((c) => !conProyecto.has(c.id))
        .map((c) => ({
          tipo: 'COTIZACION' as const,
          id: c.id,
          nombre: [c.quoteNumber, c.projectName].filter(Boolean).join(' · '),
          clientId: c.salesClient?.serviceClientId ?? null,
          cliente: c.clientCompany || c.clientName || null,
        })),
    ];
  }

  /** La bandeja: actividades con horas en el periodo que no se sabe a quién cargarle. */
  async porLigar(companyId: number | null, periodo: Periodo = 'semana', ahora = new Date()) {
    const tenantId = requireCompanyId(companyId);
    const desde = desdePeriodo(periodo, ahora);
    const sesiones = await this.prisma.activityWorkSession.findMany({
      where: {
        companyId: tenantId,
        endedAt: { not: null },
        activity: { deletedAt: null },
        ...(desde ? { startedAt: { gte: desde } } : {}),
      },
      select: { id: true, activityId: true, userId: true, startedAt: true, endedAt: true, endReason: true },
    });

    const horas = horasEfectivas(sesiones);
    const porActividad = new Map<number, { horas: number; personas: Set<number>; dias: Set<string> }>();
    for (const s of sesiones) {
      const h = horas.get(s.id)?.horas ?? 0;
      if (!(h > 0)) continue;
      const fila = porActividad.get(s.activityId) ?? { horas: 0, personas: new Set<number>(), dias: new Set<string>() };
      fila.horas += h;
      fila.personas.add(s.userId);
      fila.dias.add(s.startedAt.toISOString().slice(0, 10));
      porActividad.set(s.activityId, fila);
    }

    const ids = [...porActividad.keys()];
    const [actividades, ligas, candidatos] = await Promise.all([
      this.prisma.activity.findMany({
        where: { companyId: tenantId, id: { in: ids } },
        select: {
          id: true,
          anNumber: true,
          titulo: true,
          coreKind: true,
          projectId: true,
          clientId: true,
          cotizacionId: true,
          branchName: true,
          branchCity: true,
          client: { select: { name: true } },
        },
      }),
      this.prisma.costoActividadLiga.findMany({ where: { companyId: tenantId, activityId: { in: ids } } }),
      this.candidatos(tenantId),
    ]);
    const ligaDe = new Map(ligas.map((l) => [l.activityId, l]));

    let horasLigadas = 0;
    let horasTotal = 0;
    const filas: FilaPorLigar[] = [];
    for (const a of actividades) {
      const datos = porActividad.get(a.id)!;
      horasTotal += datos.horas;
      const liga = ligaDe.get(a.id);
      if (a.projectId || a.cotizacionId || liga?.tipo) {
        horasLigadas += datos.horas;
        continue;
      }
      const suelta: ActividadSuelta = {
        titulo: a.titulo,
        coreKind: a.coreKind,
        clientId: a.clientId,
        cliente: a.client?.name ?? null,
        lugar: [a.client?.name, a.branchName, a.branchCity].filter(Boolean).join(' · ') || null,
      };
      let sugerencia = sugerirPorReglas(suelta, candidatos);
      if (!sugerencia && liga?.sugerenciaTipo) {
        // La de la IA se guardó: sigue valiendo si su candidato existe.
        const sigue =
          liga.sugerenciaTipo === 'INTERNA' ||
          candidatos.some((c) => c.tipo === liga.sugerenciaTipo && c.id === liga.sugerenciaId);
        if (sigue) {
          sugerencia = {
            tipo: liga.sugerenciaTipo as TipoLiga,
            id: liga.sugerenciaId,
            nombre: liga.sugerenciaNombre ?? 'Trabajo interno',
            motivo: liga.sugerenciaMotivo ?? 'Lo sugiere la IA',
            fuente: 'IA',
          };
        }
      }
      filas.push({
        activityId: a.id,
        folio: a.anNumber,
        titulo: a.titulo,
        coreKind: a.coreKind,
        cliente: suelta.lugar ?? null,
        horas: redondear(datos.horas, 1),
        personas: datos.personas.size,
        dias: datos.dias.size,
        sugerencia,
      });
    }
    filas.sort((x, y) => y.horas - x.horas);

    const horasPorLigar = horasTotal - horasLigadas;
    return {
      periodo,
      resumen: {
        horasTotal: redondear(horasTotal, 1),
        horasLigadas: redondear(horasLigadas, 1),
        horasPorLigar: redondear(horasPorLigar, 1),
        actividades: filas.length,
        pctLigado: horasTotal > 0 ? redondear((horasLigadas / horasTotal) * 100, 1) : null,
        conSugerencia: filas.filter((f) => f.sugerencia).length,
      },
      iaDisponible: this.claude.disponible(),
      filas: filas.slice(0, TOPE_FILAS),
      candidatos,
    };
  }

  /** La decisión de una persona. No toca la actividad: el avance del proyecto no se mueve. */
  async decidir(
    companyId: number | null,
    activityId: number,
    dto: { tipo: string; id?: number | null },
    actorId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (!(TIPOS_LIGA as readonly string[]).includes(dto.tipo)) throw new BadRequestException('Tipo de liga inválido');
    const actividad = await this.prisma.activity.findFirst({ where: { id: activityId, companyId: tenantId }, select: { id: true } });
    if (!actividad) throw new NotFoundException('Actividad no encontrada');

    let proyectoId: number | null = null;
    let cotizacionId: number | null = null;
    if (dto.tipo === 'PROYECTO') {
      const p = await this.prisma.operationalProject.findFirst({ where: { id: Number(dto.id), companyId: tenantId }, select: { id: true } });
      if (!p) throw new BadRequestException('Proyecto no encontrado');
      proyectoId = p.id;
    } else if (dto.tipo === 'COTIZACION') {
      const c = await this.prisma.cotizacion.findFirst({ where: { id: Number(dto.id), companyId: tenantId }, select: { id: true } });
      if (!c) throw new BadRequestException('Cotización no encontrada');
      cotizacionId = c.id;
    }
    const datos = { tipo: dto.tipo, proyectoId, cotizacionId, decididoPorId: actorId ?? null, decididoAt: new Date() };
    await this.prisma.costoActividadLiga.upsert({
      where: { companyId_activityId: { companyId: tenantId, activityId } },
      create: { companyId: tenantId, activityId, ...datos },
      update: datos,
    });
    return { ok: true };
  }

  /** Deshacer: la actividad regresa a la bandeja. */
  async deshacer(companyId: number | null, activityId: number) {
    const tenantId = requireCompanyId(companyId);
    await this.prisma.costoActividadLiga.updateMany({
      where: { companyId: tenantId, activityId },
      data: { tipo: null, proyectoId: null, cotizacionId: null, decididoPorId: null, decididoAt: null },
    });
    return { ok: true };
  }

  /**
   * Le pregunta a la IA por lo que las reglas no resolvieron, de lo que más horas tiene hacia abajo.
   * Se guarda lo que responda, así no se paga dos veces. Si la IA falla, la bandeja sigue igual.
   */
  async sugerirConIa(companyId: number | null, periodo: Periodo = 'todo') {
    const tenantId = requireCompanyId(companyId);
    if (!this.claude.disponible()) return { consultadas: 0, sugeridas: 0, iaDisponible: false };

    const bandeja = await this.porLigar(tenantId, periodo);
    const yaPreguntadas = new Set(
      (
        await this.prisma.costoActividadLiga.findMany({
          where: { companyId: tenantId, sugerenciaMotivo: { not: null } },
          select: { activityId: true },
        })
      ).map((l) => l.activityId),
    );
    const pendientes = bandeja.filas.filter((f) => !f.sugerencia && !yaPreguntadas.has(f.activityId)).slice(0, LOTE_IA);

    let sugeridas = 0;
    let consultadas = 0;
    for (const f of pendientes) {
      const actividad: ActividadSuelta = { titulo: f.titulo, coreKind: f.coreKind, lugar: f.cliente };
      const lista = candidatosParaIa(actividad, bandeja.candidatos);
      try {
        const { datos } = await this.claude.json<RespuestaLiga>({
          ...peticionLiga(actividad, lista),
          proceso: 'costos-liga',
          companyId: tenantId,
        });
        consultadas += 1;
        const s = limpiarLiga(datos, lista);
        // Sin sugerencia también se guarda el intento: no se vuelve a preguntar por lo mismo.
        const fila = {
          sugerenciaTipo: s?.tipo ?? null,
          sugerenciaId: s?.id ?? null,
          sugerenciaNombre: s?.nombre.slice(0, 200) ?? null,
          sugerenciaMotivo: (s?.motivo ?? 'La IA no pudo decidir').slice(0, 160),
        };
        await this.prisma.costoActividadLiga.upsert({
          where: { companyId_activityId: { companyId: tenantId, activityId: f.activityId } },
          create: { companyId: tenantId, activityId: f.activityId, ...fila },
          update: fila,
        });
        if (s) sugeridas += 1;
      } catch (error) {
        this.logger.warn(`Sin sugerencia: ${(error as Error).message}`);
        break;
      }
    }
    return { consultadas, sugeridas, iaDisponible: true };
  }
}
