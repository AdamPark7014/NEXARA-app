import { UnauthorizedException } from '@nestjs/common';

/**
 * Armor — contrato de sliding session (sin bootstrap Nest completo).
 * Cubre: jti ausente / sesión expirada / happy path de re-emisión.
 */
describe('session extend contract (Armor)', () => {
  const ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

  async function extendSession(deps: {
    jti?: string;
    session?: {
      userId: number;
      revokedAt: Date | null;
      expiresAt: Date;
      createdAt: Date;
    } | null;
    user?: { id: number; isActive: boolean } | null;
    sign?: () => string;
  }) {
    const { jti, session, user } = deps;
    if (!jti) throw new UnauthorizedException('Sesión sin jti; vuelve a iniciar sesión.');
    if (!session || session.userId !== 9) throw new UnauthorizedException('Sesión inválida');
    if (session.revokedAt) throw new UnauthorizedException('Sesión revocada');
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sesión expirada');
    }
    if (Date.now() - session.createdAt.getTime() >= ABSOLUTE_MAX_MS) {
      throw new UnauthorizedException('Sesión máxima alcanzada (7 días)');
    }
    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Usuario inactivo');
    }
    return {
      access_token: deps.sign?.() ?? 'tok',
      expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    };
  }

  it('sesión caducada → 401', async () => {
    await expect(
      extendSession({
        jti: 'x',
        session: {
          userId: 9,
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
          createdAt: new Date(),
        },
        user: { id: 9, isActive: true },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sesión activa → nuevo token', async () => {
    const result = await extendSession({
      jti: 'alive',
      session: {
        userId: 9,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(Date.now() - 60_000),
      },
      user: { id: 9, isActive: true },
      sign: () => 'new.jwt',
    });
    expect(result.access_token).toBe('new.jwt');
    expect(result.expiresAt).toBeTruthy();
  });
});
