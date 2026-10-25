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
  it("quien cumple años ve su felicitación con el primer nombre, en una frase", () => {
    const viejo = "¡Feliz cumpleaños, Carolina! 🎂 Todo el equipo te desea un gran día";
    const aviso = textoCelebracion(base({ soyYo: true }));
    expect(aviso).toEqual({
      titulo: "¡Feliz cumpleaños, Carolina: todo el equipo te desea un gran día! 🎂",
      detalle: null,
    });
    expect(aviso.titulo).not.toBe(viejo);
    expect(aviso.titulo.match(/[!?.]/g)).toEqual(["!"]);
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
    const viejo = "¡Felicidades, Carolina! 🎉 Hoy cumples 3 años en NEXARA";
    const propio = textoCelebracion(
      base({ nombre: "Carolina Juárez Álvarez", tipo: "aniversario", anios: 3, soyYo: true }),
    );
    expect(propio).toEqual({
      titulo: "¡Felicidades, Carolina: hoy cumples 3 años en NEXARA! 🎉",
      detalle: null,
    });
    expect(propio.titulo).not.toBe(viejo);
    expect(propio.titulo.match(/[!?.]/g)).toEqual(["!"]);
    expect(textoCelebracion(base({ nombre: "Ana López", tipo: "aniversario", anios: 2, soyYo: true }))).toEqual({
      titulo: "¡Felicidades, Ana: hoy cumples 2 años en NEXARA! 🎉",
      detalle: null,
    });
  });

  it("en iOS la segunda frase ya no viaja suelta: el aviso de la web tampoco la repite", () => {
    const viejos = [
      "Mándale una felicitación.",
      "Gracias por todo lo que aportas al equipo.",
      "Felicítale por su aniversario.",
    ];
    const avisos = [
      textoCelebracion(base({ soyYo: true })).titulo,
      textoCelebracion(base({ nombre: "Carolina Juárez", tipo: "aniversario", anios: 3, soyYo: true })).titulo,
      textoCelebracion(base({ nombre: "Carolina Juárez" })).titulo,
      textoCelebracion(base({ nombre: "Carolina Juárez", tipo: "aniversario", anios: 3 })).titulo,
    ];
    for (const aviso of avisos) {
      for (const viejo of viejos) expect(aviso).not.toContain(viejo);
    }
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
