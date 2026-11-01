import { FallosPortal } from './portal-auth.service.js';

describe('Portal · bloqueo por intentos fallidos', () => {
  it('bloquea al quinto fallo dentro de la ventana y suelta después', () => {
    const f = new FallosPortal();
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i += 1) f.registrar('client:a@b.mx', t0 + i);
    expect(f.bloqueado('client:a@b.mx', t0 + 10)).toBe(false);
    f.registrar('client:a@b.mx', t0 + 20);
    expect(f.bloqueado('client:a@b.mx', t0 + 30)).toBe(true);
    expect(f.bloqueado('client:otro@b.mx', t0 + 30)).toBe(false);
    expect(f.bloqueado('client:a@b.mx', t0 + 20 + FallosPortal.VENTANA_MS + 1)).toBe(false);
  });

  it('los fallos viejos no se acumulan y un acceso correcto limpia', () => {
    const f = new FallosPortal();
    const t0 = 5_000_000;
    for (let i = 0; i < 4; i += 1) f.registrar('branch:x@y.mx', t0);
    f.registrar('branch:x@y.mx', t0 + FallosPortal.VENTANA_MS + 1);
    expect(f.bloqueado('branch:x@y.mx', t0 + FallosPortal.VENTANA_MS + 2)).toBe(false);
    for (let i = 0; i < 3; i += 1) f.registrar('branch:x@y.mx', t0 + FallosPortal.VENTANA_MS + 3);
    f.limpiar('branch:x@y.mx');
    f.registrar('branch:x@y.mx', t0 + FallosPortal.VENTANA_MS + 4);
    expect(f.bloqueado('branch:x@y.mx', t0 + FallosPortal.VENTANA_MS + 5)).toBe(false);
  });
});
