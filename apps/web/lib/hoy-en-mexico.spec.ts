import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hoyIso, inicioDeMesIso } from "@/components/erp/reportes-contabilidad";

/**
 * «Hoy» en un formulario o en un reporte es el día de México.
 *
 * `new Date().toISOString().slice(0, 10)` da el día en hora universal, que cambia a las 6 de la
 * tarde: de esa hora en adelante la fecha de pago, la de la hoja de servicio, la de la orden de
 * compra o la de baja salían con el día siguiente, y el calendario de compras no dejaba elegir hoy.
 */
describe("«hoy» después de las 6 de la tarde", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("los reportes de contabilidad arrancan con el día y el mes de México", () => {
    // 30 de noviembre, 19:30 en México; en hora universal ya es 1 de diciembre.
    vi.useFakeTimers().setSystemTime(new Date("2026-12-01T01:30:00.000Z"));

    expect(hoyIso()).toBe("2026-11-30");
    expect(inicioDeMesIso()).toBe("2026-11-01");
  });

  it("ninguna pantalla saca «hoy» de la hora universal", () => {
    const PATRON = /new Date\(\)\s*\.toISOString\(\)\s*\.(slice\(0,\s*10\)|split\(['"]T['"]\)\[0\]|substring\(0,\s*10\))/;

    expect(fuentes().filter((f) => PATRON.test(f.texto)).map((f) => f.ruta)).toEqual([]);
  });
});

/**
 * `"use client"` solo cuenta si es lo primero del archivo. Con un `import` arriba, Next deja de
 * leerlo como directiva y la compilación de producción falla («The "use client" directive must be
 * placed before other expressions»); ni los tipos ni las demás pruebas lo notan. Pasó con una
 * página que empezaba con una marca invisible (BOM): un `import` agregado por script quedó arriba.
 */
describe("la directiva de cliente va primero", () => {
  it("ningún archivo tiene código antes de «use client» o «use server»", () => {
    const DIRECTIVA = /^\uFEFF?[ \t]*["']use (client|server)["'];?[ \t]*$/m;
    const culpables = fuentes()
      .filter((f) => {
        const m = DIRECTIVA.exec(f.texto);
        if (!m) return false;
        const antes = f.texto
          .slice(0, m.index)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/[^\n]*/g, "")
          .replace(/\uFEFF/g, "")
          .trim();
        return antes.length > 0;
      })
      .map((f) => f.ruta);

    expect(culpables).toEqual([]);
  });

  it("ningún archivo empieza con una marca invisible (BOM)", () => {
    expect(fuentes().filter((f) => f.texto.includes("\uFEFF")).map((f) => f.ruta)).toEqual([]);
  });
});

/**
 * Una página, un layout o sus hermanos solo pueden exportar lo que Next conoce. Un ayudante
 * exportado desde `page.tsx` pasa los tipos y las pruebas, y tumba la compilación de producción
 * («"textoTipo" is not a valid Page export field»). Los ayudantes van en `lib/` o sin `export`.
 */
describe("las páginas solo exportan lo que Next permite", () => {
  const PERMITIDOS = new Set([
    "default",
    "metadata",
    "generateMetadata",
    "generateStaticParams",
    "viewport",
    "generateViewport",
    "dynamic",
    "dynamicParams",
    "revalidate",
    "fetchCache",
    "runtime",
    "preferredRegion",
    "maxDuration",
  ]);
  const ENTRADA = /(^|\/)(page|layout|template|loading|error|not-found|default|global-error)\.tsx?$/;

  it("ninguna página o layout exporta un ayudante", () => {
    const culpables = fuentes()
      .filter((f) => f.ruta.startsWith("app") && ENTRADA.test(f.ruta.replace(/\\/g, "/")))
      .flatMap((f) => {
        const nombres = [
          ...Array.from(
            f.texto.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm),
            (m) => m[1],
          ),
          ...Array.from(f.texto.matchAll(/^export\s*\{([^}]*)\}/gm)).flatMap((m) =>
            m[1]
              .split(",")
              .map((parte) => parte.trim().split(/\s+as\s+/).pop() ?? "")
              .filter(Boolean),
          ),
        ];
        return nombres.filter((n) => !PERMITIDOS.has(n)).map((n) => `${f.ruta}: ${n}`);
      });

    expect(culpables).toEqual([]);
  });
});

const RAIZ = join(__dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === "node_modules" || nombre.startsWith(".") ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.(spec|test)\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

/** Los archivos de código de la web (sin pruebas), con su texto. */
function fuentes(): Array<{ ruta: string; texto: string }> {
  return ["app", "components", "lib", "hooks"]
    .flatMap((carpeta) => {
      try {
        return archivos(join(RAIZ, carpeta));
      } catch {
        return [];
      }
    })
    .map((ruta) => ({ ruta: relative(RAIZ, ruta), texto: readFileSync(ruta, "utf8") }));
}
