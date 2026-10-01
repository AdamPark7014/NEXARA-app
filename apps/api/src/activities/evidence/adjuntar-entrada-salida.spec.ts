import { claveVentanaAdjuntar, ventanaAdjuntarEntradaSalida } from './adjuntar-entrada-salida';

describe('excepción temporal: adjuntar entrada/salida en vez de cámara', () => {
  const ahora = new Date('2026-10-01T18:00:00.000Z');

  it('sin valor guardado, cerrada', () => {
    expect(ventanaAdjuntarEntradaSalida(undefined, ahora)).toEqual({ abierta: false, hasta: null });
  });

  it('con una fecha futura, abierta', () => {
    const r = ventanaAdjuntarEntradaSalida('2026-10-02T00:00:00.000Z', ahora);
    expect(r.abierta).toBe(true);
    expect(r.hasta?.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('ya vencida, cerrada sola', () => {
    expect(ventanaAdjuntarEntradaSalida('2026-09-30T00:00:00.000Z', ahora).abierta).toBe(false);
  });

  it('un valor que no es fecha no abre nada', () => {
    expect(ventanaAdjuntarEntradaSalida('sí', ahora).abierta).toBe(false);
  });

  it('la llave es por actividad', () => {
    expect(claveVentanaAdjuntar(31)).toBe('evidence.allow_attach:31');
  });
});
