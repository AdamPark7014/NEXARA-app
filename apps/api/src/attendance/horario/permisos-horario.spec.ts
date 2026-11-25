import { puedeProgramarHorario, puedeVerHorario, esJefeOSuperior } from './permisos-horario';

const arbol = [
  { id: 1, managerId: null, roleKey: 'ceo' },
  { id: 2, managerId: 1, roleKey: 'dir_operaciones' },
  { id: 3, managerId: 2, roleKey: 'coord_operaciones' },
  { id: 4, managerId: 3, roleKey: 'ing_campo' },
];

describe('permisos-horario', () => {
  it('nadie se lo cambia a si mismo', () => {
    expect(puedeProgramarHorario({ id: 4, roleKey: 'ing_campo' }, 4, arbol).ok).toBe(false);
    expect(puedeProgramarHorario({ id: 1, roleKey: 'ceo' }, 1, arbol).motivo).toBe('si_mismo');
  });

  it('jefe directo y superiores pueden', () => {
    expect(puedeProgramarHorario({ id: 3, roleKey: 'coord_operaciones' }, 4, arbol).ok).toBe(true);
    expect(puedeProgramarHorario({ id: 2, roleKey: 'dir_operaciones' }, 4, arbol).ok).toBe(true);
    expect(puedeProgramarHorario({ id: 4, roleKey: 'ing_campo' }, 3, arbol).ok).toBe(false);
  });

  it('RH y direccion pueden', () => {
    expect(puedeProgramarHorario({ id: 99, roleKey: 'rh' }, 4, arbol).ok).toBe(true);
    expect(puedeProgramarHorario({ id: 99, roleKey: 'ceo' }, 4, arbol).ok).toBe(true);
  });

  it('la persona puede ver el suyo', () => {
    expect(puedeVerHorario({ id: 4 }, 4, arbol)).toBe(true);
  });

  it('esJefeOSuperior sube el arbol', () => {
    expect(esJefeOSuperior(1, 4, arbol)).toBe(true);
    expect(esJefeOSuperior(4, 1, arbol)).toBe(false);
  });
});
