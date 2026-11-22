import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Una fecha de calendario (emisión, vigencia, ingreso, visita programada) llega a medianoche UTC.
 * `new Date(x).toLocaleDateString()` la pinta con la hora de México y sale el día anterior. Esos
 * campos se formatean con `formatoFechaLocal` de `lib/fecha-calendario`.
 */
const RAIZ = join(__dirname, "..");
const CARPETAS = ["app", "components", "lib"];
const CAMPOS_DE_SOLO_DIA = [
  "issueDate",
  "validUntil",
  "nextVisitDate",
  "scheduledDate",
  "scheduledFor",
  "contratoVenceAt",
  "fechaIngreso",
  "fechaNacimiento",
  "reviewDate",
  "expectedDate",
  "requiredDate",
  "receiptDate",
];
const PATRON = new RegExp(
  `new Date\\((?:String\\()?[\\w.?!]*\\b(?:${CAMPOS_DE_SOLO_DIA.join("|")})\\)?\\)\\s*\\.toLocale(?:Date)?String`,
);

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.spec\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe("fechas de solo día", () => {
  it("ninguna pantalla pinta una fecha de calendario con la hora local", () => {
    const hallazgos: string[] = [];
    for (const carpeta of CARPETAS) {
      for (const ruta of archivos(join(RAIZ, carpeta))) {
        readFileSync(ruta, "utf8")
          .split("\n")
          .forEach((linea, i) => {
            if (PATRON.test(linea)) hallazgos.push(`${relative(RAIZ, ruta)}:${i + 1}`);
          });
      }
    }
    expect(hallazgos).toEqual([]);
  });
});
