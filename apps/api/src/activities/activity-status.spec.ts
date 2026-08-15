import {
  ACTIVITY_STATUS,
  CLOSED_ACTIVITY_WHERE,
  closedStatusSqlList,
  closedStatusVariants,
  isClosedStatus,
  isFinishedStatus,
  normalizeActivityStatus,
  OPEN_ACTIVITY_WHERE,
  statusVariants,
} from './activity-status.js';

describe('normalizeActivityStatus', () => {
  it('reconoce ambas grafías de finalizada', () => {
    // El origen del fallo: la ruta de cierre escribe 'Finalizada' y once puntos
    // de lectura filtraban por 'Finalizado', que nadie escribe nunca.
    expect(normalizeActivityStatus('Finalizada')).toBe(ACTIVITY_STATUS.FINALIZADA);
    expect(normalizeActivityStatus('Finalizado')).toBe(ACTIVITY_STATUS.FINALIZADA);
  });

  it('tolera acentos, mayúsculas y separadores', () => {
    expect(normalizeActivityStatus('EN_PROGRESO')).toBe(ACTIVITY_STATUS.EN_PROCESO);
    expect(normalizeActivityStatus('en proceso')).toBe(ACTIVITY_STATUS.EN_PROCESO);
    expect(normalizeActivityStatus('  En Proceso  ')).toBe(ACTIVITY_STATUS.EN_PROCESO);
  });

  it('normaliza el resto de estados con variantes de género', () => {
    expect(normalizeActivityStatus('Asignado')).toBe(ACTIVITY_STATUS.ASIGNADA);
    expect(normalizeActivityStatus('Rechazado')).toBe(ACTIVITY_STATUS.RECHAZADA);
    expect(normalizeActivityStatus('Cancelado')).toBe(ACTIVITY_STATUS.CANCELADA);
    expect(normalizeActivityStatus('Pendiente')).toBe(ACTIVITY_STATUS.PENDIENTE);
  });

  it('devuelve null ante valores desconocidos', () => {
    expect(normalizeActivityStatus('Inventado')).toBeNull();
    expect(normalizeActivityStatus('')).toBeNull();
    expect(normalizeActivityStatus(null)).toBeNull();
    expect(normalizeActivityStatus(undefined)).toBeNull();
  });
});

describe('isClosedStatus / isFinishedStatus', () => {
  it('trata como cerradas las finalizadas en cualquier grafía', () => {
    expect(isClosedStatus('Finalizada')).toBe(true);
    expect(isClosedStatus('Finalizado')).toBe(true);
    expect(isClosedStatus('Cancelada')).toBe(true);
  });

  it('no trata como cerradas las que siguen vivas', () => {
    expect(isClosedStatus('Pendiente')).toBe(false);
    expect(isClosedStatus('En Proceso')).toBe(false);
    expect(isClosedStatus('Rechazada')).toBe(false);
  });

  it('distingue finalizada de cancelada', () => {
    expect(isFinishedStatus('Finalizado')).toBe(true);
    expect(isFinishedStatus('Cancelada')).toBe(false);
  });
});

describe('statusVariants', () => {
  it('incluye ambas grafías de finalizada', () => {
    const variants = statusVariants(ACTIVITY_STATUS.FINALIZADA);
    expect(variants).toContain('Finalizada');
    expect(variants).toContain('Finalizado');
  });

  it('incluye las grafías reales de en proceso', () => {
    const variants = statusVariants(ACTIVITY_STATUS.EN_PROCESO);
    expect(variants).toContain('En Proceso');
    expect(variants).toContain('EN_PROGRESO');
  });
});

describe('where de Prisma', () => {
  it('el filtro de cerradas cubre ambas grafías', () => {
    expect(CLOSED_ACTIVITY_WHERE.estatus.in).toEqual(expect.arrayContaining(['Finalizada', 'Finalizado']));
  });

  it('abiertas y cerradas son complementarios', () => {
    expect(OPEN_ACTIVITY_WHERE.estatus.notIn).toEqual(CLOSED_ACTIVITY_WHERE.estatus.in);
  });

  it('no deja duplicados', () => {
    const variants = closedStatusVariants();
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe('closedStatusSqlList', () => {
  it('genera una lista SQL entrecomillada', () => {
    const sql = closedStatusSqlList();
    expect(sql).toContain("'Finalizada'");
    expect(sql).toContain("'Finalizado'");
    expect(sql.startsWith("'")).toBe(true);
  });

  it('produce solo literales bien entrecomillados', () => {
    // La lista se interpola en SQL crudo, así que cada elemento debe ser un
    // literal cerrado: si un futuro estado trajera un apóstrofo sin escapar,
    // rompería la consulta.
    const tokens = closedStatusSqlList().split(', ');
    expect(tokens.length).toBe(closedStatusVariants().length);
    for (const token of tokens) {
      expect(token).toMatch(/^'(?:[^']|'')*'$/);
    }
  });
});
