/**
 * Purga la operación de UNA empresa para dejar el sistema limpio antes de sembrar la semana demo.
 *
 * Borra: actividades (y todo lo que cuelga de ellas: evidencias, revisiones, equipo, reasignaciones,
 * reprogramaciones, alertas de geocerca, hojas de servicio, incidencias, recomendaciones, gastos y
 * vehículos ligados), clientes (comerciales + sectores + documentos, de servicio + sucursales +
 * tickets de portal, proyectos operativos de esos clientes), asistencia (entradas/salidas, días,
 * comidas, justificaciones si existe la tabla), trayectorias GPS, chat (mensajes, reacciones, canales
 * y DMs; conserva #general y #anuncios) y TODAS las notificaciones de la empresa.
 *
 * NO toca: usuarios, roles, departamentos, empresa, perfiles/RH, dispositivos, sesiones, audit_logs,
 * oportunidades/cotizaciones (solo se desligan del cliente por su FK SET NULL).
 *
 * Simulación por defecto: imprime lo que borraría. Solo borra con CONFIRMAR=SI.
 *
 * Uso (la imagen no trae scripts/: el archivo entra por stdin):
 *   docker exec -i -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-operacion.js
 *   docker exec -i -e CONFIRMAR=SI -w /app/apps/api nexara-api node - < apps/api/scripts/demo-semana/purgar-operacion.js
 * Opcional: -e COMPANY_ID=1 (por defecto la empresa principal).
 */
'use strict';

function loadPrisma() {
  try {
    return require(require.resolve('@prisma/client', { paths: [process.cwd()] }));
  } catch {
    return require('@prisma/client');
  }
}

function opt(name) {
  const pref = `--${name.toLowerCase()}=`;
  const hit = process.argv.find((a) => a.toLowerCase().startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const env = process.env[name.toUpperCase()];
  return env != null && String(env).trim() !== '' ? String(env).trim() : null;
}

const APLICAR = String(opt('CONFIRMAR') || '').toUpperCase() === 'SI';
const CANALES_ORG = ['general', 'anuncios'];
const CANALES_ORG_META = {
  general: { topic: 'Conversación del equipo', description: 'Canal abierto para toda la organización' },
  anuncios: { topic: 'Avisos importantes del equipo', description: 'Comunicados y novedades' },
};

async function resolveCompany(prisma) {
  const raw = opt('COMPANY_ID');
  if (raw) {
    const id = Number(raw);
    const c = await prisma.companyProfile.findUnique({ where: { id } });
    if (!c) throw new Error(`No existe la empresa ${raw}`);
    return c;
  }
  const primary = await prisma.companyProfile.findFirst({
    where: { isPrimary: true },
    orderBy: { id: 'asc' },
  });
  if (primary) return primary;
  const first = await prisma.companyProfile.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
  if (!first) throw new Error('No hay empresas en company_profile');
  return first;
}

async function tableExists(db, table) {
  const rows = await db.$queryRawUnsafe('SELECT to_regclass($1)::text AS t', `"${table}"`);
  return Boolean(rows?.[0]?.t);
}

async function columnExists(db, table, column) {
  const rows = await db.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    table,
    column,
  );
  return rows.length > 0;
}

/**
 * Pasos en orden seguro para las FK. Cada paso: modelo Prisma + where. Se construyen con los ids
 * leídos en la misma conexión (transacción al aplicar) para no dejar filas a medias.
 */
