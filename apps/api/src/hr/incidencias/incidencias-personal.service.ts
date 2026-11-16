import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PLATFORM_OWNER_EMAIL } from '../../common/platform-accounts.js';
import { esDireccion } from '../../users/user-creation-policy.js';
import { ROLES } from '../../common/rbac/roles.v2.js';
import { domingoDe, lunesDe } from '../../employee-payments/control-nomina.js';
import type { TipoIncidenciaPersonal } from '@prisma/client';

type Sesion = { id?: number | string | null; roleKey?: string | null; email?: string | null; isSuperAdmin?: boolean };

const TIPOS: ReadonlySet<string> = new Set([
  'FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA', 'RETARDO', 'PERMISO_CON_GOCE', 'PERMISO_SIN_GOCE',
  'INCAPACIDAD', 'VACACIONES', 'HORAS_EXTRA', 'BONO', 'DESCUENTO', 'PRESTAMO', 'OTRO',
]);

const APLICABLES = new Set(['DESCUENTO', 'FALTA_INJUSTIFICADA', 'PRESTAMO']);

const sinAcentos = (v: string) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

@Injectable()
export class IncidenciasPersonalService {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(sesion: Sesion, companyId: number) {
    if (!Number.isSafeInteger(companyId) || companyId <= 0) throw new ForbiddenException('Selecciona una empresa válida.');
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0) throw new ForbiddenException('Sesión inválida.');
    const actor = await this.prisma.user.findUnique({
      where: { id, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, roleKey: true, isActive: true },
    });
    if (!actor || actor.isActive === false) throw new ForbiddenException('Tu usuario no está activo.');
    return actor;
  }

  private puedeEscribir(actor: { email: string | null; roleKey: string | null; isSuperAdmin?: boolean }) {
    if (esDireccion(actor, PLATFORM_OWNER_EMAIL) || actor.roleKey === ROLES.RH) return true;
    throw new ForbiddenException('Solo RH o dirección registran incidencias.');
  }

  async listar(
    sesion: Sesion,
    companyId: number,
    filtros: { semana?: string; userId?: number; tipo?: string; desde?: string; hasta?: string } = {},
  ) {
    const actor = await this.actor(sesion, companyId);
    const where: any = { companyId };
    if (filtros.semana) where.semanaNomina = this.fechaValida(filtros.semana);
    if (filtros.desde || filtros.hasta) {
      where.fecha = {
        ...(filtros.desde ? { gte: new Date(this.fechaValida(filtros.desde) + 'T00:00:00.000Z') } : {}),
        ...(filtros.hasta ? { lte: new Date(this.fechaValida(filtros.hasta) + 'T23:59:59.999Z') } : {}),
      };
    }
    if (filtros.userId) where.userId = filtros.userId;
    if (filtros.tipo && TIPOS.has(filtros.tipo)) where.tipo = filtros.tipo;

    const esStaff = esDireccion(actor, PLATFORM_OWNER_EMAIL) || actor.roleKey === ROLES.RH;
    if (!esStaff) {
      const gente = await this.prisma.user.findMany({
        where: { managerId: actor.id, companyMemberships: { some: { companyId } } },
        select: { id: true },
      });
      const permitidos = [actor.id, ...gente.map((g) => g.id)];
      where.userId = { in: filtros.userId ? permitidos.filter((id) => id === filtros.userId) : permitidos };
    }

    return this.prisma.incidenciaPersonal.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      include: {
        user: { select: { id: true, nombre: true, employeeNumber: true } },
        autorizadoPor: { select: { id: true, nombre: true } },
        creadoPor: { select: { id: true, nombre: true } },
      },
    });
  }

  private fechaValida(fecha: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha)) ||
      new Date(fecha).toISOString().slice(0, 10) !== fecha) throw new BadRequestException('Fecha inválida.');
    return fecha;
  }

  private numero(valor: unknown) {
    if (valor == null || valor === '') return null;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Cantidad y monto deben ser números positivos.');
    return n;
  }

  private async autorizado(companyId: number, id: unknown) {
    if (id == null || id === '') return null;
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } }, select: { id: true },
    })) throw new BadRequestException('Quien autoriza debe pertenecer a esta empresa.');
    return userId;
  }

  async crear(sesion: Sesion, companyId: number, body: any) {
    const actor = await this.actor(sesion, companyId);
    this.puedeEscribir(actor);
    const userId = Number(body.userId);
    const tipo = String(body.tipo ?? '').trim().toUpperCase();
    const fecha = String(body.fecha ?? '').trim();
    const concepto = String(body.concepto ?? '').trim();
    if (!Number.isFinite(userId) || userId <= 0) throw new BadRequestException('Elige a la persona.');
    if (!TIPOS.has(tipo)) throw new BadRequestException('Tipo de incidencia no válido.');
    this.fechaValida(fecha);
    if (concepto.length < 2 || concepto.length > 200) throw new BadRequestException('Escribe el concepto.');

    const ok = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: { id: true },
    });
    if (!ok) throw new BadRequestException('No encontramos a esa persona.');

    const semanaNomina = String(body.semanaNomina ?? '').trim() || lunesDe(fecha);
    this.fechaValida(semanaNomina);
    if (lunesDe(semanaNomina) !== semanaNomina) throw new BadRequestException('La semana debe comenzar en lunes.');
    const autorizadoPorId = await this.autorizado(companyId, body.autorizadoPorId);
    return this.prisma.incidenciaPersonal.create({
      data: {
        companyId,
        userId,
        fecha: new Date(`${fecha}T12:00:00.000Z`),
        tipo: tipo as TipoIncidenciaPersonal,
        concepto,
        cantidad: this.numero(body.cantidad),
        monto: this.numero(body.monto),
        autorizadoPorId: autorizadoPorId,
        justificanteUrl: String(body.justificanteUrl ?? '').trim() || null,
        semanaNomina,
        creadoPorId: actor.id,
      },
    });
  }

  async actualizar(sesion: Sesion, companyId: number, id: number, body: any) {
    const actor = await this.actor(sesion, companyId);
    this.puedeEscribir(actor);
    const row = await this.prisma.incidenciaPersonal.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Incidencia no encontrada.');
    if (row.estado === 'APLICADA') throw new BadRequestException('Ya está aplicada a prenómina; no se edita.');
    if (row.estado === 'CANCELADA') throw new BadRequestException('Está cancelada.');

    const data: any = {};
    if (body.concepto != null) {
      data.concepto = String(body.concepto).trim();
      if (data.concepto.length < 2 || data.concepto.length > 200) throw new BadRequestException('El concepto debe tener entre 2 y 200 caracteres.');
    }
    if (body.cantidad !== undefined) data.cantidad = this.numero(body.cantidad);
    if (body.monto !== undefined) data.monto = this.numero(body.monto);
    if (body.autorizadoPorId !== undefined) data.autorizadoPorId = body.autorizadoPorId ? Number(body.autorizadoPorId) : null;
    if (body.justificanteUrl !== undefined) data.justificanteUrl = String(body.justificanteUrl ?? '').trim() || null;
    if (body.estado === 'CANCELADA') data.estado = 'CANCELADA';
    return this.prisma.incidenciaPersonal.update({ where: { id, companyId, estado: 'REGISTRADA' }, data });
  }

  async aplicarSemana(sesion: Sesion, companyId: number, semana: string) {
    const actor = await this.actor(sesion, companyId);
    this.puedeEscribir(actor);
    const lunes = lunesDe(this.fechaValida(String(semana ?? '').trim()));
    return this.prisma.$transaction(async (tx) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lunes)) throw new BadRequestException('Semana inválida.');

      const nomina = await tx.nominaSemana.upsert({
        create: { companyId, inicio: new Date(`${lunes}T12:00:00.000Z`), fin: new Date(`${domingoDe(lunes)}T12:00:00.000Z`) },
        update: {},
        where: { companyId_inicio: { companyId, inicio: new Date(`${lunes}T12:00:00.000Z`) } },
      });
      const abierta = await tx.nominaSemana.updateMany({ where: { id: nomina.id, companyId, estado: { not: 'CERRADA' } }, data: { fin: nomina.fin } });
      if (abierta.count !== 1) {
        throw new BadRequestException('La semana de nómina está cerrada; no se puede aplicar.');
      }
      const semanaId = nomina.id;

      const filas = await tx.incidenciaPersonal.findMany({
        where: {
          companyId,
          semanaNomina: lunes,
          estado: 'REGISTRADA',
          tipo: { in: [...APLICABLES] as TipoIncidenciaPersonal[] },
          monto: { not: null },
        },
      });

      let aplicadas = 0;
      for (const f of filas) {
        if (f.nominaDescuentoId) continue;
        const monto = Number(f.monto);
        if (!Number.isFinite(monto) || monto <= 0) continue;
        const reclamada = await tx.incidenciaPersonal.updateMany({
          where: { id: f.id, companyId, estado: 'REGISTRADA', nominaDescuentoId: null, updatedAt: f.updatedAt }, data: { estado: 'APLICADA' },
        });
        if (reclamada.count !== 1) continue;
        const desc = await tx.nominaDescuento.create({
          data: {
            semanaId,
            companyId,
            userId: f.userId,
            concepto: f.concepto,
            monto,
            sugerido: false,
            fecha: f.fecha,
            creadoPorId: actor.id,
          },
        });
        await tx.incidenciaPersonal.update({
          where: { id: f.id, companyId },
          data: { estado: 'APLICADA', nominaDescuentoId: desc.id },
        });
        aplicadas += 1;
      }
      return { semana: lunes, aplicadas, revisadas: filas.length };
    });
  }

  async importar(sesion: Sesion, companyId: number, buffer: Buffer) {
    const actor = await this.actor(sesion, companyId);
    this.puedeEscribir(actor);

    const wb = new ExcelJS.Workbook();
    if (!buffer?.length) throw new BadRequestException('Adjunta un archivo Excel .xlsx.');
    try { await wb.xlsx.load(buffer as any); } catch { throw new BadRequestException('No se pudo leer el archivo Excel .xlsx.'); }
    const sheet = wb.worksheets.find((s) => sinAcentos(s.name) === 'incidencias') ?? wb.worksheets[0];
    if (!sheet) throw new BadRequestException('El Excel no tiene hojas.');

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col] = sinAcentos(String(cell.value ?? ''));
    });
    const col = (aliases: string[]) => headers.findIndex((h, i) => i > 0 && aliases.includes(h));

    const iId = col(['id', 'id nex', 'numero', 'employee number', 'no empleado', 'clave']);
    const iNombre = col(['nombre', 'persona', 'empleado']);
    const iFecha = col(['fecha']);
    const iConcepto = col(['concepto', 'descripcion', 'descripción']);
    const iTipo = col(['tipo', 'concepto tipo']);
    const iCant = col(['cantidad', 'dias', 'días', 'horas']);
    const iMonto = col(['monto', 'importe', 'cantidad $']);

    const personal = await this.prisma.user.findMany({
      where: { companyMemberships: { some: { companyId } }, isActive: true },
      select: { id: true, nombre: true, employeeNumber: true },
    });
    const byNum = new Map(personal.filter((p) => p.employeeNumber).map((p) => [sinAcentos(p.employeeNumber!), p]));
    const byName = new Map(personal.map((p) => [sinAcentos(p.nombre), p]));

    const creadas: any[] = [];
    const noReconocidas: Array<{ fila: number; id?: string; nombre?: string; motivo: string }> = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawId = iId > 0 ? String(row.getCell(iId).value ?? '').trim() : '';
      const rawNombre = iNombre > 0 ? String(row.getCell(iNombre).value ?? '').trim() : '';
      const persona =
        (rawId && (byNum.get(sinAcentos(rawId)) || byNum.get(sinAcentos(rawId.replace(/^nex-?/i, 'nex-'))))) ||
        (rawNombre && byName.get(sinAcentos(rawNombre))) ||
        null;
      if (!persona) {
        if (rawId || rawNombre) noReconocidas.push({ fila: rowNumber, id: rawId || undefined, nombre: rawNombre || undefined, motivo: 'Persona no encontrada' });
        return;
      }
      // Stash for create after loop (async)
      (row as any).__persona = persona;
    });

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const persona = (row as any).__persona;
      if (!persona) continue;
      const fechaCell = iFecha > 0 ? row.getCell(iFecha).value : null;
      let fecha = '';
      if (fechaCell instanceof Date) fecha = fechaCell.toISOString().slice(0, 10);
      else if (typeof fechaCell === 'number' && Number.isFinite(fechaCell)) {
        const serial = Math.floor(fechaCell) + (wb.properties.date1904 ? 1462 : 0);
        const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        if (Number.isFinite(date.getTime())) fecha = date.toISOString().slice(0, 10);
      } else fecha = String(fechaCell ?? '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha) {
        noReconocidas.push({ fila: rowNumber, id: persona.employeeNumber ?? undefined, nombre: persona.nombre, motivo: 'Fecha inválida' });
        continue;
      }
      const concepto = iConcepto > 0 ? String(row.getCell(iConcepto).value ?? '').trim() : 'Incidencia importada';
      let tipo = iTipo > 0 ? sinAcentos(String(row.getCell(iTipo).value ?? '')).toUpperCase().replace(/\s+/g, '_') : 'OTRO';
      if (!TIPOS.has(tipo)) tipo = 'OTRO';
      const cantidad = iCant > 0 && row.getCell(iCant).value != null && row.getCell(iCant).value !== '' ? Number(row.getCell(iCant).value) : null;
      const monto = iMonto > 0 && row.getCell(iMonto).value != null && row.getCell(iMonto).value !== '' ? Number(row.getCell(iMonto).value) : null;
      if ((cantidad !== null && (!Number.isFinite(cantidad) || cantidad < 0)) || (monto !== null && (!Number.isFinite(monto) || monto < 0))) {
        noReconocidas.push({ fila: rowNumber, nombre: persona.nombre, motivo: 'Cantidad o monto inválido' });
        continue;
      }
      const created = await this.prisma.incidenciaPersonal.create({
        data: {
          companyId,
          userId: persona.id,
          fecha: new Date(`${fecha}T12:00:00.000Z`),
          tipo: tipo as TipoIncidenciaPersonal,
          concepto: concepto || 'Incidencia importada',
          cantidad: Number.isFinite(cantidad as number) ? cantidad : null,
          monto: Number.isFinite(monto as number) ? monto : null,
          semanaNomina: lunesDe(fecha),
          creadoPorId: actor.id,
        },
      });
      creadas.push(created);
    }

    return { creadas: creadas.length, noReconocidas };
  }
}

