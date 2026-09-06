import { beforeEach, describe, expect, it } from "vitest";

import {
  SEMILLA_VIGENCIA_MS,
  claveSemillaCamaras,
  guardarSemillaCamaras,
  idsFantasma,
  leerSemillaCamaras,
  sanearCamaraSembrada,
  semillaAcerto,
  type AlmacenSemilla,
} from "./_camarasCache";

/**
 * La siembra optimista es la que permite pintar la rejilla llena antes de que
 * llegue `integra/cameras`. También es la pieza con más filo del cambio: pinta
 * datos que pueden estar caducados. Estas pruebas fijan las defensas.
 */

function almacenFalso(): AlmacenSemilla & { volcado: Map<string, string> } {
  const volcado = new Map<string, string>();
  return {
    volcado,
    getItem: (k) => volcado.get(k) ?? null,
    setItem: (k, v) => {
      volcado.set(k, v);
    },
    removeItem: (k) => {
      volcado.delete(k);
    },
  };
}

const AHORA = 1_757_000_000_000;

describe("siembra optimista del inventario de cámaras", () => {
  let almacen: ReturnType<typeof almacenFalso>;

  beforeEach(() => {
    almacen = almacenFalso();
  });

  it("guarda y devuelve la lista, en el mismo orden", () => {
    guardarSemillaCamaras(
      "7:3",
      [
        { id: "a", name: "Recepción" },
        { id: "b", name: "Azotea" },
      ],
      { ahora: AHORA, almacen },
    );
    const leidas = leerSemillaCamaras("7:3", { ahora: AHORA + 1000, almacen });
    expect(leidas?.map((c) => c.id)).toEqual(["a", "b"]);
    expect(leidas?.[0].name).toBe("Recepción");
  });

  it("la lista de un sitio NO se pinta en otro", () => {
    guardarSemillaCamaras("7:3", [{ id: "a", name: "Recepción" }], { ahora: AHORA, almacen });
    expect(leerSemillaCamaras("7:4", { ahora: AHORA, almacen })).toBeNull();
    expect(leerSemillaCamaras("8:3", { ahora: AHORA, almacen })).toBeNull();
  });

  it("caduca: pasada la vigencia se espera al servidor como antes", () => {
    guardarSemillaCamaras("7:3", [{ id: "a", name: "Recepción" }], { ahora: AHORA, almacen });
    const justoAntes = AHORA + SEMILLA_VIGENCIA_MS - 1;
    expect(leerSemillaCamaras("7:3", { ahora: justoAntes, almacen })).not.toBeNull();
    const pasada = AHORA + SEMILLA_VIGENCIA_MS + 1;
    expect(leerSemillaCamaras("7:3", { ahora: pasada, almacen })).toBeNull();
  });

  it("una siembra del futuro es un reloj roto: no se usa", () => {
    guardarSemillaCamaras("7:3", [{ id: "a", name: "Recepción" }], {
      ahora: AHORA + 10 * 60_000,
      almacen,
    });
    expect(leerSemillaCamaras("7:3", { ahora: AHORA, almacen })).toBeNull();
  });

  it("una lista vacía BORRA la siembra: un sitio sin cámaras no pinta las de ayer", () => {
    guardarSemillaCamaras("7:3", [{ id: "a", name: "Recepción" }], { ahora: AHORA, almacen });
    guardarSemillaCamaras("7:3", [], { ahora: AHORA, almacen });
    expect(leerSemillaCamaras("7:3", { ahora: AHORA, almacen })).toBeNull();
    expect(almacen.volcado.has(claveSemillaCamaras("7:3"))).toBe(false);
  });

  it("lo guardado es entrada no confiable: basura dentro, null fuera", () => {
    almacen.setItem(claveSemillaCamaras("7:3"), "{no es json");
    expect(leerSemillaCamaras("7:3", { ahora: AHORA, almacen })).toBeNull();

    almacen.setItem(claveSemillaCamaras("7:3"), JSON.stringify({ v: 99, guardadoEn: AHORA, camaras: [] }));
    expect(leerSemillaCamaras("7:3", { ahora: AHORA, almacen })).toBeNull();

    almacen.setItem(
      claveSemillaCamaras("7:3"),
      JSON.stringify({ v: 1, guardadoEn: AHORA, camaras: "trece" }),
    );
    expect(leerSemillaCamaras("7:3", { ahora: AHORA, almacen })).toBeNull();
  });

  it("descarta filas sin id y rellena el nombre que falte", () => {
    expect(sanearCamaraSembrada({ name: "sin id" })).toBeNull();
    expect(sanearCamaraSembrada(null)).toBeNull();
    expect(sanearCamaraSembrada("a")).toBeNull();
    expect(sanearCamaraSembrada({ id: "a" })).toEqual({ id: "a", name: "a" });
  });

  it("no arrastra campos que no se hayan declarado", () => {
    const sana = sanearCamaraSembrada({
      id: "a",
      name: "Recepción",
      region: "Planta baja",
      canControlDoors: true,
      token: "secreto",
    });
    expect(sana).toEqual({ id: "a", name: "Recepción", region: "Planta baja" });
  });

  it("conserva lo que hace falta para pintar la celda", () => {
    guardarSemillaCamaras(
      "7:3",
      [
        {
          id: "a",
          name: "Domo",
          status: 1,
          sourceIp: "192.168.9.34",
          isPtz: true,
          hasAudio: false,
          model: null,
        },
      ],
      { ahora: AHORA, almacen },
    );
    const leida = leerSemillaCamaras("7:3", { ahora: AHORA, almacen })?.[0];
    expect(leida).toMatchObject({
      id: "a",
      name: "Domo",
      status: 1,
      sourceIp: "192.168.9.34",
      isPtz: true,
      hasAudio: false,
      model: null,
    });
  });

  it("sin almacén no revienta: la siembra es un lujo, no un requisito", () => {
    expect(leerSemillaCamaras("7:3", { ahora: AHORA, almacen: null })).toBeNull();
    expect(() =>
      guardarSemillaCamaras("7:3", [{ id: "a", name: "x" }], { ahora: AHORA, almacen: null }),
    ).not.toThrow();
  });

  describe("corrección cuando la siembra no acierta", () => {
    it("acierta solo si son las mismas y en el mismo orden", () => {
      const a = [{ id: "1" }, { id: "2" }];
      expect(semillaAcerto(a, [{ id: "1" }, { id: "2" }])).toBe(true);
      expect(semillaAcerto(a, [{ id: "2" }, { id: "1" }])).toBe(false);
      expect(semillaAcerto(a, [{ id: "1" }])).toBe(false);
      expect(semillaAcerto(a, [{ id: "1" }, { id: "2" }, { id: "3" }])).toBe(false);
    });

    it("señala las cámaras dadas de baja para soltarlas del muro", () => {
      const sembradas = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const reales = [{ id: "1" }, { id: "3" }, { id: "4" }];
      expect(idsFantasma(sembradas, reales)).toEqual(["2"]);
      expect(idsFantasma(sembradas, sembradas)).toEqual([]);
    });
  });
});
