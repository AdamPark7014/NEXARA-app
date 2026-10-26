/**
 * El alta rápida enseña este aviso cuando el nombre ya está en el padrón y quien lo
 * escribe no puede abrir esa ficha. Quién ve el padrón y quién le suma un tipo no cambian.
 */
import { CLIENT_REUSE_FORBIDDEN } from './client-access.js';

describe('aviso del padrón cuando el nombre ya existe', () => {
  it('deja el aviso en una frase y cita el texto viejo', () => {
    // Dos frases, con punto y «Pide» en mayúscula.
    const textoViejo =
      'Ya existe un cliente con ese nombre en el padrón y no tienes acceso a él. Pide a coordinación que le sume el tipo que necesitas.';

    expect(CLIENT_REUSE_FORBIDDEN).toBe(
      'Ya existe un cliente con ese nombre en el padrón y no tienes acceso a él: pide a coordinación que le sume el tipo que necesitas.',
    );
    expect(CLIENT_REUSE_FORBIDDEN).not.toBe(textoViejo);
    expect(textoViejo).toContain('. Pide a coordinación');
    expect(CLIENT_REUSE_FORBIDDEN).not.toContain('. Pide a coordinación');
    expect(CLIENT_REUSE_FORBIDDEN).toContain('no tienes acceso a él');
    expect(CLIENT_REUSE_FORBIDDEN).toContain('le sume el tipo que necesitas.');
  });
});
