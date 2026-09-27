import type { PrismaClient } from '@prisma/client';
import {
  emisorDesdeAjustes,
  SAT_CERT_NUMBER_DE_PRUEBA,
  type AjusteEmpresa,
  type PacEmisorEntrada,
  type PacFacturasEntrada,
} from './pac-readiness.js';

/**
 * Lecturas de base de datos para el reporte de preparación del PAC.
 *
 * SOLO LECTURA: `findMany`, `findFirst` y `count`. Se comparte entre el servicio
 * Nest (`PacReadinessService`) y el CLI (`pac-preflight.cli.ts`), que usa un
 * `PrismaClient` directo. Por eso recibe un `Pick<PrismaClient, …>` y no depende
 * de Nest.
 */
export type PacReadinessDb = Pick<PrismaClient, 'companyProfile' | 'systemSetting' | 'invoice' | 'journalEntry'>;

/** Cuántas facturas timbradas recientes se revisan buscando su póliza. */
const MAX_FACTURAS_REVISADAS_POLIZA = 500;

/**
 * Datos del emisor con la MISMA precedencia que usa `AccountingService`
 * (`getInvoiceIssuerProfile`) al crear una factura:
 *   1. Ajustes `empresa`/`fiscal` (los de la empresa pisan a los de plataforma).
 *      Si existe cualquiera de los cuatro datos, el perfil ya no se consulta.
 *   2. Perfil de empresa (`CompanyProfile`): el de la empresa activa o, sin
 *      empresa, el principal.
 * Devuelve `null` si no hay ni ajustes ni perfil.
 */
export async function leeEmisor(db: PacReadinessDb, companyId: number | null): Promise<PacEmisorEntrada | null> {
  const cid = companyId != null && Number.isFinite(companyId) && companyId > 0 ? companyId : null;

  const filas = await db.systemSetting.findMany({
    where: {
      category: { in: ['empresa', 'fiscal'] },
      ...(cid != null ? { OR: [{ companyId: null }, { companyId: cid }] } : { companyId: null }),
    },
    select: { key: true, value: true, label: true, companyId: true },
  });

  // Igual que al facturar: la fila de la empresa gana a la de plataforma.
  const porClave = new Map<string, AjusteEmpresa>();
  for (const fila of filas) {
    if (fila.companyId == null) {
      if (!porClave.has(fila.key)) porClave.set(fila.key, fila);
    } else {
      porClave.set(fila.key, fila);
    }
  }
  const desdeAjustes = emisorDesdeAjustes([...porClave.values()]);
  if (desdeAjustes) return { ...desdeAjustes, fuente: 'ajustes' };

  const perfil = await db.companyProfile.findFirst({
    where: cid != null ? { id: cid, isActive: true } : { isPrimary: true, isActive: true },
    select: { rfc: true, legalName: true, fiscalRegime: true, fiscalPostalCode: true },
  });
  if (!perfil) return null;
  return {
    rfc: perfil.rfc || null,
    legalName: perfil.legalName || null,
    fiscalRegime: perfil.fiscalRegime || null,
    fiscalPostalCode: perfil.fiscalPostalCode || null,
    fuente: 'perfil_empresa',
  };
}

/**
 * Cuántas facturas por cobrar hay timbradas, cuántas con sello de prueba y
 * cuántas (de las reales, últimas 500) no tienen su póliza `INV-STAMP-<id>`.
 */
export async function leeFacturas(db: PacReadinessDb, companyId: number | null): Promise<PacFacturasEntrada> {
  const cid = companyId != null && Number.isFinite(companyId) && companyId > 0 ? companyId : null;
  // Se filtra `deletedAt` a mano: un PrismaClient directo (CLI) no trae el middleware de borrado lógico.
  const base = {
    deletedAt: null,
    type: 'ACCOUNTS_RECEIVABLE' as const,
    cfdiUuid: { not: null },
    ...(cid != null ? { companyId: cid } : {}),
  };

  const [timbradas, conSelloDePrueba, recientes] = await Promise.all([
    db.invoice.count({ where: base }),
    db.invoice.count({ where: { ...base, satCertNumber: SAT_CERT_NUMBER_DE_PRUEBA } }),
    db.invoice.findMany({
      where: base,
      select: { id: true, satCertNumber: true },
      orderBy: { id: 'desc' },
      take: MAX_FACTURAS_REVISADAS_POLIZA,
    }),
  ]);

  const reales = recientes.filter((f) => f.satCertNumber !== SAT_CERT_NUMBER_DE_PRUEBA);
  let timbradasSinPoliza = 0;
  if (reales.length > 0) {
    const polizas = await db.journalEntry.findMany({
      where: {
        reference: { in: reales.map((f) => `INV-STAMP-${f.id}`) },
        ...(cid != null ? { companyId: cid } : {}),
      },
      select: { reference: true },
    });
    const conPoliza = new Set(polizas.map((p) => p.reference));
    timbradasSinPoliza = reales.filter((f) => !conPoliza.has(`INV-STAMP-${f.id}`)).length;
  }

  return { timbradas, conSelloDePrueba, timbradasSinPoliza };
}
