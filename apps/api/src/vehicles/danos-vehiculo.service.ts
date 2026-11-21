import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClaudeService } from '../ai/claude/claude.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { esDestinatarioFinanzas } from '../common/finance-notification-recipient.js';
import { ROLES } from '../common/rbac/roles.v2.js';
import { companyWhere } from '../common/tenant/tenant-scope.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import {
  ANCHO_FOTO_DANOS,
  ESQUEMA_DANOS,
  ESTATUS_INCIDENCIA,
  MODELO_DANOS,
  MOTIVOS_DESCARTE,
  PROMPT_DANOS,
  QUIEN_PAGA,
  TIPOS_INCIDENCIA,
  enLotes,
  etiquetaZona,
  limpiarHallazgos,
  paresParaComparar,
  textoDelLote,
  type FotoComparable,
  type HallazgoLimpio,
} from './danos-ia.js';

/** `sharp` se carga al usarse: si su binario faltara, el resto de la API arranca igual. */
function cargarSharp(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('sharp');
  return mod?.default ?? mod;
}

export type Actor = { id: number; isSuperAdmin?: boolean; roleKey?: string | null };

function fotosDe(payload: unknown): FotoComparable[] {
  const fotos = (payload as { fotos?: unknown } | null)?.fotos;
  if (!Array.isArray(fotos)) return [];
  return fotos.filter(
    (f): f is FotoComparable => Boolean(f) && typeof f === 'object' && typeof f.slot === 'string' && typeof f.url === 'string',
  );
}

