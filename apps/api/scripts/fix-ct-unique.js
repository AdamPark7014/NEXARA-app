const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const idxs = await p.$queryRawUnsafe(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='productos_ct'",
  );
  console.log(JSON.stringify(idxs, null, 2));
  try {
    await p.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "productos_ct_clave_key" ON "productos_ct"("clave")',
    );
    console.log('unique index ensured');
  } catch (e) {
    console.error('index error', e.message);
  }
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
