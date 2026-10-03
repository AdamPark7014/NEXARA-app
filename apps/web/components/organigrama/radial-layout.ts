/**
 * Organigrama radial («telaraña»): el director al centro, sus reportes directos en
 * el primer anillo y cada equipo abriéndose en abanico detrás de su jefe.
 *
 * Todo aquí es **puro**: entra el árbol que devuelve `GET users/orgchart` y sale la
 * posición de cada tarjeta, el trazo de cada conector y los anillos guía. No mide el
 * DOM ni depende de React, así que `radial-layout.spec` puede exigirle lo que el ojo
 * exige: nadie encima de nadie, nadie perdido, el director en el centro.
 *
 * Cómo se reparte el espacio:
 *  1. Los anillos son elipses concéntricas con la proporción del lienzo: una laptop
 *     es apaisada y un círculo desperdiciaría los lados.
 *  2. Cada anillo tiene una **capacidad**: cuántas tarjetas caben a lo largo. Una
 *     tarjeta es más ancha que alta, así que a los lados (apiladas) caben muchas
 *     más que arriba o abajo (una junto a otra). El ángulo se reparte según eso.
 *  3. Cada rama pide el sector que necesita su nivel más apretado (su tarjeta en su
 *     anillo, o su gente en el siguiente). Los sectores se reparten en proporción.
 *  4. Si un nivel no cabe en un anillo, su gente se alterna en dos filas (zigzag)
 *     y el conector de la fila de afuera pasa por el hueco de la de adentro.
 *  5. Al final se comprueba con los rectángulos de verdad: si algo se toca, el
 *     dibujo entero crece un poco y se repite. Nunca sale una tarjeta encima de otra.
 */
import {
  type OrgChartNode,
  contarSubordinados,
  flattenOrgNodes,
} from "@/lib/orgchart-layout";

/**
 * Qué significa la línea que llega a una tarjeta:
 *  - `mando`: reporta a esa persona (línea llena);
 *  - `lateral`: se dibuja a su costado, sin mando (punteada);
 *  - `sinJefe`: no tiene jefe asignado; se cuelga del centro con línea punteada
 *    para que no desaparezca del dibujo.
 */
export type TipoEnlace = "mando" | "lateral" | "sinJefe";

export type Medida = { ancho: number; alto: number };

export type NodoRadial = {
  id: number;
  persona: OrgChartNode;
  /** 0 = centro; 1 = reportes directos; 2 = sus equipos… */
  nivel: number;
  /** Centro de la tarjeta. El director está en (0, 0); `y` crece hacia abajo. */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Ángulo sobre la elipse, en radianes (0 = derecha, π/2 = abajo). */
  angulo: number;
  /** Fila dentro de su nivel: 0, o 1 si su nivel va alternado en dos filas. */
  fila: number;
  /** A quién lo une su conector. `null` solo en el centro. */
  enlazaCon: number | null;
  tipoEnlace: TipoEnlace | null;
};

export type EnlaceRadial = {
  de: number;
  a: number;
  tipo: TipoEnlace;
  /** Atributo `d` de un `<path>` SVG, en las mismas coordenadas que los nodos. */
  trazo: string;
};

export type DisenoRadial = {
  nodos: NodoRadial[];
  enlaces: EnlaceRadial[];
  /** Contorno de cada anillo (atributo `d` de un `<path>`), centrado en el director. */
  anillos: string[];
  /** Medio ancho y medio alto del dibujo **con el director en el centro**. */
  medioAncho: number;
  medioAlto: number;
  centroId: number | null;
  /** Tarjetas compactas: se activa solo cuando hay mucha gente. */
  compacto: boolean;
};

export type OpcionesRadial = {
  /** Ancho / alto del lienzo. Decide la proporción de los anillos. */
  aspecto?: number;
  tarjeta?: Medida;
  centro?: Medida;
  /** Aire mínimo entre dos tarjetas vecinas. */
  hueco?: number;
  /** Aire entre un anillo y el siguiente: lo que deja ver el conector. */
  huecoAnillo?: number;
};

/** Tarjeta normal, compacta (mucha gente) y la del centro. La vista las pinta a este tamaño. */
export const TARJETA: Medida = { ancho: 220, alto: 58 };
export const TARJETA_COMPACTA: Medida = { ancho: 184, alto: 50 };
export const TARJETA_CENTRO: Medida = { ancho: 264, alto: 84 };
/** A partir de cuánta gente se pasa a tarjeta compacta. */
export const UMBRAL_COMPACTO = 28;

