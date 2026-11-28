import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SolicitudAprobacionService } from '../../common/aprobaciones/solicitud-aprobacion.service.js';
import { WORKDAY_TIMEZONE, workDateKey } from '../../common/time/workday.js';
import { ROLES } from '../../common/rbac/roles.v2.js';
import { esCuentaAvisoRh } from '../../common/aprobaciones/cuenta-aviso.js';
import { runScheduledJob } from '../../common/cron/run-scheduled-job.js';

/**
 * Avisos diarios a Tere (RH): documentos por vencer, cumpleaños/aniversarios,
 * personas sin NEX o sin jefe, contratos temporales por terminar.
 */
@Injectable()
export class RhAlertasService {
  private readonly logger = new Logger(RhAlertasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aprobaciones: SolicitudAprobacionService,
  ) {}

  @Cron('0 9 * * *', { name: 'rh-alertas-diarias', timeZone: WORKDAY_TIMEZONE })
  async cronCorrerDiario() {
    await runScheduledJob('rh-alertas-diarias', this.logger, () => this.correrDiario());
  }

  /** El `try/catch` por empresa es a propósito: que una empresa falle no deja sin avisos a las demás. */
  async correrDiario() {
    let ultimoId = 0;
    while (true) {
      const empresas = await this.prisma.companyProfile.findMany({
        where: { isActive: true, id: { gt: ultimoId } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const e of empresas) {
        try {
          await this.avisarEmpresa(e.id);
        } catch {
          this.logger.warn(`No se pudieron armar las alertas RH de la empresa ${e.id}.`);
        }
      }
      if (empresas.length < 100) break;
      ultimoId = empresas[empresas.length - 1].id;
    }
  }

  async avisarEmpresa(companyId: number) {
    const rhIds = await this.aprobaciones.idsRh(companyId);
    if (!rhIds.length) return;

    const hoy = new Date();
    const inicioHoy = new Date(`${workDateKey(hoy)}T00:00:00.000Z`);
    const en30 = new Date(inicioHoy.getTime() + 31 * 24 * 60 * 60 * 1000 - 1);
    const mmdd = (d: Date) =>
      `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const hoyMd = workDateKey(hoy).slice(5);

    const cargarPagina = (ultimoId: number) => this.prisma.user.findMany({
      where: {
        id: { gt: ultimoId },
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        puesto: true,
        employeeNumber: true,
        managerId: true,
        roleKey: true,
        fechaIngreso: true,
        perfil: { select: { fechaNacimiento: true } },
        empleadoPerfil: { select: { contratoVenceAt: true, companyId: true } },
        documentos: {
          where: { expiresAt: { gte: inicioHoy, lte: en30 } },
          select: { id: true, tipo: true },
        },
      },
      take: 5000,
      orderBy: { id: 'asc' },
    });
    const activos: Awaited<ReturnType<typeof cargarPagina>> = [];
    let ultimoId = 0;
    while (true) {
      const pagina = await cargarPagina(ultimoId);
      activos.push(...pagina);
      if (pagina.length < 5000) break;
      ultimoId = pagina[pagina.length - 1].id;
    }

    const personal = activos.filter(esCuentaAvisoRh);
    const partes: string[] = [];
    const docs = personal.reduce((n, u) => n + u.documentos.length, 0);
    if (docs) partes.push(`${docs} documento(s) por vencer en 30 días`);
    const cumples = personal.filter((u) => u.perfil?.fechaNacimiento && mmdd(u.perfil.fechaNacimiento) === hoyMd);
    if (cumples.length) partes.push(`${cumples.length} cumpleaños hoy`);
    const aniv = personal.filter((u) => u.fechaIngreso && u.fechaIngreso.getUTCFullYear() < Number(workDateKey(hoy).slice(0, 4)) && mmdd(u.fechaIngreso) === hoyMd);
    if (aniv.length) partes.push(`${aniv.length} aniversario(s) hoy`);
    const sinNex = personal.filter((u) => !u.employeeNumber || !/^NEX-\d+$/i.test(u.employeeNumber));
    if (sinNex.length) partes.push(`${sinNex.length} sin número NEX`);
    const sinJefe = personal.filter((u) => u.managerId == null && u.roleKey !== ROLES.CEO);
    if (sinJefe.length) partes.push(`${sinJefe.length} sin jefe`);
    const contratos = personal.filter(
      (u) => u.empleadoPerfil?.companyId === companyId && u.empleadoPerfil.contratoVenceAt && u.empleadoPerfil.contratoVenceAt >= inicioHoy && u.empleadoPerfil.contratoVenceAt <= en30,
    );
    if (contratos.length) partes.push(`${contratos.length} contrato(s) por terminar`);

    if (!partes.length) return;

    await this.aprobaciones.avisar(rhIds, {
      type: 'RH_ALERTAS_DIARIAS',
      title: 'Alertas de personal',
      message: partes.join(' · '),
      triggerUserId: rhIds[0],
      relatedEntityId: companyId,
      companyId,
      relatedUrl: '/erp/hr',
      priority: 'normal',
      dedupeSeconds: 23 * 60 * 60,
    });
  }
}
