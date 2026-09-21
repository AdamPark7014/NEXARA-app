import { describe, expect, it } from 'vitest';
import {
  MIS_VEHICULOS_PATH,
  VEHICULOS_PATH,
  coreVehiclesHome,
  isCoreMount,
  puedeGestionarInventarioVehiculos,
  puedeVerGpsDireccion,
  vehiclesBasePath,
} from './recursos-core';
import { ALL_ROLES, ROLES } from './rbac/roles';
// La regla de la API es la fuente: la web solo la repite para pintar o esconder la página.
import { puedeVerGpsDireccion as puedeVerGpsDireccionApi } from '../../api/src/attendance/asistencia-confiable';

describe('recursos de Core', () => {
  it('el GPS de la flotilla es solo de Dirección General, igual que en la API', () => {
    for (const email of [
      'gerencia@nexara.com.mx',
      'Claudia.Bernal@nexara.com.mx',
      'coordinador@nexara.com.mx',
      'operaciones@nexara.com.mx',
      'developer@nexara.com.mx',
      '',
    ]) {
      expect(puedeVerGpsDireccion({ email }), email).toBe(puedeVerGpsDireccionApi({ email }));
    }
    expect(puedeVerGpsDireccion({ email: 'gerencia@nexara.com.mx' })).toBe(true);
    expect(puedeVerGpsDireccion({ email: 'operaciones@nexara.com.mx' })).toBe(false);
    expect(puedeVerGpsDireccion(null)).toBe(false);
  });

  it('en Core, quien no gestiona flotilla cae en «Mis vehículos» y puede pedir', () => {
    // Antes, el que no tenía par OPS de vehículos (RH, ventas, contabilidad…) caía en la
    // flotilla, donde no podía pedir nada.
    for (const role of [ROLES.ING_CAMPO, ROLES.RH, ROLES.VENDEDOR, ROLES.CONTABILIDAD, ROLES.ARQUITECTO]) {
      expect(coreVehiclesHome({ roleKey: role }), role).toBe(MIS_VEHICULOS_PATH);
    }
    for (const role of [ROLES.COORD_OPERACIONES, ROLES.DIR_OPERACIONES, ROLES.ADMINISTRATIVO, ROLES.CEO]) {
      expect(coreVehiclesHome({ roleKey: role }), role).toBe(VEHICULOS_PATH);
    }
    expect(coreVehiclesHome({ roleKey: ROLES.CEO, isSuperAdmin: true })).toBe(VEHICULOS_PATH);
    // Todo rol resuelve a una de las dos pantallas.
    for (const role of ALL_ROLES) {
      expect([VEHICULOS_PATH, MIS_VEHICULOS_PATH]).toContain(coreVehiclesHome({ roleKey: role }));
    }
  });

  it('las pantallas de OPS arman sus enlaces según dónde están montadas', () => {
    expect(isCoreMount('/erp/vehiculos/3')).toBe(true);
    expect(isCoreMount('/ops/vehicles/3')).toBe(false);
    expect(isCoreMount(null)).toBe(false);
    expect(vehiclesBasePath('/erp/vehiculos')).toBe('/erp/vehiculos');
    expect(vehiclesBasePath('/ops/vehicles')).toBe('/ops/vehicles');
  });
});
