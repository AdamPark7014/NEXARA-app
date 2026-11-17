/** Migración manual. Simulación por defecto; --aplicar habilita escrituras. Nunca se importa con conexión abierta. */
import { PrismaClient, type OperationalProjectStatus, type Prisma } from '@prisma/client';
import { esNombreDeRelleno } from '../src/ventas/client-sectors.js';

export function normalizarCliente(nombre: string | null | undefined): string {
  return (nombre ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function estadoOperativo(status: string): OperationalProjectStatus {
  if (status === 'ON_HOLD' || status === 'COMPLETED') return status;
  if (status === 'IN_PROGRESS' || status === 'AT_RISK') return 'ACTIVE';
  throw new Error('Estado legacy desconocido: ' + status);
}
export function casarCliente<T extends { id: number; companyId: number; name: string; isActive: boolean }>(nombre: string | null, companyId: number, clientes: T[]): T | null {
  if (esNombreDeRelleno(nombre)) return null;
  const candidatos = clientes.filter(c => c.companyId === companyId && c.isActive && !esNombreDeRelleno(c.name) && normalizarCliente(c.name) === normalizarCliente(nombre));
  return candidatos.length === 1 ? candidatos[0] : null;
}
type Legacy = Prisma.WorkProjectGetPayload<{ include: { expenses: true; payroll: true; logs: true } }>;
export function notaLegacy(p: Legacy): string {
  return '[work-project:' + p.id + ']\n' + (p.description ?? '') + '\nArchivo histórico (importes y avance manual, sin duplicar costos reales):\n' + JSON.stringify({ managerName: p.managerName, budgetTotal: p.budgetTotal, budgetUsed: p.budgetUsed, progressManual: p.progress, expenses: p.expenses, payroll: p.payroll, logs: p.logs });
}
/** Recibe la conexión para que las pruebas usen exclusivamente dobles en memoria. */
export async function migrarWorkProjects(prisma: PrismaClient, aplicar = false) {
  const reporte: Array<{ legacyId: number; companyId: number; estado: string; clientId?: number; operationalId?: number }> = [];
  let cursor = 0;
  for (;;) {
    const lote = await prisma.workProject.findMany({ where: { id: { gt: cursor }, deletedAt: null }, orderBy: { id: 'asc' }, take: 100, include: { expenses: true, payroll: true, logs: true } });
    if (!lote.length) break;
    for (const p of lote) {
      cursor = p.id;
      const previo = await prisma.operationalProject.findFirst({ where: { companyId: p.companyId, description: { contains: '[work-project:' + p.id + ']' } }, select: { id: true } });
      if (previo) { reporte.push({ legacyId: p.id, companyId: p.companyId, estado: 'YA_MIGRADO', operationalId: previo.id }); continue; }
      const clientes = [] as Array<{ id: number; companyId: number; name: string; isActive: boolean }>;
      let clientCursor = 0;
      for (;;) {
        const batch = await prisma.serviceClient.findMany({ where: { companyId: p.companyId, id: { gt: clientCursor }, isActive: true }, select: { id: true, companyId: true, name: true, isActive: true }, orderBy: { id: 'asc' }, take: 100 });
        if (!batch.length) break;
        clientes.push(...batch); clientCursor = batch[batch.length - 1].id;
      }
      const cliente = casarCliente(p.clientName, p.companyId, clientes);
      if (!cliente) { reporte.push({ legacyId: p.id, companyId: p.companyId, estado: 'CLIENTE_SIN_COINCIDENCIA_UNICA' }); continue; }
      const admin = await prisma.user.findFirst({ where: { isActive: true, roleKey: { in: ['super_admin', 'admin'] }, companyMemberships: { some: { companyId: p.companyId } } }, orderBy: { id: 'asc' }, select: { id: true } });
      if (!admin) { reporte.push({ legacyId: p.id, companyId: p.companyId, estado: 'SIN_ADMIN_EMPRESA', clientId: cliente.id }); continue; }
      const data = { title: p.title, description: notaLegacy(p), companyId: p.companyId, clientId: cliente.id, vendorId: admin.id, createdById: admin.id, status: estadoOperativo(p.status), startDate: p.startDate, endDate: p.endDate, budgetAmount: p.budgetTotal };
      const creado = aplicar ? await prisma.operationalProject.create({ data, select: { id: true } }) : null;
      reporte.push({ legacyId: p.id, companyId: p.companyId, estado: aplicar ? 'MIGRADO' : 'SIMULACION', clientId: cliente.id, ...(creado ? { operationalId: creado.id } : {}) });
    }
  }
  return reporte;
}
if (require.main === module) {
  const prisma = new PrismaClient();
  migrarWorkProjects(prisma, process.argv.includes('--aplicar')).then(reporte => console.table(reporte)).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
