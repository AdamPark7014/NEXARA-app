import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PLATFORM_OWNER_EMAIL } from '../../common/platform-accounts.js';
import { esDireccion } from '../../users/user-creation-policy.js';
import { ROLES } from '../../common/rbac/roles.v2.js';

type Sesion = { id?: number | string | null; email?: string | null; roleKey?: string | null; isSuperAdmin?: boolean };

export type FilaBasePersonal = {
  fila: number;
  idNex?: string | null;
  nombre?: string | null;
  puesto?: string | null;
  area?: string | null;
  fechaAlta?: string | null;
  estatus?: string | null;
  fechaBaja?: string | null;
  motivoBaja?: string | null;
  correo?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  curp?: string | null;
  nss?: string | null;
  domicilio?: string | null;
  sueldo?: number | null;
};

const sinAcentos = (v: string) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

function celda(row: ExcelJS.Row, idx: number): string {
  const v = row.getCell(idx).value;
  if (v == null) return '';
  if (typeof v === 'object' && v && 'text' in (v as any)) return String((v as any).text ?? '').trim();
  if (typeof v === 'object' && v && 'result' in (v as any)) return String((v as any).result ?? '').trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function parseFecha(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s ? s : null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${y}-${mo}-${d}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
}

function parseSueldo(raw: string): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[,$]/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

@Injectable()
export class PersonalImportService {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(sesion: Sesion, companyId: number) {
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      throw new ForbiddenException('Selecciona una empresa válida.');
    }
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0) throw new ForbiddenException('Sesión inválida.');
    const actor = await this.prisma.user.findUnique({
      where: { id, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, roleKey: true, isActive: true, nombre: true },
    });
    if (!actor || actor.isActive === false) throw new ForbiddenException('Tu usuario no está activo.');
    if (!esDireccion(actor, PLATFORM_OWNER_EMAIL) && actor.roleKey !== ROLES.RH) {
      throw new ForbiddenException('Solo RH o dirección importan la base de personal.');
    }
    return actor;
  }

  private async leerFilas(buffer: Buffer): Promise<FilaBasePersonal[]> {
    if (!buffer?.length) throw new BadRequestException('Adjunta un archivo Excel .xlsx.');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel .xlsx.');
    }
    const sheet =
      wb.worksheets.find((s) => sinAcentos(s.name).replace(/\s+/g, '_').includes('base_personal')) ||
      wb.worksheets.find((s) => sinAcentos(s.name).includes('base personal'));
    if (!sheet) throw new BadRequestException('El Excel no trae la hoja Base_Personal.');

    const header = sheet.getRow(1);
    const map: Record<string, number> = {};
    header.eachCell((cell, col) => {
      const k = sinAcentos(String(cell.value ?? ''));
      if (k) map[k] = col;
    });
    const col = (...nombres: string[]) => {
      for (const n of nombres) if (map[sinAcentos(n)]) return map[sinAcentos(n)];
      return 0;
    };

    const cId = col('id', 'nex', 'numero', 'no empleado', 'employee number');
    const cNombre = col('nombre', 'name');
    const cPuesto = col('puesto', 'cargo');
    const cArea = col('area', 'área', 'departamento');
    const cAlta = col('fecha de alta', 'fecha alta', 'alta', 'ingreso');
    const cEstatus = col('estatus', 'estado', 'status');
    const cCorreo = col('correo', 'email', 'mail');
    const cTel = col('telefono', 'teléfono', 'celular');
    const cRfc = col('rfc');
    const cCurp = col('curp');
    const cNss = col('nss', 'imss');
    const cDom = col('domicilio', 'direccion', 'dirección');
    const cSueldo = col('sueldo', 'salario', 'sueldo semanal');
    if (!cNombre && !cId && !cCorreo) {
      throw new BadRequestException('La hoja Base_Personal no trae columnas reconocibles (ID, nombre o correo).');
    }

    const filas: FilaBasePersonal[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const nombre = cNombre ? celda(row, cNombre) : '';
      const idNex = cId ? celda(row, cId) : '';
      const correo = cCorreo ? celda(row, cCorreo).toLowerCase() : '';
      if (!nombre && !idNex && !correo) return;
      const estatusRaw = cEstatus ? celda(row, cEstatus) : '';
      const estatusNorm = sinAcentos(estatusRaw);
      let fechaBaja: string | null = null;
      let motivoBaja: string | null = null;
      if (estatusNorm.includes('baja')) {
        const mFecha = estatusRaw.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        fechaBaja = mFecha ? parseFecha(mFecha[1]) : null;
        motivoBaja = estatusRaw.replace(/baja/i, '').replace(mFecha?.[0] ?? '', '').trim() || null;
      }
      filas.push({
        fila: rowNumber,
        idNex: idNex || null,
        nombre: nombre || null,
        puesto: cPuesto ? celda(row, cPuesto) || null : null,
        area: cArea ? celda(row, cArea) || null : null,
        fechaAlta: cAlta ? parseFecha(celda(row, cAlta)) : null,
        estatus: estatusRaw || null,
        fechaBaja,
        motivoBaja,
        correo: correo || null,
        telefono: cTel ? celda(row, cTel) || null : null,
        rfc: cRfc ? celda(row, cRfc) || null : null,
        curp: cCurp ? celda(row, cCurp) || null : null,
        nss: cNss ? celda(row, cNss) || null : null,
        domicilio: cDom ? celda(row, cDom) || null : null,
        sueldo: cSueldo ? parseSueldo(celda(row, cSueldo)) : null,
      });
    });
    return filas;
  }

  private async padrones(companyId: number) {
    const users = await this.prisma.user.findMany({
      where: { companyMemberships: { some: { companyId } } },
      select: {
        id: true,
        nombre: true,
        email: true,
        employeeNumber: true,
        puesto: true,
        isActive: true,
        estadoRRHH: true,
        fechaIngreso: true,
        perfil: { select: { telefono: true, rfc: true, curp: true, nss: true, direccion: true, sueldoSemanal: true } },
        empleadoPerfil: { select: { companyId: true, area: true } },
      },
      take: 5000,
    });
    return users.map((u) => ({ ...u, empleadoPerfil: u.empleadoPerfil?.companyId === companyId ? u.empleadoPerfil : null }));
  }

  private empatar(fila: FilaBasePersonal, users: Awaited<ReturnType<PersonalImportService['padrones']>>) {
    const nex = String(fila.idNex ?? '').trim().toUpperCase();
    if (nex) {
      const byNex = users.find((u) => String(u.employeeNumber ?? '').trim().toUpperCase() === nex);
      if (byNex) return byNex;
    }
    const correo = String(fila.correo ?? '').trim().toLowerCase();
    if (correo) {
      const byMail = users.find((u) => u.email.toLowerCase() === correo);
      if (byMail) return byMail;
    }
    const nombre = sinAcentos(fila.nombre ?? '');
    if (nombre) {
      const matches = users.filter((u) => sinAcentos(u.nombre) === nombre);
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  private diffCampos(fila: FilaBasePersonal, user: Awaited<ReturnType<PersonalImportService['padrones']>>[number]) {
    const cambios: Array<{ campo: string; actual: string | null; excel: string | null }> = [];
    const push = (campo: string, actual: unknown, excel: unknown) => {
      const a = actual == null || actual === '' ? null : String(actual);
      const e = excel == null || excel === '' ? null : String(excel);
      if (a === e) return;
      if (a != null && e != null && sinAcentos(a) === sinAcentos(e)) return;
      cambios.push({ campo, actual: a, excel: e });
    };
    if (fila.puesto) push('puesto', user.puesto, fila.puesto);
    if (fila.area) push('area', user.empleadoPerfil?.area, fila.area);
    if (fila.telefono) push('telefono', user.perfil?.telefono, fila.telefono);
    if (fila.rfc) push('rfc', user.perfil?.rfc, fila.rfc);
    if (fila.curp) push('curp', user.perfil?.curp, fila.curp);
    if (fila.nss) push('nss', user.perfil?.nss, fila.nss);
    if (fila.domicilio) push('domicilio', user.perfil?.direccion, fila.domicilio);
    if (fila.sueldo != null) {
      const actual = user.perfil?.sueldoSemanal != null ? Number(user.perfil.sueldoSemanal) : null;
      if (actual !== fila.sueldo) {
        cambios.push({ campo: 'sueldoSemanal', actual: actual == null ? null : String(actual), excel: String(fila.sueldo) });
      }
    }
    if (fila.idNex) push('employeeNumber', user.employeeNumber, fila.idNex);
    if (fila.fechaAlta) {
      const actual = user.fechaIngreso ? user.fechaIngreso.toISOString().slice(0, 10) : null;
      push('fechaIngreso', actual, fila.fechaAlta);
    }
    return cambios;
  }

  async previsualizar(sesion: Sesion, companyId: number, buffer: Buffer) {
    await this.actor(sesion, companyId);
    const filas = await this.leerFilas(buffer);
    const users = await this.padrones(companyId);
    const seActualiza: Array<{
      userId: number;
      nombre: string;
      employeeNumber: string | null;
      fila: FilaBasePersonal;
      cambios: Array<{ campo: string; actual: string | null; excel: string | null }>;
    }> = [];
    const noEsta: FilaBasePersonal[] = [];
    const bajaEnExcel: Array<{ userId: number; nombre: string; employeeNumber: string | null; fila: FilaBasePersonal }> = [];

    for (const fila of filas) {
      const match = this.empatar(fila, users);
      const estatusBaja = sinAcentos(fila.estatus ?? '').includes('baja');
      if (!match) {
        noEsta.push(fila);
        continue;
      }
      if (estatusBaja && match.isActive !== false) {
        bajaEnExcel.push({ userId: match.id, nombre: match.nombre, employeeNumber: match.employeeNumber, fila });
        continue;
      }
      const cambios = this.diffCampos(fila, match);
      if (cambios.length) {
        seActualiza.push({
          userId: match.id,
          nombre: match.nombre,
          employeeNumber: match.employeeNumber,
          fila,
          cambios,
        });
      }
    }

    return {
      totalFilas: filas.length,
      seActualiza,
      noEstaEnPlataforma: noEsta,
      bajaEnExcelActivoEnPlataforma: bajaEnExcel,
      nota: 'Nada se escribe hasta que confirmes. El puesto y el sueldo requieren aprobación de dirección desde el expediente.',
    };
  }

  async confirmar(
    sesion: Sesion,
    companyId: number,
    body: {
      actualizar?: Array<Record<string, unknown> & { userId: number; campos: string[] }>;
      marcarAlta?: Array<{ fila: number; nombre?: string | null; correo?: string | null; idNex?: string | null }>;
    },
  ) {
    const actor = await this.actor(sesion, companyId);
    if (body.actualizar !== undefined && !Array.isArray(body.actualizar)) throw new BadRequestException('Los cambios deben ser una lista.');
    const actualizar = body.actualizar ?? [];
    if (actualizar.length > 500) throw new BadRequestException('Confirma como máximo 500 personas por importación.');
    const permitidos = new Set(['employeeNumber', 'fechaIngreso', 'telefono', 'rfc', 'curp', 'nss', 'domicilio', 'area']);
    const personas = new Set<number>();
    for (const item of actualizar) {
      if (!item || !Number.isSafeInteger(item.userId) || item.userId <= 0 || personas.has(item.userId)) {
        throw new BadRequestException('Cada persona debe tener un identificador válido y aparecer una sola vez.');
      }
      personas.add(item.userId);
      if (!Array.isArray(item.campos) || item.campos.some((campo) => !permitidos.has(campo))) {
        throw new BadRequestException('El puesto y el sueldo requieren aprobación de dirección. Selecciona solo campos importables.');
      }
      for (const campo of item.campos) {
        const valor = item[campo];
        if (typeof valor !== 'string' || !valor.trim() || valor.length > 1000) throw new BadRequestException('Cada campo elegido debe tener un texto válido de hasta 1,000 caracteres.');
        if (campo === 'fechaIngreso' && (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || parseFecha(valor) !== valor)) throw new BadRequestException('La fecha de ingreso debe ser una fecha válida AAAA-MM-DD.');
        if (campo === 'employeeNumber' && !/^NEX-\d+$/i.test(valor.trim())) throw new BadRequestException('El número de empleado debe tener el formato NEX-001.');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const resultados: Array<{ userId: number; aplicados: string[] }> = [];
  
      for (const item of actualizar) {
        const userId = Number(item.userId);
        if (!Number.isSafeInteger(userId) || userId <= 0) continue;
        const campos = new Set((item.campos ?? []).map(String));
        if (!campos.size) continue;
        const user = await tx.user.findFirst({
          where: { id: userId, companyMemberships: { some: { companyId } } },
          select: { id: true },
        });
        if (!user) throw new ForbiddenException('Una de las personas no pertenece a la empresa seleccionada.');

        const aplicados: string[] = [];
        const userData: Record<string, unknown> = {};
        if (campos.has('employeeNumber') && item.employeeNumber != null) {
          userData.employeeNumber = String(item.employeeNumber).trim();
          aplicados.push('employeeNumber');
        }
        if (campos.has('fechaIngreso') && item.fechaIngreso) {
          userData.fechaIngreso = new Date(`${String(item.fechaIngreso).slice(0, 10)}T12:00:00.000Z`);
          aplicados.push('fechaIngreso');
        }
        if (Object.keys(userData).length) {
          await tx.user.update({ where: { id: userId, companyMemberships: { some: { companyId } } }, data: userData as any });
        }

        const perfilData: Record<string, unknown> = {};
        if (campos.has('telefono') && item.telefono != null) {
          perfilData.telefono = String(item.telefono).trim();
          aplicados.push('telefono');
        }
        if (campos.has('rfc') && item.rfc != null) {
          perfilData.rfc = String(item.rfc).trim();
          aplicados.push('rfc');
        }
        if (campos.has('curp') && item.curp != null) {
          perfilData.curp = String(item.curp).trim();
          aplicados.push('curp');
        }
        if (campos.has('nss') && item.nss != null) {
          perfilData.nss = String(item.nss).trim();
          aplicados.push('nss');
        }
        if (campos.has('domicilio') && item.domicilio != null) {
          perfilData.direccion = String(item.domicilio).trim();
          aplicados.push('domicilio');
        }
        if (Object.keys(perfilData).length) {
          await tx.userProfile.upsert({
            where: { userId },
            create: { userId, ...perfilData } as any,
            update: perfilData as any,
          });
        }
        if (campos.has('area') && item.area != null) {
          await tx.empleadoPerfil.upsert({
            where: { userId, companyId },
            create: { userId, companyId, area: String(item.area).trim() },
            update: { area: String(item.area).trim() },
          });
          aplicados.push('area');
        }
        if (aplicados.length) {
          await tx.empleadoEvento.create({
            data: {
              companyId,
              userId,
              tipo: 'OTRO',
              detalle: { via: 'import_base_personal', aplicados, por: actor.id },
              actorId: actor.id,
            },
          });
          resultados.push({ userId, aplicados });
        }
      }

      return {
        actualizados: resultados,
        altasPendientes: body?.marcarAlta ?? [],
        nota: 'Las altas y bajas usan sus flujos existentes. El puesto y el sueldo requieren aprobación de dirección desde el expediente.',
      };
    });
  }
}
