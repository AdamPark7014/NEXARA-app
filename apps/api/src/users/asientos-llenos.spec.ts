import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';

/**
 * Texto viejo, dos frases. El (10/10) sale de los asientos usados y de
 * `seatLimit`. Ampliar el plan en Billing se queda; no hay otro plan.
 */
const TEXTO_VIEJO = 'Límite de asientos alcanzado (10/10). Amplía el plan en Billing.';

describe('UsersService cupo de asientos', () => {
  function servicioConCupo(seatsUsed: number, seatLimit: number) {
    const prisma: any = {
      companyProfile: {
        findFirst: jest.fn(async () => ({ id: 7, seatLimit, billingStatus: 'active' })),
      },
      userCompany: {
        count: jest.fn(async () => seatsUsed),
      },
      user: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const servicio = new UsersService(prisma, {} as any, {} as any);
    return { servicio, prisma };
  }

  async function mensajeDeAlta(seatsUsed: number, seatLimit: number) {
    const { servicio, prisma } = servicioConCupo(seatsUsed, seatLimit);
    try {
      await servicio.create(
        {
          nombre: 'Persona Nueva',
          email: 'nueva@nexara.com.mx',
          password: 'Alta-Prueba-4444',
          roleId: 3,
          departmentId: 4,
        } as any,
        7,
      );
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(prisma.userCompany.count).toHaveBeenCalledWith({
        where: { companyId: 7, user: { isActive: true } },
      });
      const usados = await prisma.userCompany.count.mock.results[0].value;
      const empresa = await prisma.companyProfile.findFirst.mock.results[0].value;
      expect(usados).toBe(seatsUsed);
      expect(empresa.seatLimit).toBe(seatLimit);
      return (e as BadRequestException).message;
    }
    throw new Error('debía rechazar el alta');
  }

  it('deja el cupo lleno en una frase y cita el texto viejo', async () => {
    const seatsUsed = 10;
    const seatLimit = 10;
    const msg = await mensajeDeAlta(seatsUsed, seatLimit);
    const nuevo = `Límite de asientos alcanzado (${seatsUsed}/${seatLimit}): amplía el plan en Billing.`;

    expect(msg).toBe(nuevo);
    expect(msg).not.toBe(TEXTO_VIEJO);
    expect(TEXTO_VIEJO).toBe('Límite de asientos alcanzado (10/10). Amplía el plan en Billing.');
    expect(msg).not.toMatch(/\. Amplía/);
    expect(msg).toContain(': amplía el plan en Billing.');

    const otro = await mensajeDeAlta(3, 3);
    expect(otro).toBe('Límite de asientos alcanzado (3/3): amplía el plan en Billing.');
    expect(otro).not.toContain('10/10');
  });
});
