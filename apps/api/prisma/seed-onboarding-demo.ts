/**
 * Seed de onboarding: conecta los 11 usuarios reales del equipo NEXARA a
 * TODOS los nuevos procesos generados en las fases 17-34 (Helpdesk, NOC,
 * People/RH, Lab, Multi-tenant, Vacaciones, Workflow, CRM activities, Sales
 * targets, KB, Notifications, Performance reviews).
 *
 * Es idempotente: puede ejecutarse N veces sin duplicar nada. Usa upserts y
 * findFirst para evitar duplicados.
 *
 * Run:
 *   cd apps/api && npx ts-node prisma/seed-onboarding-demo.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Identidades del equipo (deben coincidir con seed-demo-users.ts) ─────────
// Karen Elizalde consolida Dirección Administrativa + Dirección Comercial.
const TEAM_EMAILS = {
  ceo: 'gerencia@nexara.com.mx',          // Christian Del Pozo
  developer: 'developer@nexara.com.mx',   // Adam Del Pozo
  directorAdmin: 'ventas@nexara.com.mx',  // Karen Elizalde (Admin + Comercial)
  directorOps: 'direccion.operaciones@nexara.com.mx', // Luis Joel Aguilar
  directorCommercial: 'ventas@nexara.com.mx', // Karen Elizalde
  projectManager: 'operaciones@nexara.com.mx', // Alejandro Gonzales
  seniorEngineer: 'soporte@nexara.com.mx', // Carolina Juárez
  salesRep: 'vendedor@nexara.com.mx',     // Karina Martínez
  fieldEngineerJulio: 'julio.rivazquez@nexara.com.mx',
  fieldEngineerDavid: 'david.morzenon@nexara.com.mx',
  fieldEngineerIsrael: 'israel.ralima@nexara.com.mx',
} as const;

type TeamMap = Record<keyof typeof TEAM_EMAILS, { id: number; nombre: string; email: string }>;

async function loadTeam(): Promise<TeamMap> {
  const team = {} as TeamMap;
  for (const [key, email] of Object.entries(TEAM_EMAILS)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`[ONBOARDING] Usuario ${email} no existe. Corre seed-demo-users.ts primero.`);
    (team as any)[key] = { id: user.id, nombre: user.nombre, email: user.email };
  }
  return team;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. MULTI-TENANT — empresa primaria + secundaria de ejemplo
// ════════════════════════════════════════════════════════════════════════════
async function seedCompanies() {
  const anyClient = prisma as any;
  // Empresa primaria (la real)
  const primary = await anyClient.companyProfile.upsert({
    where: { id: 1 },
    update: {
      legalName: 'NEXARA Tech S.A. de C.V.',
      tradeName: 'NEXARA',
      rfc: 'NEX240101AB1',
      slug: 'nexara',
      fiscalRegime: '601',
      contactEmail: 'contacto@nexara.com.mx',
      websiteUrl: 'https://nexara.com.mx',
      brandPrimary: '#0ea5e9',
      brandSecondary: '#16a34a',
      isPrimary: true,
      isActive: true,
    },
    create: {
      legalName: 'NEXARA Tech S.A. de C.V.',
      tradeName: 'NEXARA',
      rfc: 'NEX240101AB1',
      slug: 'nexara',
      fiscalRegime: '601',
      contactEmail: 'contacto@nexara.com.mx',
      websiteUrl: 'https://nexara.com.mx',
      brandPrimary: '#0ea5e9',
      brandSecondary: '#16a34a',
      isPrimary: true,
      isActive: true,
    },
  });

  // Empresa secundaria demo (para mostrar el switcher multi-tenant)
  const secondary = await anyClient.companyProfile.upsert({
    where: { slug: 'nexara-services' },
    update: { isActive: true },
    create: {
      legalName: 'NEXARA Services & Maintenance S.A. de C.V.',
      tradeName: 'NEXARA Services',
      rfc: 'NSM250101CD2',
      slug: 'nexara-services',
      fiscalRegime: '601',
      contactEmail: 'services@nexara.com.mx',
      websiteUrl: 'https://nexara.com.mx',
      brandPrimary: '#dc2626',
      brandSecondary: '#f59e0b',
      isPrimary: false,
      isActive: true,
    },
  });

  console.log(`   ✓ Multi-tenant: empresa primaria #${primary.id} + secundaria #${secondary.id}`);
  return { primary, secondary };
}

// ════════════════════════════════════════════════════════════════════════════
// 2. FEATURE FLAGS — asegurar set base
// ════════════════════════════════════════════════════════════════════════════
async function seedFeatureFlags() {
  const anyClient = prisma as any;
  const flags = [
    { key: 'lab.ai.live', scope: 'lab', description: 'Conecta AI Sandbox a la API real (Claude/GPT)', enabled: false },
    { key: 'noc.realtime.mqtt', scope: 'noc', description: 'Streaming MQTT en NOC para telemetría en vivo', enabled: false },
    { key: 'ventas.ai.lead-scoring', scope: 'ventas', description: 'Lead scoring asistido por IA en CRM', enabled: true },
    { key: 'ops.routes.auto-optimize', scope: 'ops', description: 'Optimización automática de rutas con OR-Tools', enabled: false },
    { key: 'finance.cfdi.auto-stamp', scope: 'finance', description: 'Timbrado automático al crear factura', enabled: true },
    { key: 'people.payroll.export-csv', scope: 'people', description: 'Exportar nómina en CSV para SAT', enabled: true },
    { key: 'core.workflow.slack-webhook', scope: 'core', description: 'Notificar workflows aprobados/rechazados a Slack', enabled: false },
    { key: 'support.auto-route-it', scope: 'support', description: 'Auto-asignar tickets categoría IT a Carolina', enabled: true },
    { key: 'people.vacation.auto-approve-1day', scope: 'people', description: 'Auto-aprobar vacaciones de 1 solo día', enabled: false },
  ];
  for (const f of flags) {
    await anyClient.featureFlag.upsert({
      where: { key: f.key },
      update: { scope: f.scope, description: f.description, enabled: f.enabled },
      create: f,
    });
  }
  console.log(`   ✓ Feature flags: ${flags.length} configurados`);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. KB — categorías + artículos para Helpdesk y Portal Cliente
// ════════════════════════════════════════════════════════════════════════════
async function seedKnowledgeBase(team: TeamMap) {
  const anyClient = prisma as any;

  // Categorías
  const catIT = await anyClient.kbCategory.upsert({
    where: { slug: 'helpdesk-it' },
    update: {},
    create: { slug: 'helpdesk-it', name: 'Helpdesk IT', description: 'Problemas de equipo, accesos, software', icon: '💻', visibility: 'INTERNAL', sortOrder: 1 },
  });
  const catRH = await anyClient.kbCategory.upsert({
    where: { slug: 'helpdesk-rh' },
    update: {},
    create: { slug: 'helpdesk-rh', name: 'RRHH', description: 'Vacaciones, asistencia, prestaciones', icon: '👤', visibility: 'INTERNAL', sortOrder: 2 },
  });
  const catClientes = await anyClient.kbCategory.upsert({
    where: { slug: 'portal-clientes' },
    update: {},
    create: { slug: 'portal-clientes', name: 'Portal Clientes', description: 'Guías para usuarios de Soriana, Sanborns, Toks', icon: '🏢', visibility: 'CLIENT_ONLY', sortOrder: 3 },
  });
  const catOps = await anyClient.kbCategory.upsert({
    where: { slug: 'ops-procedimientos' },
    update: {},
    create: { slug: 'ops-procedimientos', name: 'Procedimientos de campo', description: 'Procedimientos para ingenieros instaladores', icon: '🔧', visibility: 'INTERNAL', sortOrder: 4 },
  });

  // Artículos demo — autores realistas
  const articles = [
    {
      slug: 'restablecer-contrasena-erp',
      title: 'Cómo restablecer mi contraseña del ERP',
      excerpt: 'Pasos para recuperar tu acceso si olvidaste tu contraseña.',
      content: '1. Ve a https://core.nexara.com.mx/login\n2. Da clic en "¿Olvidaste tu contraseña?"\n3. Ingresa tu email corporativo (@nexara.com.mx)\n4. Revisa tu bandeja y haz clic en el enlace de reset\n5. Define una nueva contraseña (8+ caracteres, mayúscula, número, símbolo)\n\nSi después de 5 min no recibes el email, levanta un ticket en support.nexara.com.mx con categoría "Accesos".',
      visibility: 'INTERNAL',
      status: 'PUBLISHED',
      categoryId: catIT.id,
      authorId: team.seniorEngineer.id, // Carolina
    },
    {
      slug: 'solicitar-vacaciones-lft',
      title: 'Cómo solicitar vacaciones (tabla LFT)',
      excerpt: 'Saldo por antigüedad y proceso de solicitud.',
      content: 'En México la LFT marca el siguiente saldo anual:\n  • Año 1: 12 días\n  • Año 2: 14 días\n  • Año 3-5: 16 días\n  • Año 6-10: 18 días\n  • Año 11+: 20 días\n\nProceso:\n  1. Entra a people.nexara.com.mx/my-vacation\n  2. Da clic en "Nueva solicitud"\n  3. Selecciona fechas y tipo\n  4. Tu jefe directo recibirá la notificación y aprobará/rechazará\n  5. Recibes confirmación por email y notificación en la app',
      visibility: 'INTERNAL',
      status: 'PUBLISHED',
      categoryId: catRH.id,
      authorId: team.directorAdmin.id, // Karen (Dir. Admin + Comercial)
    },
    {
      slug: 'levantar-ticket-soporte-cliente',
      title: '¿Cómo levantar un ticket desde el portal?',
      excerpt: 'Guía para reportar fallas en tus equipos instalados.',
      content: 'Si tienes una cámara que no muestra imagen, un POS desconectado o cualquier incidente:\n\n1. Entra a portal.nexara.com.mx con tu usuario corporativo\n2. Ve a "Mis tickets" → "Nuevo ticket"\n3. Selecciona la sucursal afectada\n4. Indica tipo de incidente (CCTV, POS, Impresora, Red, Acceso)\n5. Describe el problema con detalle\n6. Adjunta foto o video si es posible\n7. Indica prioridad: Alta (bloqueante), Media (degradado), Baja (consulta)\n\nNuestro NOC recibe la alerta inmediatamente y un ingeniero te contactará según SLA.',
      visibility: 'CLIENT_ONLY',
      status: 'PUBLISHED',
      categoryId: catClientes.id,
      authorId: team.projectManager.id, // Alejandro
    },
    {
      slug: 'procedimiento-instalacion-cctv-hikvision',
      title: 'Procedimiento de instalación CCTV Hikvision',
      excerpt: 'Checklist y mejores prácticas para ingenieros de campo.',
      content: 'Checklist obligatorio antes de salir del sitio:\n\n☐ Cableado UTP cat6 con jacket exterior si aplica\n☐ Conectorización RJ45 hembra cumple T568B en ambos extremos\n☐ Pruebas de continuidad con tester\n☐ Cámara configurada con IP fija del rango asignado\n☐ Firmware actualizado a versión más reciente\n☐ Pruebas de visión nocturna (cubrir lente 5s)\n☐ Foto de evidencia 1: cámara montada\n☐ Foto de evidencia 2: imagen en NVR/cloud\n☐ Foto de evidencia 3: panel de cableado\n☐ Reporte firmado por encargado de sucursal\n☐ Cierre de ticket en operacion.nexara.com.mx con hora real\n\nEn caso de duda contactar a Carolina (Senior Engineer) por WhatsApp interno.',
      visibility: 'INTERNAL',
      status: 'PUBLISHED',
      categoryId: catOps.id,
      authorId: team.seniorEngineer.id,
    },
    {
      slug: 'rutas-camion-norte-mty',
      title: 'Rutas asignadas zona Norte (MTY)',
      excerpt: 'Sucursales Soriana, Toks y Sanborns en el área metropolitana.',
      content: 'Las rutas se asignan los lunes en operacion.nexara.com.mx/projects.\n\nZonas norte MTY:\n• Soriana San Nicolás (CCTV mant. mensual)\n• Toks Constitución (POS cabezal)\n• Toks Gonzalitos (impresoras)\n• Sanborns Galerías (red wifi)\n\nLas evidencias se suben desde la app móvil (Android/iOS).',
      visibility: 'INTERNAL',
      status: 'PUBLISHED',
      categoryId: catOps.id,
      authorId: team.fieldEngineerJulio.id,
    },
  ];

  for (const a of articles) {
    await anyClient.kbArticle.upsert({
      where: { slug: a.slug },
      update: {
        title: a.title,
        excerpt: a.excerpt,
        content: a.content,
        status: a.status,
        publishedAt: a.status === 'PUBLISHED' ? new Date() : null,
      },
      create: { ...a, publishedAt: a.status === 'PUBLISHED' ? new Date() : null },
    });
  }

  console.log(`   ✓ KB: 4 categorías + ${articles.length} artículos`);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. SALES TARGETS — Karen (director) y Karina (rep)
// ════════════════════════════════════════════════════════════════════════════
async function seedSalesTargets(team: TeamMap) {
  const anyClient = prisma as any;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = Math.ceil(month / 3);

  // Karina (Ejecutivo de Ventas)
  const karinaTarget = {
    revenueTarget: 350000,
    newClientsTarget: 3,
    opportunitiesTarget: 8,
    baseCommissionPct: 3,
    bonusCommissionPct: 5,
    bonusThresholdPct: 100,
    notes: 'Meta mensual ejecutivo de ventas (Karina). Plan Q2 2026.',
  };
  const existingKarina = await anyClient.salesTarget.findFirst({
    where: {
      ownerId: team.salesRep.id,
      period: 'MONTHLY',
      year,
      month,
      quarter: null,
    },
    select: { id: true },
  });
  if (existingKarina) {
    await anyClient.salesTarget.update({ where: { id: existingKarina.id }, data: karinaTarget });
  } else {
    await anyClient.salesTarget.create({
      data: {
        ownerId: team.salesRep.id,
        period: 'MONTHLY',
        year,
        month,
        quarter: null,
        ...karinaTarget,
      },
    });
  }

  // Karen (Director Comercial) — meta del equipo
  const karenTarget = {
    revenueTarget: 2500000,
    newClientsTarget: 15,
    opportunitiesTarget: 35,
    baseCommissionPct: 2,
    bonusCommissionPct: 4,
    bonusThresholdPct: 120,
    notes: 'Meta trimestral dirección comercial (Karen). Incluye equipo completo.',
  };
  const existingKaren = await anyClient.salesTarget.findFirst({
    where: {
      ownerId: team.directorCommercial.id,
      period: 'QUARTERLY',
      year,
      month: null,
      quarter,
    },
    select: { id: true },
  });
  if (existingKaren) {
    await anyClient.salesTarget.update({ where: { id: existingKaren.id }, data: karenTarget });
  } else {
    await anyClient.salesTarget.create({
      data: {
        ownerId: team.directorCommercial.id,
        period: 'QUARTERLY',
        year,
        month: null,
        quarter,
        ...karenTarget,
      },
    });
  }

  console.log(`   ✓ Sales targets: meta mensual Karina + trimestral Karen`);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. CRM ACTIVITIES — agenda comercial para Karina y Karen
// ════════════════════════════════════════════════════════════════════════════
async function seedCrmActivities(team: TeamMap) {
  const anyClient = prisma as any;
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const inOneWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

  const activities = [
    {
      subject: 'Llamada de seguimiento — Soriana Norte',
      description: 'Validar status del retake CCTV en sucursal Apodaca y comer al cierre del mes.',
      activityType: 'CALL',
      status: 'PENDING',
      dueDate: tomorrow,
      ownerId: team.salesRep.id, // Karina
      createdById: team.directorCommercial.id, // Karen le pidió a Karina
    },
    {
      subject: 'Reunión Toks Constitución — propuesta cabezales impresoras',
      description: 'Cita 11:00 con encargado regional, presentar cotización 2026-024.',
      activityType: 'MEETING',
      status: 'PENDING',
      dueDate: inThreeDays,
      ownerId: team.salesRep.id,
      createdById: team.salesRep.id,
    },
    {
      subject: 'Cotización pendiente — Sanborns Galerías Monterrey',
      description: 'Generar SOW de migración wifi mesh + 12 APs Ubiquiti.',
      activityType: 'TASK',
      status: 'PENDING',
      dueDate: inOneWeek,
      ownerId: team.directorCommercial.id, // Karen
      createdById: team.ceo.id, // Christian se lo pidió
    },
    {
      subject: 'Llamada de cierre — Polos del Bienestar fase 3',
      description: 'Confirmar entrega de drones y pago anticipo 30%.',
      activityType: 'CALL',
      status: 'COMPLETED',
      dueDate: yesterday,
      completedAt: yesterday,
      outcome: 'Cliente confirmó pago. PO emitida #PB-2026-018.',
      ownerId: team.directorCommercial.id,
      createdById: team.directorCommercial.id,
    },
    {
      subject: 'Email de prospección — cadena restaurantera Las Alitas',
      description: 'Enviar pitch deck NEXARA + casos de éxito Toks.',
      activityType: 'EMAIL',
      status: 'PENDING',
      dueDate: tomorrow,
      ownerId: team.salesRep.id,
      createdById: team.directorCommercial.id,
    },
  ];

  for (const a of activities) {
    const existing = await anyClient.crmActivity.findFirst({
      where: { subject: a.subject, ownerId: a.ownerId },
    });
    if (existing) {
      await anyClient.crmActivity.update({ where: { id: existing.id }, data: a });
    } else {
      await anyClient.crmActivity.create({ data: a });
    }
  }

  console.log(`   ✓ CRM Activities: ${activities.length} actividades (Karina + Karen)`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6. LEAVE REQUESTS — vacaciones / permisos demo
// ════════════════════════════════════════════════════════════════════════════
async function seedLeaveRequests(team: TeamMap) {
  const now = new Date();
  const in15Days = new Date(now.getTime() + 15 * 24 * 3600 * 1000);
  const in20Days = new Date(now.getTime() + 20 * 24 * 3600 * 1000);
  const ago30Days = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const ago27Days = new Date(now.getTime() - 27 * 24 * 3600 * 1000);
  const ago7Days = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const ago5Days = new Date(now.getTime() - 5 * 24 * 3600 * 1000);

  const requests: Array<{
    userId: number;
    type: 'VACATION' | 'SICK' | 'PERSONAL';
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    startDate: Date;
    endDate: Date;
    days: number;
    reason?: string;
    approvedById?: number;
    approvedAt?: Date;
  }> = [
    // Julio — vacaciones aprobadas próximas
    {
      userId: team.fieldEngineerJulio.id,
      type: 'VACATION',
      status: 'APPROVED',
      startDate: in15Days,
      endDate: in20Days,
      days: 6,
      reason: 'Vacaciones de verano programadas.',
      approvedById: team.directorOps.id, // Luis
      approvedAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
    },
    // David — solicitud pendiente para Luis
    {
      userId: team.fieldEngineerDavid.id,
      type: 'VACATION',
      status: 'PENDING',
      startDate: in15Days,
      endDate: in20Days,
      days: 6,
      reason: 'Viaje familiar (boda hermana).',
    },
    // Israel — permiso médico aprobado retro
    {
      userId: team.fieldEngineerIsrael.id,
      type: 'SICK',
      status: 'APPROVED',
      startDate: ago30Days,
      endDate: ago27Days,
      days: 4,
      reason: 'Influenza con incapacidad médica IMSS.',
      approvedById: team.directorAdmin.id, // Karen (Dir. Admin + Comercial)
      approvedAt: ago27Days,
    },
    // Karina — día personal pendiente
    {
      userId: team.salesRep.id,
      type: 'PERSONAL',
      status: 'PENDING',
      startDate: ago7Days,
      endDate: ago7Days,
      days: 1,
      reason: 'Trámite bancario presencial.',
    },
    // Alejandro — vacaciones aprobadas pasadas
    {
      userId: team.projectManager.id,
      type: 'VACATION',
      status: 'APPROVED',
      startDate: ago7Days,
      endDate: ago5Days,
      days: 3,
      reason: 'Puente largo familiar.',
      approvedById: team.directorOps.id,
      approvedAt: ago7Days,
    },
  ];

  for (const r of requests) {
    const existing = await prisma.leaveRequest.findFirst({
      where: {
        userId: r.userId,
        type: r.type as any,
        startDate: r.startDate,
      },
    });
    if (existing) {
      await prisma.leaveRequest.update({
        where: { id: existing.id },
        data: r as any,
      });
    } else {
      await prisma.leaveRequest.create({ data: r as any });
    }
  }

  console.log(`   ✓ Leaves: ${requests.length} solicitudes (1 pendiente p/ Luis, 1 pendiente p/ Karina)`);
}

// ════════════════════════════════════════════════════════════════════════════
// 7. PERFORMANCE REVIEW — Karen revisa a Karina
// ════════════════════════════════════════════════════════════════════════════
async function seedPerformanceReviews(team: TeamMap) {
  const anyClient = prisma as any;
  const now = new Date();
  const lastQuarterStart = new Date(now.getFullYear(), Math.max(0, now.getMonth() - 3), 1);

  const existing = await anyClient.performanceReview.findFirst({
    where: { userId: team.salesRep.id, reviewerId: team.directorCommercial.id, reviewDate: lastQuarterStart },
  });

  if (!existing) {
    await anyClient.performanceReview.create({
      data: {
        userId: team.salesRep.id,
        reviewerId: team.directorCommercial.id,
        period: 'QUARTERLY',
        reviewDate: lastQuarterStart,
        overallRating: 4.2,
        status: 'SUBMITTED',
      },
    }).catch(() => {});
  }

  console.log(`   ✓ Performance review: Karen → Karina Q${Math.ceil((now.getMonth() + 1) / 3) - 1 || 4} (rating 4.2)`);
}

// ════════════════════════════════════════════════════════════════════════════
// 8. WORKFLOW — definición + instancia pendiente
// ════════════════════════════════════════════════════════════════════════════
async function seedWorkflows(team: TeamMap) {
  const anyClient = prisma as any;

  // Definición: "Aprobación de cotización > $50,000"
  const workflowName = 'Aprobación cotización mayor a $50,000';
  let workflow = await anyClient.workflowDefinition.findUnique({ where: { name: workflowName } });
  if (!workflow) {
    workflow = await anyClient.workflowDefinition.create({
      data: {
        name: workflowName,
        description: 'Toda cotización emitida por ejecutivo de ventas que supere $50,000 MXN requiere aprobación de director comercial.',
        entityType: 'Cotizacion',
        status: 'ACTIVE',
        steps: {
          create: [
            {
              stepNumber: 1,
              name: 'Validación Director Comercial',
              description: 'Karen valida margen y descuento aplicado.',
              approverUserId: team.directorCommercial.id,
              sortOrder: 1,
            },
            {
              stepNumber: 2,
              name: 'Visto bueno CEO (si > $200K)',
              description: 'Para montos > $200K también requiere visto bueno del CEO.',
              approverUserId: team.ceo.id,
              sortOrder: 2,
              autoApproveCondition: 'amount<=200000',
            },
          ],
        },
      },
    });
  }

  // Definición: "Solicitud de vacaciones > 5 días"
  const wfVacName = 'Aprobación vacaciones > 5 días';
  let wfVac = await anyClient.workflowDefinition.findUnique({ where: { name: wfVacName } });
  if (!wfVac) {
    wfVac = await anyClient.workflowDefinition.create({
      data: {
        name: wfVacName,
        description: 'Solicitudes de vacaciones mayores a 5 días requieren visto bueno del director del área.',
        entityType: 'LeaveRequest',
        status: 'ACTIVE',
        steps: {
          create: [
            { stepNumber: 1, name: 'Aprobación jefe directo', approverUserId: team.directorOps.id, sortOrder: 1 },
            { stepNumber: 2, name: 'Visto bueno Director Administrativo', approverUserId: team.directorAdmin.id, sortOrder: 2 },
          ],
        },
      },
    });
  }

  // Definición: "Compra mayor a $30K"
  const wfPurName = 'Aprobación compra mayor a $30,000';
  let wfPur = await anyClient.workflowDefinition.findUnique({ where: { name: wfPurName } });
  if (!wfPur) {
    wfPur = await anyClient.workflowDefinition.create({
      data: {
        name: wfPurName,
        description: 'Órdenes de compra superiores a $30K MXN requieren validación administrativa y autorización ejecutiva.',
        entityType: 'PurchaseOrder',
        status: 'ACTIVE',
        steps: {
          create: [
            { stepNumber: 1, name: 'Validación Jefe de Proyectos', approverUserId: team.projectManager.id, sortOrder: 1 },
            { stepNumber: 2, name: 'Director Administrativo', approverUserId: team.directorAdmin.id, sortOrder: 2 },
            { stepNumber: 3, name: 'Autorización CEO (si > $100K)', approverUserId: team.ceo.id, sortOrder: 3, autoApproveCondition: 'amount<=100000' },
          ],
        },
      },
    });
  }

  console.log(`   ✓ Workflows: 3 definiciones con steps (cotización, vacaciones, compras)`);
}

// ════════════════════════════════════════════════════════════════════════════
// 8.5 SERVICE CLIENTS + OPERATIONAL PROJECTS — para que NOC tenga dispositivos
// ════════════════════════════════════════════════════════════════════════════
async function seedServiceClientsAndProjects(team: TeamMap) {
  const anyClient = prisma as any;

  // Clientes reales referenciados durante todo el desarrollo
  const clientDefs = [
    { name: 'Soriana', city: 'Monterrey', state: 'Nuevo León', accountCode: 'SOR-001' },
    { name: 'Toks', city: 'Ciudad de México', state: 'CDMX', accountCode: 'TOK-001' },
    { name: 'Sanborns', city: 'Guadalajara', state: 'Jalisco', accountCode: 'SAN-001' },
    { name: 'Polos del Bienestar', city: 'Tlaxcala', state: 'Tlaxcala', accountCode: 'PDB-001' },
  ];

  const clients: Record<string, any> = {};
  for (const c of clientDefs) {
    const existing = await prisma.serviceClient.findFirst({ where: { name: c.name } });
    if (existing) {
      clients[c.name] = existing;
    } else {
      clients[c.name] = await prisma.serviceClient.create({
        data: { ...c, isActive: true, country: 'México' },
      });
    }
  }

  // Proyectos operacionales — distintos tipos para variedad en NOC
  const projectDefs = [
    { title: 'CCTV 128 cámaras — Polos del Bienestar', projectType: 'INSTALACION_CCTV', siteCount: 8, vendorId: team.projectManager.id, clientId: clients['Polos del Bienestar'].id, scopeSummary: '128 cámaras IP + DVR + drones + control acceso' },
    { title: 'Mantenimiento POS — Toks zona Norte', projectType: 'MANTENIMIENTO', siteCount: 6, vendorId: team.projectManager.id, clientId: clients['Toks'].id, scopeSummary: 'Cambio de cabezales y reemplazo de impresoras' },
    { title: 'CCTV multi-sucursal — Soriana NL', projectType: 'INSTALACION_CCTV', siteCount: 12, vendorId: team.directorOps.id, clientId: clients['Soriana'].id, scopeSummary: 'Gestión nodos sucursales NL' },
    { title: 'Migración WiFi 6 — Sanborns Galerías', projectType: 'REDES_WIFI', siteCount: 3, vendorId: team.projectManager.id, clientId: clients['Sanborns'].id, scopeSummary: '12 APs Ubiquiti, controller cloud' },
    { title: 'Mantenimiento preventivo — Toks Constitución', projectType: 'MANTENIMIENTO', siteCount: 4, vendorId: team.directorOps.id, clientId: clients['Toks'].id, scopeSummary: 'Mantenimientos trimestrales programados' },
  ];

  for (const p of projectDefs) {
    const existing = await anyClient.operationalProject.findFirst({
      where: { title: p.title, clientId: p.clientId },
    });

    if (existing) {
      await anyClient.operationalProject.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', siteCount: p.siteCount, scopeSummary: p.scopeSummary },
      });

      // Asignar ingenieros si no están
      const assignments = [
        { projectId: existing.id, engineerId: team.fieldEngineerJulio.id },
        { projectId: existing.id, engineerId: team.fieldEngineerDavid.id },
        { projectId: existing.id, engineerId: team.fieldEngineerIsrael.id },
        { projectId: existing.id, engineerId: team.seniorEngineer.id },
      ];
      for (const a of assignments) {
        await anyClient.projectEngineer.upsert({
          where: { projectId_engineerId: { projectId: a.projectId, engineerId: a.engineerId } },
          update: {},
          create: a,
        });
      }
    } else {
      const created = await anyClient.operationalProject.create({
        data: {
          ...p,
          status: 'ACTIVE',
          startDate: new Date(Date.now() - 60 * 24 * 3600 * 1000),
          endDate: new Date(Date.now() + 180 * 24 * 3600 * 1000),
        },
      });
      // Asignar 4 ingenieros (Senior + 3 Campo) a cada proyecto
      await anyClient.projectEngineer.createMany({
        data: [
          { projectId: created.id, engineerId: team.fieldEngineerJulio.id },
          { projectId: created.id, engineerId: team.fieldEngineerDavid.id },
          { projectId: created.id, engineerId: team.fieldEngineerIsrael.id },
          { projectId: created.id, engineerId: team.seniorEngineer.id },
        ],
        skipDuplicates: true,
      });
    }
  }

  console.log(`   ✓ Service Clients: ${clientDefs.length} (Soriana, Toks, Sanborns, Polos) + ${projectDefs.length} proyectos operativos con ingenieros asignados`);
}

// ════════════════════════════════════════════════════════════════════════════
// 9. HELPDESK TICKETS — tickets internos demo
// ════════════════════════════════════════════════════════════════════════════
async function seedHelpdeskTickets(team: TeamMap) {
  const anyClient = prisma as any;
  const now = new Date();
  const ago2Days = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const ago1Day = new Date(now.getTime() - 1 * 24 * 3600 * 1000);

  const tickets = [
    {
      titulo: '[Helpdesk · IT] Mi laptop no enciende',
      descripcion: 'Al presionar power solo prende el LED 1 seg y se apaga. Probé con cargador nuevo. La uso para subir evidencias diarias.',
      estatus: 'Pendiente',
      prioridad: 'Alta',
      ticketType: 'CORRECTIVO',
      // Helpdesk: el reporte lo crea el empleado, pero el responsable es el Senior Engineer (Carolina)
      creadoPorId: team.fieldEngineerJulio.id,
      responsableId: team.seniorEngineer.id,
      fechaAsignacion: ago2Days,
    },
    {
      titulo: '[Helpdesk · ACCESS] No puedo entrar al CRM',
      descripcion: 'Me marca "credenciales inválidas" pero las pruebo en core y sí entran. Necesito acceso a sales.nexara.com.mx',
      estatus: 'En Proceso',
      prioridad: 'Media',
      ticketType: 'CORRECTIVO',
      creadoPorId: team.salesRep.id,
      responsableId: team.seniorEngineer.id,
      fechaAsignacion: ago1Day,
    },
    {
      titulo: '[Helpdesk · SOFTWARE] Necesito licencia Office para tablet',
      descripcion: 'Para llenar reportes de servicio offline en sitio.',
      estatus: 'Asignado',
      prioridad: 'Baja',
      ticketType: 'CORRECTIVO',
      creadoPorId: team.fieldEngineerDavid.id,
      responsableId: team.directorAdmin.id,
      fechaAsignacion: ago1Day,
    },
    {
      titulo: '[Helpdesk · HR] Pregunta sobre aguinaldo',
      descripcion: '¿Cuándo se paga el aguinaldo este año? ¿Es por adelantado o partido?',
      estatus: 'Finalizado',
      prioridad: 'Baja',
      ticketType: 'CORRECTIVO',
      creadoPorId: team.fieldEngineerIsrael.id,
      responsableId: team.directorAdmin.id,
      fechaAsignacion: ago2Days,
      fechaFinalizacion: ago1Day,
    },
  ];

  for (const t of tickets) {
    const existing = await anyClient.activity.findFirst({
      where: { titulo: t.titulo, creadoPorId: t.creadoPorId },
    });
    if (existing) {
      await anyClient.activity.update({ where: { id: existing.id }, data: t });
    } else {
      await anyClient.activity.create({
        data: {
          ...t,
          activityType: 'CLIENT',
          workType: 'ISSUE',
          anNumber: `HLD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
        },
      });
    }
  }

  console.log(`   ✓ Helpdesk: ${tickets.length} tickets internos demo`);
}

// ════════════════════════════════════════════════════════════════════════════
// 10. NOTIFICATIONS — bandeja de cada usuario con algo útil
// ════════════════════════════════════════════════════════════════════════════
async function seedNotifications(team: TeamMap) {
  const anyClient = prisma as any;

  const notifications = [
    {
      userId: team.directorOps.id, // Luis
      title: 'Solicitud de vacaciones pendiente',
      message: 'David Morales solicitó 6 días de vacaciones próximas. Revisa y aprueba.',
      type: 'ACTIVITY_ASSIGNED' as const,
      category: 'people',
      priority: 'high',
      relatedUrl: '/approvals',
    },
    {
      userId: team.directorCommercial.id, // Karen
      title: 'Meta trimestral 32% completada',
      message: 'Llevas $812K de $2.5M del Q. Faltan 45 días.',
      type: 'USER_ACTION_CONFIRMED' as const,
      category: 'sales',
      priority: 'normal',
      relatedUrl: '/cuotas',
    },
    {
      userId: team.salesRep.id, // Karina
      title: 'Llamada Soriana programada para mañana',
      message: 'No olvides la llamada de seguimiento con sucursal Apodaca a las 10:00 AM.',
      type: 'USER_ACTION_CONFIRMED' as const,
      category: 'sales',
      priority: 'normal',
      relatedUrl: '/agenda',
    },
    {
      userId: team.seniorEngineer.id, // Carolina
      title: 'Ticket Helpdesk de Alta prioridad',
      message: 'Julio Rivera reportó laptop sin encender. Atender hoy.',
      type: 'ACTIVITY_ASSIGNED' as const,
      category: 'support',
      priority: 'high',
      relatedUrl: '/inbox',
    },
    {
      userId: team.directorAdmin.id, // Karen (Dir. Admin + Comercial)
      title: 'NOC: 3 dispositivos OFFLINE en Toks',
      message: 'Sucursales Constitución, Gonzalitos y San Pedro reportan POS desconectado.',
      type: 'USER_ACTION_CONFIRMED' as const,
      category: 'noc',
      priority: 'high',
      relatedUrl: '/devices',
    },
    {
      userId: team.ceo.id, // Christian
      title: 'Reporte ejecutivo Q1 2026 listo',
      message: 'P&L, cash flow y BI consolidado disponibles en core.',
      type: 'USER_ACTION_CONFIRMED' as const,
      category: 'executive',
      priority: 'normal',
      relatedUrl: '/executive',
    },
  ];

  for (const n of notifications) {
    const existing = await anyClient.notification.findFirst({
      where: { userId: n.userId, title: n.title },
    });
    if (!existing) {
      await anyClient.notification.create({
        data: { ...n, isRead: false },
      }).catch((err: any) => {
        console.log(`   ⚠️  Notification para userId=${n.userId} falló: ${err.message?.slice(0, 80)}`);
      });
    }
  }

  console.log(`   ✓ Notifications: ${notifications.length} avisos jerárquicos`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═════════════════════════════════════════════════════════════');
  console.log(' NEXARA · Seed de onboarding demo — conecta usuarios reales');
  console.log(' a todos los nuevos procesos (Fases 17–34)');
  console.log('═════════════════════════════════════════════════════════════');

  console.log('[ONBOARDING] Cargando equipo de seed-demo-users.ts...');
  const team = await loadTeam();
  console.log(`[ONBOARDING] ✓ ${Object.keys(team).length} usuarios encontrados\n`);

  console.log('[ONBOARDING] 🏢 1. Multi-tenant (Companies)');
  await seedCompanies();

  console.log('[ONBOARDING] 🚩 2. Feature Flags');
  await seedFeatureFlags();

  console.log('[ONBOARDING] 📚 3. Knowledge Base');
  await seedKnowledgeBase(team);

  console.log('[ONBOARDING] 🎯 4. Sales Targets');
  await seedSalesTargets(team);

  console.log('[ONBOARDING] 📞 5. CRM Activities');
  await seedCrmActivities(team);

  console.log('[ONBOARDING] 🏖️ 6. Leave Requests (Vacaciones)');
  await seedLeaveRequests(team);

  console.log('[ONBOARDING] 📊 7. Performance Reviews');
  await seedPerformanceReviews(team);

  console.log('[ONBOARDING] ✅ 8. Workflows de aprobación');
  await seedWorkflows(team);

  console.log('[ONBOARDING] 🏪 8b. Service Clients + Operational Projects (NOC data)');
  await seedServiceClientsAndProjects(team);

  console.log('[ONBOARDING] 🆘 9. Helpdesk tickets internos');
  await seedHelpdeskTickets(team);

  console.log('[ONBOARDING] 🔔 10. Notifications');
  await seedNotifications(team);

  console.log('');
  console.log('═════════════════════════════════════════════════════════════');
  console.log(' CONEXIÓN USUARIO → PROCESO');
  console.log('═════════════════════════════════════════════════════════════');
  console.log(' 👑 Christian (CEO)         → Executive dashboard, todos los panels');
  console.log(' 👑 Adam (Developer/CEO)    → Lab (acceso AI sandbox + flags)');
  console.log(' 🛠️  Luis (Dir. Ops)        → NOC, Approvals vacaciones, Operación');
  console.log(' 💼 Karen (Dir. Admin+Com)  → Approvals, RH, Finance, CRM agenda, Sales targets, Workflows');
  console.log(' 🧩 Alejandro (Jefe Proy)   → Workflows OC, Project mgmt, KB ops');
  console.log(' 🔧 Carolina (Senior Eng)   → Helpdesk inbox, KB autor, On-call');
  console.log(' 💼 Karina (Ejecutivo Vtas) → CRM agenda diaria, meta mensual, KB');
  console.log(' 🔧 Julio Rivera (Campo)    → Vacaciones aprobadas, ticket IT abierto');
  console.log(' 🔧 David Morales (Campo)   → Vacaciones PENDIENTES (revisa Luis)');
  console.log(' 🔧 Israel Ramos (Campo)    → Permiso médico aprobado retro');
  console.log('═════════════════════════════════════════════════════════════');
  console.log('[ONBOARDING] ✅ Seed completado');
}

main()
  .catch((e) => {
    console.error('[ONBOARDING] ❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
