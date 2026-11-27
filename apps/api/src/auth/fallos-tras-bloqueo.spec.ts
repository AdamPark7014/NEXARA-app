import { UnauthorizedException } from '@nestjs/common';
import { fallosVigentes } from '../common/security/fallos-login.js';
import { AuthService } from './auth.service.js';

/**
 * 27-11-2026: Antonio traía 5 fallos de un bloqueo del 26-10 ya vencido y su primer error lo volvió a
 * bloquear 15 minutos. Tras un bloqueo vencido, el contador empieza de cero.
 */
describe('fallos de inicio de sesión tras un bloqueo vencido', () => {
  const AHORA = Date.parse('2026-11-27T05:43:00.000Z');

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(AHORA));
  afterEach(() => jest.restoreAllMocks());

  function servicio(cuenta: { failedLoginCount: number; lockedUntil: Date | null }) {
    const update = jest.fn(async () => ({}));
    const auth = new AuthService(
      {
        user: {
          findFirst: jest.fn(async () => ({
            id: 39,
            email: 'persona@nexara.com.mx',
            isActive: true,
            // hash de bcrypt que no corresponde a «equivocada»
            passwordHash: '$2b$10$abcdefghijklmnopqrstuuJ0b0H8w9m1Xc3l5rGqfQ6P9kq7mQm2e',
            role: null,
            department: null,
            ...cuenta,
          })),
          update,
        },
        userCompany: { findMany: jest.fn(async () => []) },
        companyProfile: { findFirst: jest.fn(async () => null) },
      } as any,
      {} as any,
    );
    return { auth, update };
  }

  it('fallosVigentes: cuenta los fallos mientras no haya bloqueo vencido', () => {
    expect(fallosVigentes({ failedLoginCount: 3, lockedUntil: null }, AHORA)).toBe(3);
    expect(fallosVigentes({ failedLoginCount: 5, lockedUntil: new Date(AHORA + 60_000) }, AHORA)).toBe(5);
    expect(fallosVigentes({ failedLoginCount: 5, lockedUntil: new Date(AHORA - 60_000) }, AHORA)).toBe(0);
    expect(fallosVigentes({ failedLoginCount: null, lockedUntil: null }, AHORA)).toBe(0);
  });

  it('el primer error después de un bloqueo vencido cuenta 1 y no vuelve a bloquear', async () => {
    const { auth, update } = servicio({ failedLoginCount: 5, lockedUntil: new Date('2026-10-26T22:47:31Z') });
    await expect(auth.validateUser('persona@nexara.com.mx', 'equivocada')).rejects.toThrow(
      new UnauthorizedException('Credenciales inválidas'),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 39 },
      data: { failedLoginCount: 1, lockedUntil: null },
    });
  });

  it('sin bloqueo vencido sigue sumando y bloquea al quinto', async () => {
    const { auth, update } = servicio({ failedLoginCount: 4, lockedUntil: null });
    await expect(auth.validateUser('persona@nexara.com.mx', 'equivocada')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const data = (update.mock.calls[0] as any)[0].data;
    expect(data.failedLoginCount).toBe(5);
    expect(data.lockedUntil).toEqual(new Date(AHORA + 15 * 60_000));
  });
});
