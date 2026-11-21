import { checkUrlAccess } from './url-matrix';
import { ROLES } from './roles.v2';

/**
 * 21-11: a la cuenta de dirección de la empresa de demostración (rol `ceo`, sin ser dueña de la
 * plataforma) el chat se le abría pero no la dejaba escribir ni marcar leído: «Tu rol (ceo) no puede
 * acceder a POST /api/chat/channels/3/messages». Quien ve el chat, lo usa.
 */
describe('quien ve el chat puede escribir y marcar leído', () => {
  const usos: Array<[string, 'GET' | 'POST' | 'PATCH']> = [
    ['/api/chat/channels', 'GET'],
    ['/api/chat/channels/3/messages', 'POST'],
    ['/api/chat/channels/3/read', 'PATCH'],
    ['/api/chat/dm', 'POST'],
  ];

  const conChat = Object.values(ROLES).filter((role) => checkUrlAccess(role, '/erp/chat', 'GET').allowed);

  it('hay roles con chat (la prueba no pasa en vacío)', () => {
    expect(conChat).toContain(ROLES.CEO);
    expect(conChat.length).toBeGreaterThan(5);
  });

  it.each(conChat)('%s', (role) => {
    for (const [ruta, metodo] of usos) {
      expect({ role, ruta, metodo, ok: checkUrlAccess(role, ruta, metodo).allowed }).toEqual({ role, ruta, metodo, ok: true });
    }
  });
});
