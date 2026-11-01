import { checkUrlAccess } from '../common/rbac/url-matrix';
import { ROLES } from '../common/rbac/roles.v2';
import { categoriaPorPuesto } from './categorias-base';
import { esContadora, puedeLigarHoras, veTodoCostos } from './costos-acceso';

describe('quién ve los sueldos en Costos', () => {
  it('CEO y equivalentes', () => {
    expect(veTodoCostos({ roleKey: ROLES.CEO })).toBe(true);
    expect(veTodoCostos({ roleKey: 'administrativo', email: 'gerencia@nexara.com.mx' })).toBe(true);
    expect(veTodoCostos({ isSuperAdmin: true })).toBe(true);
  });

  it('la contadora, aunque su rol sea administrativo', () => {
    expect(veTodoCostos({ roleKey: 'administrativo', puesto: 'Contador(a) General' })).toBe(true);
    expect(veTodoCostos({ roleKey: ROLES.CONTABILIDAD })).toBe(true);
    expect(esContadora({ roleKey: 'administrativo', puesto: 'Contadora' })).toBe(true);
  });

  it('el resto de la oficina no, aunque tenga el mismo rol', () => {
    expect(veTodoCostos({ roleKey: 'administrativo', puesto: 'Auxiliar Administrativa' })).toBe(false);
    expect(veTodoCostos({ roleKey: 'administrativo', puesto: 'Encargada comercial' })).toBe(false);
  });

  it('dirección de operaciones y coordinación tampoco ven sueldos', () => {
    for (const roleKey of [ROLES.DIR_OPERACIONES, ROLES.COORD_OPERACIONES, ROLES.ENC_SOPORTE, ROLES.ARQUITECTO, ROLES.DIR_ADMIN]) {
      expect(veTodoCostos({ roleKey })).toBe(false);
    }
  });

  it('sin persona, nada', () => {
    expect(veTodoCostos(null)).toBe(false);
    expect(puedeLigarHoras(null)).toBe(false);
  });
});

describe('quién liga horas', () => {
  it('quien coordina la operación, además de CEO y contadora', () => {
    expect(puedeLigarHoras({ roleKey: ROLES.COORD_OPERACIONES })).toBe(true);
    expect(puedeLigarHoras({ roleKey: ROLES.ENC_SOPORTE })).toBe(true);
    expect(puedeLigarHoras({ roleKey: 'administrativo', puesto: 'Contador(a) General' })).toBe(true);
  });

  it('técnicos, vendedores y el resto de la oficina no', () => {
    expect(puedeLigarHoras({ roleKey: ROLES.ING_CAMPO })).toBe(false);
    expect(puedeLigarHoras({ roleKey: ROLES.VENDEDOR })).toBe(false);
    expect(puedeLigarHoras({ roleKey: 'administrativo', puesto: 'Auxiliar Administrativa' })).toBe(false);
  });
});

describe('matriz de URLs de Costos', () => {
  const puede = (rol: string, url: string, metodo: 'GET' | 'POST' | 'PUT' = 'GET') =>
    checkUrlAccess(rol as never, url, metodo).allowed;

  it.each([ROLES.CEO, ROLES.CONTABILIDAD, ROLES.ADMINISTRATIVO, ROLES.COORD_OPERACIONES, ROLES.DIR_OPERACIONES, ROLES.ENC_SOPORTE])(
    '%s entra a la pantalla y a la API',
    (rol) => {
      expect(puede(rol, '/erp/costos')).toBe(true);
      expect(puede(rol, '/api/costos/por-ligar')).toBe(true);
      expect(puede(rol, '/api/costos/por-ligar/12', 'POST')).toBe(true);
    },
  );

  it('técnicos de campo no entran a nada de Costos', () => {
    expect(puede(ROLES.ING_CAMPO, '/erp/costos')).toBe(false);
    expect(puede(ROLES.ING_CAMPO, '/api/costos/tarifas')).toBe(false);
    expect(puede(ROLES.ING_SOPORTE, '/api/costos/por-ligar')).toBe(false);
  });

  it('ventas solo lee los costos de un proyecto; ni tarifas ni bandeja', () => {
    expect(puede(ROLES.VENDEDOR, '/api/costos/proyectos/5')).toBe(true);
    expect(puede(ROLES.VENDEDOR, '/api/costos/acceso')).toBe(true);
    expect(puede(ROLES.VENDEDOR, '/api/costos/tarifas')).toBe(false);
    expect(puede(ROLES.VENDEDOR, '/api/costos/por-ligar')).toBe(false);
    expect(puede(ROLES.VENDEDOR, '/erp/costos')).toBe(false);
  });
});

describe('categoría por puesto', () => {
  it.each([
    ['Técnico Instalador', 'INSTALADOR'],
    ['Técnica de Campo', 'INSTALADOR'],
    ['Ingeniero de Campo / Técnico de Campo', 'INSTALADOR'],
    ['Ingeniero de Soporte', 'SOPORTE'],
    ['Técnico de Soporte', 'SOPORTE'],
    ['Encargado de soporte', 'ENCARGADO'],
    ['Encargado de Obra', 'ENCARGADO'],
    ['Encargada de Operaciones', 'ENCARGADO'],
    ['Encargada comercial', 'OFICINA'],
    ['Contador(a) General', 'OFICINA'],
    ['Auxiliar Administrativa', 'OFICINA'],
  ])('%s → %s', (puesto, clave) => {
    expect(categoriaPorPuesto(puesto)).toBe(clave);
  });

  it('un puesto desconocido no se adivina', () => {
    expect(categoriaPorPuesto('Astronauta')).toBeNull();
    expect(categoriaPorPuesto(null)).toBeNull();
  });
});
