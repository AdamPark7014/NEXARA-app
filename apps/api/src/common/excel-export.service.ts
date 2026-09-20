import { Injectable } from '@nestjs/common';
import {
  crearReporte,
  etiquetaGenerica,
  type ColumnaReporte,
  type OpcionesReporte,
  type TipoColumna,
} from './excel/reporte-excel.js';

/**
 * Puente entre Nest y el tema Excel corporativo (`excel/reporte-excel.ts`).
 *
 * Los reportes con nombre propio (actividades, evidencias, vehículos, viáticos, asistencia,
 * KPI, los packs de «Exportar») pasan por `exportarReporte` con sus columnas declaradas en
 * `excel/reportes.ts`. `exportToExcel` queda para el endpoint genérico `/export/:model`,
 * que recibe cualquier modelo y tiene que adivinar: infiere el tipo de cada columna por el
 * nombre del campo y por lo que trae la primera fila con dato.
 */

/**
 * Campos que nunca salen en un Excel, aunque el modelo genérico los traiga.
 *
 * `/export/:model` y los exports por módulo hacían `findMany` sin `select` y volcaban el
 * registro entero, así que el hash de contraseña del usuario y el secreto MFA acababan en
 * una hoja de cálculo que se manda por correo. Se filtran aquí, además de declarar columnas
 * explícitas en cada reporte con nombre.
 */
const CAMPOS_PROHIBIDOS = new Set(
  [
    'passwordHash',
    'password',
    'portalPasswordHash',
    'mfaSecret',
    'mfaEnabledAt',
    'oidcSubject',
    'publicToken',
    'apiKey',
    'apiKeyHash',
    'secret',
    'token',
    'refreshToken',
    'accessToken',
  ].map((c) => c.toLowerCase()),
);

/** Campos internos que ensucian el reporte sin aportar nada a quien lo lee. */
const CAMPOS_TECNICOS = new Set(['companyid', 'deletedat', 'approvaltrail', 'moduleaccess']);

const SUFIJOS_ID = /(^id$|Id$|_id$)/;

function tipoPorNombre(clave: string, muestra: unknown): TipoColumna {
  const k = clave.toLowerCase();
  if (typeof muestra === 'boolean') return 'booleano';
  if (
    k.startsWith('fecha') ||
    k.endsWith('at') ||
    k.endsWith('date') ||
    k.includes('fecha') ||
    k === 'createdat' ||
    k === 'updatedat'
  ) {
    return 'fechaHora';
  }
  if (k.includes('monto') || k.includes('total') || k.includes('precio') || k.includes('importe') || k.includes('costo')) {
    return 'dinero';
  }
  if (k.endsWith('pct') || k.includes('porcentaje') || k.includes('percent')) return 'porcentaje';
  if (k.includes('minutos') || k.endsWith('min')) return 'duracion';
  if (typeof muestra === 'number') return Number.isInteger(muestra) ? 'entero' : 'numero';
  return 'texto';
}

@Injectable()
export class ExcelExportService {
  /** Reporte con columnas declaradas: lo que usan todos los módulos con nombre propio. */
  async exportarReporte<T = any>(opciones: OpcionesReporte<T>): Promise<Buffer> {
    return crearReporte(opciones);
  }

  /**
   * Reporte genérico a partir de objetos planos: infiere columnas, tipos y encabezados.
   * Se conserva para `/export/:model`, que no sabe de antemano qué modelo le van a pedir.
   */
  async exportToExcel(
    data: any[],
    sheetName = 'Reporte',
    meta?: { titulo?: string; subtitulo?: string; generadoPor?: string | null },
  ): Promise<Buffer> {
    const filas = Array.isArray(data) ? data : [];
    const claves = Array.from(
      new Set(filas.flatMap((item) => Object.keys(item ?? {}))),
    ).filter((clave) => {
      const k = clave.toLowerCase();
      if (CAMPOS_PROHIBIDOS.has(k) || CAMPOS_TECNICOS.has(k)) return false;
      // Los ids de base no le dicen nada a quien abre el archivo; los folios sí y no acaban en «Id».
      return !SUFIJOS_ID.test(clave);
    });

    const columnas: ColumnaReporte<any>[] = claves.map((clave) => {
      const muestra = filas.find((f) => f?.[clave] !== null && f?.[clave] !== undefined)?.[clave];
      return {
        clave,
        titulo: etiquetaGenerica(clave),
        tipo: tipoPorNombre(clave, muestra),
      };
    });

    return crearReporte({
      titulo: meta?.titulo ?? etiquetaGenerica(sheetName),
      subtitulo: meta?.subtitulo,
      generadoPor: meta?.generadoPor ?? null,
      hoja: etiquetaGenerica(sheetName),
      columnas,
      filas,
    });
  }
}
