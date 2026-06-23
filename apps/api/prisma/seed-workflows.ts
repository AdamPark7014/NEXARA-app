/**
 * Seed de workflows estándar — NEXARA ERP tech-services.
 *
 * Define los 5 flujos de aprobación obligatorios que cubren los puntos de
 * control del negocio:
 *
 *   1. DISCOUNT_APPROVAL (COTIZACION)  — descuento > 15% / 30%
 *   2. EXPENSE_APPROVAL  (EXPENSE)     — gasto operativo > $5,000
 *   3. VIATIC_APPROVAL   (VIATIC)      — viáticos fuera de policy
 *   4. PO_APPROVAL       (PURCHASE_ORDER) — orden de compra a proveedor
 *   5. PROJECT_BUDGET    (SALES_PROJECT)  — proyecto > $500k requiere CEO
 *
 * Cada flujo se hace upsert por `name` (único). Los aprobadores se resuelven
 * por `orgRoleKey` → `roleId`, de modo que cualquiera con ese rol pueda
 * aprobar (no se hardcodea un userId).
 *
 * Idempotente: borra los steps existentes del flujo y los recrea, lo que
 * permite editar la definición y re-ejecutar el seeder.
 *
 * Run:
 *   cd apps/api && npx ts-node prisma/seed-workflows.ts
 */

import { PrismaClient } from '@prisma/client';
import { ORG_ROLE_KEYS, ORG_ROLE_TEMPLATES, type OrgRoleKey } from '../src/common/org-roles';

const prisma = new PrismaClient();

type WorkflowStepDef = {
  stepNumber: number;
  name: string;
  description: string;
  approverRoleKey: OrgRoleKey;
  timeoutHours?: number;
};

type WorkflowDef = {
  name: string;
  description: string;
  entityType: string;
  steps: WorkflowStepDef[];
};

const WORKFLOWS: WorkflowDef[] = [
  {
    name: 'Aprobación de descuento en cotización',
    description:
      'Cotizaciones con descuento mayor a 15% requieren visto bueno del Gerente de Ventas; mayor a 30% además del Director Comercial.',
    entityType: 'COTIZACION',
    steps: [
      {
        stepNumber: 1,
        name: 'Visto bueno Gerente de Ventas',
        description: 'Revisión comercial: precio, márgen y condiciones especiales.',
        approverRoleKey: ORG_ROLE_KEYS.SALES_MANAGER,
        timeoutHours: 24,
      },
      {
        stepNumber: 2,
        name: 'Aprobación Dirección',
        description: 'Validación estratégica para descuentos profundos (>30%).',
        approverRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
        timeoutHours: 48,
      },
    ],
  },
  {
    name: 'Aprobación de gasto operativo',
    description: 'Gastos por arriba de $5,000 MXN: visto bueno del Director Administrativo.',
    entityType: 'EXPENSE',
    steps: [
      {
        stepNumber: 1,
        name: 'Validación contable',
        description: 'Verificación de factura, política y centro de costo.',
        approverRoleKey: ORG_ROLE_KEYS.ACCOUNTANT,
        timeoutHours: 12,
      },
      {
        stepNumber: 2,
        name: 'Aprobación Director Administrativo',
        description: 'Visto bueno final para liberación de pago.',
        approverRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
        timeoutHours: 36,
      },
    ],
  },
  {
    name: 'Aprobación de viáticos',
    description: 'Viáticos fuera de policy (monto, días o destino no estándar).',
    entityType: 'VIATIC',
    steps: [
      {
        stepNumber: 1,
        name: 'Aprobación Project Manager',
        description: 'Validación operativa: necesario para la OT.',
        approverRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER,
        timeoutHours: 8,
      },
      {
        stepNumber: 2,
        name: 'Aprobación Director Administrativo',
        description: 'Liberación presupuestal de viático.',
        approverRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
        timeoutHours: 24,
      },
    ],
  },
  {
    name: 'Aprobación de orden de compra',
    description: 'OC a proveedor: revisión por Compras y autorización por Dirección Administrativa.',
    entityType: 'PURCHASE_ORDER',
    steps: [
      {
        stepNumber: 1,
        name: 'Validación de Compras',
        description: 'Tres cotizaciones, mejor precio y disponibilidad.',
        approverRoleKey: ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
        timeoutHours: 24,
      },
      {
        stepNumber: 2,
        name: 'Aprobación Director Administrativo',
        description: 'Autorización presupuestal y liberación de pago al proveedor.',
        approverRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
        timeoutHours: 48,
      },
    ],
  },
  {
    name: 'Aprobación de proyecto > $500k',
    description: 'Proyectos comerciales con presupuesto mayor a $500,000: requiere visto del CEO.',
    entityType: 'SALES_PROJECT',
    steps: [
      {
        stepNumber: 1,
        name: 'Validación Dirección',
        description: 'Coherencia comercial, margen y estrategia.',
        approverRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
        timeoutHours: 24,
      },
      {
        stepNumber: 2,
        name: 'Visto bueno Director Operaciones',
        description: 'Factibilidad de ejecución en campo.',
        approverRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
        timeoutHours: 36,
      },
      {
        stepNumber: 3,
        name: 'Autorización CEO',
        description: 'Aprobación ejecutiva final.',
        approverRoleKey: ORG_ROLE_KEYS.CEO,
        timeoutHours: 72,
      },
    ],
  },
];