const DOS_PI = Math.PI * 2;
const HUECO = 12;
const HUECO_ANILLO = 30;
const MUESTRAS = 1440;
/** Cuánto puede abrirse un equipo respecto de lo justo: más y deja de leerse como grupo. */
const HOLGURA_ABANICO = 1.5;
/** Hasta cuántos niveles pueden alternarse en dos filas (el resto va en una). */
const NIVELES_ALTERNABLES = 4;
/** Exponente de la superelipse de los anillos: 2 es una elipse, 4 ya es casi un rectángulo. */
const EXPONENTE = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Árbol de dibujo
// ─────────────────────────────────────────────────────────────────────────────

type Rama = {
  persona: OrgChartNode;
  tipo: TipoEnlace | null;
  enlazaCon: number | null;
  nivel: number;
  hijos: Rama[];
  /** Peso aproximado, solo para ordenar el primer anillo. */
  peso: number;
  /** Fracción del anillo que necesita esta rama. */
  demanda: number;
  /** Posición a lo largo del anillo, en capacidad (0..1), antes del mapa de ángulos. */
  t: number;
  fila: number;
};

/**
 * Quién va al centro: de las raíces sin jefe, la que tiene más gente debajo. En
 * NEXARA es el director general; no se busca por nombre ni por puesto para que
 * otra empresa del mismo sistema no dependa de cómo escribió «Director».
 */
export function elegirCentro(roots: OrgChartNode[]): OrgChartNode | null {
  if (roots.length === 0) return null;
  const sinJefe = roots.filter((r) => r.managerId == null);
  const candidatas = sinJefe.length > 0 ? sinJefe : roots;
  let mejor = candidatas[0];
  let gente = contarSubordinados(mejor);
  for (const r of candidatas.slice(1)) {
    const n = contarSubordinados(r);
    if (n > gente) {
      mejor = r;
      gente = n;
    }
  }
  return mejor;
}

/**
 * Arma el árbol que se dibuja. Difiere del de mando en dos cosas, y solo en el
 * dibujo: quien va «al lado de» alguien se saca de la fila de su jefe y se pone
 * junto a su ancla, y las raíces que no son el centro se cuelgan de él como
 * `sinJefe`. `managerId` no se toca.
 */
function armarArbol(roots: OrgChartNode[]): { raiz: Rama; todas: Rama[] } | null {
  const centro = elegirCentro(roots);
  if (!centro) return null;

  const todos = flattenOrgNodes(roots);
  const porId = new Map(todos.map((n) => [n.id, n]));

  /** Un lateral vale si su ancla existe y la cadena de «al lado de» no se muerde la cola. */
  const lateralValido = (n: OrgChartNode): boolean => {
    if (n.lateralDeId == null || n.lateralDeId === n.id || !porId.has(n.lateralDeId)) return false;
    if (n.id === centro.id) return false;
    const vistos = new Set<number>([n.id]);
    let actual: OrgChartNode | undefined = porId.get(n.lateralDeId);
    while (actual && actual.lateralDeId != null && actual.id !== centro.id) {
      if (vistos.has(actual.id)) return false;
      vistos.add(actual.id);
      actual = porId.get(actual.lateralDeId);
    }
    return true;
  };

  const lateralesPorAncla = new Map<number, OrgChartNode[]>();
  for (const n of todos) {
    if (!lateralValido(n)) continue;
    const lista = lateralesPorAncla.get(n.lateralDeId as number) ?? [];
    lista.push(n);
    lateralesPorAncla.set(n.lateralDeId as number, lista);
  }

  const puestos = new Set<number>();
  const todas: Rama[] = [];

  const crear = (
    persona: OrgChartNode,
    tipo: TipoEnlace | null,
    enlazaCon: number | null,
    nivel: number,
  ): Rama => {
    puestos.add(persona.id);
    const rama: Rama = { persona, tipo, enlazaCon, nivel, hijos: [], peso: 1, demanda: 0, t: 0, fila: 0 };
    todas.push(rama);
    for (const hijo of persona.children ?? []) {
      if (puestos.has(hijo.id) || lateralValido(hijo)) continue;
      rama.hijos.push(crear(hijo, "mando", persona.id, nivel + 1));
      colgarLaterales(hijo, rama.hijos, nivel + 1);
    }
    return rama;
  };

  /** Los laterales van justo después de su ancla, en su mismo nivel. */
  const colgarLaterales = (ancla: OrgChartNode, fila: Rama[], nivel: number) => {
    for (const lat of lateralesPorAncla.get(ancla.id) ?? []) {
      if (puestos.has(lat.id)) continue;
      fila.push(crear(lat, "lateral", ancla.id, nivel));
      colgarLaterales(lat, fila, nivel);
    }
  };

  const raiz = crear(centro, null, null, 0);

  // Grupos del primer anillo: cada reporte directo con quien lleve al costado.
  const grupos: Rama[][] = [];
  for (const rama of raiz.hijos) {
    const ultimo = grupos[grupos.length - 1];
    if (rama.tipo === "lateral" && ultimo) ultimo.push(rama);
    else grupos.push([rama]);
  }
  // Quien va al lado del propio director: primer anillo, línea punteada.
  const alLadoDelCentro: Rama[] = [];
  colgarLaterales(centro, alLadoDelCentro, 1);
  for (const rama of alLadoDelCentro) grupos.push([rama]);

  // Las demás raíces: sin jefe (o con un jefe que ya no está). Van juntas, en un
  // solo bloque del primer anillo, para que se lean como grupo y no salpicadas.
  const sueltas: Rama[] = [];
  for (const r of roots) {
    if (puestos.has(r.id) || lateralValido(r)) continue;
    sueltas.push(crear(r, "sinJefe", centro.id, 1));
    colgarLaterales(r, sueltas, 1);
  }
  // Red de seguridad: nadie se queda sin dibujar por un dato raro (un ancla que
  // cuelga de su propio lateral, ciclos). Se cuelga del centro como una raíz suelta.
  for (const n of todos) {
    if (puestos.has(n.id)) continue;
    sueltas.push(crear(n, "sinJefe", centro.id, 1));
  }
  if (sueltas.length > 0) grupos.push(sueltas);

  // Primero todos colgados del centro (para pesar el árbol entero), luego el orden.
  raiz.hijos = grupos.flat();
  pesar(raiz);
  raiz.hijos = ordenBalanceado(grupos).flat();
  return { raiz, todas };
}

