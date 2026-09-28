import { alcanzaA, asignablesDe, puedeAsignarA, tiposVisibles } from './equipo-alcance';

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

  it('en la pizarra de otros, Luis solo ve servicios; los demás todo', () => {
    expect(tiposVisibles(luis)).toEqual(['servicio']);
    expect(tiposVisibles(david)).toBeNull();
    expect(tiposVisibles({ id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' })).toBeNull();
  });
});

describe('quién asigna a quién (organigrama)', () => {
  const org = [
    { id: 1, email: 'gerencia@nexara.com.mx', managerId: null },
    { id: 7, email: 'direccion.operaciones@nexara.com.mx', managerId: 1 },
    { id: 8, email: 'operaciones@nexara.com.mx', managerId: 1 },
    { id: 39, email: 'jose.ramirez@nexara.com.mx', managerId: 1 },
    { id: 13, email: 'soporte@nexara.com.mx', managerId: 39 },
    { id: 40, email: 'roberto.vivanco@nexara.com.mx', managerId: 39 },
    { id: 16, email: 'israel.ramos@nexara.com.mx', managerId: 8 },
    { id: 12, email: 'joan.sanchez@nexara.com.mx', managerId: 8 },
  ];
  const christian = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' };
  const luis = { id: 7, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
  const david = { id: 8, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
  const antonio = { id: 39, email: 'jose.ramirez@nexara.com.mx', roleKey: 'ing_soporte' };
  const carolina = { id: 13, email: 'soporte@nexara.com.mx', roleKey: 'ing_soporte' };

  it('coordinación asigna a cualquiera, también fuera de su organigrama', () => {
    expect(puedeAsignarA(david, org, 16)).toBe(true);
    expect(puedeAsignarA(david, org, 12)).toBe(true);
    expect(puedeAsignarA(david, org, 39)).toBe(true);
    expect(puedeAsignarA(david, org, 13)).toBe(true);
    expect(puedeAsignarA(luis, org, 40)).toBe(true);
    expect(puedeAsignarA(david, org, 8)).toBe(false);
  });

  it('el encargado de soporte reparte a su equipo y no a instalación', () => {
    expect(puedeAsignarA(antonio, org, 13)).toBe(true);
    expect(puedeAsignarA(antonio, org, 40)).toBe(true);
    expect(puedeAsignarA(antonio, org, 16)).toBe(false);
    const encargado = { id: 90, email: 'nuevo.encargado@nexara.com.mx', roleKey: 'enc_soporte' };
    const conEquipo = [...org, { id: 91, email: 'tecnico.nuevo@nexara.com.mx', managerId: 90 }];
    expect(puedeAsignarA(encargado, conEquipo, 91)).toBe(true);
    expect(puedeAsignarA(encargado, conEquipo, 16)).toBe(false);
  });

  it('Antonio asigna a su soporte aunque no le reporte; coordinación también', () => {
    const sueltos = org.map((u) => (u.id === 13 || u.id === 40 ? { ...u, managerId: 1 } : u));
    expect(puedeAsignarA(antonio, sueltos, 13)).toBe(true);
    expect(puedeAsignarA(antonio, sueltos, 40)).toBe(true);
    expect(puedeAsignarA(luis, sueltos, 13)).toBe(true);
    expect(puedeAsignarA(luis, sueltos, 40)).toBe(true);
  });

  it('Carolina no asigna a nadie, y nadie se asigna a sí mismo', () => {
    expect(org.every((u) => !puedeAsignarA(carolina, org, u.id))).toBe(true);
    expect(puedeAsignarA(david, org, 8)).toBe(false);
  });

  it('Christian puede con todos y primero salen los jefes', () => {
    const lista = asignablesDe(christian, org);
    expect(lista.map((p) => p.id)).toEqual(expect.arrayContaining([7, 8, 39, 13, 16]));
    // En esta muestra solo David y José Antonio tienen gente a su cargo.
    expect(lista.slice(0, 2).map((p) => p.id).sort((a, b) => a - b)).toEqual([8, 39]);
    expect(lista.some((p) => p.id === 1)).toBe(false);
  });
});
