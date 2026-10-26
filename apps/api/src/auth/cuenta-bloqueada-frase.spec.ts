import { UnauthorizedException } from '@nestjs/common';
import { AccountAccessService } from '../account-access/account-access.service.js';
import { PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';
import { AuthService } from './auth.service.js';

/** El texto viejo eran dos frases. Los minutos salen de `lockedUntil`, aquí 15. */
const TEXTO_VIEJO = 'Cuenta bloqueada temporalmente. Reintenta en 15 min.';

describe('cuenta bloqueada', () => {
  const AHORA = Date.parse('2026-10-25T19:00:00.000Z');

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deja el bloqueo en una frase al entrar y al abrir la bóveda, y cita el texto viejo', async () => {
    expect(TEXTO_VIEJO).toBe('Cuenta bloqueada temporalmente. Reintenta en 15 min.');

    const lockedUntil = new Date(AHORA + 15 * 60_000);
    const mins = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
    const frase = `Cuenta bloqueada temporalmente: reintenta en ${mins} min.`;
    expect(mins).toBe(15);
    expect(frase).toBe('Cuenta bloqueada temporalmente: reintenta en 15 min.');
    expect(frase).not.toBe(TEXTO_VIEJO);

    const authUpdate = jest.fn();
    const auth = new AuthService(
      {
        user: {
          findFirst: jest.fn(async () => ({
            id: 4,
            email: 'ana@nexara.com.mx',
            isActive: true,
            lockedUntil,
            passwordHash: 'no-se-compara',
            failedLoginCount: 5,
            role: null,
            department: null,
          })),
          update: authUpdate,
        },
      } as any,
      {} as any,
    );

    const vaultUpdate = jest.fn();
    const acceso = new AccountAccessService(
      {
        user: {
          findUnique: jest.fn(async () => ({
            id: 1,
            email: PLATFORM_OWNER_EMAIL,
            passwordHash: 'no-se-compara',
            isActive: true,
            failedLoginCount: 5,
            lockedUntil,
          })),
          update: vaultUpdate,
        },
      } as any,
      { log: jest.fn() } as any,
      {} as any,
      { disponible: () => true } as any,
    );

    const alEntrar = await auth.validateUser('ana@nexara.com.mx', 'cualquiera').then(
      () => null,
      (error: unknown) => error,
    );
    const alAbrirBoveda = await acceso.desbloquear({ id: 1 }, 'cualquiera', 7).then(
      () => null,
      (error: unknown) => error,
    );

    expect(alEntrar).toBeInstanceOf(UnauthorizedException);
    expect(alAbrirBoveda).toBeInstanceOf(UnauthorizedException);
    expect((alEntrar as UnauthorizedException).message).toBe(frase);
    expect((alAbrirBoveda as UnauthorizedException).message).toBe(frase);
    expect((alEntrar as UnauthorizedException).message).toBe((alAbrirBoveda as UnauthorizedException).message);
    expect((alEntrar as UnauthorizedException).getStatus()).toBe(401);
    expect(authUpdate).not.toHaveBeenCalled();
    expect(vaultUpdate).not.toHaveBeenCalled();
  });
});
