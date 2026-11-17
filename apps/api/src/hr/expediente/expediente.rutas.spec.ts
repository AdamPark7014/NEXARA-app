import { checkUrlAccess } from '../../common/rbac/url-matrix.js';
import { ALL_ROLES, ROLES } from '../../common/rbac/roles.v2.js';
import { ExpedienteController } from './expediente.controller.js';
import { RhSolicitudesController } from '../rh-solicitudes.controller.js';

describe('Rutas de expediente y aprobación con alcance en el servicio', () => {
  it.each(ALL_ROLES)('%s puede llegar a la validación del expediente propio y sus pendientes', (rol) => {
    expect(checkUrlAccess(rol, '/api/hr/expediente/50', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/hr/expediente/documentos', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/hr/solicitudes-aprobacion/mis-pendientes', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/hr/expediente/solicitudes/9/decidir', 'POST').allowed).toBe(true);
  });

  it.each([ROLES.CEO, ROLES.RH])('%s puede enviar cambios e importar', (rol) => {
    expect(checkUrlAccess(rol, '/api/hr/expediente/cambios', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/hr/personal-import/confirmar', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/hr/expediente/50/sensibles', 'PATCH').allowed).toBe(true);
  });

  it('los endpoints propios no exigen permisos de administración de personal', () => {
    for (const handler of [ExpedienteController.prototype.obtener, ExpedienteController.prototype.subirDocumento,
      ExpedienteController.prototype.decidir, RhSolicitudesController.prototype.misPendientes]) {
      expect(Reflect.getMetadata('rbac', handler)).toEqual({});
    }
  });
});
