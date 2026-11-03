/**
 * La foto del diseño que viaja con la cotización: de aquí salen, en el PDF, el alcance ejecutivo, la
 * especificación de cada línea de cámaras, el centro de monitoreo y el levantamiento por zona. Puro
 * y sin inventar nada: lo que el diseño no sabe no se manda.
 */
import { ETIQUETA_TIPO_CAMARA, ETIQUETA_TIPO_EQUIPO, modeloPorId, type TipoCamara } from "./catalogo";
import type { ResumenDiseno } from "./editor";
import { listaNiveles } from "./niveles";
import type { Grabacion } from "./infraestructura";
import { aMetros, dirRumbo, type CamaraPlano, type Plano } from "./plano";
import { areaEn } from "./recorrido";
import { balanceDelSistema, conexionesDelSistema, gruposDeEquipos } from "./sistema";
import { RESOLUCIONES } from "./optica";

/** Nombre de cada imagen que se adjunta: el PDF decide con él dónde va (igual en `cotizacion-formato-nexara.ts`). */
export const NOMBRE_VISTA_3D = "Vista 3D general del sitio";
export const NOMBRE_VISTA_COBERTURA = "Cobertura en el piso por nivel de detalle";
export const NOMBRE_PLANO_TECNICO = "Plano técnico de distribución";

export type MemoriaCotizacion = {
  calibrado: boolean;
  camaras: number;
  cobertura: ResumenDiseno["cobertura"] | null;
  mbps: number;
  tb: number;
  retencionDias: number;
  codec: string;
  zonas: string[];
  canales: number | null;
  poeW: number | null;
  poeDisponibleW: number | null;
  cableM: number;
  bobinas: number;
  lineas: Array<{ tipo: string; titulo: string; marca: string; modelo: string; cantidad: number; ubicaciones: string[]; datos: string[]; foto?: string | null }>;
  centro: Array<{ tipo: string; titulo: string; modelo: string; cantidad: number; detalle: string }>;
  otros: Array<{ titulo: string; modelo: string; cantidad: number }>;
  levantamiento: {
    columnas: Array<{ clave: string; titulo: string; modelo: string }>;
    filas: Array<{ nivel: string; zona: string; piezas: Record<string, number> }>;
  };
};

/** Fuera de toda área dibujada: va en el exterior, no en una zona inventada. */
const SIN_ZONA = "Exterior y perímetro";
/** Lo que ve una cámara define su zona, no el muro donde va pegada: se mira un poco hacia adelante. */
const METROS_HACIA_ADELANTE = 2;

function zonaDeCamara(plano: Plano, c: CamaraPlano): string {
  const pos = aMetros(c.pos, plano.escala);
  const d = dirRumbo(c.rumboDeg);
  return areaEn(plano, { x: pos.x + d.x * METROS_HACIA_ADELANTE, y: pos.y + d.y * METROS_HACIA_ADELANTE }) ?? areaEn(plano, pos) ?? SIN_ZONA;
}

const mpDeOptica = (o: { pxHoriz: number; pxVert: number }) => {
  const conocida = RESOLUCIONES.find((r) => r.pxHoriz === o.pxHoriz && r.pxVert === o.pxVert);
  if (conocida) return conocida.mp;
  // Como lo anuncia el fabricante: 2688×1520 son 4 MP, no 4.1.
  const mp = (o.pxHoriz * o.pxVert) / 1_000_000;
  return Math.abs(mp - Math.round(mp)) < 0.25 ? Math.round(mp) : Math.round(mp * 10) / 10;
};

/** Lo que ya dicen la resolución y la visión nocturna no se repite. */
const YA_DICHO = /resoluci[oó]n m[aá]xima|sensor cmos|infrarrojo|iluminador ir|ir/i;

const CODEC: Readonly<Record<string, string>> = { h265: "H.265", h264: "H.264" };

