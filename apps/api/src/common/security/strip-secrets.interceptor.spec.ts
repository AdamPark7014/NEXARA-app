import { stripSecrets } from './strip-secrets.interceptor';

describe('stripSecrets · nada de hashes ni secretos MFA en las respuestas', () => {
  it('quita passwordHash y mfaSecret del usuario y de sus anidados', () => {
    const user = {
      id: 1,
      email: 'demo@nexara.mx',
      passwordHash: '$2a$10$abc',
      mfaSecret: 'JBSWY3DP',
      manager: { id: 2, passwordHash: '$2a$10$def' },
      equipo: [{ id: 3, passwordHash: 'x' }, { id: 4 }],
    };
    const limpio = stripSecrets(user);
    expect(limpio).toEqual({ id: 1, email: 'demo@nexara.mx', manager: { id: 2 }, equipo: [{ id: 3 }, { id: 4 }] });
  });

  it('no muta el original (puede venir de una caché que se usa para autenticar)', () => {
    const user = { id: 1, passwordHash: 'hash' };
    stripSecrets(user);
    expect(user.passwordHash).toBe('hash');
  });

  it('devuelve la misma referencia si no hay nada que quitar y respeta fechas', () => {
    const fecha = new Date('2026-09-17T10:00:00Z');
    const body = { items: [{ id: 1, createdAt: fecha }] };
    const limpio = stripSecrets(body);
    expect(limpio).toBe(body);
    expect(limpio.items[0].createdAt).toBe(fecha);
  });
});
