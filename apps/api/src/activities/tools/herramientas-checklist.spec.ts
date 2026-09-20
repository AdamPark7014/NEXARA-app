import {
  MAX_REQUISITOS,
  estadoChecklist,
  mensajeChecklistPendiente,
  normalizarRequisitos,
  type RequisitoConCheck,
} from './herramientas-checklist.helpers.js';

function renglon(over: Partial<RequisitoConCheck> = {}): RequisitoConCheck {
  return {
    id: 1,
    descripcion: 'Escalera de 6 m',
    cantidad: 1,
    productId: null,
    producto: null,
    toolId: null,
    herramienta: null,
    check: null,
    ...over,
  };
}

const palomeado = (ok: boolean) => ({
  ok,
  nota: null,
  fotoUrl: null,
  at: '2026-09-19T15:00:00.000Z',
  por: { id: 3, nombre: 'Técnico' },
});

describe('normalizarRequisitos', () => {
  it('limpia, recorta y numera el orden', () => {
    const res = normalizarRequisitos([
      { descripcion: '  Escalera  ', cantidad: 2 },
      { descripcion: 'Taladro', productId: 5, toolId: 9 },
    ]);
    expect(res).toEqual([
      { id: null, descripcion: 'Escalera', cantidad: 2, productId: null, toolId: null, orden: 0 },
      { id: null, descripcion: 'Taladro', cantidad: 1, productId: 5, toolId: 9, orden: 1 },
    ]);
  });

  it('descarta renglones sin descripción', () => {
    expect(normalizarRequisitos([{ descripcion: '   ' }, { cantidad: 3 }, null, 'x'])).toEqual([]);
  });

  it('un mismo nombre dos veces es un solo renglón', () => {
    const res = normalizarRequisitos([
      { descripcion: 'Escalera' },
      { descripcion: '  escalera ' },
      { descripcion: 'ESCALERA' },
    ]);
    expect(res).toHaveLength(1);
  });

  it('conserva el id cuando el renglón ya existía', () => {
    expect(normalizarRequisitos([{ id: 42, descripcion: 'Multímetro' }])[0].id).toBe(42);
  });

  it('cantidad inválida cae a 1', () => {
    expect(normalizarRequisitos([{ descripcion: 'Pinzas', cantidad: -3 }])[0].cantidad).toBe(1);
    expect(normalizarRequisitos([{ descripcion: 'Cable', cantidad: 'x' }])[0].cantidad).toBe(1);
  });

  it('no acepta más renglones que el tope', () => {
    const muchos = Array.from({ length: MAX_REQUISITOS + 10 }, (_, i) => ({
      descripcion: `Herramienta ${i}`,
    }));
    expect(normalizarRequisitos(muchos)).toHaveLength(MAX_REQUISITOS);
  });

  it('lo que no es lista no rompe nada', () => {
    expect(normalizarRequisitos(undefined)).toEqual([]);
    expect(normalizarRequisitos({ descripcion: 'x' })).toEqual([]);
  });
});

describe('estadoChecklist', () => {
  it('sin renglones está completo: la OT no exige nada', () => {
    expect(estadoChecklist([])).toEqual({ total: 0, listos: 0, pendientes: [], completo: true });
  });

  it('cuenta listos y pendientes', () => {
    const res = estadoChecklist([
      renglon({ id: 1, check: palomeado(true) }),
      renglon({ id: 2, descripcion: 'Taladro' }),
    ]);
    expect(res).toEqual({
      total: 2,
      listos: 1,
      pendientes: ['Taladro'],
      completo: false,
    });
  });

  it('marcado «falta o está dañado» sigue pendiente', () => {
    const res = estadoChecklist([renglon({ check: palomeado(false) })]);
    expect(res.completo).toBe(false);
    expect(res.pendientes).toEqual(['Escalera de 6 m']);
  });

  it('todo palomeado en ok está completo', () => {
    const res = estadoChecklist([
      renglon({ id: 1, check: palomeado(true) }),
      renglon({ id: 2, descripcion: 'Taladro', check: palomeado(true) }),
    ]);
    expect(res.completo).toBe(true);
    expect(res.listos).toBe(2);
  });
});

describe('mensajeChecklistPendiente', () => {
  it('dice exactamente qué falta', () => {
    expect(mensajeChecklistPendiente(['Escalera'])).toContain('Falta palomear');
    expect(mensajeChecklistPendiente(['Escalera'])).toContain('Escalera');
  });

  it('en plural concuerda', () => {
    expect(mensajeChecklistPendiente(['Escalera', 'Taladro'])).toContain('Faltan palomear');
  });

  it('con muchos corta y dice cuántos quedan', () => {
    const msg = mensajeChecklistPendiente(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(msg).toContain('A, B, C, D y 2 más');
  });

  it('sin pendientes no hay mensaje', () => {
    expect(mensajeChecklistPendiente([])).toBe('');
  });
});
