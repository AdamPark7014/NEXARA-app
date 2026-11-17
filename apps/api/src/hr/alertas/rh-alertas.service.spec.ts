import { RhAlertasService } from './rh-alertas.service.js';
import { esCuentaAvisoRh } from '../../common/aprobaciones/cuenta-aviso.js';
import { TESTER_CEO_EMAIL, PLATFORM_DEVELOPER_EMAIL, PLATFORM_OWNER_EMAIL } from '../../common/platform-accounts.js';

describe('Avisos RH', () => {
  afterEach(() => jest.useRealTimers());

  it('excluye cuentas técnicas, pruebas y demostración, pero admite dirección', () => {
    for (const email of ['', TESTER_CEO_EMAIL, PLATFORM_DEVELOPER_EMAIL, 'demo@empresa.invalid', 'play.review@nexara.com.mx']) {
      expect(esCuentaAvisoRh({ email })).toBe(false);
    }
    expect(esCuentaAvisoRh({ email: PLATFORM_OWNER_EMAIL })).toBe(true);
    expect(esCuentaAvisoRh({ email: 'persona@empresa.mx', puesto: 'Cuenta demo' })).toBe(false);
  });

  it('usa el día de México y no cuenta cuentas demo ni altas del mismo año como aniversario', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-17T02:00:00Z'));
    const base = { id: 1, nombre: 'Persona ficticia', email: 'persona@empresa.mx', puesto: 'Operador', employeeNumber: 'NEX-001', managerId: 2, roleKey: 'operativo', documentos: [], empleadoPerfil: null };
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([
      { ...base, perfil: { fechaNacimiento: new Date('2000-11-16T00:00:00Z') }, fechaIngreso: new Date('2026-11-16T00:00:00Z') },
      { ...base, id: 3, email: TESTER_CEO_EMAIL, employeeNumber: null, managerId: null, perfil: null, fechaIngreso: null },
      { ...base, id: 4, perfil: null, fechaIngreso: null,
        empleadoPerfil: { companyId: 9, contratoVenceAt: new Date('2026-11-20') } },
    ]) } };
    const aprobaciones = { idsRh: jest.fn().mockResolvedValue([9]), avisar: jest.fn() };
    await new RhAlertasService(prisma as any, aprobaciones as any).avisarEmpresa(7);
    expect(prisma.user.findMany.mock.calls[0][0].where.companyMemberships).toEqual({ some: { companyId: 7 } });
    expect(aprobaciones.avisar).toHaveBeenCalledWith([9], expect.objectContaining({ companyId: 7, message: '1 cumpleaños hoy' }));
  });
});
