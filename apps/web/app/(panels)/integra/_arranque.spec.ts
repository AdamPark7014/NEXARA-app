import { beforeEach, describe, expect, it } from "vitest";

import {
  RECURSOS_ARRANQUE,
  claveArranque,
  lanzarArranque,
  olvidarArranque,
  recursosPendientes,
  tomarArranque,
} from "./_arranque";

/**
 * Lo que fija este archivo es **el orden de las peticiones del arranque**, que
 * es de donde salían los segundos de pantalla muerta al entrar en la consola.
 *
 * Capacidades, salud, panel y cámaras no dependen unas de otras: son cuatro
 * respuestas independientes que se pintan en cuatro sitios distintos. Si alguna
 * vez alguien vuelve a encadenarlas —un `await` de más, un efecto que espera al
 * anterior— estas pruebas se ponen rojas antes de que llegue a producción.
 */

/** Una promesa que se resuelve cuando la prueba quiera. */
function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (motivo: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

describe("arranque en paralelo de la consola", () => {
  beforeEach(() => {
    olvidarArranque();
  });

  it("dispara TODAS las peticiones antes de que ninguna responda", () => {
    const arrancadas: string[] = [];
    const pendientes = {
      capabilities: diferida<string>(),
      health: diferida<string>(),
      dashboard: diferida<string>(),
      cameras: diferida<string>(),
    };

    lanzarArranque("7:3", {
      capabilities: () => {
        arrancadas.push("capabilities");
        return pendientes.capabilities.promesa;
      },
      health: () => {
        arrancadas.push("health");
        return pendientes.health.promesa;
      },
      dashboard: () => {
        arrancadas.push("dashboard");
        return pendientes.dashboard.promesa;
      },
      cameras: () => {
        arrancadas.push("cameras");
        return pendientes.cameras.promesa;
      },
    });

    // Ni un `await` de por medio y ninguna ha respondido todavía: si estuvieran
    // en cascada aquí solo habría arrancado la primera.
    expect(arrancadas).toEqual(["capabilities", "health", "dashboard", "cameras"]);
  });

  it("una respuesta lenta no retrasa a las demás", async () => {
    const capacidades = diferida<string>();
    const camaras = diferida<string>();
    lanzarArranque("7:3", {
      capabilities: () => capacidades.promesa,
      cameras: () => camaras.promesa,
    });

    // Las cámaras contestan mientras capacidades sigue en el aire.
    camaras.resolver("trece cámaras");
    await expect(tomarArranque<string>("cameras", "7:3")).resolves.toBe("trece cámaras");

    // Y capacidades sigue viva, sin haberse perdido por el camino.
    capacidades.resolver("caps");
    await expect(tomarArranque<string>("capabilities", "7:3")).resolves.toBe("caps");
  });

  it("cada respuesta se recoge UNA vez: el refresco periódico pide de verdad", async () => {
    lanzarArranque("7:3", { health: () => Promise.resolve("sano") });
    await expect(tomarArranque<string>("health", "7:3")).resolves.toBe("sano");
    expect(tomarArranque<string>("health", "7:3")).toBeNull();
  });

  it("lo adelantado para un sitio NO se usa en otro", () => {
    lanzarArranque("7:3", { cameras: () => Promise.resolve("cámaras del sitio 3") });
    expect(tomarArranque<string>("cameras", "7:4")).toBeNull();
    expect(tomarArranque<string>("cameras", "8:3")).toBeNull();
    expect(tomarArranque<string>("cameras", "7:3")).not.toBeNull();
  });

  it("montar dos veces no duplica el tráfico", () => {
    let veces = 0;
    const pedir = () => {
      veces += 1;
      return Promise.resolve("ok");
    };
    lanzarArranque("7:3", { cameras: pedir });
    lanzarArranque("7:3", { cameras: pedir });
    expect(veces).toBe(1);
  });

  it("cambiar de empresa tira lo adelantado", () => {
    lanzarArranque("7:3", { cameras: () => Promise.resolve("ok") });
    olvidarArranque();
    expect(tomarArranque<string>("cameras", "7:3")).toBeNull();
    expect(recursosPendientes()).toEqual([]);
  });

  it("una petición que falla no revienta la consola con un rechazo sin atender", async () => {
    const rota = diferida<string>();
    lanzarArranque("7:3", { capabilities: () => rota.promesa });
    rota.rechazar(new Error("401"));
    // El `catch` interno ya la atendió; el consumidor la ve por su lado.
    const recogida = tomarArranque<string>("capabilities", "7:3");
    await expect(recogida).rejects.toThrow("401");
  });

  it("la clave distingue empresa y sitio, y aguanta que falten", () => {
    expect(claveArranque(7, 3)).toBe("7:3");
    expect(claveArranque(7, null)).toBe("7:-");
    expect(claveArranque(null, null)).toBe("-:-");
    expect(claveArranque(7, 3)).not.toBe(claveArranque(7, 4));
  });

  it("los cinco recursos del arranque siguen siendo los que se lanzan juntos", () => {
    expect([...RECURSOS_ARRANQUE]).toEqual([
      "capabilities",
      "health",
      "dashboard",
      "cameras",
      "media",
    ]);
  });
});
