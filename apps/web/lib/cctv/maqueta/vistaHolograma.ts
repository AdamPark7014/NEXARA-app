/**
 * Transformaciones puras de la vista del modo holograma (sin three ni DOM).
 * Las usa el panel de controles y las pruebas; el motor aplica el resultado con su vuelo.
 */

export type VistaHolograma = {
  /** 0 = norte; crece en el sentido horario visto desde arriba. */
  azimutDeg: number;
  /** 0 = horizonte, 90 = desde arriba. Se mantiene entre 1 y 89. */
  elevacionDeg: number;
  /** Metros del ojo al target. */
  distancia: number;
  target: { x: number; y: number; z: number };
};

export type LimitesPiso = { min: { x: number; z: number }; max: { x: number; z: number } };
export type CaraCubo = "norte" | "sur" | "este" | "oeste" | "arriba" | "abajo";

const DIST_MIN = 0.6;
const DIST_MAX = 400;
const ELEV_MIN = 1;
const ELEV_MAX = 89;
/** Semi-FOV vertical ≈ 25° (holgura incluida en el factor 1.2). */
const SEMI_FOV_RAD = (25 * Math.PI) / 180 / 2;

function normAzimut(deg: number): number {
  let r = deg % 360;
  if (r < 0) r += 360;
  return r;
}

function clampElev(deg: number): number {
  return Math.min(ELEV_MAX, Math.max(ELEV_MIN, deg));
}

function clampDist(d: number): number {
  return Math.min(DIST_MAX, Math.max(DIST_MIN, d));
}

/** Gira en azimut. Grados positivos = a la derecha. */
export function girar(vista: VistaHolograma, grados: number): VistaHolograma {
  return { ...vista, azimutDeg: normAzimut(vista.azimutDeg + grados) };
}

/** Inclina. Positivo = más desde arriba. */
export function inclinar(vista: VistaHolograma, grados: number): VistaHolograma {
  return { ...vista, elevacionDeg: clampElev(vista.elevacionDeg + grados) };
}

/**
 * Desplaza el target sobre el piso.
 * `dx` = derecha de pantalla (perpendicular al azimut); `dy` = adelante (hacia el azimut).
 */
export function desplazar(vista: VistaHolograma, dx: number, dy: number): VistaHolograma {
  const a = (vista.azimutDeg * Math.PI) / 180;
  // Azimut 0 mira a −Z (norte); derecha de pantalla = +X.
  const adelanteX = Math.sin(a);
  const adelanteZ = -Math.cos(a);
  const derechaX = Math.cos(a);
  const derechaZ = Math.sin(a);
  return {
    ...vista,
    target: {
      x: vista.target.x + derechaX * dx + adelanteX * dy,
      y: vista.target.y,
      z: vista.target.z + derechaZ * dx + adelanteZ * dy,
    },
  };
}

/** Acerca: `factor` > 1 reduce la distancia. */
export function acercar(vista: VistaHolograma, factor: number): VistaHolograma {
  if (!Number.isFinite(factor) || factor === 0) return vista;
  return { ...vista, distancia: clampDist(vista.distancia / factor) };
}

/** Centra el target y calcula distancia para que quepa el bbox con holgura 1.2. */
export function encuadrar(vista: VistaHolograma, limites: LimitesPiso): VistaHolograma {
  const cx = (limites.min.x + limites.max.x) / 2;
  const cz = (limites.min.z + limites.max.z) / 2;
  const w = Math.max(limites.max.x - limites.min.x, 0.5);
  const d = Math.max(limites.max.z - limites.min.z, 0.5);
  const diagonal = Math.hypot(w, d);
  const distancia = clampDist((diagonal * 1.2) / Math.tan(SEMI_FOV_RAD));
  return {
    ...vista,
    target: { x: cx, y: vista.target.y, z: cz },
    distancia,
  };
}

function conLimites(vista: VistaHolograma, limites?: LimitesPiso): VistaHolograma {
  return limites ? encuadrar(vista, limites) : vista;
}

export function vistaIsometrica(vista: VistaHolograma, limites?: LimitesPiso): VistaHolograma {
  return conLimites({ ...vista, azimutDeg: 45, elevacionDeg: 35 }, limites);
}

export function vistaArriba(vista: VistaHolograma, limites?: LimitesPiso): VistaHolograma {
  return conLimites({ ...vista, elevacionDeg: 89 }, limites);
}

export function vistaFrente(vista: VistaHolograma, limites?: LimitesPiso): VistaHolograma {
  return conLimites({ ...vista, azimutDeg: 0, elevacionDeg: 20 }, limites);
}

const AZIMUT_CARA: Record<Exclude<CaraCubo, "arriba" | "abajo">, number> = {
  norte: 0,
  este: 90,
  sur: 180,
  oeste: 270,
};

/** Clic en una cara del cubo de orientación. */
export function vistaDesdeCara(vista: VistaHolograma, cara: CaraCubo, limites?: LimitesPiso): VistaHolograma {
  if (cara === "arriba") return vistaArriba(vista, limites);
  if (cara === "abajo") return conLimites({ ...vista, elevacionDeg: 1 }, limites);
  return conLimites({ ...vista, azimutDeg: AZIMUT_CARA[cara], elevacionDeg: 20 }, limites);
}