async function buildPlan(db, companyId) {
  const actividades = await db.activity.findMany({ where: { companyId }, select: { id: true } });
  const activityIds = actividades.map((a) => a.id);

  const serviceClients = await db.serviceClient.findMany({
    where: { companyId },
    select: { id: true, name: true, _count: { select: { maintenanceContracts: true } } },
  });
  const clientesConContrato = serviceClients.filter((c) => c._count.maintenanceContracts > 0);
  const serviceClientIds = serviceClients.filter((c) => c._count.maintenanceContracts === 0).map((c) => c.id);

  const salesClients = await db.salesClient.findMany({ where: { companyId }, select: { id: true } });
  const salesClientIds = salesClients.map((c) => c.id);

  const canales = await db.chatChannel.findMany({
    where: { companyId },
    select: { id: true, slug: true, kind: true },
  });
  const canalIds = canales.map((c) => c.id);
  const canalesBorrar = canales
    .filter((c) => c.kind !== 'DOCUMENT' && !(c.kind === 'PUBLIC' && CANALES_ORG.includes(c.slug || '')))
    .map((c) => c.id);

  // Usuarios que solo pertenecen a esta empresa: sus avisos sin empresa también son de aquí.
  const miembros = await db.userCompany.findMany({ where: { companyId }, select: { userId: true } });
  const otros = await db.userCompany.findMany({
    where: { userId: { in: miembros.map((m) => m.userId) }, companyId: { not: companyId } },
    select: { userId: true },
  });
  const conOtraEmpresa = new Set(otros.map((o) => o.userId));
  const soloAqui = miembros.map((m) => m.userId).filter((id) => !conOtraEmpresa.has(id));

  const enActividades = { in: activityIds };
  const mensajesWhere = { OR: [{ companyId }, { channelId: { in: canalIds } }] };

  const pasos = [
    // Notificaciones
    { grupo: 'Notificaciones', modelo: 'notification', where: { OR: [{ companyId }, { companyId: null, userId: { in: soloAqui } }] } },
    // Chat
    { grupo: 'Chat', modelo: 'chatMessageReaction', where: { message: mensajesWhere } },
    { grupo: 'Chat', modelo: 'chatMessage', etiqueta: 'chatMessage (respuestas)', where: { ...mensajesWhere, parentId: { not: null } } },
    { grupo: 'Chat', modelo: 'chatMessage', etiqueta: 'chatMessage (principales)', where: { ...mensajesWhere, parentId: null } },
    { grupo: 'Chat', modelo: 'chatChannelMember', etiqueta: 'chatChannelMember (canales/DMs que se borran)', where: { channelId: { in: canalesBorrar } } },
    { grupo: 'Chat', modelo: 'chatChannel', etiqueta: 'chatChannel (menos #general/#anuncios y de documentos)', where: { id: { in: canalesBorrar } } },
    // GPS y asistencia
    { grupo: 'GPS', modelo: 'locationTracking', where: { companyId } },
    { grupo: 'Asistencia', modelo: 'lunchBreak', where: { companyId } },
    { grupo: 'Asistencia', modelo: 'attendanceDay', where: { companyId } },
    { grupo: 'Asistencia', modelo: 'attendance', where: { companyId } },
    { grupo: 'Asistencia', raw: 'attendance_justifications' },
    // Lo que cuelga de las actividades
    { grupo: 'Actividades', modelo: 'activityGeofenceAlert', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'activityEvidenceReview', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'activityReassignment', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'activityScheduleChange', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'activityAssignee', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'activityEvidence', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'evidence', where: { actividadId: enActividades } },
    { grupo: 'Actividades', modelo: 'serviceSheet', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'clientActivityFeedback', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'activityIncident', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'activityRecommendation', where: { activityId: enActividades } },
    { grupo: 'Actividades', modelo: 'expense', etiqueta: 'expense (gastos ligados a actividades)', where: { actividadId: enActividades } },
    { grupo: 'Actividades', modelo: 'vehicleControl', etiqueta: 'vehicleControl (solicitudes ligadas a actividades)', where: { actividadId: enActividades } },
    { grupo: 'Actividades', modelo: 'activity', where: { id: enActividades } },
    // Clientes
    { grupo: 'Clientes', modelo: 'projectEngineer', where: { project: { clientId: { in: serviceClientIds } } } },
    { grupo: 'Clientes', modelo: 'operationalProject', where: { clientId: { in: serviceClientIds } } },
    { grupo: 'Clientes', modelo: 'salesClientDocument', where: { clientId: { in: salesClientIds } } },
    { grupo: 'Clientes', modelo: 'salesClientSector', where: { salesClientId: { in: salesClientIds } } },
    { grupo: 'Clientes', modelo: 'salesClient', where: { id: { in: salesClientIds } } },
    { grupo: 'Clientes', modelo: 'clientTicketRequest', where: { clientId: { in: serviceClientIds } } },
    { grupo: 'Clientes', modelo: 'inventorySnapshot', where: { clientId: { in: serviceClientIds } } },
    { grupo: 'Clientes', modelo: 'serviceClientBranch', where: { clientId: { in: serviceClientIds } } },
    { grupo: 'Clientes', modelo: 'serviceClient', where: { id: { in: serviceClientIds } } },
  ];

  // Filas que NO se borran pero pierden su referencia (FK SET NULL).
  const desligados = [
    { modelo: 'viatico', etiqueta: 'viáticos que pierden actividad', where: { actividadId: enActividades } },
    { modelo: 'invoice', etiqueta: 'facturas que pierden actividad', where: { activityId: enActividades } },
    { modelo: 'stockMovement', etiqueta: 'movimientos de almacén que pierden actividad', where: { activityId: enActividades } },
    { modelo: 'meetingAgreement', etiqueta: 'acuerdos de reunión que pierden actividad', where: { activityId: enActividades } },
    { modelo: 'salesOpportunity', etiqueta: 'oportunidades que pierden cliente', where: { clientId: { in: salesClientIds } } },
    { modelo: 'salesLead', etiqueta: 'leads que pierden cliente', where: { clientId: { in: salesClientIds } } },
    { modelo: 'cotizacion', etiqueta: 'cotizaciones que pierden cliente', where: { salesClientId: { in: salesClientIds } } },
  ];

  return { pasos, desligados, activityIds, serviceClientIds, clientesConContrato, canalesBorrar };
}

