/**
 * Solo lectura: lista actividades abiertas con periodo de más de un día.
 * Uso: npx ts-node --transpile-only apps/api/scripts/listar-actividades-multi-dia.ts
 * Sale 0 si no hay ninguna; 1 si hay.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function clave(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

async function main() {
  const filas = await prisma.activity.findMany({
    where: {
      deletedAt: null,
      cancelledAt: null,
      periodoInicio: { not: null },
      periodoFin: { not: null },
      NOT: {
        OR: [
          { estatus: { contains: 'Finalizada', mode: 'insensitive' } },
          { estatus: { contains: 'Cancelada', mode: 'insensitive' } },
          { estatus: { contains: 'Completada', mode: 'insensitive' } },
        ],
      },
    },
    select: {
      id: true,
      anNumber: true,
      titulo: true,
      estatus: true,
      periodoInicio: true,
      periodoFin: true,
      responsable: { select: { nombre: true, email: true } },
    },
    orderBy: { id: 'asc' },
  });

  const multi = filas.filter((f) => {
    const a = clave(f.periodoInicio);
    const b = clave(f.periodoFin);
    return Boolean(a && b && a !== b);
  });

  if (!multi.length) {
    console.log('OK: no hay actividades abiertas con periodo de más de un día.');
    process.exitCode = 0;
    return;
  }

  console.log(`Hay ${multi.length} actividad(es) abierta(s) de varios días:\n`);
  for (const f of multi) {
    const a = clave(f.periodoInicio)!;
    const b = clave(f.periodoFin)!;
    const n = diasEntre(a, b);
    console.log(`- ${f.anNumber} · ${f.titulo}`);
    console.log(`  Responsable: ${f.responsable?.nombre ?? '?'} <${f.responsable?.email ?? ''}>`);
    console.log(`  Periodo: ${a} → ${b} (${n} días de calendario)`);
    console.log(`  Propuesta: partir en ${n} actividades «${f.titulo} · día 1 de ${n}» … «día ${n} de ${n}»`);
    console.log('');
  }
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });