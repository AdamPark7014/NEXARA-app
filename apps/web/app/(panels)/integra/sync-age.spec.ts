import { describe, expect, it, vi, afterEach } from "vitest";
import { syncAge } from "./_IntegraChrome";

/**
 * El espejo es la fuente de todo lo que enseña el panel: cámaras, puertas,
 * personas. Un espejo viejo no deja la pantalla vacía —eso se vería— sino que
 * la deja llena de cifras que ya no son ciertas. Por eso la antigüedad se
 * pinta, y por eso se prueba: es aritmética de tiempo, que se rompe sola.
 */
describe("syncAge · antigüedad del espejo", () => {
  const AHORA = new Date("2026-09-04T21:00:00.000Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  function conReloj(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    return syncAge(iso);
  }

  it("sin fecha no inventa una antigüedad", () => {
    expect(syncAge(null)).toBeNull();
    expect(syncAge(undefined)).toBeNull();
    expect(syncAge("")).toBeNull();
  });

  it("una fecha ilegible se trata como ausencia, no como cero", () => {
    // Un espejo de fecha corrupta no puede leerse como «recién sincronizado»:
    // eso sería justo la mentira que este indicador existe para evitar.
    expect(syncAge("no es una fecha")).toBeNull();
  });

  it("por debajo del minuto no dice «hace 0 min»", () => {
    expect(conReloj("2026-09-04T20:59:40.000Z")).toEqual({
      label: "hace menos de 1 min",
      stale: false,
    });
  });

  it("cuenta minutos dentro de la primera hora", () => {
    expect(conReloj("2026-09-04T20:23:00.000Z")).toEqual({
      label: "hace 37 min",
      stale: false,
    });
  });

  it("a los 59 minutos todavía no está rancio", () => {
    expect(conReloj("2026-09-04T20:01:00.000Z")).toMatchObject({ stale: false });
  });

  it("pasada la hora marca rancio y cambia a horas", () => {
    expect(conReloj("2026-09-04T18:30:00.000Z")).toEqual({
      label: "hace 2 h",
      stale: true,
    });
  });

  it("más de un día se cuenta en días, y sigue rancio", () => {
    expect(conReloj("2026-09-01T21:00:00.000Z")).toEqual({
      label: "hace 3 d",
      stale: true,
    });
  });

  it("un reloj adelantado en el servidor no produce antigüedades negativas", () => {
    // Los equipos y el droplet no siempre tienen la misma hora; una deriva no
    // debe pintar «hace -4 min», que parecería un fallo del panel.
    expect(conReloj("2026-09-04T21:04:00.000Z")).toEqual({
      label: "recién",
      stale: false,
    });
  });
});