async function contarRaw(db, table, companyId) {
  if (!(await tableExists(db, table))) return null;
  if (!(await columnExists(db, table, 'companyId'))) return null;
  const rows = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}" WHERE "companyId" = $1`, companyId);
  return rows[0].n;
}

async function ejecutar(db, plan, companyId, borrar) {
  const resultado = [];
  for (const paso of plan.pasos) {
    const etiqueta = paso.etiqueta || paso.modelo || paso.raw;
    if (paso.raw) {
      const n = await contarRaw(db, paso.raw, companyId);
      if (n == null) {
        resultado.push({ grupo: paso.grupo, etiqueta: `${paso.raw} (no existe; se omite)`, n: 0 });
        continue;
      }
      if (borrar && n > 0) {
        await db.$executeRawUnsafe(`DELETE FROM "${paso.raw}" WHERE "companyId" = $1`, companyId);
      }
      resultado.push({ grupo: paso.grupo, etiqueta: paso.raw, n });
      continue;
    }
    const delegate = db[paso.modelo];
    if (!delegate) {
      resultado.push({ grupo: paso.grupo, etiqueta: `${etiqueta} (modelo no disponible; se omite)`, n: 0 });
      continue;
    }
    if (borrar) {
      const r = await delegate.deleteMany({ where: paso.where });
      resultado.push({ grupo: paso.grupo, etiqueta, n: r.count });
    } else {
      resultado.push({ grupo: paso.grupo, etiqueta, n: await delegate.count({ where: paso.where }) });
    }
  }
  return resultado;
}

