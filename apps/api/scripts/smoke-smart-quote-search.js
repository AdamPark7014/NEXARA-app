const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const total = await p.productCT.count();
  const hits = await p.productCT.findMany({
    where: {
      activo: true,
      OR: [
        { nombre: { contains: 'camara', mode: 'insensitive' } },
        { nombre: { contains: 'cámara', mode: 'insensitive' } },
        { categoria: { contains: 'Video', mode: 'insensitive' } },
      ],
    },
    take: 5,
  });
  console.log(JSON.stringify({ total, sample: hits.map((h) => ({ clave: h.clave, nombre: h.nombre, precio: h.precio, moneda: h.moneda })) }, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
