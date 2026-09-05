import { describe, expect, it } from "vitest";

import { FalloApi, diagnosticar } from "./_fallosApi";

/**
 * Por qué existen estas pruebas.
 *
 * Las dos pantallas que estrenan esto pintaban literalmente la palabra «Error»
 * pasara lo que pasara. La diferencia que importa no es cosmética: si es un 403
 * el operador tiene que ir a pedir permiso, y si es un 502 tiene que avisar de
 * que el backend está caído. Ofrecer «Reintentar» en el primer caso es mandarle
 * a perder el tiempo.
 */

describe("diagnóstico · de quién es el problema", () => {
  it("sin respuesta del servidor: la petición ni salió, y reintentar tiene sentido", () => {
    const d = diagnosticar(new FalloApi("Failed to fetch", null), "cargar la bitácora");
    expect(d.titulo).toBe("El servidor no responde");
    expect(d.cuerpo).toContain("cargar la bitácora");
    expect(d.reintentable).toBe(true);
    expect(d.tono).toBe("danger");
  });

  it("403: es de permisos, se enseña el motivo del guard y NO se ofrece reintentar", () => {
    const d = diagnosticar(
      new FalloApi("Tu rol (tecnico) no puede acceder a GET /api/integra/audit", 403),
      "cargar la bitácora",
    );
    expect(d.titulo).toBe("No tienes permiso");
    expect(d.cuerpo).toContain("Tu rol (tecnico)");
    expect(d.reintentable).toBe(false);
    // No es un fallo del sistema: el sistema funciona y dice que no.
    expect(d.tono).toBe("warn");
  });

  it("403 sin mensaje del servidor: dice qué hacer de todos modos", () => {
    const d = diagnosticar(new FalloApi("", 403), "borrar el vehículo");
    expect(d.cuerpo).toContain("borrar el vehículo");
    expect(d.cuerpo).toContain("administrador");
  });

  it("401: la sesión caducó y reintentar no la resucita", () => {
    const d = diagnosticar(new FalloApi("Unauthorized", 401), "cargar la bitácora");
    expect(d.titulo).toBe("Tu sesión caducó");
    expect(d.reintentable).toBe(false);
  });

  it("404 y 400 no se ofrecen a reintentar; 429 sí", () => {
    expect(diagnosticar(new FalloApi("", 404), "x").reintentable).toBe(false);
    expect(diagnosticar(new FalloApi("Placa requerida", 400), "x").reintentable).toBe(false);
    expect(diagnosticar(new FalloApi("Placa requerida", 400), "x").cuerpo).toBe(
      "Placa requerida",
    );
    expect(diagnosticar(new FalloApi("", 429), "x").reintentable).toBe(true);
  });

  it("5xx: falló el servidor, se dice el código y se puede reintentar", () => {
    const d = diagnosticar(new FalloApi("Internal server error", 500), "cargar la bitácora");
    expect(d.titulo).toBe("El servidor falló");
    expect(d.cuerpo).toContain("HTTP 500");
    expect(d.reintentable).toBe(true);
    expect(diagnosticar(new FalloApi("Bad gateway", 502), "x").titulo).toBe(
      "El servidor falló",
    );
  });

  it("un 4xx raro no se confunde con un fallo del servidor", () => {
    const d = diagnosticar(new FalloApi("Conflicto", 409), "guardar");
    expect(d.titulo).toBe("El servidor rechazó la petición");
    expect(d.reintentable).toBe(false);
  });

  it("un error que no pasó por `pedirIntegra` no se inventa un estado", () => {
    const d = diagnosticar(new Error("algo raro"), "cargar la bitácora");
    expect(d.titulo).toBe("No se pudo cargar la bitácora");
    expect(d.cuerpo).toBe("algo raro");
  });

  it("algo que ni siquiera es un Error tampoco tumba la pantalla", () => {
    const d = diagnosticar("no soy un Error", "cargar la bitácora");
    expect(d.titulo).toBe("No se pudo cargar la bitácora");
    expect(d.cuerpo).toBe("El motivo no llegó con el error.");
  });

  it("`FalloApi` sigue siendo un Error, para que `instanceof Error` valga", () => {
    const e = new FalloApi("x", 500);
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(500);
    expect(e.name).toBe("FalloApi");
  });
});
