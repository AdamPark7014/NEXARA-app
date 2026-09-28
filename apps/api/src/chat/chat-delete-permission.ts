import { CEO_CHRISTIAN_USER_ID, esCeoChristian } from '../common/ceo-user.js';

/**
 * Quién puede borrar mensajes del chat interno.
 *
 * Misma allowlist que eliminar una actividad: solo Christian, usuario 1.
 * No alcanza el rol `ceo` ni un correo equivalente (la cuenta de pruebas no
 * puede). El endpoint DELETE comprueba esta función con el id del JWT.
 */
export const CHAT_DELETE_USER_ID = CEO_CHRISTIAN_USER_ID;

/** Texto que ven las respuestas cuando el mensaje citado ya no existe. */
export const MENSAJE_ELIMINADO = 'Mensaje eliminado';

export function puedeEliminarMensajesDeChat(userId: number | null | undefined): boolean {
  return esCeoChristian(userId);
}

/**
 * Cita de una respuesta. Si el padre sigue vivo no se manda nada (el hilo ya
 * muestra el original). Si está borrado, solo el aviso: nunca el texto.
 */
export function citaDeRespuesta(
  parentId: number | null | undefined,
  parent: { id: number; deletedAt: Date | string | null } | null | undefined,
): { id: number; deleted: true; body: typeof MENSAJE_ELIMINADO } | null {
  if ((parentId == null || !Number.isFinite(Number(parentId))) && !parent) return null;
  if (parent && parent.deletedAt == null) return null;
  const id = parent?.id ?? parentId;
  if (id == null || !Number.isFinite(Number(id))) return null;
  return { id: Number(id), deleted: true, body: MENSAJE_ELIMINADO };
}
