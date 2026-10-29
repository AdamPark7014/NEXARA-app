/**
 * Plano por niveles (artboard 5 del lienzo, aprobado por Adam el 29-10-2026): edificios con
 * mezzanine o varios pisos. El plano raíz es la planta baja y los demás pisos van en
 * `raiz.niveles`, cada uno con su croquis, escala, muros y cámaras. La numeración de cámaras
 * sigue entre niveles (15, 16…).
 *
 * La geometría de cada nivel está en px de su propio croquis; para pasar algo de un nivel a otro
 * se va por metros (`metrosPorPx` de cada uno), con el origen de los croquis alineado.
 */
import { nuevoId } from "./ids";
import type { CamaraPlano, Nivel, Plano } from "./plano";

export const ID_PLANTA_BAJA = "planta-baja";

export type NivelConPlano = { nivel: Nivel; plano: Plano };

export function nivelBase(raiz: Plano): Nivel {
  return raiz.nivel ?? { id: ID_PLANTA_BAJA, nombre: "Planta baja", elevacionM: 0 };
}

/** Todos los niveles de abajo hacia arriba; el primero es la planta baja (el plano raíz). */
export function listaNiveles(raiz: Plano): NivelConPlano[] {
  const otros = [...(raiz.niveles ?? [])].sort((a, b) => a.nivel.elevacionM - b.nivel.elevacionM);
  return [{ nivel: nivelBase(raiz), plano: raiz }, ...otros];
}

export function esPlantaBaja(raiz: Plano, id: string): boolean {
  return nivelBase(raiz).id === id;
}

export function planoDeNivel(raiz: Plano, id: string): Plano {
  if (esPlantaBaja(raiz, id)) return raiz;
  return raiz.niveles?.find((n) => n.nivel.id === id)?.plano ?? raiz;
}

/** Pone `nuevo` en el lugar del nivel `id` y devuelve la raíz. */
export function reemplazarNivel(raiz: Plano, id: string, nuevo: Plano): Plano {
  if (esPlantaBaja(raiz, id)) return { ...nuevo, nivel: raiz.nivel, niveles: raiz.niveles };
  const limpio: Plano = { ...nuevo, nivel: undefined, niveles: undefined };
  return { ...raiz, niveles: (raiz.niveles ?? []).map((n) => (n.nivel.id === id ? { ...n, plano: limpio } : n)) };
}

/**
 * Agrega un nivel arriba del más alto (3.5 m por omisión). Hereda escala y norte de la planta
 * baja: si los croquis son del mismo juego de planos, las medidas coinciden.
 */
export function agregarNivel(raiz: Plano, datos: { nombre?: string; elevacionM?: number } = {}): { raiz: Plano; id: string } {
  const lista = listaNiveles(raiz);
  const tope = Math.max(...lista.map((n) => n.nivel.elevacionM));
  const id = nuevoId("nv");
  const nivel: Nivel = {
    id,
    nombre: datos.nombre?.trim() || `Nivel ${lista.length + 1}`,
    elevacionM: datos.elevacionM ?? Math.round((tope + 3.5) * 100) / 100,
    alturaLibreM: 2.8,
  };
  const plano: Plano = {
    version: 1,
    croquis: null,
    escala: { ...raiz.escala, calibracion: raiz.escala.calibracion ? { ...raiz.escala.calibracion } : null },
    norteDeg: raiz.norteDeg,
    muros: [],
    aberturas: [],
    obstaculos: [],
    etiquetas: [],
    cotas: [],
    camaras: [],
    personas: [],
  };
  return { raiz: { ...raiz, niveles: [...(raiz.niveles ?? []), { nivel, plano }] }, id };
}

export function actualizarNivel(raiz: Plano, id: string, cambios: Partial<Omit<Nivel, "id">>): Plano {
  if (esPlantaBaja(raiz, id)) return { ...raiz, nivel: { ...nivelBase(raiz), ...cambios } };
  return { ...raiz, niveles: (raiz.niveles ?? []).map((n) => (n.nivel.id === id ? { ...n, nivel: { ...n.nivel, ...cambios } } : n)) };
}

