/**
 * Borra SOLO lo que sembró `sembrar-semana.js`, según el manifiesto del lote:
 *   <UPLOADS_ROOT>/demo/<LOTE>/manifest.json
 *
 * Además de los ids del manifiesto, limpia lo que la API real haya colgado de esos registros después
 * de sembrar (avisos de las actividades demo, evidencias o alertas de geocerca que alguien subió,
 * respuestas en los chats demo). Restaura la vista previa de los canales y las lecturas que la
 * siembra movió. Al final borra la carpeta de fotos del lote.
 *
 * Simulación por defecto. Solo borra con CONFIRMAR=SI.
 *
 *   docker exec -i -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-demo.js
 *   docker exec -i -e CONFIRMAR=SI -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-demo.js
 *
 * Variables (o --nombre=valor): LOTE=demo-20260917 (si solo hay un lote se toma solo), TODOS=SI (todos
 * los lotes), BORRAR_GASTOS=SI (si alguien registró gastos o vehículos sobre actividades demo).
 */
'use strict';

const fs = require('fs');
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

function loadPrisma() {
  try {
    return require(require.resolve('@prisma/client', { paths: [process.cwd()] }));
  } catch {
    return require('@prisma/client');
  }
}
function uploadsRoot() {
  const env = (process.env.UPLOADS_ROOT || process.env.UPLOAD_ROOT || '').trim();
  if (env) return path.resolve(env);
  for (const c of ['/app/uploads', path.resolve(process.cwd(), '..', '..', 'uploads')]) if (fs.existsSync(c)) return c;
  return path.resolve(process.cwd(), '..', '..', 'uploads');
}
function preview(body) {
  const clean = String(body || '')
    .replace(/\[@?([^\]\n]+)\]\(user:\d+\)/g, '@$1')
    .replace(/\[([^\]\n]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\p{Extended_Pictographic}️?\s?/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

function lotes(raiz) {
  const demo = path.join(raiz, 'demo');
  if (!fs.existsSync(demo)) return [];
  return fs
    .readdirSync(demo, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(demo, d.name, 'manifest.json')))
    .map((d) => d.name)
    .sort();
}

/** Pasos en orden seguro para las FK. `where` combina ids del manifiesto con lo que cuelga de ellos. */
function pasos(m) {
  const ids = (modelo) => m.ids?.[modelo] || [];
  const act = ids('activity');
  const msg = ids('chatMessage');
  const comidas = ids('lunchBreak');
  const enIds = (modelo) => ({ id: { in: ids(modelo) } });
  const oIds = (modelo, extra) => ({ OR: [enIds(modelo), extra] });
  return [
    {
      modelo: 'notification',
      where: {
        OR: [
          enIds('notification'),
          { companyId: m.companyId, entityType: 'Activity', relatedEntityId: { in: act } },
          { companyId: m.companyId, entityType: 'LunchBreak', relatedEntityId: { in: comidas } },
          { companyId: m.companyId, entityType: 'chat_message', relatedEntityId: { in: msg } },
        ],
      },
    },
    { modelo: 'chatMessageReaction', where: oIds('chatMessageReaction', { messageId: { in: msg } }) },
    { modelo: 'chatMessage', etiqueta: 'chatMessage (respuestas)', where: { OR: [{ id: { in: msg } }, { parentId: { in: msg } }], parentId: { not: null } } },
    { modelo: 'chatMessage', etiqueta: 'chatMessage (principales)', where: { id: { in: msg } } },
    { restaurar: true },
    { modelo: 'chatChannelMember', where: enIds('chatChannelMember') },
    { modelo: 'chatChannel', where: enIds('chatChannel') },
    { modelo: 'locationTracking', where: enIds('locationTracking') },
    { modelo: 'lunchBreak', where: enIds('lunchBreak') },
    { modelo: 'attendanceDay', where: enIds('attendanceDay') },
    { modelo: 'attendance', where: enIds('attendance') },
    { raw: 'attendance_justifications', ids: ids('attendance_justifications') },
    { modelo: 'activityGeofenceAlert', where: oIds('activityGeofenceAlert', { activityId: { in: act } }) },
    { modelo: 'activityEvidenceReview', where: oIds('activityEvidenceReview', { activityId: { in: act } }) },
    { modelo: 'activityReassignment', where: oIds('activityReassignment', { activityId: { in: act } }) },
    { modelo: 'activityScheduleChange', where: oIds('activityScheduleChange', { activityId: { in: act } }) },
    { modelo: 'activityEvidence', where: oIds('activityEvidence', { activityId: { in: act } }) },
    { modelo: 'activityAssignee', where: oIds('activityAssignee', { activityId: { in: act } }) },
    { modelo: 'expense', gasto: true, where: { actividadId: { in: act } } },
    { modelo: 'vehicleControl', gasto: true, where: { actividadId: { in: act } } },
    { modelo: 'activity', where: enIds('activity') },
    { modelo: 'projectEngineer', where: oIds('projectEngineer', { projectId: { in: ids('operationalProject') } }) },
    { modelo: 'operationalProject', where: enIds('operationalProject') },
    { modelo: 'salesClientSector', where: oIds('salesClientSector', { salesClientId: { in: ids('salesClient') } }) },
    { modelo: 'salesClient', where: enIds('salesClient') },
    { modelo: 'serviceClientBranch', where: oIds('serviceClientBranch', { clientId: { in: ids('serviceClient') } }) },
    { modelo: 'serviceClient', where: enIds('serviceClient') },
  ];
}

const CONOCIDOS = new Set([
  'notification', 'chatMessageReaction', 'chatMessage', 'chatChannelMember', 'chatChannel', 'locationTracking', 'lunchBreak',
  'attendanceDay', 'attendance', 'attendance_justifications', 'activityGeofenceAlert', 'activityEvidenceReview', 'activityReassignment',
  'activityScheduleChange', 'activityEvidence', 'activityAssignee', 'activity', 'projectEngineer', 'operationalProject',
  'salesClientSector', 'salesClient', 'serviceClientBranch', 'serviceClient',
]);

async function restaurar(db, m, aplicar) {
  const acciones = [];
  const miembros = m.previos?.miembros || [];
  if (miembros.length) {
    acciones.push(`${miembros.length} lecturas de chat vuelven a su valor anterior`);
    if (aplicar) {
      for (const mb of miembros) {
        await db.chatChannelMember.updateMany({ where: { id: mb.id }, data: { lastReadAt: mb.lastReadAt ? new Date(mb.lastReadAt) : null } });
      }
    }
  }
  const canales = m.previos?.canales || [];
  for (const c of canales) {
    const ultimo = await db.chatMessage.findFirst({
      where: { channelId: c.id, parentId: null, deletedAt: null, ...(aplicar ? {} : { id: { notIn: m.ids?.chatMessage || [] } }) },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, body: true },
    });
    const data = ultimo
      ? { lastMessageAt: ultimo.createdAt, lastMessagePreview: preview(ultimo.body) }
      : { lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null, lastMessagePreview: c.lastMessagePreview ?? null };
    acciones.push(`canal #${c.id}: vista previa ${ultimo ? 'del último mensaje real' : 'anterior a la siembra'}`);
    if (aplicar) await db.chatChannel.updateMany({ where: { id: c.id }, data });
  }
  return acciones;
}

