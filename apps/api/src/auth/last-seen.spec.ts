import { debeTocarLastSeen, LAST_SEEN_CADA_MS } from './auth.service';

/** C2: lastSeenAt se escribía en cada petición; ahora como mucho cada 5 min. */
describe('lastSeenAt de la sesión', () => {
  const ahora = Date.parse('2026-11-18T12:00:00Z');
  it('sin valor, se escribe', () => expect(debeTocarLastSeen(null, ahora)).toBe(true));
  it('hace 1 min, no', () => expect(debeTocarLastSeen(new Date(ahora - 60_000), ahora)).toBe(false));
  it('hace 5 min o más, sí', () => expect(debeTocarLastSeen(new Date(ahora - LAST_SEEN_CADA_MS), ahora)).toBe(true));
});
