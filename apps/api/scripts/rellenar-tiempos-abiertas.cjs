#!/usr/bin/env node
/**
 * Relleno de tiempo y entrega de las actividades abiertas (29-10-2026). Corre dentro del contenedor
 * de la API, sobre el `dist` compilado, sin levantar la app (ni sus crons):
 *
 *   docker cp apps/api/scripts/rellenar-tiempos-abiertas.cjs nexara-api:/app/apps/api/
 *   docker exec -w /app/apps/api nexara-api node rellenar-tiempos-abiertas.cjs            # simulacro
 *   docker exec -w /app/apps/api nexara-api node rellenar-tiempos-abiertas.cjs --escribir # guarda
 *
 * Opción B del 29-10: en proceso, completas desde el título (con el tipo corregido si el título dice
 * otro trabajo); ya entregadas, sin estándar y con la mediana real de su tipo como tiempo, marcadas
 * como relleno para que el desempeño no las use como plan.
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
const { estandarDeLectura, cantidadDelTitulo } = dist('activities/tiempo-entrega.js');
const { planDeRelleno, aTiempo, ESTATUS_CERRADOS, tipoPorTitulo, yaEntregada } = dist('activities/rellenar-tiempos.js');
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

  const tipoDe = (x) => (x.coreKind === 'servicio' ? x.ticketType : x.ticketTypeCustom);
  const tipicoDe = async (x) =>
    (await complejidad.tiempos(x.companyId, { coreKind: x.coreKind, tipo: tipoDe(x) }).catch(() => null))?.total?.medianaMin ?? null;
  const reporte = [];
  const cambiosATiempo = [];
  for (const a of filas) {
    const ev = a.activityEvidences.find((e) => e.userId === a.responsableId && e.status === 'COMPLETED');
    const fin = a.assignees.find((x) => x.userId === a.responsableId)?.finRealAt ?? null;
    const entregadaAt = ev?.completedAt ?? fin ?? null;
    const entregada = yaEntregada({ estatus: a.estatus, entregadaAt });
    let est = null;
    let tipoCorregido = null;
    let tipicoMin = null;
    if (entregada) {
      // Sin IA: solo hace falta de respaldo si su tipo no tiene mediana.
      tipicoMin = a.tiempoEstimadoMin == null ? await tipicoDe(a) : null;
      if (a.tiempoEstimadoMin == null && !tipicoMin) est = estandarDeLectura(a, { cantidad: cantidadDelTitulo(a.titulo) });
    } else if (a.tiempoEstandarMin == null) {
      tipoCorregido = tipoPorTitulo(a);
      const conTipo = { ...a, ...(tipoCorregido ?? {}) };
      const lectura = await tiempos.lectura(a.companyId, conTipo);
      est = estandarDeLectura(conTipo, lectura, { tipicoMin: await tipicoDe(conTipo), duracionAgendaMin: a.tiempoEstimadoMin });
    }
    const plan = planDeRelleno({ ...a, entregadaAt }, est, { tipoCorregido, tipicoMin });
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
      entregada,
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
  // El reporte va a un archivo: la consola lleva los registros de cada lectura con la IA.
  const salida = process.env.SALIDA || '/tmp/relleno-tiempos.json';
  require('node:fs').writeFileSync(
    salida,
    JSON.stringify({ escribir: ESCRIBIR, antes, despues, aCambiar: reporte.length, cambiosATiempo, reporte }, null, 1),
  );
  console.log(`RELLENO ${ESCRIBIR ? 'escrito' : 'simulacro'}: ${reporte.length} filas, ${cambiosATiempo.length} cambios de «a tiempo» → ${salida}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
