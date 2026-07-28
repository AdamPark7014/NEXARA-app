import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from './tenant/tenant-scope.js';

/** Import models whose Prisma target carries companyId (tenant-scoped). */
const TENANT_IMPORT_MODELS = new Set(['activity', 'evidence', 'vehicle', 'viatic']);

const MODEL_SCHEMAS = {
  viatic: z.object({
    actividadId: z.number().int().positive(),
    usuarioId: z.number().int().positive(),
    montoSolicitado: z.number(),
    razonGasto: z.string().optional(),
    ticketEvidenciaUrl: z.string().optional(),
    estatusPago: z.string().optional(),
    fechaSolicitud: z.date().optional(),
  }),
  vehicle: z.object({
    actividadId: z.number().int().positive(),
    solicitanteId: z.number().int().positive(),
    nombreVehiculo: z.string().optional(),
    placasVehiculo: z.string().optional(),
    estatusAprobacion: z.string().optional(),
    evidenciaEntregaUrl: z.string().optional(),
    evidenciaDevolucionUrl: z.string().optional(),
    fechaInicio: z.date().optional(),
    fechaFin: z.date().optional(),
    fechaInicioSolicitada: z.date().optional(),
    fechaFinSolicitada: z.date().optional(),
    fechaInicioAprobada: z.date().optional(),
    fechaFinAprobada: z.date().optional(),
    motivoUso: z.string().optional(),
  }),
  activity: z.object({
    anNumber: z.string().min(1),
    titulo: z.string().min(1),
    creadoPorId: z.number().int().positive(),
    responsableId: z.number().int().positive(),
    descripcion: z.string().optional(),
    indicaciones: z.string().optional(),
    estatus: z.string().optional(),
    prioridad: z.string().optional(),
    fechaInicio: z.date().optional(),
    fechaMaxima: z.date().optional(),
    fechaEntregaEsperada: z.date().optional(),
    fechaFinalizacion: z.date().optional(),
    clientId: z.number().int().positive().optional(),
    branchName: z.string().optional(),
    branchNumber: z.string().optional(),
    branchCity: z.string().optional(),
    branchState: z.string().optional(),
    branchAddress: z.string().optional(),
    tiempoEstimadoMin: z.number().int().nonnegative().optional(),
    tiempoMaximoMin: z.number().int().nonnegative().optional(),
  }),
  evidence: z.object({
    actividadId: z.number().int().positive(),
    tipoEvidencia: z.string().min(1),
    archivoUrl: z.string().min(1),
    aprobada: z.boolean().optional(),
    estatus: z.string().optional(),
    comentarios: z.string().optional(),
    observacionesRevision: z.string().optional(),
    calificacionEficiencia: z.string().optional(),
    latitud: z.number().optional(),
    longitud: z.number().optional(),
    aprobadoPorId: z.number().int().positive().optional(),
    revisadoEn: z.date().optional(),
    subidoEn: z.date().optional(),
    userId: z.number().int().positive().optional(),
  }),
};

const MODEL_HEADERS: Record<string, string[]> = {
  viatic: ['actividadId', 'usuarioId', 'montoSolicitado', 'razonGasto', 'ticketEvidenciaUrl', 'estatusPago', 'fechaSolicitud'],
  vehicle: ['actividadId', 'solicitanteId', 'nombreVehiculo', 'placasVehiculo', 'motivoUso', 'estatusAprobacion', 'evidenciaEntregaUrl', 'evidenciaDevolucionUrl', 'fechaInicio', 'fechaFin', 'fechaInicioSolicitada', 'fechaFinSolicitada', 'fechaInicioAprobada', 'fechaFinAprobada'],
  activity: ['anNumber', 'titulo', 'creadoPorId', 'responsableId', 'descripcion', 'indicaciones', 'estatus', 'prioridad', 'fechaInicio', 'fechaMaxima', 'fechaEntregaEsperada', 'fechaFinalizacion', 'clientId', 'branchName', 'branchNumber', 'branchCity', 'branchState', 'branchAddress', 'tiempoEstimadoMin', 'tiempoMaximoMin'],
  evidence: ['actividadId', 'tipoEvidencia', 'archivoUrl', 'aprobada', 'estatus', 'comentarios', 'observacionesRevision', 'calificacionEficiencia', 'latitud', 'longitud', 'aprobadoPorId', 'revisadoEn', 'subidoEn', 'userId'],
};