/** Peso de una rama para ordenar: su gente, descontada porque afuera hay más sitio. */
function pesar(rama: Rama): number {
  const suma = rama.hijos.reduce((total, h) => total + pesar(h), 0);
  rama.peso = rama.nivel === 0 ? suma : Math.max(1, suma * 0.6);
  return rama.peso;
}

/**
 * Orden del primer anillo: el equipo más grande a la derecha, el segundo más
 * grande enfrente (a la izquierda), y el resto repartido arriba y abajo buscando
 * que pesen parecido. A los lados es donde más gente cabe apilada; y con dos
 * equipos grandes seguidos el dibujo se carga a un lado y el director deja de
 * quedar en el centro de nada.
 */
function ordenBalanceado(grupos: Rama[][]): Rama[][] {
  if (grupos.length <= 2) return grupos;
  const peso = (g: Rama[]) => g.reduce((t, r) => t + r.peso, 0);
  const porPeso = grupos
    .map((g, i) => ({ g, i, p: peso(g) }))
    .sort((a, b) => b.p - a.p || a.i - b.i);
  const [primero, segundo, ...resto] = porPeso;
  const ladoA: typeof porPeso = [];
  const ladoB: typeof porPeso = [];
  let pesoA = 0;
  let pesoB = 0;
  for (const item of resto) {
    if (pesoA <= pesoB) {
      ladoA.push(item);
      pesoA += item.p;
    } else {
      ladoB.push(item);
      pesoB += item.p;
    }
  }
  // Dentro de cada lado, los más pesados pegados a los grandes y los ligeros al
  // medio: arriba y abajo —donde menos cabe— queda la gente sin equipo.
  const alMedio = (lado: typeof porPeso) => {
    const izq: typeof porPeso = [];
    const der: typeof porPeso = [];
    lado.forEach((item, i) => (i % 2 === 0 ? izq.push(item) : der.unshift(item)));
    return [...izq, ...der];
  };
  return [primero, ...alMedio(ladoA), segundo, ...alMedio(ladoB)].map((x) => x.g);
}

