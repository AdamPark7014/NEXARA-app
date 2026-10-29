#!/usr/bin/env node
/**
 * Relleno de tiempo y entrega de las actividades abiertas (29-10-2026). Corre dentro del contenedor
 * de la API, sobre el `dist` compilado, sin levantar la app (ni sus crons):
 *
 *   docker cp apps/api/scripts/rellenar-tiempos-abiertas.cjs nexara-api:/app/apps/api/
 *   docker exec -w /app/apps/api nexara-api node rellenar-tiempos-abiertas.cjs            # simulacro
 *   docker exec -w /app/apps/api nexara-api node rellenar-tiempos-abiertas.cjs --escribir # guarda
 *
 * Idempotente (solo llena lo vacío; `rellenar-tiempos.ts`). Lee cada título con la misma IA del alta
 * (Haiku por la puerta, proceso `complejidad`) y comprueba que ninguna entrega cambie de «a tiempo».
 */
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const dist = (rel) => require(path.join(__dirname, 'dist', rel));
const { ClaudeService } = dist('ai/claude/claude.service.js');
const { ComplejidadService } = dist('ai/complejidad/complejidad.service.js');
const { TiemposActividadService } = dist('activities/tiempos-actividad.service.js');
const { estandarDeLectura } = dist('activities/tiempo-entrega.js');
const { planDeRelleno, aTiempo, ESTATUS_CERRADOS } = dist('activities/rellenar-tiempos.js');
const { limiteDeEntrega } = dist('activities/semaforo-actividad.js');

const ESCRIBIR = process.argv.includes('--escribir');

async function contar(prisma) {
  const filas = await prisma.$queryRawUnsafe(`
    SELECT CASE WHEN "creadoPorId" = "responsableId" THEN 'auto' ELSE 'asignada' END AS tipo,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "fechaEntregaEsperada" IS NULL AND "fechaMaxima" IS NULL)::int AS sin_entrega,
           COUNT(*) FILTER (WHERE "tiempoEstimadoMin" IS NULL)::int AS sin_tiempo,
           COUNT(*) FILTER (WHERE "tiempoEstandarMin" IS NULL)::int AS sin_estandar
    FROM "Activity"
    WHERE "deletedAt" IS NULL AND estatus NOT IN (${ESTATUS_CERRADOS.map((e) => `'${e}'`).join(',')})
    GROUP BY 1 ORDER BY 1`);
  return filas;
}

async function main() {
  const prisma = new PrismaClient();
  const claude = new ClaudeService();
  const complejidad = new ComplejidadService(prisma, claude);
  const tiempos = new TiemposActividadService(complejidad);

  const antes = await contar(prisma);
  const filas = await prisma.activity.findMany({
    where: { deletedAt: null, estatus: { notIn: ESTATUS_CERRADOS } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      companyId: true,
      anNumber: true,
      titulo: true,
      indicaciones: true,
      estatus: true,
      coreKind: true,
      ticketType: true,
      ticketTypeCustom: true,
      creadoPorId: true,
      responsableId: true,
      tiempoEstimadoMin: true,
      tiempoEstandarMin: true,
      complejidad: true,
      complejidadSugerida: true,
      unidades: true,
      fechaInicio: true,
      fechaAsignacion: true,
      fechaEntregaEsperada: true,
      fechaMaxima: true,
      periodoInicio: true,
      periodoFin: true,
      activityEvidences: { select: { userId: true, status: true, completedAt: true } },
      assignees: { select: { userId: true, finRealAt: true } },
    },
  });

  const reporte = [];
  const cambiosATiempo = [];
  for (const a of filas) {
    const ev = a.activityEvidences.find((e) => e.userId === a.responsableId && e.status === 'COMPLETED');
    const fin = a.assignees.find((x) => x.userId === a.responsableId)?.finRealAt ?? null;
    const entregadaAt = ev?.completedAt ?? fin ?? null;
    let est = null;
    if (a.tiempoEstandarMin == null) {
      const lectura = await tiempos.lectura(a.companyId, a);
      const t = await complejidad.tiempos(a.companyId, { coreKind: a.coreKind, tipo: a.coreKind === 'servicio' ? a.ticketType : a.ticketTypeCustom }).catch(() => null);
      est = estandarDeLectura(a, lectura, { tipicoMin: t?.total?.medianaMin ?? null, duracionAgendaMin: a.tiempoEstimadoMin });
    }
    const plan = planDeRelleno({ ...a, entregadaAt }, est);
    if (!Object.keys(plan.cambios).length) continue;
    const limiteAntes = limiteDeEntrega(a);
    const limiteDespues = limiteDeEntrega({ ...a, ...plan.cambios });
    const antesOk = aTiempo(entregadaAt, limiteAntes);
    const despuesOk = aTiempo(entregadaAt, limiteDespues);
    if (antesOk !== despuesOk) cambiosATiempo.push({ id: a.id, anNumber: a.anNumber, antesOk, despuesOk });
    reporte.push({
      id: a.id,
      anNumber: a.anNumber,
      titulo: a.titulo,
      estatus: a.estatus,
      auto: a.creadoPorId === a.responsableId,
      cambios: Object.fromEntries(
        Object.entries(plan.cambios).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
      ),
      nota: plan.nota,
      entregadaAt: entregadaAt ? entregadaAt.toISOString() : null,
    });
  }

  if (cambiosATiempo.length) {
    console.error('NO SE ESCRIBE: cambiaría el «a tiempo» de', JSON.stringify(cambiosATiempo));
    process.exitCode = 1;
  } else if (ESCRIBIR) {
    for (const r of reporte) {
      const data = { ...r.cambios };
      for (const k of ['fechaEntregaEsperada', 'fechaMaxima']) if (data[k]) data[k] = new Date(data[k]);
      await prisma.activity.update({ where: { id: r.id }, data });
    }
  }
  const despues = ESCRIBIR && !cambiosATiempo.length ? await contar(prisma) : null;
  console.log(
    JSON.stringify(
      { escribir: ESCRIBIR, antes, despues, aCambiar: reporte.length, cambiosATiempo, reporte },
      null,
      1,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
