import { DEFAULT_ROW_CAP, applyCap, probeTake, resolveRowCap, shouldCap } from './row-cap.js';

describe('a qué consultas se aplica el tope', () => {
  it('a un findMany sin take', () => {
    expect(shouldCap('findMany', {})).toBe(true);
    expect(shouldCap('findMany', undefined)).toBe(true);
  });

  it('NO a uno que ya pidió take: ahí el llamador sabe lo que pide', () => {
    expect(shouldCap('findMany', { take: 20 })).toBe(false);
    expect(shouldCap('findMany', { take: 100000 })).toBe(false);
  });

  it('take: 0 cuenta como decisión del llamador', () => {
    expect(shouldCap('findMany', { take: 0 })).toBe(false);
  });

  it('NO a acciones que no devuelven listas', () => {
    for (const accion of ['findFirst', 'findUnique', 'count', 'aggregate', 'create', 'update']) {
      expect(shouldCap(accion, {})).toBe(false);
    }
  });
});

describe('tope configurable', () => {
  it('usa el valor por defecto si no hay variable', () => {
    expect(resolveRowCap(undefined)).toBe(DEFAULT_ROW_CAP);
  });

  it('respeta la variable de entorno', () => {
    expect(resolveRowCap('250')).toBe(250);
  });

  it('ignora basura y vuelve al valor por defecto', () => {
    // Un tope de 0 o negativo dejaria toda lista vacia: peor que no topar.
    for (const malo of ['0', '-5', 'muchas', '']) {
      expect(resolveRowCap(malo)).toBe(DEFAULT_ROW_CAP);
    }
  });
});

describe('sonda de un registro extra', () => {
  it('pide uno más que el tope', () => {
    // Sin ese registro de mas no se puede distinguir "vinieron justo 5000" de
    // "habia mas y se corto", y el aviso saltaria de mas o de menos.
    expect(probeTake(5000)).toBe(5001);
  });
});

describe('recorte', () => {
  const filas = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('no toca lo que cabe', () => {
    const r = applyCap(filas(10), 5000);
    expect(r.truncated).toBe(false);
    expect(r.rows).toHaveLength(10);
  });

  it('justo en el tope no se considera recortado', () => {
    const r = applyCap(filas(5000), 5000);
    expect(r.truncated).toBe(false);
    expect(r.rows).toHaveLength(5000);
  });

  it('uno de más sí recorta y lo señala', () => {
    const r = applyCap(filas(5001), 5000);
    expect(r.truncated).toBe(true);
    expect(r.rows).toHaveLength(5000);
  });

  it('el registro sonda nunca sale en la respuesta', () => {
    const r = applyCap(filas(5001), 5000);
    expect(r.rows[r.rows.length - 1]).toBe(4999);
  });

  it('una lista vacía no rompe nada', () => {
    expect(applyCap([], 5000)).toEqual({ rows: [], truncated: false });
  });
});
