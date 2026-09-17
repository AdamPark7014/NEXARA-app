import {
  celebracionCerrada,
  cerrarCelebracion,
  ordenarCelebraciones,
  primerNombre,
  textoCelebracion,
  type Celebracion,
} from "./celebraciones";

const base = (over: Partial<Celebracion>): Celebracion => ({
  userId: 7,
  nombre: "carolina Juárez Álvarez",
  avatarUrl: null,
  tipo: "cumpleanos",
  anios: null,
  soyYo: false,
  ...over,
});

describe("texto del aviso de celebraciones", () => {
  it("quien cumple años ve su felicitación con el primer nombre", () => {
    expect(textoCelebracion(base({ soyYo: true }))).toEqual({
      titulo: "¡Feliz cumpleaños, Carolina! 🎂",
      detalle: "Todo el equipo te desea un gran día",
    });
  });

  it("el resto del equipo ve de quién es el cumpleaños", () => {
    expect(textoCelebracion(base({ nombre: "Carolina Juárez" }))).toEqual({
      titulo: "Hoy es cumpleaños de Carolina Juárez 🎂",
      detalle: null,
    });
  });

  it("el cumpleaños nunca muestra la edad, aunque llegara un número", () => {
    const { titulo, detalle } = textoCelebracion(base({ anios: 34 }));
    expect(`${titulo} ${detalle ?? ""}`).not.toMatch(/\d/);
    const propio = textoCelebracion(base({ anios: 34, soyYo: true }));
    expect(`${propio.titulo} ${propio.detalle ?? ""}`).not.toMatch(/\d/);
  });

  it("aniversario: años en NEXARA, en singular y plural", () => {
    expect(textoCelebracion(base({ nombre: "Ana López", tipo: "aniversario", anios: 3 })).titulo).toBe(
      "Ana López cumple 3 años en NEXARA 🎉",
    );
    expect(textoCelebracion(base({ nombre: "Ana López", tipo: "aniversario", anios: 1 })).titulo).toBe(
      "Ana López cumple 1 año en NEXARA 🎉",
    );
    expect(textoCelebracion(base({ nombre: "Ana López", tipo: "aniversario", anios: 2, soyYo: true }))).toEqual({
      titulo: "¡Felicidades, Ana! 🎉",
      detalle: "Hoy cumples 2 años en NEXARA",
    });
  });

  it("primer nombre y orden: lo propio primero", () => {
    expect(primerNombre("  josué  ramírez ")).toBe("Josué");
    expect(primerNombre("")).toBe("");
    const lista = [base({ userId: 1 }), base({ userId: 2, soyYo: true }), base({ userId: 3 })];
    expect(ordenarCelebraciones(lista).map((c) => c.userId)).toEqual([2, 1, 3]);
  });
});

describe("cerrar el aviso por fecha", () => {
  beforeEach(() => window.localStorage.clear());

  it("se queda cerrado ese día y vuelve al siguiente", () => {
    expect(celebracionCerrada("2026-09-17", 5)).toBe(false);
    cerrarCelebracion("2026-09-17", 5);
    expect(celebracionCerrada("2026-09-17", 5)).toBe(true);
    expect(celebracionCerrada("2026-09-18", 5)).toBe(false);
    expect(celebracionCerrada("2026-09-17", 6)).toBe(false);
  });

  it("sin localStorage no truena", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => cerrarCelebracion("2026-09-17", 5)).not.toThrow();
    expect(celebracionCerrada("2026-09-17", 5)).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});
