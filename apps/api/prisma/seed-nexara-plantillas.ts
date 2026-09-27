/**
 * Siembra las plantillas de cotización base de NEXARA en `cotizacion_plantillas` de UNA empresa.
 *
 * Los datos viven en `src/cotizaciones/plantillas-base.ts` (arquetipos: suministro, licenciamiento,
 * seguridad perimetral, red estructurada, CCTV, control de acceso, póliza, proyecto integral y
 * licitación) y la decisión de qué hacer con cada una en `plantillas-siembra.ts` (lógica pura, con
 * pruebas). Este archivo solo lee la base, imprime el plan y, con `--apply`, lo escribe.
 *
 * POR OMISIÓN NO ESCRIBE NADA (simulación). Con `--apply` sí.
 *
 * IDEMPOTENTE. La llave es (empresa, nombre): correrlo N veces no duplica.
 *   · falta                       → la crea
 *   · igual a la base             → sin cambios
 *   · la sembró este proceso, sin edición posterior y la base cambió → la actualiza
 *   · la editó alguien / se creó a mano con ese nombre → NO la pisa: la reporta con los campos que difieren
 *   · archivada                   → se respeta (no la resucita)
 *
 * EMPRESA OBLIGATORIA, sin adivinar: `--company-slug=<slug>` o `--company-id=<n>`. El id de una empresa
 * no es el mismo en cada base, así que si dudas cuál es: `--list-companies`.
 *
 * TENANT. Usa un `PrismaClient` directo (como los demás seeds), que no pasa por el middleware de
 * aislamiento de la API; cada fila lleva explícito el `companyId` de la empresa elegida.
 *
 * Uso (desde apps/api):
 *   npm run seed:plantillas -- --list-companies
 *   npm run seed:plantillas -- --company-slug=<slug>            # simulación
 *   npm run seed:plantillas -- --company-slug=<slug> --apply    # escribe
 *   npm run seed:plantillas -- --company-id=<n> --apply
 *
 * En el contenedor de producción (solo hay `dist/`, el seed carga los módulos compilados de ahí):
 *   docker exec nexara-api sh -c 'cd /app/apps/api && npm run seed:plantillas -- --company-slug=<slug>'
 */
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import type { PlantillaBase } from '../src/cotizaciones/plantillas-base';
import type { AccionSiembra, FilaPlantilla, ResumenSiembra } from '../src/cotizaciones/plantillas-siembra';

type ModulosSiembra = {
  PLANTILLAS_BASE: readonly PlantillaBase[];
  contenidoParaGuardar: (base: PlantillaBase) => unknown;
  planificarSiembra: (bases: readonly PlantillaBase[], filas: readonly FilaPlantilla[]) => AccionSiembra[];
  resumirSiembra: (acciones: readonly AccionSiembra[]) => ResumenSiembra;
};

/**
 * Carga los módulos puros. En desarrollo salen de `src/` (el preload del repo resuelve las importaciones
 * con extensión `.js`); en la imagen de producción `src/` no existe y salen de `dist/`.
 */
function cargarModulos(): ModulosSiembra {
  const raiz = path.resolve(__dirname, '..');
  const dirSrc = path.join(raiz, 'src', 'cotizaciones');
  if (fs.existsSync(path.join(dirSrc, 'plantillas-base.ts'))) {
    const preload = path.join(raiz, 'scripts', 'ts-node-js-ext.js');
    if (fs.existsSync(preload)) require(preload);
    return { ...require(path.join(dirSrc, 'plantillas-base')), ...require(path.join(dirSrc, 'plantillas-siembra')) };
  }
  const dirDist = path.join(raiz, 'dist', 'cotizaciones');
  return {
    ...require(path.join(dirDist, 'plantillas-base.js')),
    ...require(path.join(dirDist, 'plantillas-siembra.js')),
  };
}

// ─── Argumentos ──────────────────────────────────────────────────────────────────────────────────

