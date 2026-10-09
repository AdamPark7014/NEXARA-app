import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { MAPLIBRE_WORKER_URL } from "./BrandMap";

/**
 * El worker de MapLibre se sirve desde /public y el hilo principal sale del
 * paquete instalado: si se sube `maplibre-gl` sin volver a copiar los `.mjs`,
 * el mapa queda con dos versiones que no se entienden y se queda en blanco.
 */
const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const publicDir = resolve(__dirname, "../../public");
// Git con autocrlf deja CRLF en los checkouts de Windows; el contenido es el mismo.
const leer = (ruta: string) => readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");

describe("worker de MapLibre en /public", () => {
  it("apunta a la carpeta copiada", () => {
    expect(MAPLIBRE_WORKER_URL).toBe("/maplibre/maplibre-gl-worker.mjs");
  });

  it.each(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])("%s es copia exacta del paquete instalado", (archivo: string) => {
    const publicado = leer(join(publicDir, "maplibre", archivo));
    const instalado = leer(join(dist, archivo));
    expect(publicado === instalado).toBe(true);
  });
});
