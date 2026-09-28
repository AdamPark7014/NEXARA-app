import { citaDeRespuesta, MENSAJE_ELIMINADO, puedeEliminarMensajesDeChat } from './chat-delete-permission.js';

describe('permiso para eliminar mensajes del chat', () => {
  it('solo el usuario 1 (Christian)', () => {
    expect(puedeEliminarMensajesDeChat(1)).toBe(true);
    expect(puedeEliminarMensajesDeChat(2)).toBe(false);
    expect(puedeEliminarMensajesDeChat(0)).toBe(false);
    expect(puedeEliminarMensajesDeChat(null)).toBe(false);
    expect(puedeEliminarMensajesDeChat(undefined)).toBe(false);
  });

  it('la cita de un padre borrado no incluye el texto', () => {
    expect(citaDeRespuesta(9, { id: 9, deletedAt: new Date(), body: 'secreto' } as never)).toEqual({
      id: 9,
      deleted: true,
      body: MENSAJE_ELIMINADO,
    });
    expect(citaDeRespuesta(4, null)).toEqual({ id: 4, deleted: true, body: MENSAJE_ELIMINADO });
    expect(citaDeRespuesta(3, { id: 3, deletedAt: null })).toBeNull();
    expect(citaDeRespuesta(null, null)).toBeNull();
  });
});