export type ArgumentosSiembra = {
  slug: string | null;
  id: number | null;
  aplicar: boolean;
  ayuda: boolean;
  listarEmpresas: boolean;
};

export class ErrorDeUso extends Error {}

export function leerArgumentos(argv: readonly string[]): ArgumentosSiembra {
  const args: ArgumentosSiembra = { slug: null, id: null, aplicar: false, ayuda: false, listarEmpresas: false };
  for (const crudo of argv) {
    if (crudo === '--apply') args.aplicar = true;
    else if (crudo === '--help' || crudo === '-h') args.ayuda = true;
    else if (crudo === '--list-companies') args.listarEmpresas = true;
    else if (crudo.startsWith('--company-slug=')) {
      const slug = crudo.slice('--company-slug='.length).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) throw new ErrorDeUso(`«${slug}» no es un slug válido.`);
      args.slug = slug;
    } else if (crudo.startsWith('--company-id=')) {
      const id = Number(crudo.slice('--company-id='.length));
      if (!Number.isInteger(id) || id <= 0) throw new ErrorDeUso(`«${crudo}» no es un id de empresa válido.`);
      args.id = id;
    } else {
      throw new ErrorDeUso(`Argumento desconocido: ${crudo}`);
    }
  }
  if (args.ayuda || args.listarEmpresas) return args;
  if (args.slug && args.id) throw new ErrorDeUso('Pasa --company-slug o --company-id, no los dos.');
  if (!args.slug && !args.id) {
    throw new ErrorDeUso('Falta la empresa: --company-slug=<slug> o --company-id=<n> (no se adivina). Usa --list-companies para verlas.');
  }
  return args;
}

const AYUDA = `Siembra las plantillas de cotización base en una empresa.

  --company-slug=<slug>   empresa por slug   (obligatorio uno de los dos)
  --company-id=<n>        empresa por id
  --apply                 escribe en la base de datos (sin esto es solo simulación)
  --list-companies        lista las empresas (id, slug, nombre) y termina
  --help                  esta ayuda
`;

// ─── Siembra ─────────────────────────────────────────────────────────────────────────────────────

const ETIQUETA: Record<AccionSiembra['tipo'], string> = {
  CREAR: 'CREAR',
  ACTUALIZAR: 'ACTUALIZAR',
  SIN_CAMBIOS: 'SIN CAMBIOS',
  OMITIR_EDITADA: 'OMITIR',
  OMITIR_ARCHIVADA: 'OMITIR',
};

export type ResultadoSiembra = { companyId: number; acciones: AccionSiembra[]; resumen: ResumenSiembra; aplicado: boolean };

/**
 * Planifica y, si `aplicar`, escribe. Recibe el cliente para poder probarlo con uno de mentira; no
 * abre ni cierra la conexión.
 */