/** Los datos de un modelo como frases cortas, en el orden en que importan al cliente. */
function datosDeCamara(c: CamaraPlano): string[] {
  const m = modeloPorId(c.productoId);
  const o = c.lentes[0]?.optica;
  const datos: string[] = [];
  if (o) {
    const focal = o.focalMinMm && o.focalMaxMm && o.focalMaxMm > o.focalMinMm ? `${o.focalMinMm}–${o.focalMaxMm} mm` : `${o.focalMm} mm`;
    datos.push(`Resolución de ${mpDeOptica(o)} MP (${o.pxHoriz}×${o.pxVert}) con lente de ${focal}.`);
    if (o.irM) datos.push(`Visión nocturna de hasta ${o.irM} m.`);
  }
  for (const t of m?.caracteristicas ?? []) {
    if (datos.length >= 5) break;
    const limpio = t.trim().replace(/\.$/, "");
    if (limpio && !YA_DICHO.test(limpio)) datos.push(`${limpio}.`);
  }
  return datos;
}

export function memoriaDelDiseno(raiz: Plano, resumen: ResumenDiseno | null, grabacion: Grabacion): MemoriaCotizacion {
  const niveles = listaNiveles(raiz);
  const balance = balanceDelSistema(raiz, resumen, conexionesDelSistema(raiz));
  const lineas = new Map<string, MemoriaCotizacion["lineas"][number]>();
  const filas = new Map<string, MemoriaCotizacion["levantamiento"]["filas"][number]>();
  const zonas: string[] = [];
  const calibrado = niveles.some((n) => Boolean(n.plano.escala.calibracion));

  for (const { nivel, plano } of niveles) {
    for (const c of [...plano.camaras].sort((a, b) => a.numero - b.numero)) {
      const m = modeloPorId(c.productoId);
      const tipo: TipoCamara = c.esPtz ? "ptz" : (m?.tipo ?? "domo");
      const clave = `cam|${c.productoId || c.modelo}`;
      const o = c.lentes[0]?.optica;
      const linea = lineas.get(clave) ?? {
        tipo,
        titulo: `${ETIQUETA_TIPO_CAMARA[tipo]} IP${o ? ` ${mpDeOptica(o)} MP` : ""}`,
        marca: m?.marca ?? "",
        modelo: m?.modelo ?? c.modelo,
        cantidad: 0,
        ubicaciones: [],
        datos: datosDeCamara(c),
        foto: m?.foto ?? null,
      };
      linea.cantidad += 1;
      if (c.nombre && !linea.ubicaciones.includes(c.nombre)) linea.ubicaciones.push(c.nombre);
      lineas.set(clave, linea);

      const zona = zonaDeCamara(plano, c);
      if (!zonas.includes(zona)) zonas.push(zona);
      const k = `${nivel.id}|${zona}`;
      const fila = filas.get(k) ?? { nivel: nivel.nombre, zona, piezas: {} };
      fila.piezas[clave] = (fila.piezas[clave] ?? 0) + 1;
      filas.set(k, fila);
    }
  }

  const centro: MemoriaCotizacion["centro"] = [];
  const otros: MemoriaCotizacion["otros"] = [];
  for (const g of gruposDeEquipos(raiz, grabacion)) {
    if (g.familia === "camaras") continue;
    const titulo = ETIQUETA_TIPO_EQUIPO[g.tipo as keyof typeof ETIQUETA_TIPO_EQUIPO] ?? g.nombre;
    if (g.familia === "grabacion" || g.familia === "red" || g.familia === "servidores" || g.familia === "infraestructura") {
      centro.push({ tipo: g.tipo, titulo, modelo: g.modelo, cantidad: g.cantidad, detalle: "" });
    } else otros.push({ titulo, modelo: g.modelo, cantidad: g.cantidad });
  }

  return {
    calibrado,
    camaras: balance.camaras,
    cobertura: resumen?.cobertura ?? null,
    mbps: balance.mbps,
    tb: balance.tb,
    retencionDias: grabacion.retencionDias,
    codec: CODEC[grabacion.codec] ?? grabacion.codec.toUpperCase(),
    zonas,
    canales: balance.canales,
    poeW: balance.poeW,
    poeDisponibleW: balance.poeDisponibleW,
    cableM: balance.cableM,
    bobinas: balance.bobinas,
    lineas: [...lineas.values()],
    centro,
    otros,
    levantamiento: {
      columnas: [...lineas.entries()].map(([clave, l]) => ({ clave, titulo: l.titulo.replace(/ IP.*$/, ""), modelo: l.modelo })),
      filas: [...filas.values()],
    },
  };
}