async function asegurarCanalesOrg(db, companyId, borrar) {
  const acciones = [];
  const ceo = await db.user.findFirst({ where: { email: 'gerencia@nexara.com.mx' }, select: { id: true } });
  const activos = await db.user.findMany({
    where: { isActive: true, companyMemberships: { some: { companyId } } },
    select: { id: true },
  });
  for (const slug of CANALES_ORG) {
    const canal = await db.chatChannel.findFirst({ where: { companyId, slug } });
    if (canal) {
      acciones.push(`#${slug}: se conserva (sin mensajes, vista previa en blanco)`);
      if (borrar) {
        await db.chatChannel.update({
          where: { id: canal.id },
          data: { lastMessageAt: null, lastMessagePreview: null, isArchived: false },
        });
      }
      continue;
    }
    acciones.push(`#${slug}: no existe, se crea con ${activos.length} miembros`);
    if (borrar) {
      const creado = await db.chatChannel.create({
        data: {
          kind: 'PUBLIC',
          slug,
          name: slug,
          topic: CANALES_ORG_META[slug].topic,
          description: CANALES_ORG_META[slug].description,
          createdById: ceo?.id ?? null,
          companyId,
        },
      });
      if (activos.length) {
        await db.chatChannelMember.createMany({
          data: activos.map((u) => ({ channelId: creado.id, userId: u.id, role: 'member' })),
          skipDuplicates: true,
        });
      }
    }
  }
  return acciones;
}

function imprimir(resultado) {
  let grupo = null;
  let total = 0;
  for (const r of resultado) {
    if (r.grupo !== grupo) {
      grupo = r.grupo;
      console.log(`\n  ${grupo}`);
    }
    total += r.n;
    console.log(`    ${String(r.n).padStart(7)}  ${r.etiqueta}`);
  }
  return total;
}

async function main() {
  const { PrismaClient } = loadPrisma();
  const prisma = new PrismaClient();
  try {
    const company = await resolveCompany(prisma);
    const nombre = company.tradeName || company.legalName;
    console.log('════════════════════════════════════════════════════════════');
    console.log(` Purga de operación · empresa ${company.id} (${nombre})`);
    console.log(` Modo: ${APLICAR ? 'BORRAR (CONFIRMAR=SI)' : 'SIMULACIÓN — no se borra nada'}`);
    console.log('════════════════════════════════════════════════════════════');

    const plan = await buildPlan(prisma, company.id);
    if (plan.clientesConContrato.length) {
      console.log('\n  Clientes de servicio que se CONSERVAN por tener contratos de mantenimiento:');
      for (const c of plan.clientesConContrato) console.log(`    - #${c.id} ${c.name}`);
    }

    if (!APLICAR) {
      const resultado = await ejecutar(prisma, plan, company.id, false);
      const total = imprimir(resultado);
      console.log('\n  Se desligan (no se borran):');
      for (const d of plan.desligados) {
        const delegate = prisma[d.modelo];
        const n = delegate ? await delegate.count({ where: d.where }) : 0;
        console.log(`    ${String(n).padStart(7)}  ${d.etiqueta}`);
      }
      console.log('\n  Canales de organización:');
      for (const a of await asegurarCanalesOrg(prisma, company.id, false)) console.log(`    - ${a}`);
      console.log(`\n  Total de filas que se borrarían: ${total}`);
      console.log('\n  Nada se borró. Para aplicar: docker exec -i -e CONFIRMAR=SI ... node - < purgar-operacion.js');
      return;
    }

    const inicio = Date.now();
    const { resultado, acciones } = await prisma.$transaction(
      async (tx) => {
        const planTx = await buildPlan(tx, company.id);
        const res = await ejecutar(tx, planTx, company.id, true);
        const acc = await asegurarCanalesOrg(tx, company.id, true);
        return { resultado: res, acciones: acc };
      },
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );
    const total = imprimir(resultado);
    console.log('\n  Canales de organización:');
    for (const a of acciones) console.log(`    - ${a}`);
    console.log(`\n  Listo: ${total} filas borradas en ${Math.round((Date.now() - inicio) / 1000)} s.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nERROR — la transacción se revirtió, no se borró nada.');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