const HEADER_ALIASES: Record<string, Record<string, string>> = {
  viatic: {
    actividadid: 'actividadId',
    actividad: 'actividadId',
    an: 'actividadId',
    ans: 'actividadId',
    usuarioid: 'usuarioId',
    usuario: 'usuarioId',
    responsableid: 'usuarioId',
    responsable: 'usuarioId',
    montosolicitado: 'montoSolicitado',
    monto: 'montoSolicitado',
    total: 'montoSolicitado',
    razongasto: 'razonGasto',
    razon: 'razonGasto',
    ticketevidenciaurl: 'ticketEvidenciaUrl',
    ticket: 'ticketEvidenciaUrl',
    estatuspago: 'estatusPago',
    estatus: 'estatusPago',
    fechasolicitud: 'fechaSolicitud',
  },
  vehicle: {
    actividadid: 'actividadId',
    solicitanteid: 'solicitanteId',
    usuarioid: 'solicitanteId',
    responsableid: 'solicitanteId',
    nombrevehiculo: 'nombreVehiculo',
    placasvehiculo: 'placasVehiculo',
    placas: 'placasVehiculo',
    motivouso: 'motivoUso',
    estatusaprobacion: 'estatusAprobacion',
    estatus: 'estatusAprobacion',
    evidenciaentregaurl: 'evidenciaEntregaUrl',
    evidenciaentrega: 'evidenciaEntregaUrl',
    evidenciadevolucionurl: 'evidenciaDevolucionUrl',
    evidenciadevolucion: 'evidenciaDevolucionUrl',
    fechainicio: 'fechaInicio',
    inicio: 'fechaInicio',
    fechafin: 'fechaFin',
    fin: 'fechaFin',
    fechainiciosolicitada: 'fechaInicioSolicitada',
    fechafinsolicitada: 'fechaFinSolicitada',
    fechainicioaprobada: 'fechaInicioAprobada',
    fechafinaprobada: 'fechaFinAprobada',
  },
  activity: {
    annumber: 'anNumber',
    an: 'anNumber',
    titulo: 'titulo',
    creadoporid: 'creadoPorId',
    responsableid: 'responsableId',
    usuarioid: 'responsableId',
    estatus: 'estatus',
    prioridad: 'prioridad',
    descripcion: 'descripcion',
    indicaciones: 'indicaciones',
    fechainicio: 'fechaInicio',
    fechamaxima: 'fechaMaxima',
    fechaentregaesperada: 'fechaEntregaEsperada',
    fechafinalizacion: 'fechaFinalizacion',
    clientid: 'clientId',
    branchname: 'branchName',
    branchnumber: 'branchNumber',
    branchcity: 'branchCity',
    branchstate: 'branchState',
    branchaddress: 'branchAddress',
    tiempoestimadomin: 'tiempoEstimadoMin',
    tiempomaximomin: 'tiempoMaximoMin',
  },
  evidence: {
    actividadid: 'actividadId',
    actividad: 'actividadId',
    tipoevidencia: 'tipoEvidencia',
    tipo: 'tipoEvidencia',
    archivourl: 'archivoUrl',
    archivo: 'archivoUrl',
    aprobada: 'aprobada',
    estatus: 'estatus',
    comentarios: 'comentarios',
    observacionesrevision: 'observacionesRevision',
    calificacioneficiencia: 'calificacionEficiencia',
    latitud: 'latitud',
    longitud: 'longitud',
    aprobadoporid: 'aprobadoPorId',
    revisadoen: 'revisadoEn',
    subidoen: 'subidoEn',
    userid: 'userId',
    usuarioid: 'userId',
    usuario: 'userId',
  },
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function cellToValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('result' in value) return (value as any).result ?? '';
    if ('text' in value) return (value as any).text ?? '';
    if ('hyperlink' in value) return (value as any).hyperlink ?? '';
    if ('richText' in value && Array.isArray((value as any).richText)) {
      return (value as any).richText.map((segment: any) => segment?.text ?? '').join('');
    }
  }
  return value;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const v = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'si', 'sí', 'aprobada', 'aprobado', 'yes'].includes(v);
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim().replace(/[$,\s]/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function parseDateLike(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function detectHeaderRow(worksheet: ExcelJS.Worksheet, model: string): number {
  const expected = new Set(MODEL_HEADERS[model].map((key) => normalizeHeader(key)));
  const aliases = HEADER_ALIASES[model] || {};
  let bestRow = 1;
  let bestScore = -1;
  const scanLimit = Math.min(worksheet.rowCount, 12);

  for (let rowIndex = 1; rowIndex <= scanLimit; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const values = (Array.isArray(row.values) ? row.values.slice(1) : []) as unknown[];
    let score = 0;
    for (const value of values) {
      const normalized = normalizeHeader(value);
      if (!normalized) continue;
      if (expected.has(normalized) || aliases[normalized]) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = rowIndex;
    }
  }

  return bestRow;
}

@Injectable()
export class ExcelImportService {
  constructor(private readonly prisma: PrismaService) {}

  private coerceRowByModel(model: string, row: Record<string, unknown>): Record<string, unknown> {
    const out = { ...row };
    if (model === 'viatic') {
      out.actividadId = parseNumber(out.actividadId);
      out.usuarioId = parseNumber(out.usuarioId);
      out.montoSolicitado = parseNumber(out.montoSolicitado);
      out.fechaSolicitud = parseDateLike(out.fechaSolicitud);
    }
    if (model === 'evidence') {
      out.actividadId = parseNumber(out.actividadId);
      if (out.aprobada !== undefined) out.aprobada = parseBoolean(out.aprobada);
      out.latitud = parseNumber(out.latitud);
      out.longitud = parseNumber(out.longitud);
      out.aprobadoPorId = parseNumber(out.aprobadoPorId);
      out.userId = parseNumber(out.userId);
      out.revisadoEn = parseDateLike(out.revisadoEn);
      out.subidoEn = parseDateLike(out.subidoEn);
    }
    if (model === 'vehicle') {
      out.actividadId = parseNumber(out.actividadId);
      out.solicitanteId = parseNumber(out.solicitanteId);
      out.fechaInicio = parseDateLike(out.fechaInicio);
      out.fechaFin = parseDateLike(out.fechaFin);
      out.fechaInicioSolicitada = parseDateLike(out.fechaInicioSolicitada);
      out.fechaFinSolicitada = parseDateLike(out.fechaFinSolicitada);
      out.fechaInicioAprobada = parseDateLike(out.fechaInicioAprobada);
      out.fechaFinAprobada = parseDateLike(out.fechaFinAprobada);
    }
    if (model === 'activity') {
      out.creadoPorId = parseNumber(out.creadoPorId);
      out.responsableId = parseNumber(out.responsableId);
      out.clientId = parseNumber(out.clientId);
      out.tiempoEstimadoMin = parseNumber(out.tiempoEstimadoMin);
      out.tiempoMaximoMin = parseNumber(out.tiempoMaximoMin);
      out.fechaInicio = parseDateLike(out.fechaInicio);
      out.fechaMaxima = parseDateLike(out.fechaMaxima);
      out.fechaEntregaEsperada = parseDateLike(out.fechaEntregaEsperada);
      out.fechaFinalizacion = parseDateLike(out.fechaFinalizacion);
    }

    Object.keys(out).forEach((key) => {
      if (out[key] === '' || out[key] === null || out[key] === undefined) delete out[key];
      if (typeof out[key] === 'number' && Number.isNaN(out[key] as number)) delete out[key];
    });

    const allowed = new Set(MODEL_HEADERS[model] || []);
    Object.keys(out).forEach((key) => {
      if (!allowed.has(key)) delete out[key];
    });

    delete (out as any).id;
    return out;
  }

  async importExcel(
    model: string,
    fileBuffer: Buffer | Uint8Array | ArrayBuffer,
    companyId?: number | null,
  ) {
    if (!(model in MODEL_SCHEMAS)) throw new BadRequestException('Modelo no permitido');

    let tenantId: number | null = null;
    if (TENANT_IMPORT_MODELS.has(model)) {
      tenantId = requireCompanyId(companyId);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new BadRequestException('La hoja especificada no existe en el archivo.');

    const aliases = HEADER_ALIASES[model] || {};
    const expectedMap = new Map((MODEL_HEADERS[model] || []).map((key) => [normalizeHeader(key), key]));
    const headerRowIndex = detectHeaderRow(worksheet, model);
    const headerRow = worksheet.getRow(headerRowIndex);
    const headerValues = (Array.isArray(headerRow.values) ? headerRow.values.slice(1) : []) as unknown[];
    const headers = headerValues.map((raw) => {
      const normalized = normalizeHeader(raw);
      if (!normalized) return '';
      return aliases[normalized] || expectedMap.get(normalized) || normalized;
    });

    const rawData: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return;
      const obj: any = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (typeof header === 'string' && header) {
          const value = cellToValue(cell.value);
          obj[header] = value;
          if (value !== '' && value !== null && value !== undefined) hasValue = true;
        }
      });
      if (hasValue) rawData.push(obj);
    });

    const schema = MODEL_SCHEMAS[model as keyof typeof MODEL_SCHEMAS];
    const validData: any[] = [];
    const errors: any[] = [];

    for (const [i, row] of rawData.entries()) {
      try {
        const parsed = schema.parse(this.coerceRowByModel(model, row));
        if (tenantId != null) {
          validData.push({ ...parsed, companyId: tenantId });
        } else {
          validData.push(parsed);
        }
      } catch (err) {
        if (err instanceof z.ZodError) {
          errors.push({ row: i + headerRowIndex + 1, error: err.issues });
        } else {
          errors.push({ row: i + headerRowIndex + 1, error: err });
        }
      }
    }

    if (validData.length === 0) {
      throw new BadRequestException({ message: 'No hay datos válidos', errors });
    }

    if (model === 'viatic') {
      throw new BadRequestException(
        'Importación masiva de viáticos deshabilitada — usa el flujo de solicitud con evidencia.',
      );
    }

    const MODEL_MAP: Record<string, keyof PrismaService> = {
      vehicle: 'vehicleControl',
      activity: 'activity',
      evidence: 'evidence',
    };
    const prismaModel = MODEL_MAP[model];
    if (!prismaModel) throw new BadRequestException('Modelo no permitido');

    const result = await (this.prisma as any)[prismaModel].createMany({
      data: validData,
      skipDuplicates: true,
    });

    return {
      message: 'Importación finalizada',
      importados: result.count,
      errores: errors,
      filaEncabezados: headerRowIndex,
    };
  }
}