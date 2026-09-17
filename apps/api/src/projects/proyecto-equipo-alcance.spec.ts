import { fueraDeAlcance, mensajeFueraDeAlcance, puedeIntegrarAlEquipo } from './proyecto-equipo-alcance.js';

// Organigrama de prueba: Christian arriba, David con sus instaladores, Luis (servicios)
// que despacha a José Antonio, y José Antonio con soporte.
const USERS = [
  { id: 1, email: 'christian@nexara.com.mx', managerId: null },
  { id: 2, email: 'operaciones@nexara.com.mx', managerId: 1 }, // David
  { id: 3, email: 'joan.sanchez@nexara.com.mx', managerId: 2 },
  { id: 4, email: 'direccion.operaciones@nexara.com.mx', managerId: 1 }, // Luis
  { id: 5, email: 'jose.ramirez@nexara.com.mx', managerId: 1 },
  { id: 6, email: 'soporte@nexara.com.mx', managerId: 5 },
];

const david = { id: 2, email: 'operaciones@nexara.com.mx' };
const luis = { id: 4, email: 'direccion.operaciones@nexara.com.mx' };
const christian = { id: 1, email: 'christian@nexara.com.mx', roleKey: 'ceo' };

describe('quién puede entrar al equipo de un proyecto', () => {
  it('uno mismo siempre: el proyecto sin su coordinador dentro no tiene sentido', () => {
    // Esta es la única diferencia con asignar una actividad, donde uno mismo no cuenta.
    expect(puedeIntegrarAlEquipo(david, USERS, david.id)).toBe(true);
  });

  it('el organigrama hacia abajo sí', () => {
    expect(puedeIntegrarAlEquipo(david, USERS, 3)).toBe(true);
  });

  it('lo que no cuelga de ti no, aunque lo veas en la pizarra', () => {
    // Luis ve a soporte en su tablero pero despacha a través de José Antonio.
    expect(puedeIntegrarAlEquipo(luis, USERS, 6)).toBe(false);
    expect(puedeIntegrarAlEquipo(luis, USERS, 5)).toBe(true);
  });

  it('David no alcanza a soporte: ni su organigrama ni su despacho', () => {
    expect(puedeIntegrarAlEquipo(david, USERS, 6)).toBe(false);
  });

  it('dirección alcanza a toda la empresa', () => {
    for (const u of USERS) {
      expect(puedeIntegrarAlEquipo(christian, USERS, u.id)).toBe(true);
    }
  });
});

describe('equipo propuesto', () => {
  it('devuelve solo los que se salen del alcance, sin repetir', () => {
    expect(fueraDeAlcance(david, USERS, [2, 3, 6, 6])).toEqual([6]);
  });

  it('el mensaje nombra a la persona, no su id', () => {
    const gente = [{ id: 6, nombre: 'Carolina', email: 'soporte@nexara.com.mx' }];
    expect(mensajeFueraDeAlcance([6], gente)).toContain('Carolina');
    expect(mensajeFueraDeAlcance([6], gente)).not.toContain('#6');
  });

  it('con varios los lista todos', () => {
    const gente = [
      { id: 6, nombre: 'Carolina', email: 'soporte@nexara.com.mx' },
      { id: 5, nombre: 'José Antonio', email: 'jose.ramirez@nexara.com.mx' },
    ];
    const msg = mensajeFueraDeAlcance([6, 5], gente);
    expect(msg).toContain('Carolina');
    expect(msg).toContain('José Antonio');
  });
});
