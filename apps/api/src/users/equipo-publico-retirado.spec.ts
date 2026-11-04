/**
 * `GET users/public-team` enseñaba sin sesión nombre, foto y puesto del personal, y con `X-Company-Id` el de cualquier
 * empresa. Nadie la llamaba: `/nosotros` pinta el equipo desde `components/sitio/equipo`. Adam decidió quitarla.
 * Si el sitio vuelve a necesitar al equipo, que sea sin datos de la tabla User y sin elegir empresa con una cabecera.
 */
import 'reflect-metadata';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('el equipo público ya no sale de la API', () => {
  it('ninguna ruta de usuarios se llama public-team', () => {
    const rutas = Object.getOwnPropertyNames(UsersController.prototype)
      .map((nombre) => (UsersController.prototype as unknown as Record<string, object>)[nombre])
      .filter((metodo) => typeof metodo === 'function')
      .map((metodo) => Reflect.getMetadata('path', metodo));

    expect(rutas).not.toContain('public-team');
  });

  it('el servicio tampoco conserva la consulta', () => {
    expect((UsersService.prototype as unknown as Record<string, unknown>).findPublicTeam).toBeUndefined();
  });
});
