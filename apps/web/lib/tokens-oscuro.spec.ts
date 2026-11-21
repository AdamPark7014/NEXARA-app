import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un token declarado en `:root` con `var(--otro)` se resuelve en `:root`, con
 * el valor del tema claro, y `body.dark` lo hereda ya resuelto: aunque el tema
 * oscuro cambie `--otro`, el alias se queda claro. Así hubo tarjetas blancas
 * con letra clara en Costos, Vehículos y Asistencias. Todo alias que dependa
 * de un token que el tema oscuro cambia tiene que repetirse en `body.dark`.
 */
const HOJAS = ["globals.scss", "utilities.scss", "ecosystem.scss", "ui-tokens.scss", "ui-firma.scss"];
const CLARO = /^(?::root|html)\s*(?:,\s*(?::root|html)\s*)*\{/gm;
const OSCURO = /^(?:body\.dark|html\.dark|\.dark|:root\.dark)\s*(?:,[^{]*)?\{/gm;
// Declarado en `body` a secas se resuelve en el mismo elemento que lleva `.dark`: vale para los dos temas.
const EN_BODY = /^body\s*\{/gm;

function declaraciones(css: string, selector: RegExp): Map<string, string> {
  const fuera = new Map<string, string>();
  for (const m of css.matchAll(selector)) {
    const abre = css.indexOf("{", m.index);
    let hondo = 0;
    let cierra = abre;
    for (; cierra < css.length; cierra++) {
      if (css[cierra] === "{") hondo++;
      else if (css[cierra] === "}" && --hondo === 0) break;
    }
    for (const d of css.slice(abre + 1, cierra).matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
      fuera.set(d[1], d[2].trim());
    }
  }
  return fuera;
}

describe("tokens en tema oscuro", () => {
  it("ningún alias de :root se queda con el valor del tema claro", () => {
    const claro = new Map<string, string>();
    const oscuro = new Map<string, string>();
    const enBody = new Set<string>();
    for (const hoja of HOJAS) {
      const css = readFileSync(path.resolve(__dirname, "../app", hoja), "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) =>
        " ".repeat(c.length),
      );
      for (const [k, v] of declaraciones(css, CLARO)) claro.set(k, v);
      for (const [k, v] of declaraciones(css, OSCURO)) oscuro.set(k, v);
      for (const k of declaraciones(css, EN_BODY).keys()) enBody.add(k);
    }
    // Lo bastante grande para saber que sí se leyeron las hojas.
    expect(claro.size).toBeGreaterThan(200);
    expect(oscuro.size).toBeGreaterThan(100);

    const viejos = new Set<string>();
    for (let cambio = true; cambio; ) {
      cambio = false;
      for (const [nombre, valor] of claro) {
        if (oscuro.has(nombre) || enBody.has(nombre) || viejos.has(nombre)) continue;
        const depende = [...valor.matchAll(/var\((--[A-Za-z0-9_-]+)/g)].map((d) => d[1]);
        if (depende.some((d) => oscuro.has(d) || viejos.has(d))) {
          viejos.add(nombre);
          cambio = true;
        }
      }
    }
    expect([...viejos].sort()).toEqual([]);
  });
});