/** Quita un nivel (la planta baja no se quita). */
export function quitarNivel(raiz: Plano, id: string): Plano {
  if (esPlantaBaja(raiz, id)) return raiz;
  const quedan = (raiz.niveles ?? []).filter((n) => n.nivel.id !== id);
  return { ...raiz, niveles: quedan.length ? quedan : undefined };
}

/** El nivel inmediato de abajo (el de mayor elevación por debajo de este). */
export function nivelDeAbajo(raiz: Plano, id: string): NivelConPlano | null {
  const lista = listaNiveles(raiz);
  const i = lista.findIndex((n) => n.nivel.id === id);
  return i > 0 ? lista[i - 1] : null;
}

/** Pasa un punto de un nivel a otro por metros. */
export const reescalar = (p: { x: number; y: number }, desde: Plano, hacia: Plano) => ({
  x: (p.x * desde.escala.metrosPorPx) / hacia.escala.metrosPorPx,
  y: (p.y * desde.escala.metrosPorPx) / hacia.escala.metrosPorPx,
});

/**
 * Copia los muros (con sus puertas y ventanas) del nivel de abajo a este, con ids nuevos y la
 * altura libre del nivel. Lo que ya tenía el nivel se queda.
 */
export function copiarMurosDeAbajo(raiz: Plano, id: string): Plano {
  const abajo = nivelDeAbajo(raiz, id);
  if (!abajo) return raiz;
  const destino = planoDeNivel(raiz, id);
  const nivel = listaNiveles(raiz).find((n) => n.nivel.id === id)?.nivel;
  const altura = nivel?.alturaLibreM ?? null;
  const ids = new Map<string, string>();
  const muros = abajo.plano.muros.map((m) => {
    const nuevo = nuevoId("m");
    ids.set(m.id, nuevo);
    return { ...m, id: nuevo, a: reescalar(m.a, abajo.plano, destino), b: reescalar(m.b, abajo.plano, destino), alturaM: altura ?? m.alturaM };
  });
  const aberturas = abajo.plano.aberturas
    .filter((a) => ids.has(a.muroId))
    .map((a) => {
      const alto = altura ?? Number.POSITIVE_INFINITY;
      return { ...a, id: nuevoId("ab"), muroId: ids.get(a.muroId)!, alturaM: Math.min(a.alturaM, Math.max(alto - a.baseM, 0.1)) };
    });
  return reemplazarNivel(raiz, id, { ...destino, muros: [...destino.muros, ...muros], aberturas: [...destino.aberturas, ...aberturas] });
}

/** Todas las cámaras del edificio con su nivel, por número. */
export function todasLasCamaras(raiz: Plano): Array<{ camara: CamaraPlano; nivel: Nivel; plano: Plano }> {
  return listaNiveles(raiz)
    .flatMap(({ nivel, plano }) => plano.camaras.map((camara) => ({ camara, nivel, plano })))
    .sort((a, b) => a.camara.numero - b.camara.numero);
}

/** Número para la siguiente cámara: sigue entre niveles. */
export function siguienteNumeroGlobal(raiz: Plano): number {
  return todasLasCamaras(raiz).reduce((max, c) => Math.max(max, c.camara.numero), 0) + 1;
}

/** Aplica `fn` a la URL del croquis de cada nivel (resolverla al cargar, volverla relativa al guardar). */
export function transformarCroquis(raiz: Plano, fn: (url: string) => string): Plano {
  const conUrl = (p: Plano): Plano => (p.croquis ? { ...p, croquis: { ...p.croquis, url: fn(p.croquis.url) } } : p);
  const base = conUrl(raiz);
  return raiz.niveles?.length ? { ...base, niveles: raiz.niveles.map((n) => ({ ...n, plano: conUrl(n.plano) })) } : base;
}

/** El nivel donde está una cámara. */
export function nivelDeCamara(raiz: Plano, camaraId: string): NivelConPlano | null {
  return listaNiveles(raiz).find((n) => n.plano.camaras.some((c) => c.id === camaraId)) ?? null;
}

/** «+3.50 m», «±0.00 m». */
export function elevacionTexto(m: number): string {
  if (Math.abs(m) < 0.005) return "±0.00 m";
  return `${m > 0 ? "+" : "−"}${Math.abs(m).toFixed(2)} m`;
}
