import {
  indicadoresDeRenglones,
  normalizarRenglones,
  renglonesDesdeTextoLibre,
  textoResumenDeRenglones,
} from './plan-renglones.js';

describe('plan-renglones', () => {
  it('parte texto libre en renglones Nombre: actividad', () => {
    const rows = renglonesDesdeTextoLibre('Ana: Instalar cámaras\nLuis - Revisar NVR');
    expect(rows).toHaveLength(2);
    expect(rows[0].personaNombre).toBe('Ana');
    expect(rows[0].actividad).toContain('Instalar');
    expect(rows[1].personaNombre).toBe('Luis');
  });

  it('normaliza y descarta filas vacías', () => {
    const rows = normalizarRenglones([
      { actividad: 'Visita IPADE', personaNombre: 'Erick', prioridad: 'alta' },
      { actividad: '', personaNombre: '' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].prioridad).toBe('alta');
    expect(rows[0].id).toBeTruthy();
  });

  it('arma resumen e indicadores con conflicto de horario', () => {
    const rows = normalizarRenglones([
      { personaId: 1, personaNombre: 'A', actividad: 'Uno', horarioEstimado: '09:00' },
      { personaId: 1, personaNombre: 'A', actividad: 'Dos', horarioEstimado: '09:00' },
      { personaId: 2, personaNombre: 'B', actividad: 'Tres', horarioEstimado: '10:00' },
    ]);
    expect(textoResumenDeRenglones(rows).split('\n')).toHaveLength(3);
    const ind = indicadoresDeRenglones([{ renglones: rows, autorId: 9 }], [1, 2, 3]);
    expect(ind.planesRecibidos).toBe(1);
    expect(ind.personasSinAsignacion).toBe(1);
    expect(ind.conflictosHorario).toHaveLength(1);
    expect(ind.conflictosHorario[0].horario).toBe('09:00');
  });
});