/** Las ramas de cada nivel, en el orden en que se recorren los anillos. */
function porNiveles(raiz: Rama): Rama[][] {
  const niveles: Rama[][] = [];
  const visitar = (rama: Rama) => {
    for (const hijo of rama.hijos) {
      (niveles[hijo.nivel - 1] ??= []).push(hijo);
      visitar(hijo);
    }
  };
  visitar(raiz);
  return niveles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cada nivel va sobre un anillo de radios (rx[d], ry[d]) centrado en el director.
 * El anillo no es una elipse sino una **superelipse** (un rectángulo de esquinas
 * muy redondas): se pega más a la forma del lienzo, arriba y abajo las tarjetas
 * quedan en renglón y a los lados en columna, y cabe bastante más gente.
 */
type Forma = { rx: number[]; ry: number[]; pasoX: number; pasoY: number };

type Medidas = {
  tarjeta: Medida;
  centro: Medida;
  hueco: number;
  huecoAnillo: number;
  aspecto: number;
};

type Caja = { x: number; y: number; ancho: number; alto: number };

/** ¿Se tocan dos tarjetas, contando el aire que debe quedar entre ellas? */
export function seTocan(a: Caja, b: Caja, hueco = 0): boolean {
  return (
    Math.abs(a.x - b.x) < (a.ancho + b.ancho) / 2 + hueco &&
    Math.abs(a.y - b.y) < (a.alto + b.alto) / 2 + hueco
  );
}

type Colocada = Caja & { rama: Rama; angulo: number };

type Intento = {
  colocadas: Colocada[];
  forma: Forma;
  filas: number[];
  medioAncho: number;
  medioAlto: number;
  coste: number;
};

/** Coseno y seno «cuadrados»: los de la superelipse de exponente `EXPONENTE`. */
function unidad(angulo: number) {
  const c = Math.cos(angulo);
  const s = Math.sin(angulo);
  return {
    c: Math.sign(c) * Math.abs(c) ** (2 / EXPONENTE),
    s: Math.sign(s) * Math.abs(s) ** (2 / EXPONENTE),
  };
}

/** Bordes de las muestras del anillo unidad; se calculan una vez. */
const BORDES = Array.from({ length: MUESTRAS + 1 }, (_, i) => unidad((i * DOS_PI) / MUESTRAS));

function puntoLibre(rx: number, ry: number, angulo: number) {
  const u = unidad(angulo);
  return { x: rx * u.c, y: ry * u.s };
}

/**
 * Dónde cae una tarjeta. La fila 1 (cuando el nivel va alternado) queda una
 * tarjeta más afuera en el eje que manda en ese punto: a los lados, una columna
 * más allá; arriba y abajo, un renglón más allá.
 */
function punto(forma: Forma, d: number, fila: number, angulo: number, m: Medidas) {
  const u = unidad(angulo);
  const k = fila === 0 ? 0 : fila / Math.max(Math.abs(u.c), Math.abs(u.s));
  // Doble hueco: el anillo se curva hacia adentro y a la vecina de al lado le
  // faltaban un par de píxeles de aire con el hueco justo.
  return {
    x: (forma.rx[d] + k * (m.tarjeta.ancho + 2 * m.hueco)) * u.c,
    y: (forma.ry[d] + k * (m.tarjeta.alto + 2 * m.hueco)) * u.s,
  };
}

/**
 * Un anillo empaquetado: los ángulos en los que caben tarjetas seguidas, una
 * detrás de otra, desde la derecha y en el sentido de las manecillas. Se recorre
 * el anillo de verdad y se pone la siguiente tarjeta en cuanto queda libre de la
 * anterior a lo ancho **o** a lo alto. Sumar «densidades» por tramo mentía en
 * las esquinas, donde dos vecinas se separan un poco en cada eje y nada en ninguno.
 */
type Empaque = { angulos: number[]; cabe: number };

function empaquetar(rx: number, ry: number, m: Medidas): Empaque {
  const anchoUtil = m.tarjeta.ancho + m.hueco;
  const altoUtil = m.tarjeta.alto + m.hueco;
  const angulos = [0];
  let ultimo = { x: rx * BORDES[0].c, y: ry * BORDES[0].s };
  for (let i = 1; i < MUESTRAS; i += 1) {
    const p = { x: rx * BORDES[i].c, y: ry * BORDES[i].s };
    if (Math.abs(p.x - ultimo.x) >= anchoUtil || Math.abs(p.y - ultimo.y) >= altoUtil) {
      angulos.push((i * DOS_PI) / MUESTRAS);
      ultimo = p;
    }
  }
  // Al cerrar la vuelta, la última no puede montarse sobre la primera.
  const primera = { x: rx, y: 0 };
  while (angulos.length > 1) {
    const p = puntoLibre(rx, ry, angulos[angulos.length - 1]);
    if (Math.abs(p.x - primera.x) >= anchoUtil || Math.abs(p.y - primera.y) >= altoUtil) break;
    angulos.pop();
  }
  return { angulos, cabe: angulos.length };
}

/** Índice de la tarjeta empaquetada en cuyo hueco cae `angulo` (0..2π). */
function huecoDe(empaque: Empaque, angulo: number): number {
  const vuelta = ((angulo % DOS_PI) + DOS_PI) % DOS_PI;
  let lo = 0;
  let hi = empaque.angulos.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (empaque.angulos[mid] <= vuelta) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Ancho angular del hueco `k` de un empaque (el último llega hasta cerrar la vuelta). */
function anchoDeHueco(empaque: Empaque, k: number): number {
  const fin = k + 1 < empaque.angulos.length ? empaque.angulos[k + 1] : DOS_PI;
  return fin - empaque.angulos[k];
}

/** Mapa de capacidad (0..1) → ángulo: una tarjeta del anillo de referencia es 1/cabe. */
function mapaDeAngulos(empaque: Empaque) {
  return (t: number): number => {
    const vueltas = Math.floor(t);
    const pos = (t - vueltas) * empaque.cabe;
    const k = Math.min(empaque.cabe - 1, Math.floor(pos));
    return empaque.angulos[k] + (pos - k) * anchoDeHueco(empaque, k) + vueltas * DOS_PI;
  };
}

/**
 * Coloca a todos sobre anillos de una forma dada. Devuelve también cuánto del
 * anillo se pidió en total (`pedido` > 1 = no cabe: hay que crecer).
 */
function colocar(
  raiz: Rama,
  niveles: Rama[][],
  filas: number[],
  forma: Forma,
  m: Medidas,
): { colocadas: Colocada[]; pedido: number } {
  const D = niveles.length;
  // Todos los niveles comparten un mismo mapa de ángulos (el del anillo medio):
  // así el abanico de un equipo queda centrado en su jefe. Lo que cambia por
  // nivel es cuánto del mapa ocupa una tarjeta en cada punto.
  const rxMedio = forma.rx.reduce((a, b) => a + b, 0) / D;
  const ryMedio = forma.ry.reduce((a, b) => a + b, 0) / D;
  const medio = empaquetar(rxMedio, ryMedio, m);
  const empaques = niveles.map((_, d) => empaquetar(forma.rx[d], forma.ry[d], m));
  const angulos = mapaDeAngulos(medio);
  /** Cuánto mapa ocupa una tarjeta del nivel `d` colocada en `t`. */
  const unaTarjetaEn = (d: number, t: number): number => {
    const angulo = angulos(t);
    const propio = anchoDeHueco(empaques[d], huecoDe(empaques[d], angulo));
    const referencia = anchoDeHueco(medio, huecoDe(medio, angulo));
    return propio / (referencia * medio.cabe);
  };
  const cap = empaques.map((e) => e.cabe);

  // Lo que pide cada rama: su tarjeta en su anillo o su gente en el siguiente, lo
  // que más. Primero sin saber dónde cae (promedio del anillo); después, ya con
  // sitio, lo que cuesta de verdad ahí: arriba y abajo una tarjeta ocupa más mapa.
  let pedido = 1;
  let escala = 1;
  const pedir = (rama: Rama, conSitio: boolean): number => {
    const d = rama.nivel - 1;
    const propio = (conSitio ? unaTarjetaEn(d, rama.t) : 1 / cap[d]) / filas[d];
    const gente = rama.hijos.reduce((total, h) => total + pedir(h, conSitio), 0);
    rama.demanda = Math.max(propio, gente);
    return rama.demanda;
  };
  const repartir = (rama: Rama, t0: number, t1: number) => {
    rama.t = (t0 + t1) / 2;
    if (rama.hijos.length === 0) return;
    const justo = rama.hijos.reduce((total, h) => total + h.demanda, 0);
    const ancho = Math.min(t1 - t0, justo * Math.min(escala, HOLGURA_ABANICO));
    let cursor = rama.t - ancho / 2;
    for (const hijo of rama.hijos) {
      const w = (ancho * hijo.demanda) / justo;
      repartir(hijo, cursor, cursor + w);
      cursor += w;
    }
  };
  for (const conSitio of [false, true, true]) {
    pedido = raiz.hijos.reduce((total, h) => total + pedir(h, conSitio), 0);
    escala = 1 / pedido;
    // El primer reporte (el equipo más grande) queda centrado a la derecha.
    let cursor = raiz.hijos.length > 0 ? (-raiz.hijos[0].demanda * escala) / 2 : 0;
    for (const hijo of raiz.hijos) {
      const w = hijo.demanda * escala;
      repartir(hijo, cursor, cursor + w);
      cursor += w;
    }
  }

  // Filas: adentro mientras quepa; si el vecino de adentro queda muy cerca, afuera.
  niveles.forEach((nivel, d) => {
    if (filas[d] === 1) {
      for (const rama of nivel) rama.fila = 0;
      return;
    }
    const ultimo = [-Infinity, -Infinity];
    const primero: Array<number | null> = [null, null];
    for (const rama of nivel) {
      const paso = unaTarjetaEn(d, rama.t);
      const holgura = (fila: number) => {
        const atras = rama.t - ultimo[fila];
        const p = primero[fila];
        const adelante = p == null ? Infinity : p + 1 - rama.t;
        return Math.min(atras, adelante) / paso;
      };
      const fila = holgura(0) >= 0.98 ? 0 : holgura(1) >= 0.98 ? 1 : holgura(0) >= holgura(1) ? 0 : 1;
      rama.fila = fila;
      ultimo[fila] = rama.t;
      if (primero[fila] == null) primero[fila] = rama.t;
    }
  });

  const tarjetaEn = (rama: Rama, d: number): Colocada => {
    const angulo = angulos(rama.t);
    return {
      rama,
      ...punto(forma, d, rama.fila, angulo, m),
      ancho: m.tarjeta.ancho,
      alto: m.tarjeta.alto,
      angulo,
    };
  };

  // Afinado: el reparto por capacidad acierta a unos píxeles, no al píxel. Si dos
  // del mismo nivel se tocan, se separan a lo largo del anillo, poco a poco,
  // hasta que dejan de tocarse. Es local: no agranda el dibujo entero.
  niveles.forEach((nivel, d) => {
    for (let vuelta = 0; vuelta < 80; vuelta += 1) {
      const cajas = nivel.map((rama) => tarjetaEn(rama, d));
      let movio = false;
      for (let i = 0; i < nivel.length; i += 1) {
        for (let j = i + 1; j < nivel.length; j += 1) {
          if (!seTocan(cajas[i], cajas[j], m.hueco)) continue;
          const a = nivel[i];
          const b = nivel[j];
          const delta = 0.08 * unaTarjetaEn(d, (a.t + b.t) / 2);
          // ¿Quién va después en la vuelta? Ese se adelanta; el otro retrocede.
          const adelante = (((b.t - a.t) % 1) + 1) % 1 <= 0.5 ? 1 : -1;
          a.t -= delta * adelante;
          b.t += delta * adelante;
          movio = true;
        }
      }
      if (!movio) break;
    }
  });

  const colocadas: Colocada[] = [
    { rama: raiz, x: 0, y: 0, ancho: m.centro.ancho, alto: m.centro.alto, angulo: 0 },
  ];
  niveles.forEach((nivel, d) => {
    for (const rama of nivel) colocadas.push(tarjetaEn(rama, d));
  });
  return { colocadas, pedido };
}

function hayChoques(colocadas: Colocada[], m: Medidas): boolean {
  for (let i = 0; i < colocadas.length; i += 1) {
    for (let j = i + 1; j < colocadas.length; j += 1) {
      const a = colocadas[i];
      const b = colocadas[j];
      // Entre niveles se pide más aire: por ahí pasan los conectores.
      const aire = a.rama.nivel === b.rama.nivel ? m.hueco : Math.max(m.hueco, m.huecoAnillo * 0.6);
      if (seTocan(a, b, aire)) return true;
    }
  }
  return false;
}

/**
 * Busca los anillos más pequeños en los que cabe todo, con `filas[d]` filas en
 * cada nivel. Arrancan en lo mínimo (una tarjeta más su aire entre anillo y
 * anillo), con la proporción del lienzo, y crecen parejo hasta que nada se toca.
 */
function resolver(
  raiz: Rama,
  niveles: Rama[][],
  filas: number[],
  m: Medidas,
  apretarAlto: number,
): Intento | null {
  const D = niveles.length;
  const anchoUtil = m.tarjeta.ancho + m.hueco;
  const altoUtil = m.tarjeta.alto + m.hueco;
  const filasExtra = filas.reduce((total, f) => total + (f - 1), 0);
  const cx = Math.max(0, (m.centro.ancho - m.tarjeta.ancho) / 2);
  const cy = Math.max(0, (m.centro.alto - m.tarjeta.alto) / 2);
  let sx = m.tarjeta.ancho + m.huecoAnillo;
  let sy = m.tarjeta.alto + m.huecoAnillo;
  const fijoX = cx + filasExtra * anchoUtil + m.tarjeta.ancho / 2;
  const fijoY = cy + filasExtra * altoUtil + m.tarjeta.alto / 2;
  if ((fijoX + D * sx) / (fijoY + D * sy) > m.aspecto) {
    sy = ((fijoX + D * sx) / m.aspecto - fijoY) / D;
  } else {
    sx = ((fijoY + D * sy) * m.aspecto - fijoX) / D;
  }
  // Anillos más bajos que la proporción del lienzo: cuando el ancho es lo que
  // limita, estirarlos a lo alto solo deja anillos vacíos arriba y abajo.
  sy = Math.max(m.tarjeta.alto + m.huecoAnillo, sy * apretarAlto);

  let crecer = 1;
  for (let vuelta = 0; vuelta < 240; vuelta += 1) {
    const forma: Forma = { rx: [], ry: [], pasoX: sx * crecer, pasoY: sy * crecer };
    for (let d = 0; d < D; d += 1) {
      const previoX = d === 0 ? cx : forma.rx[d - 1] + (filas[d - 1] - 1) * anchoUtil;
      const previoY = d === 0 ? cy : forma.ry[d - 1] + (filas[d - 1] - 1) * altoUtil;
      forma.rx[d] = previoX + forma.pasoX;
      forma.ry[d] = previoY + forma.pasoY;
    }
    const { colocadas, pedido } = colocar(raiz, niveles, filas, forma, m);
    if (pedido <= 1.0001 && !hayChoques(colocadas, m)) {
      let mw = 0;
      let mh = 0;
      for (const c of colocadas) {
        mw = Math.max(mw, Math.abs(c.x) + c.ancho / 2);
        mh = Math.max(mh, Math.abs(c.y) + c.alto / 2);
      }
      return {
        // Copia: el siguiente intento vuelve a escribir `t` y `fila` en las mismas ramas.
        colocadas: colocadas.map((c) => ({ ...c, rama: { ...c.rama } })),
        forma,
        filas,
        medioAncho: mw,
        medioAlto: mh,
        // Manda la dimensión que limita el zoom; la otra pesa un poco para que,
        // a igual zoom, gane el dibujo más recogido.
        coste: Math.max(mw / m.aspecto, mh) + 0.15 * Math.min(mw / m.aspecto, mh),
      };
    }
    // Si falta capacidad se sabe cuánta: se salta de una vez en lugar de ir a pasitos.
    crecer *= Math.max(1.02, Math.min(1.5, pedido * 0.99));
  }
  return null;
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const xy = (p: { x: number; y: number }) => `${f1(p.x)},${f1(p.y)}`;

function trazoDe(desde: Colocada, hasta: Colocada, tipo: TipoEnlace, intento: Intento, m: Medidas): string {
  const { forma, filas } = intento;
  const anchoUtil = m.tarjeta.ancho + m.hueco;
  const altoUtil = m.tarjeta.alto + m.hueco;
  if (tipo === "lateral") {
    if (desde.rama.nivel === 0) return `M0,0 L${xy(hasta)}`;
    // Un puente punteado que se mete hacia el centro, por el aire que queda entre
    // anillos: une a los dos sin parecer línea de mando y no se esconde tras las
    // tarjetas (por fuera, el arco quedaba tapado por ellas mismas).
    let delta = hasta.angulo - desde.angulo;
    while (delta > Math.PI) delta -= DOS_PI;
    while (delta < -Math.PI) delta += DOS_PI;
    const d = Math.min(desde.rama.nivel, hasta.rama.nivel) - 1;
    const dentro = puntoLibre(
      Math.max(0, forma.rx[d] - forma.pasoX * 0.55),
      Math.max(0, forma.ry[d] - forma.pasoY * 0.55),
      desde.angulo + delta / 2,
    );
    return `M${xy(desde)} Q${xy(dentro)} ${xy(hasta)}`;
  }
  // Entra por el anillo de su nivel, a su propio ángulo: si va en la fila de
  // afuera, ese punto es justo el hueco entre sus dos vecinos de adentro.
  const dHasta = hasta.rama.nivel - 1;
  const entrada = punto(forma, dHasta, 0, hasta.angulo, m);
  const cola = hasta.rama.fila > 0 ? ` L${xy(hasta)}` : "";
  // Del centro salen radios rectos, como en una telaraña.
  if (desde.rama.nivel === 0) return `M0,0 L${xy(entrada)}${cola}`;
  const dDesde = desde.rama.nivel - 1;
  const ultimaFila = filas[dDesde] - 1;
  const salida = punto(forma, dDesde, ultimaFila, desde.angulo, m);
  const cabeza = desde.rama.fila < ultimaFila ? ` L${xy(salida)}` : "";
  const rxMedio = (forma.rx[dDesde] + ultimaFila * anchoUtil + forma.rx[dHasta]) / 2;
  const ryMedio = (forma.ry[dDesde] + ultimaFila * altoUtil + forma.ry[dHasta]) / 2;
  return (
    `M${xy(desde)}${cabeza} ` +
    `C${xy(puntoLibre(rxMedio, ryMedio, desde.angulo))} ` +
    `${xy(puntoLibre(rxMedio, ryMedio, hasta.angulo))} ${xy(entrada)}${cola}`
  );
}

/** El contorno de un anillo como `d` de un `<path>`. */
function contorno(rx: number, ry: number): string {
  const pasos = 120;
  let d = "";
  for (let i = 0; i < pasos; i += 1) {
    d += `${i === 0 ? "M" : "L"}${xy(puntoLibre(rx, ry, (i * DOS_PI) / pasos))} `;
  }
  return `${d}Z`;
}

const VACIO: DisenoRadial = {
  nodos: [],
  enlaces: [],
  anillos: [],
  medioAncho: 0,
  medioAlto: 0,
  centroId: null,
  compacto: false,
};

/** Todas las combinaciones de una o dos filas para los primeros niveles. */
function combinacionesDeFilas(niveles: Rama[][]): number[][] {
  let combos: number[][] = [[]];
  niveles.forEach((nivel, d) => {
    const puedeAlternar = d < NIVELES_ALTERNABLES && nivel.length > 2;
    combos = combos.flatMap((c) => (puedeAlternar ? [[...c, 1], [...c, 2]] : [[...c, 1]]));
  });
  return combos;
}

/**
 * Calcula el organigrama radial completo.
 *
 * `aspecto` es ancho/alto del lienzo donde se va a pintar: los anillos toman esa
 * proporción para aprovechar una pantalla apaisada.
 */
export function calcularRadial(roots: OrgChartNode[], opciones: OpcionesRadial = {}): DisenoRadial {
  const arbol = armarArbol(roots);
  if (!arbol) return VACIO;
  const { raiz, todas } = arbol;

  const compacto = opciones.tarjeta ? false : todas.length > UMBRAL_COMPACTO;
  const m: Medidas = {
    tarjeta: opciones.tarjeta ?? (compacto ? TARJETA_COMPACTA : TARJETA),
    centro: opciones.centro ?? TARJETA_CENTRO,
    hueco: opciones.hueco ?? HUECO,
    huecoAnillo: opciones.huecoAnillo ?? HUECO_ANILLO,
    aspecto: Math.min(2.6, Math.max(0.5, opciones.aspecto ?? 1.7)),
  };

  const niveles = porNiveles(raiz);
  let mejor: Intento | null = null;
  let mejorPuntaje = Infinity;
  for (const filas of combinacionesDeFilas(niveles)) {
    if (niveles.length === 0) break;
    for (const apretarAlto of [1, 0.85, 0.7]) {
      const intento = resolver(raiz, niveles, filas, m, apretarAlto);
      if (!intento) continue;
      // Alternar filas solo si de verdad gana sitio: un anillo limpio se lee mejor.
      const alternados = filas.filter((f) => f > 1).length;
      const puntaje = intento.coste * (1 + 0.05 * alternados);
      if (puntaje < mejorPuntaje) {
        mejor = intento;
        mejorPuntaje = puntaje;
      }
    }
  }
  if (!mejor) {
    // Solo el director: no hay anillos que resolver.
    return {
      ...VACIO,
      nodos: [
        {
          id: raiz.persona.id,
          persona: raiz.persona,
          nivel: 0,
          x: 0,
          y: 0,
          ancho: m.centro.ancho,
          alto: m.centro.alto,
          angulo: 0,
          fila: 0,
          enlazaCon: null,
          tipoEnlace: null,
        },
      ],
      medioAncho: m.centro.ancho / 2,
      medioAlto: m.centro.alto / 2,
      centroId: raiz.persona.id,
    };
  }

  const elegido = mejor;
  const porId = new Map(elegido.colocadas.map((c) => [c.rama.persona.id, c]));
  const nodos: NodoRadial[] = elegido.colocadas.map((c) => ({
    id: c.rama.persona.id,
    persona: c.rama.persona,
    nivel: c.rama.nivel,
    x: Math.round(c.x),
    y: Math.round(c.y),
    ancho: c.ancho,
    alto: c.alto,
    angulo: c.angulo,
    fila: c.rama.fila,
    enlazaCon: c.rama.enlazaCon,
    tipoEnlace: c.rama.tipo,
  }));
  const enlaces: EnlaceRadial[] = [];
  for (const c of elegido.colocadas) {
    const { enlazaCon, tipo } = c.rama;
    if (enlazaCon == null || tipo == null) continue;
    const desde = porId.get(enlazaCon);
    if (!desde) continue;
    enlaces.push({ de: enlazaCon, a: c.rama.persona.id, tipo, trazo: trazoDe(desde, c, tipo, elegido, m) });
  }

  return {
    nodos,
    enlaces,
    anillos: elegido.forma.rx.map((rx, d) => contorno(rx, elegido.forma.ry[d])),
    medioAncho: Math.ceil(elegido.medioAncho),
    medioAlto: Math.ceil(elegido.medioAlto),
    centroId: raiz.persona.id,
    compacto,
  };
}

/**
 * Zoom con el que el dibujo entero cabe en el lienzo, con el director en el centro.
 * No amplía más allá de `maximo`: un organigrama de cinco personas estirado a
 * pantalla completa se ve raro.
 */
export function zoomQueCabe(
  diseno: Pick<DisenoRadial, "medioAncho" | "medioAlto">,
  lienzo: Medida,
  margen: { x: number; y: number } = { x: 20, y: 36 },
  maximo = 1.15,
): number {
  if (diseno.medioAncho <= 0 || diseno.medioAlto <= 0) return 1;
  const escala = Math.min(
    (lienzo.ancho / 2 - margen.x) / diseno.medioAncho,
    (lienzo.alto / 2 - margen.y) / diseno.medioAlto,
  );
  if (!Number.isFinite(escala) || escala <= 0) return 1;
  return Math.min(maximo, escala);
}
