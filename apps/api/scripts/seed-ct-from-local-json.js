/**
 * Bootstrap ProductCT from a local productos.json (FTP cache) without re-downloading.
 * Usage: node scripts/seed-ct-from-local-json.js [path-to-json]
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const file =
  process.argv[2] ||
  path.join(__dirname, '../../../.tmp-ftp-inspect/productos.json');

function normalize(row) {
  const sku = String(row.clave || '').trim();
  if (!sku) return null;
  return {
    idProducto: row.idProducto ?? null,
    clave: sku,
    numParte: row.numParte?.trim() || null,
    nombre: row.nombre?.trim() || sku,
    modelo: row.modelo?.trim() || null,
    idMarca: row.idMarca ?? null,
    marca: row.marca?.trim() || null,
    idSubCategoria: row.idSubCategoria ?? null,
    subcategoria: row.subcategoria?.trim() || null,
    idCategoria: row.idCategoria ?? null,
    categoria: row.categoria?.trim() || null,
    descripcion_corta: row.descripcion_corta?.trim() || null,
    ean: row.ean?.trim() || null,
    upc: row.upc?.trim() || null,
    sustituto: row.sustituto?.trim() || null,
    activo: row.activo === 1 || row.activo === true,
    protegido: row.protegido === 1 || row.protegido === true,
    existencia: row.existencia || {},
    precio: Number(row.precio) || 0,
    moneda: (row.moneda || 'MXN').toUpperCase(),
    tipoCambio: row.tipoCambio != null ? Number(row.tipoCambio) : null,
    especificaciones: row.especificaciones || [],
    promociones: row.promociones || [],
    imagen: row.imagen?.trim() || null,
    name: row.nombre?.trim() || sku,
    description: row.descripcion_corta?.trim() || null,
    imageUrl: row.imagen?.trim() || null,
    thumbnailUrl: row.imagen?.trim() || null,
  };
}

async function main() {
  if (!fs.existsSync(file)) {
    throw new Error(`JSON no encontrado: ${file}`);
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Seeding ${rows.length} products from ${file}`);
  let n = 0;
  const started = Date.now();
  for (const row of rows) {
    const data = normalize(row);
    if (!data) continue;
    await prisma.productCT.upsert({
      where: { clave: data.clave },
      create: data,
      update: data,
    });
    n += 1;
    if (n % 250 === 0) console.log(`… ${n}/${rows.length}`);
  }
  await prisma.supplierCatalogSyncRun.create({
    data: {
      supplierCode: 'CT',
      source: 'JSON',
      status: 'OK',
      finishedAt: new Date(),
      rowsRead: rows.length,
      rowsUpserted: n,
      fileModifiedAt: 'local-seed',
      checksum: null,
    },
  });
  console.log(`Done ${n} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
