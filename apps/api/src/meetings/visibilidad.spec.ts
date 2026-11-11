import { veReunion } from './visibilidad';

// Christian (1) → David (8) → Israel (16); Christian → José Antonio (39) → Carolina (13).
const usuarios = [
  { id: 1, managerId: null },
  { id: 8, managerId: 1 },
  { id: 16, managerId: 8 },
  { id: 39, managerId: 1 },
  { id: 13, managerId: 39 },
];
const ceo = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' };
const nueva = { soloDireccion: false, facilitadorId: 39, asistentes: [{ userId: 13 }] };

describe('quién ve una reunión (11-11)', () => {
  it('Christian ve todas, también las de antes', () => {
    expect(veReunion(ceo, { ...nueva, soloDireccion: true }, usuarios)).toBe(true);
    expect(veReunion(ceo, nueva, usuarios)).toBe(true);
  });

  it('las de antes solo dirección', () => {
    expect(veReunion({ id: 39, roleKey: 'enc_soporte' }, { ...nueva, soloDireccion: true }, usuarios)).toBe(false);
  });

  it('la ven quien estuvo, quien la condujo y sus jefes, aunque no estuvieran', () => {
    expect(veReunion({ id: 13, roleKey: 'ing_soporte' }, nueva, usuarios)).toBe(true);
    expect(veReunion({ id: 39, roleKey: 'enc_soporte' }, nueva, usuarios)).toBe(true);
    const deIsrael = { soloDireccion: false, facilitadorId: 16, asistentes: [] };
    expect(veReunion({ id: 8, roleKey: 'coord_operaciones' }, deIsrael, usuarios)).toBe(true);
  });

  it('otra área no la ve', () => {
    expect(veReunion({ id: 8, roleKey: 'coord_operaciones' }, nueva, usuarios)).toBe(false);
    expect(veReunion({ id: 16, roleKey: 'ing_campo' }, nueva, usuarios)).toBe(false);
  });
});