async function resolveRoleId(orgRoleKey: OrgRoleKey): Promise<number | null> {
  const template = ORG_ROLE_TEMPLATES.find((t) => t.orgRoleKey === orgRoleKey);
  if (!template) return null;
  const role = await prisma.role.findUnique({ where: { nombre: template.nombre } });
  return role?.id ?? null;
}

async function upsertWorkflow(def: WorkflowDef) {
  const existing = await prisma.workflowDefinition.findUnique({ where: { name: def.name } });

  if (existing) {
    // Refrescar metadata + reemplazar steps
    await prisma.workflowStep.deleteMany({ where: { workflowId: existing.id } });
    await prisma.workflowDefinition.update({
      where: { id: existing.id },
      data: {
        description: def.description,
        entityType: def.entityType,
        status: 'ACTIVE',
      },
    });
    for (const step of def.steps) {
      const roleId = await resolveRoleId(step.approverRoleKey);
      if (!roleId) {
        console.warn(
          `   ⚠️  ${def.name} · paso ${step.stepNumber}: rol ${step.approverRoleKey} no existe, se omite.`,
        );
        continue;
      }
      await prisma.workflowStep.create({
        data: {
          workflowId: existing.id,
          stepNumber: step.stepNumber,
          name: step.name,
          description: step.description,
          approverRoleId: roleId,
          timeoutHours: step.timeoutHours ?? null,
          sortOrder: step.stepNumber,
        },
      });
    }
    console.log(`   ↻ Actualizado: ${def.name} (${def.steps.length} pasos)`);
    return;
  }

  const created = await prisma.workflowDefinition.create({
    data: {
      name: def.name,
      description: def.description,
      entityType: def.entityType,
      status: 'ACTIVE',
    },
  });

  for (const step of def.steps) {
    const roleId = await resolveRoleId(step.approverRoleKey);
    if (!roleId) {
      console.warn(
        `   ⚠️  ${def.name} · paso ${step.stepNumber}: rol ${step.approverRoleKey} no existe, se omite.`,
      );
      continue;
    }
    await prisma.workflowStep.create({
      data: {
        workflowId: created.id,
        stepNumber: step.stepNumber,
        name: step.name,
        description: step.description,
        approverRoleId: roleId,
        timeoutHours: step.timeoutHours ?? null,
        sortOrder: step.stepNumber,
      },
    });
  }
  console.log(`   + Creado: ${def.name} (${def.steps.length} pasos)`);
}

async function main() {
  console.log('🌱 [workflows] Sincronizando flujos de aprobación estándar…');
  for (const def of WORKFLOWS) {
    await upsertWorkflow(def);
  }
  console.log(`✅ ${WORKFLOWS.length} workflows sincronizados.`);
}

main()
  .then(() => {
    console.log('\n✨ seed-workflows completado.');
  })
  .catch((e) => {
    console.error('❌ seed-workflows falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
