/**
 * Da folio con nomenclatura a los borradores viejos que nunca salieron al cliente.
 *
 * Antes de que el servidor emitiera el folio (contrato 17-09, sección D) la web lo armaba al azar:
 * `NXR-2026-763366`. Esos borradores siguen en la lista sin decir de quién son ni quién intervino.
 * Este script les da el folio que habrían recibido: `NEX-{nomenclatura de quien la hizo}-{su
 * siguiente consecutivo}`, con la misma regla y el mismo contador por persona que usa la API
 * (`CotizacionesCoreService.siguienteFolio`, `POST /api/cotizaciones/:id/refoliar`).
 *
 * Qué toca, por borrador:
 *   - Guarda la foto de la cotización en `cotizacion_versions` con la nota «Refoliado: antes <folio>»:
 *     el folio anterior queda en el historial (la web lo muestra en «Versiones»).
 *   - Incrementa el contador de su autor (`cotizacion_contadores`) y fija `quoteNumber`,
 *     `folioNomenclatura` y `folioConsecutivo`.
 *   - Registra al autor como «Elaboró» en `cotizacion_participantes` si no estaba.
 *
 * Qué NO toca: nada que haya salido al cliente (enviada, aprobada, rechazada, vencida, o un borrador
 * que alguna vez se envió y se volvió a editar), ni borradores sin autor (no hay de quién sacar la
 * nomenclatura; se listan para revisarlos a mano), ni borrados.
 *
 * Simulación por defecto. Solo escribe con CONFIRMAR=SI.
 *
 *   docker exec -i -w /app/apps/api nexara-api node - < apps/api/scripts/refoliar-borradores.js
 *   docker exec -i -e CONFIRMAR=SI -w /app/apps/api nexara-api node - < apps/api/scripts/refoliar-borradores.js
 *
 * Variables (o --nombre=valor): COMPANY=1 (solo esa empresa), IDS=12,15 (solo esas cotizaciones),
 * JSON=SI (imprime el reporte completo en JSON).
 *
 * Necesita la API compilada (`dist/cotizaciones/folio-core.js`), igual que `importar-rrhh.js`.
 */
'use strict';

const path = require('path');