async function procesar(db, m, aplicar) {
  const filas = [];
  const acciones = [];
  for (const paso of pasos(m)) {
    if (paso.restaurar) {
      acciones.push(...(await restaurar(db, m, aplicar)));
      continue;
    }
    if (paso.raw) {
      if (!paso.ids.length) continue;
      const existe = await db.$queryRawUnsafe('SELECT to_regclass($1)::text AS t', `"${paso.raw}"`);
      if (!existe?.[0]?.t) continue;
      const n = aplicar
        ? await db.$executeRawUnsafe(`DELETE FROM "${paso.raw}" WHERE id = ANY($1::int[])`, paso.ids)
        : (await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${paso.raw}" WHERE id = ANY($1::int[])`, paso.ids))[0].n;
      filas.push({ etiqueta: paso.raw, n });
      continue;
    }
    const delegate = db[paso.modelo];
    if (!delegate) continue;
    const etiqueta = paso.etiqueta || paso.modelo;
    if (paso.gasto) {
      const n = await delegate.count({ where: paso.where });
      if (n > 0 && !si('BORRAR_GASTOS')) {
        if (aplicar) throw new Error(`Hay ${n} registros en ${paso.modelo} ligados a actividades demo. Revísalos y vuelve a correr con BORRAR_GASTOS=SI.`);
        filas.push({ etiqueta: `${etiqueta} (BLOQUEA: requiere BORRAR_GASTOS=SI)`, n });
        continue;
      }
      if (n === 0) continue;
    }
    const n = aplicar ? (await delegate.deleteMany({ where: paso.where })).count : await delegate.count({ where: paso.where });
    filas.push({ etiqueta, n });
  }
  for (const modelo of Object.keys(m.ids || {})) {
    if (CONOCIDOS.has(modelo) || !db[modelo]) continue;
    const where = { id: { in: m.ids[modelo] } };
    const n = aplicar ? (await db[modelo].deleteMany({ where })).count : await db[modelo].count({ where });
    filas.push({ etiqueta: `${modelo} (otro modelo del manifiesto)`, n });
  }
  return { filas, acciones };
}

async function main() {
  const raiz = uploadsRoot();
  const disponibles = lotes(raiz);
  let elegidos;
  if (si('TODOS')) elegidos = disponibles;
  else if (opt('LOTE')) elegidos = [opt('LOTE')];
  else if (disponibles.length === 1) elegidos = disponibles;
  else {
    console.log(`Lotes encontrados en ${path.join(raiz, 'demo')}: ${disponibles.length ? disponibles.join(', ') : '(ninguno)'}`);
    console.log('Indica LOTE=<nombre> o TODOS=SI.');
    process.exit(disponibles.length ? 2 : 0);
  }

  const { PrismaClient } = loadPrisma();
  const prisma = new PrismaClient();
  try {
    for (const lote of elegidos) {
      if (!/^[A-Za-z0-9_-]{3,60}$/.test(lote)) throw new Error(`Lote inválido: ${lote}`);
      const carpeta = path.join(raiz, 'demo', lote);
      const archivo = path.join(carpeta, 'manifest.json');
      if (!fs.existsSync(archivo)) throw new Error(`No existe el manifiesto ${archivo}`);
      const m = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      console.log('════════════════════════════════════════════════════════════');
      console.log(` Purga del lote ${lote} · empresa ${m.companyId} · sembrado ${m.creadoAt}`);
      console.log(` Modo: ${APLICAR ? 'BORRAR (CONFIRMAR=SI)' : 'SIMULACIÓN — no se borra nada'}`);
      console.log('════════════════════════════════════════════════════════════');

      const { filas, acciones } = APLICAR
        ? await prisma.$transaction((tx) => procesar(tx, m, true), { timeout: 10 * 60_000, maxWait: 60_000 })
        : await procesar(prisma, m, false);
      let total = 0;
      for (const f of filas) {
        total += f.n;
        console.log(`  ${String(f.n).padStart(7)}  ${f.etiqueta}`);
      }
      for (const a of acciones) console.log(`  - ${a}`);
      const nArchivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).length : 0;
      if (!APLICAR) {
        console.log(`\n  Se borrarían ${total} filas y la carpeta ${carpeta} (${nArchivos} archivos).`);
        continue;
      }
      // Solo se borra una carpeta dentro de <uploads>/demo/.
      const demo = path.resolve(raiz, 'demo');
      if (path.resolve(carpeta).startsWith(demo + path.sep)) fs.rmSync(carpeta, { recursive: true, force: true });
      console.log(`\n  Listo: ${total} filas borradas y ${nArchivos} archivos eliminados.`);
    }
    if (!APLICAR) console.log('\nNada se borró. Para aplicar: docker exec -i -e CONFIRMAR=SI ... node - < purgar-demo.js');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nERROR — la transacción se revirtió, no se borró nada.');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
