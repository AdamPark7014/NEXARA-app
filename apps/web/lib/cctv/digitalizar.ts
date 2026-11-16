/**
 * Digitalizar el croquis con IA (Ola 5, 15-11-2026). La API (`POST cctv-disenos/:id/digitalizar`) lee
 * la imagen y regresa muros, áreas y cámaras en píxeles del croquis, que son las unidades del `Plano`.
 * Aquí se revisa (todo editable) y se agrega al plano con las mismas funciones del editor.
 */
import { agregarArea, agregarCamara, agregarEtiqueta, agregarMuro } from "./editor";
import type { Plano } from "./plano";

export type TipoCamaraLeida = "domo" | "bala" | "ptz" | "fisheye" | "otra";

export type LecturaPlano = {
  clase: "plano" | "croquis" | "foto" | "otro";
  anchoM: number | null;
  escalaTexto: string | null;
  muros: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>;
  areas: Array<{ nombre: string; x: number; y: number; ancho: number; alto: number }>;
  camaras: Array<{
    numero: number;
    pos: { x: number; y: number };
    rumboDeg: number | null;
    tipo: TipoCamaraLeida;
    ubicacion: string;
    alturaM: number | null;
    segura: boolean;
  }>;
  dudas: string[];
};

export type ResultadoDigitalizar = { lectura: LecturaPlano; anchoPx: number; altoPx: number; ms: number };

export const ETIQUETA_TIPO_CAMARA: Record<TipoCamaraLeida, string> = {
  domo: "Domo",
  bala: "Bala",
  ptz: "PTZ",
  fisheye: "Ojo de pez",
  otra: "Sin definir",
};

/** Lo que se agrega: lo revisado y, si se sabe, el ancho real para la escala. */
export type OpcionesAplicar = {
  /** Ancho real que cubre el croquis completo (m). Sin él, la escala del plano no se toca. */
  anchoM: number | null;
  conMuros: boolean;
  conAreas: boolean;
};

/**
 * Agrega lo leído al plano. La escala solo cambia si no estaba calibrada y hay ancho real; las cámaras
 * se numeran después de las que ya tenga el plano y llevan su ubicación en el nombre.
 */
export function aplicarLectura(plano: Plano, lectura: LecturaPlano, anchoPx: number, opciones: OpcionesAplicar): Plano {
  let p: Plano = plano;
  if (opciones.anchoM && opciones.anchoM > 0 && anchoPx > 0 && !p.escala.calibracion) {
    p = { ...p, escala: { metrosPorPx: opciones.anchoM / anchoPx, calibracion: null } };
  }
  if (opciones.conMuros) {
    for (const m of lectura.muros) p = agregarMuro(p, m.a, m.b).plano;
  }
  if (opciones.conAreas) {
    for (const ar of lectura.areas) {
      const r = agregarArea(p, { x: ar.x, y: ar.y }, { x: ar.x + ar.ancho, y: ar.y + ar.alto });
      p = r.plano;
      if (r.area && ar.nombre) {
        p = { ...p, areas: (p.areas ?? []).map((x) => (x.id === r.area!.id ? { ...x, nombre: ar.nombre } : x)) };
        p = agregarEtiqueta(p, { x: ar.x + ar.ancho / 2, y: ar.y + ar.alto / 2 }, ar.nombre);
      }
    }
  }
  for (const c of lectura.camaras) {
    const extra: Parameters<typeof agregarCamara>[3] = {
      ...(c.rumboDeg != null ? { rumboDeg: c.rumboDeg } : {}),
      ...(c.alturaM ? { alturaM: c.alturaM } : {}),
      ...(c.tipo === "ptz" ? { esPtz: true } : {}),
    };
    const r = agregarCamara(p, c.pos, undefined, extra);
    const nombre = c.ubicacion ? `Cámara ${r.camara.numero} · ${c.ubicacion}` : r.camara.nombre;
    p = { ...r.plano, camaras: r.plano.camaras.map((x) => (x.id === r.camara.id ? { ...x, nombre: nombre.slice(0, 80) } : x)) };
  }
  return p;
}

/** «12 muros, 5 áreas y 9 cámaras». */
export function resumenLectura(l: Pick<LecturaPlano, "muros" | "areas" | "camaras">): string {
  const partes = [
    l.muros.length ? `${l.muros.length} ${l.muros.length === 1 ? "muro" : "muros"}` : null,
    l.areas.length ? `${l.areas.length} ${l.areas.length === 1 ? "área" : "áreas"}` : null,
    `${l.camaras.length} ${l.camaras.length === 1 ? "cámara" : "cámaras"}`,
  ].filter(Boolean) as string[];
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0]!;
}