function aMonto(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(String(valor).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Daños propuestos por la IA, su revisión por Liz y las incidencias de vehículo (responsable y costo).
 */
@Injectable()
export class DanosVehiculoService {
  private readonly logger = new Logger('DanosVehiculo');
  private readonly carpeta = getUploadSubdir(__dirname, 'vehicles');

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** `/uploads/vehicles/<archivo>` → ruta en disco. Nada fuera de la carpeta de vehículos. */
  rutaDeFoto(url: string): string | null {
    const m = /^\/uploads\/vehicles\/([A-Za-z0-9._-]+)$/.exec(String(url ?? ''));
    if (!m || m[1].startsWith('.')) return null;
    return path.join(this.carpeta, m[1]);
  }

  private async fotoParaIa(url: string) {
    const ruta = this.rutaDeFoto(url);
    if (!ruta) throw new Error(`Foto fuera de la carpeta de vehículos: ${url}`);
    const buffer = await fs.readFile(ruta);
    const salida: Buffer = await cargarSharp()(buffer)
      .rotate()
      .resize({ width: ANCHO_FOTO_DANOS, height: ANCHO_FOTO_DANOS, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return { mediaType: 'image/jpeg' as const, base64: salida.toString('base64') };
  }

  /** Liz (gestora de vehículos) de la empresa, sin cuentas de prueba. */
  async gestoras(companyId: number) {
    const liz = await this.prisma.user.findMany({
      where: { isActive: true, roleKey: ROLES.COORD_ADMIN, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, puesto: true },
    });
    return liz.filter(esDestinatarioFinanzas);
  }

  /**
   * Compara salida y devolución de un uso y guarda los daños que la IA propone. Se puede volver a
   * correr: reemplaza lo propuesto que nadie ha revisado y deja lo confirmado o descartado.
   */
  async analizar(controlId: number): Promise<{ estatus: string; hallazgos: number }> {
    const c = await this.prisma.vehicleControl.findUnique({
      where: { id: controlId },
      select: {
        id: true,
        companyId: true,
        vehicleId: true,
        capturaVersion: true,
        fotosSalida: true,
        fotosDevolucion: true,
        nombreVehiculo: true,
        vehiculo: { select: { nombre: true, placas: true } },
      },
    });
    if (!c) throw new NotFoundException('Uso de vehículo no encontrado');
    if (!c.fotosSalida || !c.fotosDevolucion) return { estatus: 'SIN_FOTOS', hallazgos: 0 };

    const pares = paresParaComparar(fotosDe(c.fotosSalida), fotosDe(c.fotosDevolucion), c.capturaVersion ?? 1);
    const marcar = (estatus: string) =>
      this.prisma.vehicleControl.update({ where: { id: c.id }, data: { analisisDanosEstatus: estatus, analisisDanosEn: new Date() } });

    if (!pares.length) {
      await marcar('LISTO');
      return { estatus: 'LISTO', hallazgos: 0 };
    }
    if (!this.claude.disponible()) {
      await marcar('SIN_IA');
      return { estatus: 'SIN_IA', hallazgos: 0 };
    }

    await marcar('PENDIENTE');
    try {
      const hallazgos: HallazgoLimpio[] = [];
      for (const lote of enLotes(pares)) {
        const imagenes = [];
        for (const p of lote) {
          imagenes.push(await this.fotoParaIa(p.salidaUrl), await this.fotoParaIa(p.devolucionUrl));
        }
        const { datos } = await this.claude.json<Record<string, unknown>>({
          proceso: 'vehiculo-danos',
          companyId: c.companyId,
          sistema: [PROMPT_DANOS],
          usuario: textoDelLote(lote),
          imagenes,
          esquema: ESQUEMA_DANOS,
          modelo: MODELO_DANOS,
          esfuerzo: 'medium',
          maxTokens: 2000,
          timeoutMs: 120_000,
          reintentos: 1,
        });
        hallazgos.push(...limpiarHallazgos(datos, lote));
      }

      await this.prisma.$transaction([
        this.prisma.vehicleDamageFinding.deleteMany({ where: { controlId: c.id, origen: 'IA', estatus: 'PROPUESTO' } }),
        this.prisma.vehicleDamageFinding.createMany({
          data: hallazgos.map((h) => ({
            controlId: c.id,
            vehicleAssetId: c.vehicleId ?? null,
            zona: h.zona,
            descripcion: h.descripcion,
            severidad: h.severidad,
            confianza: h.confianza,
            fotoSalidaUrl: h.fotoSalidaUrl,
            fotoDevolucionUrl: h.fotoDevolucionUrl,
            origen: 'IA',
            companyId: c.companyId,
          })),
        }),
      ]);
      await marcar('LISTO');

      if (hallazgos.length) {
        const unidad = c.vehiculo?.nombre ?? c.nombreVehiculo ?? 'la unidad';
        for (const u of await this.gestoras(c.companyId)) {
          await this.notifications.createNotification({
            userId: u.id,
            type: 'VEHICLE_DAMAGE_PROPOSED',
            category: 'vehicles',
            title: 'Posibles daños por revisar',
            message: `La IA ve ${hallazgos.length === 1 ? 'un posible daño nuevo' : `${hallazgos.length} posibles daños nuevos`} en ${unidad} al compararla con la salida. Confírmalos o descártalos.`,
            relatedEntityId: c.id,
            entityType: 'VehicleControl',
            relatedUrl: `/erp/vehiculos/danos?uso=${c.id}`,
            priority: 'high',
            companyId: c.companyId,
          });
        }
      }
      return { estatus: 'LISTO', hallazgos: hallazgos.length };
    } catch (error) {
      this.logger.error(`Comparación de daños del uso ${c.id} falló: ${String((error as Error)?.message ?? error)}`);
      await marcar('ERROR').catch(() => undefined);
      return { estatus: 'ERROR', hallazgos: 0 };
    }
  }

  /** Corre la comparación sin detener a quien devolvió la unidad. */
  analizarEnSegundoPlano(controlId: number): void {
    setImmediate(() => {
      this.analizar(controlId).catch((e) => this.logger.error(`Daños uso ${controlId}: ${String(e?.message ?? e)}`));
    });
  }

  async listarHallazgos(companyId: number | null, filtros: { estatus?: string; uso?: number }) {
    const estatus = ['PROPUESTO', 'CONFIRMADO', 'DESCARTADO'].includes(String(filtros.estatus)) ? String(filtros.estatus) : 'PROPUESTO';
    const filas = await this.prisma.vehicleDamageFinding.findMany({
      where: {
        ...companyWhere(companyId),
        estatus,
        ...(filtros.uso ? { controlId: filtros.uso } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { confianza: 'desc' }],
      take: 200,
      include: {
        control: {
          select: {
            id: true,
            nombreVehiculo: true,
            placasVehiculo: true,
            fechaFin: true,
            odometroInicio: true,
            odometroFin: true,
            kmEsperados: true,
            combustibleInicioPct: true,
            combustibleFinPct: true,
            vehiculo: { select: { id: true, nombre: true, placas: true } },
            solicitante: { select: { id: true, nombre: true } },
            encargado: { select: { id: true, nombre: true } },
            actividad: { select: { id: true, anNumber: true, titulo: true } },
          },
        },
        incidencia: { select: { id: true, estatus: true } },
      },
    });
    return { hallazgos: filas.map((h) => ({ ...h, confianza: Number(h.confianza), etiquetaZona: etiquetaZona(h.zona) })) };
  }

  /** Liz confirma (abre incidencia) o descarta (con motivo) un daño propuesto. */
  async revisarHallazgo(
    id: number,
    actor: Actor,
    body: { accion?: string; motivo?: string; nota?: string; responsableId?: unknown; costoEstimado?: unknown; quienPaga?: string },
    companyId: number | null,
  ) {
    const h = await this.prisma.vehicleDamageFinding.findFirst({
      where: { id, ...companyWhere(companyId) },
      include: { control: { select: { id: true, solicitanteId: true, encargadoId: true, vehicleId: true, companyId: true } } },
    });
    if (!h) throw new NotFoundException('Daño no encontrado');
    if (h.estatus !== 'PROPUESTO') throw new BadRequestException('Este daño ya se revisó');
    const nota = body.nota ? String(body.nota).slice(0, 500) : null;

    if (body.accion === 'descartar') {
      const motivo = String(body.motivo ?? '');
      if (!(MOTIVOS_DESCARTE as readonly string[]).includes(motivo)) {
        throw new BadRequestException('Elige por qué se descarta: ya estaba, reflejo o suciedad, no es daño u otro');
      }
      return this.prisma.vehicleDamageFinding.update({
        where: { id },
        data: { estatus: 'DESCARTADO', motivoDescarte: motivo, notaRevision: nota, revisadoPorId: actor.id, revisadoEn: new Date() },
      });
    }
    if (body.accion !== 'confirmar') throw new BadRequestException('Acción inválida: confirmar o descartar');

    const quienPaga = (QUIEN_PAGA as readonly string[]).includes(String(body.quienPaga)) ? String(body.quienPaga) : 'EMPRESA';
    const responsableId = Number(body.responsableId) || h.control.encargadoId || h.control.solicitanteId;
    await this.validarPersona(responsableId, h.companyId);

    const [, incidencia] = await this.prisma.$transaction([
      this.prisma.vehicleDamageFinding.update({
        where: { id },
        data: { estatus: 'CONFIRMADO', notaRevision: nota, revisadoPorId: actor.id, revisadoEn: new Date() },
      }),
      this.prisma.vehicleIncident.create({
        data: {
          tipo: 'DANO',
          descripcion: `${etiquetaZona(h.zona)}: ${h.descripcion}`.slice(0, 1000),
          vehicleAssetId: h.control.vehicleId ?? h.vehicleAssetId ?? null,
          controlId: h.control.id,
          hallazgoId: h.id,
          responsableId,
          costoEstimado: aMonto(body.costoEstimado),
          quienPaga,
          cobroEstatus: quienPaga === 'RESPONSABLE' ? 'PENDIENTE' : null,
          fotos: [h.fotoSalidaUrl, h.fotoDevolucionUrl].filter(Boolean) as string[],
          creadoPorId: actor.id,
          companyId: h.companyId,
        },
      }),
    ]);
    await this.avisarIncidencia(incidencia.id);
    return incidencia;
  }

  private async validarPersona(userId: number, companyId: number) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, companyMemberships: { some: { companyId } } },
      select: { id: true },
    });
    if (!u) throw new BadRequestException('El responsable no es una persona activa de la empresa');
  }

  /** Aviso al responsable; si se le cobraría, también a dirección para que lo apruebe. */
  private async avisarIncidencia(incidenciaId: number) {
    try {
      const i = await this.prisma.vehicleIncident.findUnique({
        where: { id: incidenciaId },
        include: { vehiculo: { select: { nombre: true } }, responsable: { select: { id: true, nombre: true } } },
      });
      if (!i) return;
      const unidad = i.vehiculo?.nombre ?? 'la unidad';
      if (i.responsableId) {
        await this.notifications.createNotification({
          userId: i.responsableId,
          type: 'VEHICLE_INCIDENT_OPENED',
          category: 'vehicles',
          title: 'Incidencia de vehículo a tu nombre',
          message: `${unidad}: ${i.descripcion}`.slice(0, 500),
          relatedEntityId: i.id,
          entityType: 'VehicleIncident',
          relatedUrl: '/erp/vehiculos/mis-vehiculos',
          priority: 'high',
          companyId: i.companyId,
        });
      }
      if (i.cobroEstatus === 'PENDIENTE') {
        const direccion = await this.prisma.user.findMany({
          where: { isActive: true, roleKey: ROLES.CEO, companyMemberships: { some: { companyId: i.companyId } } },
          select: { id: true, email: true, puesto: true },
        });
        for (const d of direccion.filter(esDestinatarioFinanzas)) {
          await this.notifications.createNotification({
            userId: d.id,
            type: 'VEHICLE_INCIDENT_OPENED',
            category: 'vehicles',
            title: 'Cobro de daño por aprobar',
            message: `Se propone cobrar a ${i.responsable?.nombre ?? 'el responsable'} el daño de ${unidad}: ${i.descripcion}`.slice(0, 500),
            relatedEntityId: i.id,
            entityType: 'VehicleIncident',
            relatedUrl: '/erp/vehiculos/danos?vista=incidencias',
            priority: 'high',
            companyId: i.companyId,
          });
        }
      }
    } catch (e) {
      this.logger.warn(`Aviso de incidencia ${incidenciaId}: ${String((e as Error)?.message ?? e)}`);
    }
  }

  async crearIncidencia(
    actor: Actor,
    body: {
      tipo?: string;
      descripcion?: string;
      vehicleAssetId?: unknown;
      controlId?: unknown;
      responsableId?: unknown;
      costoEstimado?: unknown;
      quienPaga?: string;
    },
    companyId: number,
  ) {
    const tipo = (TIPOS_INCIDENCIA as readonly string[]).includes(String(body.tipo)) ? String(body.tipo) : null;
    if (!tipo) throw new BadRequestException('Tipo de incidencia inválido');
    const descripcion = String(body.descripcion ?? '').trim();
    if (descripcion.length < 5) throw new BadRequestException('Describe qué pasó');

    let vehicleAssetId = Number(body.vehicleAssetId) || null;
    const controlId = Number(body.controlId) || null;
    let responsableId = Number(body.responsableId) || null;
    if (controlId) {
      const c = await this.prisma.vehicleControl.findFirst({
        where: { id: controlId, ...companyWhere(companyId) },
        select: { vehicleId: true, encargadoId: true, solicitanteId: true },
      });
      if (!c) throw new BadRequestException('Uso de vehículo no encontrado');
      vehicleAssetId = vehicleAssetId ?? c.vehicleId ?? null;
      responsableId = responsableId ?? c.encargadoId ?? c.solicitanteId;
    }
    if (!vehicleAssetId) throw new BadRequestException('Indica la unidad');
    const unidad = await this.prisma.vehicleAsset.findFirst({ where: { id: vehicleAssetId, ...companyWhere(companyId) }, select: { id: true } });
    if (!unidad) throw new BadRequestException('Unidad no encontrada');
    if (responsableId) await this.validarPersona(responsableId, companyId);

    const quienPaga = (QUIEN_PAGA as readonly string[]).includes(String(body.quienPaga)) ? String(body.quienPaga) : 'EMPRESA';
    const incidencia = await this.prisma.vehicleIncident.create({
      data: {
        tipo,
        descripcion: descripcion.slice(0, 1000),
        vehicleAssetId,
        controlId,
        responsableId,
        costoEstimado: aMonto(body.costoEstimado),
        quienPaga,
        cobroEstatus: quienPaga === 'RESPONSABLE' ? 'PENDIENTE' : null,
        creadoPorId: actor.id,
        companyId,
      },
    });
    await this.avisarIncidencia(incidencia.id);
    return incidencia;
  }

  async listarIncidencias(companyId: number | null, filtros: { estatus?: string; vehiculo?: number; responsable?: number }) {
    const estatus = (ESTATUS_INCIDENCIA as readonly string[]).includes(String(filtros.estatus)) ? String(filtros.estatus) : undefined;
    const filas = await this.prisma.vehicleIncident.findMany({
      where: {
        ...companyWhere(companyId),
        ...(estatus ? { estatus } : {}),
        ...(filtros.vehiculo ? { vehicleAssetId: filtros.vehiculo } : {}),
        ...(filtros.responsable ? { responsableId: filtros.responsable } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        vehiculo: { select: { id: true, nombre: true, placas: true } },
        responsable: { select: { id: true, nombre: true } },
        control: { select: { id: true, actividad: { select: { id: true, anNumber: true, titulo: true } } } },
      },
    });
    return {
      incidencias: filas.map((i) => ({
        ...i,
        costoEstimado: i.costoEstimado != null ? Number(i.costoEstimado) : null,
        costoReal: i.costoReal != null ? Number(i.costoReal) : null,
      })),
    };
  }

  async actualizarIncidencia(
    id: number,
    actor: Actor,
    body: { estatus?: string; costoEstimado?: unknown; costoReal?: unknown; quienPaga?: string; responsableId?: unknown },
    companyId: number | null,
  ) {
    const i = await this.prisma.vehicleIncident.findFirst({ where: { id, ...companyWhere(companyId) } });
    if (!i) throw new NotFoundException('Incidencia no encontrada');
    const data: Record<string, unknown> = {};
    if (body.estatus != null) {
      if (!(ESTATUS_INCIDENCIA as readonly string[]).includes(body.estatus)) throw new BadRequestException('Estatus inválido');
      data.estatus = body.estatus;
      if (body.estatus === 'CERRADA') {
        data.cerradoPorId = actor.id;
        data.cerradoEn = new Date();
      }
    }
    if (body.costoEstimado !== undefined) data.costoEstimado = aMonto(body.costoEstimado);
    if (body.costoReal !== undefined) data.costoReal = aMonto(body.costoReal);
    if (body.responsableId !== undefined) {
      const r = Number(body.responsableId) || null;
      if (r) await this.validarPersona(r, i.companyId);
      data.responsableId = r;
    }
    if (body.quienPaga !== undefined) {
      if (!(QUIEN_PAGA as readonly string[]).includes(body.quienPaga)) throw new BadRequestException('Quién paga: empresa, responsable o seguro');
      data.quienPaga = body.quienPaga;
      // Cambiar a «responsable» vuelve a pedir la aprobación de dirección; quitarlo la retira.
      data.cobroEstatus = body.quienPaga === 'RESPONSABLE' ? (i.quienPaga === 'RESPONSABLE' ? i.cobroEstatus : 'PENDIENTE') : null;
    }
    const actualizada = await this.prisma.vehicleIncident.update({ where: { id }, data });
    if (data.cobroEstatus === 'PENDIENTE' && i.cobroEstatus !== 'PENDIENTE') await this.avisarIncidencia(id);
    return actualizada;
  }

  /** Cobrar un daño a una persona lo decide dirección (superadmin). */
  async revisarCobro(id: number, actor: Actor, decision: string, companyId: number | null) {
    if (!actor.isSuperAdmin) throw new ForbiddenException('El cobro al responsable lo aprueba dirección');
    const i = await this.prisma.vehicleIncident.findFirst({ where: { id, ...companyWhere(companyId) } });
    if (!i) throw new NotFoundException('Incidencia no encontrada');
    if (i.cobroEstatus !== 'PENDIENTE') throw new BadRequestException('Este cobro no está pendiente');
    if (decision !== 'APROBADO' && decision !== 'RECHAZADO') throw new BadRequestException('Decisión inválida');
    return this.prisma.vehicleIncident.update({
      where: { id },
      data: {
        cobroEstatus: decision,
        cobroRevisadoPorId: actor.id,
        cobroRevisadoEn: new Date(),
        ...(decision === 'RECHAZADO' ? { quienPaga: 'EMPRESA' } : {}),
      },
    });
  }
}
