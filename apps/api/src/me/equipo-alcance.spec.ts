import { alcanzaA, tiposVisibles } from './equipo-alcance';

// Organigrama como debe quedar: soporte con José Antonio, instaladores con David.
const users = [
  { id: 1, email: 'gerencia@nexara.com.mx', managerId: null },
  { id: 7, email: 'direccion.operaciones@nexara.com.mx', managerId: 3 },
  { id: 8, email: 'operaciones@nexara.com.mx', managerId: 3 },
  { id: 39, email: 'jose.ramirez@nexara.com.mx', managerId: 1 },
  { id: 13, email: 'soporte@nexara.com.mx', managerId: 39 },
  { id: 40, email: 'roberto.vivanco@nexara.com.mx', managerId: 39 },
  { id: 16, email: 'israel.ramos@nexara.com.mx', managerId: 8 },
];
const luis = { id: 7, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const david = { id: 8, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const antonio = { id: 39, email: 'jose.ramirez@nexara.com.mx', roleKey: 'ing_soporte' };

describe('equipo-alcance', () => {
  it('David no alcanza a soporte (Carolina), sí a sus instaladores', () => {
    expect(alcanzaA(david, users, 13)).toBe(false);
    expect(alcanzaA(david, users, 16)).toBe(true);
  });

  it('Luis pasa a José Antonio y ve a soporte; José Antonio reparte a soporte', () => {
    expect(alcanzaA(luis, users, 39)).toBe(true);
    expect(alcanzaA(luis, users, 13)).toBe(true);
    expect(alcanzaA(antonio, users, 40)).toBe(true);
    expect(alcanzaA(antonio, users, 16)).toBe(false);
  });

  it('dirección alcanza a todos', () => {
    expect(alcanzaA({ id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' }, users, 16)).toBe(true);
  });

  it('Luis solo ve servicios; los demás todo', () => {
    expect(tiposVisibles(luis)).toEqual(['servicio']);
    expect(tiposVisibles(david)).toBeNull();
    expect(tiposVisibles({ id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' })).toBeNull();
  });
});
