import { casarCliente, estadoOperativo, migrarWorkProjects, notaLegacy, normalizarCliente } from '../../scripts/migrar-work-projects.js';

const cliente = { id: 8, companyId: 1, name: 'Clínica   México', isActive: true };
const legacy = { id: 4, companyId: 1, title: 'Obra', clientName: 'CLINICA MEXICO', status: 'AT_RISK', expenses: [{ amount: '120', category: 'Material' }], payroll: [{ amount: '80', employee: 'Juan' }], logs: [{ label: 'Avance histórico', progress: 40 }], description: 'Original', managerName: 'Encargado', progress: 40, budgetTotal: null, budgetUsed: '200', startDate: null, endDate: null };
function db() {
  return {
    workProject: { findMany: jest.fn().mockResolvedValueOnce([legacy]).mockResolvedValue([]) },
    serviceClient: { findMany: jest.fn().mockResolvedValueOnce([cliente]).mockResolvedValue([]) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
    operationalProject: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 9 }) },
  };
}
describe('migrar-work-projects (solo dobles, nunca conecta una base)', () => {
  it('normaliza acentos, espacios y mayúsculas', () => {
    expect(normalizarCliente('  CLÍNICA México ')).toBe('clinica mexico');
    expect(casarCliente('CLINICA MEXICO', 1, [cliente])).toBe(cliente);
  });
  it('no liga otra empresa, inactivos, relleno ni coincidencias ambiguas', () => {
    expect(casarCliente(cliente.name, 2, [cliente])).toBeNull();
    expect(casarCliente(cliente.name, 1, [{ ...cliente, isActive: false }])).toBeNull();
    expect(casarCliente('A QUIEN CORRESPONDA', 1, [{ ...cliente, name: 'A QUIEN CORRESPONDA' }])).toBeNull();
    expect(casarCliente(cliente.name, 1, [cliente, { ...cliente, id: 10 }])).toBeNull();
  });
  it.each([['IN_PROGRESS', 'ACTIVE'], ['AT_RISK', 'ACTIVE'], ['ON_HOLD', 'ON_HOLD'], ['COMPLETED', 'COMPLETED']])('mapea %s a %s', (a, b) => expect(estadoOperativo(a)).toBe(b));
  it('conserva gastos, nómina, bitácora y avance manual como archivo histórico', () => {
    const nota = notaLegacy(legacy as any);
    expect(nota).toContain('[work-project:4]');
    for (const valor of ['Original', 'Material', '120', 'Juan', '80', 'Avance histórico', 'progressManual']) expect(nota).toContain(valor);
  });
  it('simula por defecto sin ninguna escritura', async () => {
    const prisma = db();
    expect(await migrarWorkProjects(prisma as any)).toEqual([{ legacyId: 4, companyId: 1, estado: 'SIMULACION', clientId: 8 }]);
    expect(prisma.operationalProject.create).not.toHaveBeenCalled();
  });
  it('aplica solo al pedirlo y atribuye el maestro al admin de esa empresa', async () => {
    const prisma = db();
    await migrarWorkProjects(prisma as any, true);
    expect(prisma.operationalProject.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdById: 3, vendorId: 3, clientId: 8, companyId: 1, status: 'ACTIVE' }) }));
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyMemberships: { some: { companyId: 1 } } }) }));
  });
  it('reporta sin coincidencia y sin admin sin inventar clientes', async () => {
    const prisma = db(); prisma.serviceClient.findMany.mockReset().mockResolvedValue([]);
    expect((await migrarWorkProjects(prisma as any, true))[0].estado).toBe('CLIENTE_SIN_COINCIDENCIA_UNICA');
    expect(prisma.operationalProject.create).not.toHaveBeenCalled();
    const sinAdmin = db(); sinAdmin.user.findFirst.mockResolvedValue(null);
    expect((await migrarWorkProjects(sinAdmin as any, true))[0].estado).toBe('SIN_ADMIN_EMPRESA');
  });
  it('no duplica un maestro ya migrado', async () => {
    const prisma = db(); prisma.operationalProject.findFirst.mockResolvedValue({ id: 9 });
    expect((await migrarWorkProjects(prisma as any, true))[0].estado).toBe('YA_MIGRADO');
    expect(prisma.operationalProject.create).not.toHaveBeenCalled();
  });
});
