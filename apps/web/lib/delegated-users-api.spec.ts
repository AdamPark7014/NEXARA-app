import { afterEach, describe, expect, it, vi } from "vitest";
import { contrasenaAceptable, crearUsuarioDelegado, generarContrasena, listarTiposCreables } from "@/lib/delegated-users-api";

afterEach(() => vi.unstubAllGlobals());

describe("generarContrasena", () => {
  it("14 caracteres por omisión, con mayúscula, minúscula y número, y sin caracteres ambiguos", () => {
    for (let i = 0; i < 200; i += 1) {
      const p = generarContrasena();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).not.toMatch(/[0O1lI]/);
      expect(contrasenaAceptable(p)).toBe(true);
    }
  });

  it("nunca baja de 10 caracteres y no se repite", () => {
    expect(generarContrasena(4)).toHaveLength(10);
    const muchas = new Set(Array.from({ length: 100 }, () => generarContrasena()));
    expect(muchas.size).toBe(100);
  });
});

describe("contrasenaAceptable", () => {
  it("8+ caracteres con letra y número", () => {
    expect(contrasenaAceptable("Nexara2026")).toBe(true);
    for (const mala of ["corta1", "sinnumeros", "12345678", ""]) expect(contrasenaAceptable(mala)).toBe(false);
  });
});

describe("listarTiposCreables", () => {
  it("devuelve los tipos del API y ninguno si algo falla (no se ofrece el botón)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [{ roleKey: "ing_soporte", etiqueta: "Soporte" }, { basura: 1 }] })));
    expect(await listarTiposCreables("tok")).toEqual([{ roleKey: "ing_soporte", etiqueta: "Soporte" }]);

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => [] })));
    expect(await listarTiposCreables("tok")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    expect(await listarTiposCreables("tok")).toEqual([]);
  });
});

describe("crearUsuarioDelegado", () => {
  const alta = { nombre: "Persona Nueva", email: "a@b.com", password: "Nexara2026x", roleKey: "ing_soporte" };

  it("manda el alta con la sesión y devuelve el usuario creado", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ id: 5, nombre: "Persona Nueva", email: "a@b.com", roleKey: "ing_soporte" }) }));
    vi.stubGlobal("fetch", f);
    const r = await crearUsuarioDelegado("tok", alta);
    expect(r.id).toBe(5);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("users/delegated");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual(alta);
  });

  it("muestra el mensaje del API cuando rechaza el alta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ message: "No tienes permiso para dar de alta usuarios de ese tipo." }) })));
    await expect(crearUsuarioDelegado("tok", alta)).rejects.toThrow("No tienes permiso para dar de alta usuarios de ese tipo.");

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ message: ["correo inválido", "nombre muy corto"] }) })));
    await expect(crearUsuarioDelegado("tok", alta)).rejects.toThrow("correo inválido nombre muy corto");

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => { throw new Error("no json"); } })));
    await expect(crearUsuarioDelegado("tok", alta)).rejects.toThrow(/No se pudo dar de alta/);
  });
});
