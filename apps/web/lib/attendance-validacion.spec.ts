import {
  checadaDelTipo,
  insigniasChecada,
  requiereRevision,
  type ChecadaValidable,
} from "./attendance-validacion";

/**
 * Lo que un jefe ve de un vistazo en la tarjeta del día. Los textos son los del
 * contrato: Android e iOS enseñan lo mismo con las mismas palabras.
 */

const base = (over: Partial<ChecadaValidable> = {}): ChecadaValidable => ({
  id: 1,
  type: "entrada",
  timestamp: "2026-09-17T15:00:00.000Z",
  validacion: "OK",
  ...over,
});

describe("insignias de una checada", () => {
  it("una checada limpia no lleva ninguna", () => {
    expect(insigniasChecada(base())).toEqual([]);
  });

  it("«Sin conexión» cuando se capturó sin red", () => {
    const [i] = insigniasChecada(base({ offline: true, validacion: "PENDIENTE" }));
    expect(i.texto).toBe("Sin conexión");
  });

  it("«Revisar: <motivo>» con el motivo del servidor", () => {
    const [i] = insigniasChecada(
      base({ validacion: "REVISAR", motivoValidacion: "La hora del teléfono no coincidía" }),
    );
    expect(i.texto).toBe("Revisar: La hora del teléfono no coincidía");
  });

  it("«Fuera de sitio · N m» con la distancia al más cercano", () => {
    const insignias = insigniasChecada(
      base({ fueraDeSitio: true, distanciaSitioM: 1840, sitioNombre: "Oficina" }),
    );
    const fuera = insignias.find((i) => i.clave === "fuera-sitio");
    expect(fuera?.texto).toBe("Fuera de sitio · 1840 m");
    expect(fuera?.detalle).toContain("Oficina");
  });

  it("«Cierre automático» cuando la salida la puso el sistema", () => {
    const insignias = insigniasChecada(
      base({ type: "salida", cierreAutomatico: true, validacion: "REVISAR" }),
    );
    expect(insignias.map((i) => i.clave)).toContain("cierre");
  });

  it("«Corregida» con quién la corrigió y por qué", () => {
    const insignias = insigniasChecada(
      base({
        correcciones: [
          {
            antes: "2026-09-17T15:00:00.000Z",
            despues: "2026-09-17T14:00:00.000Z",
            motivo: "Entró a planta antes de tener señal",
            por: { id: 2, nombre: "Christian" },
            at: "2026-09-17T18:00:00.000Z",
          },
        ],
      }),
    );
    const corregida = insignias.find((i) => i.clave === "corregida");
    expect(corregida?.texto).toBe("Corregida");
    expect(corregida?.detalle).toContain("Christian");
  });

  it("varias marcas a la vez salen en orden de lectura", () => {
    const insignias = insigniasChecada(
      base({
        offline: true,
        validacion: "REVISAR",
        motivoValidacion: "Ubicación imprecisa",
        fueraDeSitio: true,
        distanciaSitioM: 700,
      }),
    );
    expect(insignias.map((i) => i.clave)).toEqual(["offline", "revisar", "fuera-sitio"]);
  });
});

describe("resumen del día", () => {
  it("la checada más reciente de cada tipo es la que manda", () => {
    const lista = [
      base({ id: 1, timestamp: "2026-09-17T15:00:00.000Z" }),
      base({ id: 2, timestamp: "2026-09-17T15:30:00.000Z", fueraDeSitio: true }),
      base({ id: 3, type: "salida", timestamp: "2026-09-18T00:00:00.000Z" }),
    ];
    expect(checadaDelTipo(lista, "entrada")?.id).toBe(2);
    expect(checadaDelTipo(lista, "salida")?.id).toBe(3);
  });

  it("un día sin marcas no pide revisión", () => {
    expect(requiereRevision([base()])).toBe(false);
  });

  it("y uno con algo fuera de sitio sí", () => {
    expect(requiereRevision([base(), base({ id: 2, fueraDeSitio: true })])).toBe(true);
  });
});
