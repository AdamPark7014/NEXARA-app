/* eslint-disable no-console */
import { Logger } from '@nestjs/common';
import { CsdService } from './csd.service.js';
import { buildPacReadinessReport, type PacEmisorEntrada, type PacFacturasEntrada } from './pac-readiness.js';
import { leeEmisor, leeFacturas } from './pac-readiness.data.js';
import { formateaReporteTexto } from './pac-readiness.format.js';

/**
 * Revisión previa a encender la facturación electrónica (CFDI 4.0).
 *
 * SOLO LECTURA: no timbra, no cancela, no escribe en la base de datos ni en
 * archivos, y no imprime jamás una contraseña, token ni el contenido del CSD.
 * Lee las variables de entorno del proceso y, con `--db`, hace consultas de
 * lectura (datos fiscales del emisor y conteo de facturas).
 *
 *   npm run pac:preflight --workspace=apps/api                 # sin base de datos
 *   npm run pac:preflight --workspace=apps/api -- --db         # con datos del emisor
 *   npm run pac:preflight --workspace=apps/api -- --db --json  # salida JSON
 *
 * En el servidor (la imagen solo lleva `dist/`):
 *   docker exec nexara-api node dist/pac/pac-preflight.cli.js --db
 *
 * Opciones:  --db · --company <id> · --json · --help
 * Código de salida: 0 listo para producción · 1 con bloqueos · 2 error al revisar.
 */

const AYUDA = `Uso: pac-preflight [--db] [--company <id>] [--json]

  --db            También consulta la base de datos (solo lectura): datos fiscales
                  del emisor y conteo de facturas. Sin esta opción el emisor
                  queda "sin verificar" y el reporte nunca da el visto bueno.
  --company <id>  Empresa a revisar (por omisión, la empresa principal).
  --json          Salida en JSON en lugar de texto.
  --help          Esta ayuda.

Código de salida: 0 = listo para producción, 1 = hay bloqueos, 2 = error.`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const tiene = (n: string) => args.includes(`--${n}`);
  const valor = (n: string): string | null => {
    const i = args.indexOf(`--${n}`);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
  };

  if (tiene('help') || tiene('h')) {
    console.log(AYUDA);
    return 0;
  }

  const companyRaw = valor('company');
  const companyId = companyRaw != null ? Number(companyRaw) : null;
  if (companyRaw != null && (!Number.isInteger(companyId) || (companyId as number) <= 0)) {
    console.error('--company debe ser un número entero positivo.');
    return 2;
  }

  // CsdService avisa por el log de Nest cuando no hay CSD; aquí ese ruido sobra.
  Logger.overrideLogger(false);
  const csd = new CsdService().info();

  let company: PacEmisorEntrada | null | undefined;
  let invoices: PacFacturasEntrada | null = null;
  if (tiene('db')) {
    if (!process.env['DATABASE_URL']) {
      console.error('Con --db se necesita DATABASE_URL en el entorno.');
      return 2;
    }
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      company = await leeEmisor(prisma, companyId);
      invoices = await leeFacturas(prisma, companyId);
    } finally {
      await prisma.$disconnect();
    }
  }

  const reporte = buildPacReadinessReport({ env: process.env, company, csd, invoices });
  console.log(tiene('json') ? JSON.stringify(reporte, null, 2) : formateaReporteTexto(reporte));
  return reporte.listoParaProduccion ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    // Solo el mensaje: un error de conexión de Prisma puede traer la URL de la base en el stack.
    console.error(`No se pudo completar la revisión: ${err instanceof Error ? err.message.split('\n')[0] : 'error desconocido'}`);
    process.exitCode = 2;
  });
