import {
  ROLES_DELEGABLES,
  contrasenaAceptable,
  esDireccion,
  parsearConcesiones,
  puedeCrearRol,
  rolesBajoDireccion,
  rolesQuePuedeCrear,
  tiposParaMostrar,
} from './user-creation-policy.js';
import { ROLE_TIER } from '../common/rbac/roles.v2.js';

const DUENO = 'gerencia@nexara.com.mx';
const CONCESIONES = parsearConcesiones(
  JSON.stringify({
    'jose.ramirez@nexara.com.mx': ['ing_soporte'], // Antonio
    'operaciones@nexara.com.mx': ['ing_campo'], // David
    'Direccion.Operaciones@Nexara.com.mx': ['ing_soporte'], // Luis (mayúsculas: se normaliza)
  }),
);

const antonio = { email: 'jose.ramirez@nexara.com.mx', roleKey: 'ing_soporte' };
const david = { email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const luis = { email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const christian = { email: DUENO, roleKey: 'ceo' };

describe('parsearConcesiones', () => {
  it('sin valor o con JSON roto: nadie tiene concesiones', () => {
    expect(parsearConcesiones(null)).toEqual({});
    expect(parsearConcesiones('')).toEqual({});
    expect(parsearConcesiones('{no')).toEqual({});
    expect(parsearConcesiones('["ing_soporte"]')).toEqual({});
  });

  it('normaliza correos y quita repetidos', () => {
    expect(CONCESIONES['direccion.operaciones@nexara.com.mx']).toEqual(['ing_soporte']);
    expect(parsearConcesiones('{"a@x.com":["ing_soporte","ING_SOPORTE"]}')).toEqual({ 'a@x.com': ['ing_soporte'] });
  });

  it('ignora roles que no se pueden delegar, aunque alguien los escriba', () => {
    const c = parsearConcesiones(
      JSON.stringify({ 'a@x.com': ['ceo', 'super_admin', 'dir_admin', 'coord_admin', 'contabilidad', 'rh', 'cliente', 'ing_campo'] }),
    );
    expect(c).toEqual({ 'a@x.com': ['ing_campo'] });
    expect(parsearConcesiones('{"a@x.com":["ceo"]}')).toEqual({});
  });

  it('todos los roles delegables son operativos (por debajo de coordinación)', () => {
    for (const r of ROLES_DELEGABLES) expect(ROLE_TIER[r]).toBeLessThanOrEqual(50);
  });
});

describe('quién da de alta a quién', () => {
  it('Antonio y Luis: solo soporte', () => {
    expect(rolesQuePuedeCrear(antonio, CONCESIONES, DUENO)).toEqual(['ing_soporte']);
    expect(rolesQuePuedeCrear(luis, CONCESIONES, DUENO)).toEqual(['ing_soporte']);
    expect(puedeCrearRol(antonio, 'ing_campo', CONCESIONES, DUENO)).toBe(false);
    expect(puedeCrearRol(luis, 'ing_campo', CONCESIONES, DUENO)).toBe(false);
  });

  it('David: solo instaladores, aunque comparta rol con Luis', () => {
    expect(rolesQuePuedeCrear(david, CONCESIONES, DUENO)).toEqual(['ing_campo']);
    expect(puedeCrearRol(david, 'ing_soporte', CONCESIONES, DUENO)).toBe(false);
  });

  it('nadie más puede dar de alta a nadie', () => {
    expect(rolesQuePuedeCrear({ email: 'carolina@nexara.com.mx', roleKey: 'ing_soporte' }, CONCESIONES, DUENO)).toEqual([]);
    expect(rolesQuePuedeCrear({ email: 'otro@nexara.com.mx', roleKey: 'coord_operaciones' }, CONCESIONES, DUENO)).toEqual([]);
    expect(rolesQuePuedeCrear(null, CONCESIONES, DUENO)).toEqual([]);
  });

  it('sin concesiones configuradas, los tres quedan sin permiso (dirección sigue pudiendo)', () => {
    expect(rolesQuePuedeCrear(antonio, {}, DUENO)).toEqual([]);
    expect(rolesQuePuedeCrear(christian, {}, DUENO).length).toBeGreaterThan(0);
  });
});

describe('Christian: todos los tipos por debajo de él', () => {
  it('se reconoce por rol, por ser el dueño o por ser super admin', () => {
    expect(esDireccion(christian, DUENO)).toBe(true);
    expect(esDireccion({ email: DUENO, roleKey: 'rh' }, DUENO)).toBe(true);
    expect(esDireccion({ email: 'x@y.com', roleKey: 'ceo' }, DUENO)).toBe(true);
    expect(esDireccion({ email: 'x@y.com', isSuperAdmin: true }, DUENO)).toBe(true);
    expect(esDireccion(antonio, DUENO)).toBe(false);
  });

  it('da de alta soporte, instalador y todo lo demás por debajo, pero nunca otro CEO ni super admin ni clientes', () => {
    const roles = rolesQuePuedeCrear(christian, {}, DUENO);
    for (const r of ['ing_soporte', 'enc_soporte', 'ing_campo', 'coord_operaciones', 'dir_operaciones', 'dir_admin', 'contabilidad', 'rh', 'vendedor', 'disenador']) {
      expect(roles).toContain(r);
    }
    for (const r of ['ceo', 'super_admin', 'cliente']) expect(roles).not.toContain(r);
    expect(roles).toEqual(rolesBajoDireccion());
  });

  it('va ordenado del cargo más alto al más bajo', () => {
    const tiers = rolesBajoDireccion().map((r) => ROLE_TIER[r]);
    expect(tiers).toEqual([...tiers].sort((a, b) => b - a));
  });
});

describe('presentación y contraseña', () => {
  it('los tipos se muestran con el nombre del organigrama', () => {
    const t = tiposParaMostrar(['ing_soporte', 'ing_campo', 'dir_admin']);
    expect(t).toEqual([
      { roleKey: 'ing_soporte', etiqueta: 'Soporte' },
      { roleKey: 'ing_campo', etiqueta: 'Instalador' },
      { roleKey: 'dir_admin', etiqueta: 'Director Administrativo' },
    ]);
  });

  it('contraseña: 8+ caracteres con letra y número', () => {
    expect(contrasenaAceptable('Nexara2026')).toBe(true);
    for (const mala of ['corta1', 'sinnumeros', '12345678', '', null, 'a'.repeat(80) + '1']) {
      expect(contrasenaAceptable(mala)).toBe(false);
    }
  });
});