function opt(name) {
  const pref = `--${name.toLowerCase()}=`;
  const hit = process.argv.find((a) => a.toLowerCase().startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const env = process.env[name.toUpperCase()];
  return env != null && String(env).trim() !== '' ? String(env).trim() : null;
}
const si = (name) => String(opt(name) || '').toUpperCase() === 'SI';
const APLICAR = si('CONFIRMAR');
const COMO_JSON = si('JSON');
const COMPANY_ID = opt('company') ? Number(opt('company')) : null;
const IDS = (opt('ids') || '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);

function loadPrisma() {
  try {
    return require(require.resolve('@prisma/client', { paths: [process.cwd()] }));
  } catch {
    return require('@prisma/client');
  }
}

function loadFolioCore() {
  const candidatos = [
    path.resolve(process.cwd(), 'dist/cotizaciones/folio-core.js'),
    path.resolve(process.cwd(), 'dist/src/cotizaciones/folio-core.js'),
  ];
  for (const ruta of candidatos) {
    try {
      return require(ruta);
    } catch (error) {
      if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  console.error(
    'No encontré dist/cotizaciones/folio-core.js. Corre el script con -w /app/apps/api dentro del contenedor ' +
      '(o compila la API con `npm run build` antes).',
  );
  process.exit(2);
}

const { PrismaClient } = loadPrisma();
const folioCore = loadFolioCore();
const prisma = new PrismaClient();

/** Mismo criterio que `ensureUniqueQuoteNumber` del servicio. */
async function folioLibre(tx, base, companyId) {
  let candidato = base;
  for (let n = 1; n < 1000; n += 1) {
    const ocupado = await tx.cotizacion.findFirst({ where: { companyId, quoteNumber: candidato }, select: { id: true } });
    if (!ocupado) return candidato;
    candidato = `${base}-${String(n).padStart(3, '0')}`;
  }
  throw new Error(`No hay folio libre a partir de ${base}`);
}

async function main() {
  const where = {
    status: 'DRAFT',
    sentAt: null,
    folioEnviado: null,
    deletedAt: null,
    ...(COMPANY_ID ? { companyId: COMPANY_ID } : {}),
    ...(IDS.length ? { id: { in: IDS } } : {}),
  };

  const borradores = await prisma.cotizacion.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      items: true,
      createdBy: {
        select: {
          id: true,
          nombre: true,
          employeeNumber: true,
          fechaIngreso: true,
          perfil: { select: { curp: true, fechaNacimiento: true } },
        },
      },
    },
  });

  const candidatos = borradores.filter((q) => folioCore.necesitaRefolio(q));
  const sinAutor = borradores.filter(
    (q) => !q.createdById && !(q.folioNomenclatura && folioCore.tieneNomenclatura(q.quoteNumber)),
  );

  // Contador simulado por persona, para que la simulación muestre el folio que de verdad saldría.
  const contadores = new Map();
  async function siguienteSimulado(userId) {
    if (!contadores.has(userId)) {
      const fila = await prisma.cotizacionContador.findUnique({ where: { userId }, select: { ultimo: true } });
      contadores.set(userId, fila ? fila.ultimo : 0);
    }
    const n = contadores.get(userId) + 1;
    contadores.set(userId, n);
    return n;
  }

  const reporte = [];
  for (const quote of candidatos) {
    const autor = quote.createdBy;
    const nomenclatura = folioCore.nomenclaturaParaFolio({
      nombre: autor ? autor.nombre : '',
      employeeNumber: autor ? autor.employeeNumber : null,
      curp: autor && autor.perfil ? autor.perfil.curp : null,
      fechaNacimiento: autor && autor.perfil ? autor.perfil.fechaNacimiento : null,
      fechaIngreso: autor ? autor.fechaIngreso : null,
    });
    const fila = {
      id: quote.id,
      companyId: quote.companyId,
      autor: autor ? `${autor.nombre} (#${autor.id})` : `#${quote.createdById}`,
      nomenclatura,
      claveCompleta: folioCore.nomenclaturaCompleta(nomenclatura),
      antes: quote.quoteNumber,
      despues: null,
      cliente: quote.clientName || quote.clientCompany || null,
    };

    if (!APLICAR) {
      fila.despues = folioCore.folioBase(nomenclatura, await siguienteSimulado(quote.createdById));
      reporte.push(fila);
      continue;
    }

    fila.despues = await prisma.$transaction(async (tx) => {
      const ultima = await tx.cotizacionVersion.findFirst({
        where: { cotizacionId: quote.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const { createdBy: _autor, ...foto } = quote;
      await tx.cotizacionVersion.create({
        data: {
          cotizacionId: quote.id,
          version: (ultima ? ultima.version : 0) + 1,
          snapshot: JSON.parse(JSON.stringify(foto)),
          note: `Refoliado: antes ${quote.quoteNumber}`.slice(0, 255),
          createdById: quote.createdById,
        },
      });

      const contador = await tx.cotizacionContador.upsert({
        where: { userId: quote.createdById },
        create: { userId: quote.createdById, ultimo: 1 },
        update: { ultimo: { increment: 1 } },
        select: { ultimo: true },
      });
      const folio = await folioLibre(tx, folioCore.folioBase(nomenclatura, contador.ultimo), quote.companyId);

      await tx.cotizacion.update({
        where: { id: quote.id },
        data: { quoteNumber: folio, folioNomenclatura: nomenclatura, folioConsecutivo: contador.ultimo },
      });
      await tx.cotizacionParticipante.upsert({
        where: {
          cotizacionId_userId_rol: { cotizacionId: quote.id, userId: quote.createdById, rol: 'ELABORO' },
        },
        create: {
          cotizacionId: quote.id,
          userId: quote.createdById,
          clave: nomenclatura,
          siglas: folioCore.siglasDeNomenclatura(nomenclatura),
          rol: 'ELABORO',
        },
        update: {},
      });
      return folio;
    });
    reporte.push(fila);
  }

  if (COMO_JSON) {
    console.log(JSON.stringify({ aplicado: APLICAR, refoliados: reporte, sinAutor: sinAutor.map((q) => ({ id: q.id, folio: q.quoteNumber })) }, null, 2));
  } else {
    console.log(APLICAR ? 'APLICADO' : 'SIMULACIÓN (nada se escribió; CONFIRMAR=SI para aplicar)');
    console.log(`Borradores nunca enviados revisados: ${borradores.length}`);
    console.log(`${APLICAR ? 'Refoliados' : 'Se refoliarían'}: ${reporte.length}`);
    for (const f of reporte) {
      const aviso = f.claveCompleta ? '' : '  (clave de RH incompleta: ceros donde falta el dato)';
      console.log(`  #${f.id}  ${f.antes}  →  ${f.despues}   ${f.autor}${f.cliente ? ` · ${f.cliente}` : ''}${aviso}`);
    }
    if (sinAutor.length) {
      console.log(`Sin autor (no se tocan; revisar a mano): ${sinAutor.length}`);
      for (const q of sinAutor) console.log(`  #${q.id}  ${q.quoteNumber}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
