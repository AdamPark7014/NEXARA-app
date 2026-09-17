import { TeamBoardService } from './team-board.service';
import { workDateKey } from '../common/time/workday';

/** `resolveRange` no toca la base: se prueba con un Prisma de mentira. */
const service = new TeamBoardService({} as never);

describe('TeamBoardService.resolveRange', () => {
  // 17-09-2026 a las 23:30 UTC ya es el 17 en México (17:30), no el 18.
  const now = new Date('2026-09-17T23:30:00.000Z');

  it('sin parámetros: el día de hoy en hora de México', () => {
    const r = service.resolveRange(null, null, now);
    expect(workDateKey(r.desde)).toBe('2026-09-17');
    expect(workDateKey(r.hasta)).toBe('2026-09-17');
    expect(r.hasta.getTime()).toBeGreaterThan(r.desde.getTime());
  });

  it('un rango de varios días abarca de la primera 00:00 a la última 23:59', () => {
    const r = service.resolveRange('2026-09-14', '2026-09-17', now);
    expect(workDateKey(r.desde)).toBe('2026-09-14');
    expect(workDateKey(r.hasta)).toBe('2026-09-17');
  });

  it('solo `desde`: ese día', () => {
    const r = service.resolveRange('2026-09-01', null, now);
    expect(workDateKey(r.desde)).toBe('2026-09-01');
    expect(workDateKey(r.hasta)).toBe('2026-09-01');
  });

  it('al revés o con basura no revienta', () => {
    const alReves = service.resolveRange('2026-09-17', '2026-09-14', now);
    expect(workDateKey(alReves.desde)).toBe('2026-09-14');
    expect(workDateKey(alReves.hasta)).toBe('2026-09-14');
    const basura = service.resolveRange('ayer', 'mañana', now);
    expect(workDateKey(basura.desde)).toBe('2026-09-17');
    expect(workDateKey(basura.hasta)).toBe('2026-09-17');
  });
});
