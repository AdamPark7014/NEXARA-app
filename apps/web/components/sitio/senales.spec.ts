import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HEXAGONO, SENALES, senal } from "./senales";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const css = (archivo: string) => readFileSync(join(__dirname, archivo), "utf8");

describe("La señal de cada servicio (icono y color)", () => {
  it("son los cinco servicios, sin repetir ancla, icono ni color", () => {
    expect(SENALES.map((s) => s.id)).toEqual(["cctv", "redes", "computo", "soporte", "software"]);
    for (const campo of ["id", "nombre", "icono", "color"] as const) {
      expect(new Set(SENALES.map((s) => s[campo])).size).toBe(5);
    }
  });

  it("cada color es un token que el sitio sí declara, con su valor del logotipo", () => {
    const hoja = css("sitio.module.css");
    for (const s of SENALES) {
      const token = /^var\((--senal-[a-z]+)\)$/.exec(s.color)?.[1];
      expect(token, `${s.id} no usa un token --senal-*`).toBeTruthy();
      expect(hoja).toMatch(new RegExp(`${token}:\\s*#[0-9a-f]{6};`));
    }
  });

  it("las pistas de los costados pintan sus señales con esos mismos cinco colores, en el mismo orden", () => {
    const hoja = css("sitio.module.css");
    const valores = SENALES.map((s) => {
      const token = /^var\((--senal-[a-z]+)\)$/.exec(s.color)![1];
      return new RegExp(`${token}:\\s*(#[0-9a-f]{6});`).exec(hoja)![1];
    });
    const trazas = readFileSync(join(__dirname, "Trazas.tsx"), "utf8");
    const lista = /const SENALES = \[([^\]]+)\]/.exec(trazas)![1].match(/#[0-9a-f]{6}/g);
    expect(lista).toEqual(valores);
  });

  it("el menú de la barra lleva a las mismas anclas, en el mismo orden y con el mismo icono", async () => {
    const { MENU_SERVICIOS } = await import("./Encabezado");
    const delMenu = MENU_SERVICIOS.filter((o) => o.href.startsWith("/servicios#"));
    expect(delMenu.map((o) => o.href)).toEqual(SENALES.map((s) => `/servicios#${s.id}`));
    expect(delMenu.map((o) => o.icono)).toEqual(SENALES.map((s) => s.icono));
  });

  it("`senal(id)` devuelve la del servicio pedido", () => {
    expect(senal("soporte")).toBe(SENALES[3]);
    expect(senal("cctv").icono).toBe("camera");
  });

  it("el hexágono es una figura cerrada dentro de su lienzo de 52 × 56", () => {
    expect(HEXAGONO.startsWith("M")).toBe(true);
    expect(HEXAGONO.endsWith("z")).toBe(true);
    const numeros = HEXAGONO.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.max(...numeros)).toBeLessThanOrEqual(56);
    expect(Math.min(...numeros)).toBeGreaterThanOrEqual(0);
  });
});
