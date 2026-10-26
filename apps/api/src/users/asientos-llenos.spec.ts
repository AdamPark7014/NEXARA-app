import { BadRequestException } from '@nestjs/common';
import { BillingService } from '../company/billing.service.js';
import { UsersService } from './users.service.js';

/**
 * Cupo lleno: el (usados/límite) sale del conteo de usuarios activos y de
 * `seatLimit`. El alta normal y el aprovisionamiento SCIM dicen lo mismo.
 */
describe('cupo de asientos lleno', () => {
  function prismaConCupo(seatsUsed: number, seatLimit: number) {
    const empresa = { id: 7, seatLimit, billingStatus: 'active' };
    return {
      companyProfile: {
        findFirst: jest.fn(async () => empresa),
        findUnique: jest.fn(async () => empresa),
      },
      userCompany: {
        count: jest.fn(async () => seatsUsed),
      },
      user: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    } as any;
  }

  async function mensajeDeAlta(seatsUsed: number, seatLimit: number): Promise<string> {
    const prisma = prismaConCupo(seatsUsed, seatLimit);
    const servicio = new UsersService(prisma, {} as any, {} as any);
    const error = await servicio
      .create(
        {
          nombre: 'Persona Nueva',
          email: 'nueva@nexara.com.mx',
          password: 'Alta-Prueba-4444',
          roleId: 3,
          departmentId: 4,
        } as any,
        7,
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.userCompany.count).toHaveBeenCalledWith({
      where: { companyId: 7, user: { isActive: true } },
    });
    return (error as BadRequestException).message;
  }

  it('al dar de alta, el cupo lleno se dice en una frase con los números reales', async () => {
    expect(await mensajeDeAlta(10, 10)).toBe(
      'Límite de asientos alcanzado (10/10): amplía el plan en Billing.',
    );
    expect(await mensajeDeAlta(3, 3)).toBe('Límite de asientos alcanzado (3/3): amplía el plan en Billing.');
  });

  it('el aprovisionamiento (SCIM) dice lo mismo que el alta', async () => {
    const prisma = prismaConCupo(4, 4);
    const billing = new BillingService(prisma);
    await expect(billing.assertSeatAvailable(7)).rejects.toThrow(
      new BadRequestException('Límite de asientos alcanzado (4/4): amplía el plan en Billing.'),
    );
    await expect(new BillingService(prismaConCupo(3, 4)).assertSeatAvailable(7)).resolves.toBeUndefined();
  });
});
