import { puedeAsignarA } from './equipo-alcance';

const users = [
  { id: 1, email: 'gerencia@nexara.com.mx', managerId: null },
  { id: 3, email: 'infraestructura@nexara.com.mx', managerId: 1 },
  { id: 8, email: 'operaciones@nexara.com.mx', managerId: 1 },
  { id: 39, email: 'jose.ramirez@nexara.com.mx', managerId: 1 },
  { id: 16, email: 'israel.ramos@nexara.com.mx', managerId: 8 },
  { id: 13, email: 'soporte@nexara.com.mx', managerId: 39 },
  { id: 5, email: 'soluciones@nexara.com.mx', managerId: 1 },
];
const josue = { id: 3, email: 'infraestructura@nexara.com.mx', roleKey: 'arquitecto' };

describe('arquitecto asigna a las cuadrillas de David y José Antonio (10-11)', () => {
  it('llega a quien reporta a David o a José Antonio', () => {
    expect(puedeAsignarA(josue, users, 16)).toBe(true);
    expect(puedeAsignarA(josue, users, 13)).toBe(true);
  });

  it('no llega a los jefes ni a otras áreas', () => {
    expect(puedeAsignarA(josue, users, 8)).toBe(false);
    expect(puedeAsignarA(josue, users, 5)).toBe(false);
  });

  it('sin rol de arquitecto no aplica', () => {
    expect(puedeAsignarA({ ...josue, roleKey: 'administrativo' }, users, 16)).toBe(false);
  });
});