export async function sembrarPlantillas(
  prisma: PrismaClient,
  empresa: { slug: string | null; id: number | null },
  aplicar: boolean,
  log: (linea: string) => void = console.log,
): Promise<ResultadoSiembra> {
  const { PLANTILLAS_BASE, contenidoParaGuardar, planificarSiembra, resumirSiembra } = cargarModulos();

  const compania = await prisma.companyProfile.findFirst({
    where: empresa.slug ? { slug: empresa.slug } : { id: empresa.id as number },
    select: { id: true, slug: true, legalName: true, tradeName: true },
  });
  if (!compania) {
    throw new ErrorDeUso(
      `No existe la empresa ${empresa.slug ? `con slug «${empresa.slug}»` : `con id ${empresa.id}`}. Usa --list-companies.`,
    );
  }
  const companyId = compania.id;

  // Todas las de la empresa (vivas y archivadas): el nombre se compara sin acentos ni mayúsculas.
  const filas: FilaPlantilla[] = await prisma.cotizacionPlantilla.findMany({
    where: { companyId },
    select: { id: true, nombre: true, archivadaAt: true, contenido: true },
    take: 2000,
  });

  const acciones = planificarSiembra(PLANTILLAS_BASE, filas);
  const resumen = resumirSiembra(acciones);
  const baseDe = new Map(PLANTILLAS_BASE.map((p) => [p.clave, p]));

  log(`Empresa: #${companyId} · slug ${compania.slug ?? '(sin slug)'} · ${compania.tradeName ?? compania.legalName}`);
  log(aplicar ? 'Modo: APLICAR (escribe en la base de datos)\n' : 'Modo: SIMULACIÓN (no se escribe nada; agrega --apply para aplicar)\n');
  for (const a of acciones) {
    const base = baseDe.get(a.clave)!;
    const datos = `${base.segmento} · ${base.contenido.items.length} partidas`;
    log(`  [${ETIQUETA[a.tipo].padEnd(11)}] ${a.nombre}  (${datos})`);
    if (a.tipo !== 'SIN_CAMBIOS') log(`                 ${a.motivo}${a.diferencias.length ? ` Difiere en: ${a.diferencias.join(', ')}.` : ''}`);
  }
  log(
    `\nResumen: ${aplicar ? 'crear' : 'crearía'} ${resumen.CREAR} · ${aplicar ? 'actualizar' : 'actualizaría'} ${resumen.ACTUALIZAR}` +
      ` · sin cambios ${resumen.SIN_CAMBIOS} · omitidas ${resumen.OMITIR_EDITADA + resumen.OMITIR_ARCHIVADA}`,
  );

  const escrituras = acciones.filter((a) => a.tipo === 'CREAR' || a.tipo === 'ACTUALIZAR');
  if (aplicar && escrituras.length) {
    // Todo o nada: si una falla no queda la siembra a medias.
    await prisma.$transaction(
      escrituras.map((a) => {
        const base = baseDe.get(a.clave)!;
        const contenido = contenidoParaGuardar(base) as unknown as Prisma.InputJsonValue;
        return a.tipo === 'CREAR'
          ? prisma.cotizacionPlantilla.create({
              data: { companyId, nombre: base.nombre, segmento: base.segmento, contenido, conPartidas: base.conPartidas, createdById: null },
            })
          : prisma.cotizacionPlantilla.update({
              where: { id: a.id as number },
              data: { segmento: base.segmento, contenido, conPartidas: base.conPartidas },
            });
      }),
    );
    log(`Escritas ${escrituras.length} plantillas.`);
  } else if (!aplicar && escrituras.length) {
    log('Simulación: no se escribió nada.');
  }

  return { companyId, acciones, resumen, aplicado: aplicar && escrituras.length > 0 };
}

async function listarEmpresas(prisma: PrismaClient, log: (linea: string) => void = console.log): Promise<void> {
  const empresas = await prisma.companyProfile.findMany({
    select: { id: true, slug: true, legalName: true, tradeName: true, isPrimary: true },
    orderBy: { id: 'asc' },
  });
  log('id   slug                      primaria  nombre');
  for (const e of empresas) {
    log(`${String(e.id).padEnd(4)} ${(e.slug ?? '(sin slug)').padEnd(25)} ${(e.isPrimary ? 'sí' : '').padEnd(9)} ${e.tradeName ?? e.legalName}`);
  }
}

// ─── Entrada directa ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  let args: ArgumentosSiembra;
  try {
    args = leerArgumentos(process.argv.slice(2));
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${AYUDA}`);
    process.exit(2);
  }
  if (args.ayuda) {
    console.log(AYUDA);
    process.exit(0);
  }

  const prisma = new PrismaClient();
  (args.listarEmpresas ? listarEmpresas(prisma) : sembrarPlantillas(prisma, { slug: args.slug, id: args.id }, args.aplicar))
    .catch((e) => {
      if (e instanceof ErrorDeUso) {
        console.error(e.message);
        process.exitCode = 2;
      } else {
        console.error('seed-nexara-plantillas falló:', e);
        process.exitCode = 1;
      }
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
