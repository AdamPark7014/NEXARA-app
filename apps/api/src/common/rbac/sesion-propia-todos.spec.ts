import { checkUrlAccess } from './url-matrix';
import { ROLES } from './roles.v2';

/** 11-11: a Jorge (arquitecto) «Mi perfil» le enseñaba «Tu rol no puede acceder a GET /api/users/mfa/status». */
describe('lo propio de cada quien lo puede abrir cualquier rol', () => {
  const propias: Array<[string, 'GET' | 'POST']> = [
    ['/api/users/mfa/status', 'GET'],
    ['/api/users/mfa/setup', 'POST'],
    ['/api/users/mfa/confirm', 'POST'],
    ['/api/users/mfa/disable', 'POST'],
    ['/api/workflow/my-pending', 'GET'],
    ['/api/ai/voz/estado', 'GET'],
    ['/api/users/me', 'GET'],
  ];

  it.each(Object.values(ROLES))('%s', (role) => {
    for (const [ruta, metodo] of propias) {
      expect({ role, ruta, ok: checkUrlAccess(role, ruta, metodo).allowed }).toEqual({ role, ruta, ok: true });
    }
  });
});
