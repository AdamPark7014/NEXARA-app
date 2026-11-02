/**
 * Arma un diseño completo a partir de unos cuantos datos: muros, áreas, huecos, anaqueles, muebles,
 * cámaras apuntadas, acceso, alarmas, gabinete, grabador y switch.
 *
 * Lo hace el código, no la IA. La IA solo convierte una frase en estos datos (`POST generar-sitio`, unos
 * 500 tokens) y las plantillas ni siquiera la llaman. Por eso casi no gasta y sale igual cada vez: lo que
 * arma es un punto de partida editable, con las mismas piezas que se colocan a mano, y Ctrl+Z lo deshace.
 */
import { MODELOS_CAMARA, MODELOS_EQUIPO, MODELO_GENERICO, todasLasCamarasDelCatalogo, todosLosEquiposDelCatalogo, type ModeloCamara, type ModeloEquipo, type TipoCamara, type TipoEquipo } from "./catalogo";
import { agregarAbertura, agregarArea, agregarCamara, agregarEquipo, agregarMueble, agregarMuro, agregarObstaculo, agregarPersona } from "./editor";
import { canalesNvr } from "./infraestructura";
import { agregarNivel, reemplazarNivel } from "./niveles";
import { inclinacionHacia } from "./optica";
import { pegarAMuros } from "./pegado";
import { planoVacio, type MaterialPiso, type Plano, type Punto, type TipoMueble } from "./plano";

export type TipoArea = "bodega" | "oficina" | "recepcion" | "ti" | "sala" | "tienda" | "aula" | "pasillo" | "estacionamiento" | "patio" | "otro";

export type EspecArea = {
  nombre: string;
  tipo: TipoArea;
  /** 0: no lo dijo. */
  m2?: number;
  piso?: number;
  camaras?: number;
};

/** Lo que devuelve la IA o trae una plantilla. Un 0 o un vacío quiere decir «no lo dijo»: lo resuelve el código. */
export type EspecSitio = {
  anchoM?: number;
  fondoM?: number;
  alturaM?: number;
  camaras?: number;
  accesos?: number;
  barrera?: boolean;
  sismica?: number;
  sirena?: number;
  grabacionDias?: number;
  marca?: string;
  areas: EspecArea[];
};

const K = 0.02;
const px = (m: number) => m / K;
const P = (x: number, y: number): Punto => ({ x: px(x), y: px(y) });
const limita = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

const M2_TIPICO: Readonly<Record<TipoArea, number>> = { bodega: 500, oficina: 70, recepcion: 30, ti: 12, sala: 24, tienda: 200, aula: 50, pasillo: 30, estacionamiento: 300, patio: 300, otro: 40 };
const PISO: Readonly<Record<TipoArea, MaterialPiso>> = { bodega: "concreto", oficina: "madera", recepcion: "piedra", ti: "tecnico", sala: "madera", tienda: "piedra", aula: "piedra", pasillo: "piedra", estacionamiento: "asfalto", patio: "asfalto", otro: "concreto" };
const AFUERA: ReadonlySet<TipoArea> = new Set<TipoArea>(["estacionamiento", "patio"]);
/** Orden de arriba hacia abajo en la columna: lo que recibe gente, al frente. */
const ORDEN_COLUMNA: Readonly<Record<TipoArea, number>> = { ti: 0, sala: 1, otro: 2, aula: 3, oficina: 4, pasillo: 5, tienda: 6, bodega: 6, recepcion: 9, estacionamiento: 9, patio: 9 };

export const PLANTILLAS: ReadonlyArray<{ id: string; nombre: string; descripcion: string; espec: EspecSitio }> = [
  {
    id: "bodega",
    nombre: "Bodega con oficinas",
    descripcion: "Nave con anaqueles, oficinas, cuarto de TI y patio",
    espec: {
      anchoM: 32,
      fondoM: 18,
      alturaM: 6,
      accesos: 2,
      barrera: true,
      sismica: 1,
      sirena: 1,
      areas: [
        { nombre: "Bodega", tipo: "bodega", m2: 400 },
        { nombre: "Oficinas", tipo: "oficina", m2: 70 },
        { nombre: "Recepción", tipo: "recepcion", m2: 40 },
        { nombre: "Cuarto de TI", tipo: "ti", m2: 15 },
        { nombre: "Patio de maniobras", tipo: "patio", m2: 320 },
      ],
    },
  },
  {
    id: "oficinas",
    nombre: "Oficinas",
    descripcion: "Piso abierto, sala de juntas, recepción y TI",
    espec: {
      anchoM: 24,
      fondoM: 14,
      alturaM: 3,
      accesos: 1,
      sismica: 1,
      areas: [
        { nombre: "Oficinas", tipo: "oficina", m2: 200 },
        { nombre: "Sala de juntas", tipo: "sala", m2: 30 },
        { nombre: "Recepción", tipo: "recepcion", m2: 40 },
        { nombre: "Cuarto de TI", tipo: "ti", m2: 12 },
      ],
    },
  },
  {
    id: "tienda",
    nombre: "Tienda",
    descripcion: "Piso de venta, caja, almacén y estacionamiento",
    espec: {
      anchoM: 22,
      fondoM: 16,
      alturaM: 4,
      sirena: 1,
      areas: [
        { nombre: "Piso de venta", tipo: "tienda", m2: 260 },
        { nombre: "Almacén", tipo: "otro", m2: 50 },
        { nombre: "Cuarto de TI", tipo: "ti", m2: 8 },
        { nombre: "Estacionamiento", tipo: "estacionamiento", m2: 280 },
      ],
    },
  },
  {
    id: "escuela",
    nombre: "Escuela",
    descripcion: "Patio, aulas, dirección y dos pisos",
    espec: {
      anchoM: 40,
      fondoM: 16,
      alturaM: 3.2,
      accesos: 1,
      sismica: 2,
      sirena: 1,
      areas: [
        { nombre: "Pasillo y salones", tipo: "pasillo", m2: 420 },
        { nombre: "Dirección", tipo: "oficina", m2: 60 },
        { nombre: "Recepción", tipo: "recepcion", m2: 40 },
        { nombre: "Cuarto de TI", tipo: "ti", m2: 12 },
        { nombre: "Patio", tipo: "patio", m2: 500 },
        { nombre: "Salones de arriba", tipo: "pasillo", m2: 400, piso: 1 },
        { nombre: "Laboratorio", tipo: "aula", m2: 100, piso: 1 },
      ],
    },
  },
];

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Cuarto = { area: EspecArea; rect: Rect; m2: number; muroPuerta?: { id: string; t: number }; puertaId?: string };

const m2De = (a: EspecArea) => (a.m2 && a.m2 > 0 ? a.m2 : M2_TIPICO[a.tipo] ?? 40);
const centroDe = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const metrosCuadrados = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);

/** Rumbo de un punto hacia otro: 0 es arriba del plano y 90 a la derecha. */
const rumboHacia = (a: { x: number; y: number }, b: { x: number; y: number }) => ((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI + 360) % 360;

/** Reparte el edificio: el área principal a la derecha y las demás apiladas en columnas a la izquierda. */
function repartir(areas: readonly EspecArea[], W: number, D: number): Cuarto[] {
  if (!areas.length) return [];
  const orden = [...areas].sort((a, b) => m2De(b) - m2De(a));
  const principal = orden[0];
  const resto = orden.slice(1).sort((a, b) => (ORDEN_COLUMNA[a.tipo] ?? 2) - (ORDEN_COLUMNA[b.tipo] ?? 2));
  if (!resto.length) return [{ area: principal, rect: { x0: 0, y0: 0, x1: W, y1: D }, m2: W * D }];
  const sumaResto = resto.reduce((s, a) => s + m2De(a), 0);
  const columnas = Math.ceil(resto.length / 5);
  const anchoTotal = limita(W * (sumaResto / (sumaResto + m2De(principal))), Math.min(5 * columnas, W * 0.3), W * 0.55);
  const anchoCol = anchoTotal / columnas;
  const salida: Cuarto[] = [];
  for (let c = 0; c < columnas; c++) {
    const grupo = resto.filter((_, i) => Math.floor(i / 5) === c);
    const suma = grupo.reduce((s, a) => s + m2De(a), 0);
    let y = 0;
    grupo.forEach((a, i) => {
      const alto = i === grupo.length - 1 ? D - y : Math.max((D * m2De(a)) / suma, 2.6);
      const rect = { x0: c * anchoCol, y0: y, x1: (c + 1) * anchoCol, y1: y + alto };
      salida.push({ area: a, rect, m2: metrosCuadrados(rect) });
      y += alto;
    });
  }
  const rect = { x0: anchoTotal, y0: 0, x1: W, y1: D };
  salida.push({ area: principal, rect, m2: metrosCuadrados(rect) });
  return salida;
}

/** Cuántas cámaras pide cada área si nadie dijo otra cosa. */
function camarasPorArea(a: EspecArea, m2: number): number {
  if (a.camaras && a.camaras > 0) return Math.round(a.camaras);
  switch (a.tipo) {
    case "bodega":
      return limita(4 + Math.floor((m2 - 500) / 500), 2, 8);
    case "tienda":
      return limita(2 + Math.floor(m2 / 150), 2, 8);
    case "oficina":
      return m2 > 80 ? 2 : 1;
    case "patio":
    case "estacionamiento":
      return m2 > 250 ? 3 : 2;
    case "pasillo":
      return m2 > 200 ? 4 : 2;
    default:
      return 1;
  }
}

/** Ajusta al total pedido: quita de lo menos importante y agrega donde hay más metros por cámara. */
function ajustarAlTotal(cuartos: readonly Cuarto[], total: number | undefined): Map<Cuarto, number> {
  const cuenta = new Map(cuartos.map((c) => [c, camarasPorArea(c.area, c.m2)]));
  if (!total || total <= 0) return cuenta;
  const pedidas = (c: Cuarto) => Boolean(c.area.camaras && c.area.camaras > 0);
  const suma = () => [...cuenta.values()].reduce((a, b) => a + b, 0);
  let vuelta = 0;
  while (suma() > total && vuelta++ < 200) {
    const candidatos = cuartos.filter((c) => !pedidas(c) && (cuenta.get(c) ?? 0) > 0).sort((a, b) => a.m2 / (cuenta.get(a) ?? 1) - b.m2 / (cuenta.get(b) ?? 1));
    if (!candidatos.length) break;
    cuenta.set(candidatos[0], (cuenta.get(candidatos[0]) ?? 0) - 1);
  }
  while (suma() < total && vuelta++ < 400) {
    const candidatos = cuartos.filter((c) => !pedidas(c)).sort((a, b) => b.m2 / ((cuenta.get(b) ?? 0) + 1) - a.m2 / ((cuenta.get(a) ?? 0) + 1));
    if (!candidatos.length) break;
    cuenta.set(candidatos[0], (cuenta.get(candidatos[0]) ?? 0) + 1);
  }
  return cuenta;
}

/** Lugares para las cámaras de un área, en el orden en que se usan: primero esquinas opuestas y luego el perímetro, cada vez más repartido. */
function lugaresDe(r: Rect, n: number): Array<{ x: number; y: number }> {
  const m = 0.35;
  const c = centroDe(r);
  const lugares = [
    { x: r.x0 + m, y: r.y0 + m },
    { x: r.x1 - m, y: r.y1 - m },
    { x: r.x1 - m, y: r.y0 + m },
    { x: r.x0 + m, y: r.y1 - m },
    { x: c.x, y: r.y0 + m },
    { x: c.x, y: r.y1 - m },
    { x: r.x0 + m, y: c.y },
    { x: r.x1 - m, y: c.y },
  ];
  for (let partes = 4; lugares.length < n; partes *= 2) {
    for (let i = 1; i < partes; i += 2) {
      const u = i / partes;
      const x = r.x0 + (r.x1 - r.x0) * u;
      const y = r.y0 + (r.y1 - r.y0) * u;
      lugares.push({ x, y: r.y0 + m }, { x, y: r.y1 - m }, { x: r.x0 + m, y }, { x: r.x1 - m, y });
    }
  }
  return lugares;
}

const mismaMarca = (a: string, b: string | undefined) => Boolean(b) && a.trim().toLowerCase().includes(String(b).trim().toLowerCase());

/** La cámara de ese tipo, de la marca pedida si la hay en el catálogo. */
function elegirCamara(tipo: TipoCamara, marca: string | undefined): ModeloCamara {
  const todas = todasLasCamarasDelCatalogo();
  return (
    todas.find((m) => m.tipo === tipo && mismaMarca(m.marca, marca)) ??
    // De la misma marca aunque sea de otra forma: es lo que se le va a vender.
    todas.find((m) => m.tipo !== "ptz" && tipo !== "ptz" && mismaMarca(m.marca, marca)) ??
    todas.find((m) => m.tipo === tipo) ??
    MODELOS_CAMARA[0] ??
    MODELO_GENERICO
  );
}

function elegirEquipo(tipo: TipoEquipo, marca: string | undefined, cumple: (m: ModeloEquipo) => boolean = () => true): ModeloEquipo | null {
  const todos = todosLosEquiposDelCatalogo().filter((m) => m.tipo === tipo && cumple(m));
  return todos.find((m) => mismaMarca(m.marca, marca)) ?? todos.find((m) => m.fuente !== "tipo") ?? todos[0] ?? null;
}

/** Sin un grabador de esos canales en el catálogo, un genérico que dice que falta elegirlo. */
function grabadorDe(canales: number, marca: string | undefined): ModeloEquipo {
  const conCanales = (m: ModeloEquipo) => (m.datos.canales ?? 0) >= canales;
  const hay = elegirEquipo("nvr", marca, conCanales);
  if (hay) return hay;
  const n = canalesNvr(canales);
  return { id: `tipo-nvr-${n}`, tipo: "nvr", marca: "", modelo: `Grabador de ${n} canales`, descripcion: "Falta elegir el modelo", datos: { canales: n, unidades: 2, bahias: n > 16 ? 4 : 2 }, caracteristicas: [], fuente: "tipo", verificado: false };
}

type Armado = { plano: Plano; numeroCamara: number; numeros: Map<TipoEquipo, number>; avisos: string[] };

function numeroDe(a: Armado, tipo: TipoEquipo) {
  const n = (a.numeros.get(tipo) ?? 0) + 1;
  a.numeros.set(tipo, n);
  return n;
}

function ponerEquipo(a: Armado, x: number, y: number, modelo: ModeloEquipo | null, cambios?: { rumboDeg?: number }) {
  if (!modelo) return null;
  const r = agregarEquipo(a.plano, P(x, y), modelo, numeroDe(a, modelo.tipo));
  a.plano = r.plano;
  if (cambios?.rumboDeg != null && !r.equipo.gabineteId) {
    a.plano = { ...a.plano, equipos: (a.plano.equipos ?? []).map((e) => (e.id === r.equipo.id ? { ...e, rumboDeg: cambios.rumboDeg as number } : e)) };
  }
  return r.equipo;
}

function ponerCamara(a: Armado, x: number, y: number, tipo: TipoCamara, marca: string | undefined, nombre: string, hacia: { x: number; y: number }, alturaM: number, alcanceM: number, montaje: "muro" | "poste" = "muro") {
  const modelo = elegirCamara(tipo, marca);
  a.numeroCamara += 1;
  const distanciaM = limita(alcanceM, 4, 45);
  // Pegada de verdad a su muro o esquina, y no más alta que él. Mira a donde se le pidió.
  const pegado = montaje === "muro" ? pegarAMuros(a.plano, P(x, y)) : null;
  alturaM = pegado ? Math.min(alturaM, Math.round(pegado.alturaMaxM * 10) / 10) : alturaM;
  const r = agregarCamara(a.plano, pegado?.pos ?? P(x, y), modelo, {
    numero: a.numeroCamara,
    nombre,
    rumboDeg: Math.round(rumboHacia({ x, y }, hacia)),
    alturaM,
    distanciaM: Math.round(distanciaM * 10) / 10,
    inclinacionDeg: Math.round(inclinacionHacia(alturaM, distanciaM * 0.6)),
    montaje,
    esPtz: modelo.tipo === "ptz",
  });
  a.plano = r.plano;
}

const rectArea = (a: Armado, r: Rect, piso: MaterialPiso, nombre: string) => {
  const x = agregarArea(a.plano, P(r.x0, r.y0), P(r.x1, r.y1), piso);
  a.plano = x.area ? { ...x.plano, areas: (x.plano.areas ?? []).map((u) => (u.id === x.area?.id ? { ...u, nombre } : u)) } : x.plano;
};

const mueble = (a: Armado, x: number, y: number, tipo: TipoMueble, rumbo = 180) => {
  a.plano = agregarMueble(a.plano, P(x, y), tipo, rumbo).plano;
};

/** Anaqueles en filas, con pasillos, como en una bodega de verdad. */
function ponerAnaqueles(a: Armado, r: Rect, alturaM: number) {
  const ancho = r.x1 - r.x0;
  const fondo = r.y1 - r.y0;
  if (ancho < 8 || fondo < 8) return;
  const largo = ancho - 5;
  const paso = 4.4;
  const filas = Math.max(1, Math.floor((fondo - 4) / paso));
  const y0 = r.y0 + (fondo - (filas - 1) * paso) / 2;
  for (let i = 0; i < filas; i++) {
    const y = y0 + i * paso;
    const x = agregarObstaculo(a.plano, P(r.x0 + 2.5, y - 0.55), P(r.x0 + 2.5 + largo, y + 0.55), Math.min(alturaM - 1.2, 4));
    a.plano = x.obstaculo ? { ...x.plano, obstaculos: x.plano.obstaculos.map((o) => (o.id === x.obstaculo?.id ? { ...o, nombre: "Anaquel" } : o)) } : x.plano;
  }
}

function amueblar(a: Armado, c: Cuarto, alturaM: number) {
  const r = c.rect;
  const m = centroDe(r);
  const ancho = r.x1 - r.x0;
  const fondo = r.y1 - r.y0;
  switch (c.area.tipo) {
    case "bodega":
      ponerAnaqueles(a, r, alturaM);
      break;
    case "tienda":
      ponerAnaqueles(a, { ...r, y1: r.y1 - 4 }, 3);
      mueble(a, r.x0 + 3, r.y1 - 2, "mostrador");
      break;
    case "oficina":
    case "aula": {
      const cols = limita(Math.floor((ancho - 1.5) / 2.6), 1, 5);
      const filas = limita(Math.floor((fondo - 1.5) / 3), 1, 4);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < filas; j++) mueble(a, r.x0 + (ancho * (i + 0.5)) / cols, r.y0 + (fondo * (j + 0.5)) / filas, "escritorio", j % 2 ? 0 : 180);
      }
      if (c.area.tipo === "oficina") mueble(a, r.x0 + 0.6, r.y0 + 0.6, "planta");
      break;
    }
    case "sala":
      mueble(a, m.x, m.y, "mesa-juntas");
      break;
    case "recepcion":
      mueble(a, m.x, r.y0 + Math.min(fondo * 0.3, 2), "mostrador");
      mueble(a, r.x1 - 1.6, r.y1 - 1.4, "sofa", 270);
      mueble(a, r.x0 + 0.7, r.y1 - 0.7, "planta");
      break;
    case "patio":
      mueble(a, m.x, m.y, "camion");
      break;
    case "estacionamiento": {
      const n = limita(Math.floor(ancho / 3), 1, 10);
      for (let i = 0; i < n; i++) mueble(a, r.x0 + (ancho * (i + 0.5)) / n, r.y0 + Math.min(fondo * 0.3, 3), "auto", 0);
      break;
    }
    default:
  }
}

function camarasDelCuarto(a: Armado, c: Cuarto, n: number, marca: string | undefined, alturaM: number) {
  if (n <= 0) return;
  const r = c.rect;
  const centro = centroDe(r);
  const tipo: TipoCamara = c.area.tipo === "bodega" || c.area.tipo === "tienda" ? "turret" : "domo";
  const altura = c.area.tipo === "bodega" ? Math.min(alturaM - 0.5, 6) : Math.min(alturaM - 0.2, 3);
  const diagonal = Math.hypot(r.x1 - r.x0, r.y1 - r.y0);
  lugaresDe(r, n)
    .slice(0, n)
    .forEach((lugar, i) => {
      const nombre = n > 1 ? `${c.area.nombre} ${i + 1}` : c.area.nombre;
      ponerCamara(a, lugar.x, lugar.y, tipo, marca, nombre, centro, altura, n === 1 ? diagonal * 0.9 : diagonal * 0.62);
    });
}

/** Un piso completo. El de abajo además lleva el exterior, la reja y el gabinete. */
function armarPiso(a: Armado, areas: readonly EspecArea[], W: number, D: number, alturaM: number, espec: EspecSitio, planta: boolean, cuenta: (c: Cuarto[]) => Map<Cuarto, number>) {
  const adentro = areas.filter((x) => !AFUERA.has(x.tipo));
  const cuartos = repartir(adentro.length ? adentro : [{ nombre: "Interior", tipo: "otro", m2: W * D }], W, D);
  const alturaInterior = Math.min(alturaM, 3.2);
  // Afuera, al frente del edificio.
  const exteriores = areas.filter((x) => AFUERA.has(x.tipo));
  let yExterior = D;
  const cuartosAfuera: Cuarto[] = exteriores.map((x) => {
    const fondo = limita(m2De(x) / W, 6, 40);
    const rect = { x0: 0, y0: yExterior, x1: W, y1: yExterior + fondo };
    yExterior += fondo;
    return { area: x, rect, m2: metrosCuadrados(rect) };
  });

  for (const c of [...cuartos, ...cuartosAfuera]) rectArea(a, c.rect, PISO[c.area.tipo] ?? "concreto", c.area.nombre);

  // Muros de afuera.
  const muro = (x0: number, y0: number, x1: number, y1: number, extra: { alturaM: number; grosorM: number; tipo?: "muro" | "reja" }) => {
    const r = agregarMuro(a.plano, P(x0, y0), P(x1, y1), extra);
    a.plano = r.plano;
    return r.muro;
  };
  const exterior = { alturaM, grosorM: 0.25 };
  muro(0, 0, W, 0, exterior);
  muro(W, 0, W, D, exterior);
  const frente = muro(W, D, 0, D, exterior);
  const izquierda = muro(0, D, 0, 0, exterior);

  // Divisiones: una por cada columna y una entre cuartos apilados.
  const divisiones = new Map<number, { id: string }>();
  for (const c of cuartos) {
    if (c.rect.x1 < W - 0.01 && !divisiones.has(c.rect.x1)) {
      const m = muro(c.rect.x1, 0, c.rect.x1, D, { alturaM: alturaInterior, grosorM: 0.15 });
      if (m) divisiones.set(c.rect.x1, m);
    }
    if (c.rect.y0 > 0.01) muro(c.rect.x0, c.rect.y0, c.rect.x1, c.rect.y0, { alturaM: alturaInterior, grosorM: 0.15 });
  }

  // Puertas: cada cuarto a su derecha; la principal y la recepción, al frente.
  const hueco = (muroId: string, t: number, tipo: "puerta" | "ventana" | "acceso") => {
    const r = agregarAbertura(a.plano, muroId, limita(t, 0.03, 0.97), tipo);
    if (!r.error) a.plano = r.plano;
    return r.abertura?.id ?? null;
  };
  for (const c of cuartos) {
    const div = divisiones.get(c.rect.x1);
    const y = centroDe(c.rect).y;
    if (div) c.puertaId = hueco(div.id, y / D, "puerta") ?? undefined;
    if (izquierda && c.rect.x0 < 0.01 && c.area.tipo !== "ti") hueco(izquierda.id, 1 - y / D, "ventana");
  }
  const principal = cuartos[cuartos.length - 1];
  if (frente && planta) {
    const recepcion = cuartos.find((c) => c.area.tipo === "recepcion");
    if (recepcion) recepcion.puertaId = hueco(frente.id, 1 - centroDe(recepcion.rect).x / W, "puerta") ?? recepcion.puertaId;
    const centroP = centroDe(principal.rect);
    const entrada = hueco(frente.id, 1 - centroP.x / W, principal.area.tipo === "bodega" ? "acceso" : "puerta");
    if (!recepcion) principal.puertaId = entrada ?? undefined;
    if (principal.area.tipo !== "bodega") hueco(frente.id, 1 - (principal.rect.x0 + 2.5) / W, "ventana");
  }

  for (const c of [...cuartos, ...cuartosAfuera]) amueblar(a, c, alturaM);

  // Cámaras.
  const todos = [...cuartos, ...cuartosAfuera];
  const reparto = cuenta(todos);
  for (const c of cuartos) camarasDelCuarto(a, c, reparto.get(c) ?? 0, espec.marca, alturaM);
  for (const c of cuartosAfuera) {
    const n = reparto.get(c) ?? 0;
    const r = c.rect;
    const m = centroDe(r);
    const fondo = r.y1 - r.y0;
    // Balas en la fachada mirando hacia afuera, y un PTZ en poste para un patio grande.
    for (let i = 0; i < n; i++) {
      const esUltimaGrande = i === 2 && c.m2 > 250;
      if (esUltimaGrande) {
        ponerCamara(a, r.x1 - 1.5, r.y1 - 1.5, "ptz", espec.marca, `${c.area.nombre} (poste)`, m, 6, Math.max(fondo, 15), "poste");
      } else {
        const x = i === 0 ? r.x0 + (r.x1 - r.x0) * 0.25 : r.x0 + (r.x1 - r.x0) * 0.75;
        ponerCamara(a, x, r.y0 + 0.3, "bala", espec.marca, `${c.area.nombre} ${i + 1}`, { x, y: r.y1 }, Math.min(alturaM - 0.3, 3.5), Math.min(fondo, 18));
      }
    }
  }

  // Exterior: reja con su acceso, árboles y barrera.
  if (planta && cuartosAfuera.length) {
    const reja = { alturaM: 2.1, grosorM: 0.05, tipo: "reja" as const };
    const fin = yExterior;
    const m = 2;
    const puertaX = W * 0.62;
    muro(-m, -m, W + m, -m, reja);
    muro(W + m, -m, W + m, fin, reja);
    muro(-m, fin, -m, -m, reja);
    muro(W + m, fin, puertaX + 5.5, fin, reja);
    muro(puertaX, fin, -m, fin, reja);
    for (const [x, y] of [[-m - 2, D * 0.2], [-m - 2, D * 0.8], [W + m + 2, D * 0.4], [W * 0.3, -m - 2], [W * 0.7, -m - 2]] as const) mueble(a, x, y, "arbol");
    if (espec.barrera) ponerEquipo(a, puertaX + 0.2, fin, elegirEquipo("barrera", espec.marca), { rumboDeg: 90 });
  }

  // Personas de prueba, para ver cómo las capta cada cámara.
  if (planta) {
    const m = centroDe(principal.rect);
    a.plano = agregarPersona(a.plano, P(m.x, m.y));
    const recepcion = cuartos.find((c) => c.area.tipo === "recepcion");
    if (recepcion) {
      const q = centroDe(recepcion.rect);
      a.plano = agregarPersona(a.plano, P(q.x, q.y));
    }
  }
  return { cuartos, cuartosAfuera, principal };
}

export type DisenoGenerado = { raiz: Plano; resumen: string; avisos: string[]; grabacionDias: number | null };

/** Todo el diseño, listo para usarse como cualquiera dibujado a mano. */
export function generarSitio(espec: EspecSitio): DisenoGenerado {
  const areas = espec.areas.length ? espec.areas : (PLANTILLAS[0].espec.areas as EspecArea[]);
  const pisos = [...new Set(areas.map((a) => Math.max(0, Math.round(a.piso ?? 0))))].sort((x, y) => x - y);
  if (!pisos.includes(0)) pisos.unshift(0);
  const deAdentro = areas.filter((a) => !AFUERA.has(a.tipo));
  const m2Piso = Math.max(...pisos.map((p) => deAdentro.filter((a) => (a.piso ?? 0) === p).reduce((s, a) => s + m2De(a), 0)), 40);
  // Sin medidas: 1.6 de proporción, redondeado a medio metro.
  const W = espec.anchoM && espec.anchoM > 0 ? espec.anchoM : Math.round(Math.sqrt(m2Piso * 1.6) * 2) / 2;
  const D = espec.fondoM && espec.fondoM > 0 ? espec.fondoM : Math.round((m2Piso / W) * 2) / 2 || 10;
  const alturaM = espec.alturaM && espec.alturaM > 0 ? espec.alturaM : areas.some((a) => a.tipo === "bodega") ? 6 : 3;

  const avisos: string[] = [];
  if (espec.marca && !todasLasCamarasDelCatalogo().some((m) => mismaMarca(m.marca, espec.marca))) {
    avisos.push(`No hay cámaras ${espec.marca} en el catálogo: usé otras. Carga su ficha o cambia el modelo en cada cámara.`);
  }

  // El total de cámaras se reparte entre todos los pisos, midiendo cada cuarto una sola vez.
  const armado: Armado = { plano: { ...planoVacio(), escala: { metrosPorPx: K, calibracion: { a: P(0, 0), b: P(W, 0), metros: W } } }, numeroCamara: 0, numeros: new Map(), avisos };
  const planos = new Map<number, Plano>();
  const planosCuartos: Cuarto[] = [];
  const cuantosPisos = pisos.length;
  let raizBase: Plano | null = null;
  let infra: { ti: Cuarto; principal: Cuarto } | null = null;

  for (const piso of pisos) {
    armado.plano = { ...planoVacio(), escala: { metrosPorPx: K, calibracion: { a: P(0, 0), b: P(W, 0), metros: W } } };
    const areasDelPiso = areas.filter((a) => Math.max(0, Math.round(a.piso ?? 0)) === piso);
    const restantes = cuantosPisos - pisos.indexOf(piso);
    const yaPuestas = armado.numeroCamara;
    const total = espec.camaras && espec.camaras > 0 ? Math.max(0, Math.round((espec.camaras - yaPuestas) / restantes)) : undefined;
    const r = armarPiso(armado, areasDelPiso, W, D, alturaM, espec, piso === 0, (c) => ajustarAlTotal(c, total));
    planosCuartos.push(...r.cuartos);
    if (piso === 0) {
      infra = { ti: r.cuartos.find((c) => c.area.tipo === "ti") ?? r.cuartos[0], principal: r.principal };
    }
    planos.set(piso, armado.plano);
  }

  // Acceso: primero la recepción, luego el cuarto de TI y después los demás.
  const puertas = planosCuartos.filter((c) => c.puertaId).sort((a, b) => (a.area.tipo === "recepcion" ? -2 : a.area.tipo === "ti" ? -1 : 0) - (b.area.tipo === "recepcion" ? -2 : b.area.tipo === "ti" ? -1 : 0));
  const accesos = Math.max(0, Math.round(espec.accesos ?? 0));
  armado.plano = planos.get(0) as Plano;
  const terminal = elegirEquipo("terminal", undefined);
  const baseCuartos = planosCuartos.filter((c) => (c.area.piso ?? 0) === 0);
  let terminales = 0;
  for (const c of puertas.filter((x) => baseCuartos.includes(x)).slice(0, accesos)) {
    const m = centroDe(c.rect);
    const enFrente = c.area.tipo === "recepcion" || c.area === infra?.principal.area;
    const x = enFrente ? m.x + 1.3 : c.rect.x1 + 0.2;
    const y = enFrente ? D + 0.3 : m.y + 1.3;
    if (ponerEquipo(armado, x, y, terminal)) terminales += 1;
  }
  if (accesos > terminales) avisos.push(`Quedaron ${accesos - terminales} puertas de acceso por poner: el sitio no tiene tantas.`);

  // Alarmas: en muros, repartidas.
  const principal = infra?.principal;
  for (let i = 0; i < Math.round(espec.sismica ?? 0); i++) {
    const c = i === 0 && principal ? principal : baseCuartos[(i - 1 + baseCuartos.length) % baseCuartos.length];
    const m = centroDe(c.rect);
    ponerEquipo(armado, m.x, c.rect.y0 + 0.3, elegirEquipo("sismica", undefined));
  }
  for (let i = 0; i < Math.round(espec.sirena ?? 0); i++) {
    ponerEquipo(armado, W * (0.2 + i * 0.3), D + 0.35, elegirEquipo("sirena", undefined));
  }

  // Gabinete en el cuarto de TI, con lo que hace falta para las cámaras colocadas.
  const camarasTotales = armado.numeroCamara;
  if (infra) {
    const t = infra.ti.rect;
    const gab = elegirEquipo("gabinete", undefined) ?? MODELOS_EQUIPO.find((m) => m.tipo === "gabinete") ?? null;
    ponerEquipo(armado, t.x0 + 0.65, t.y0 + 0.75, gab, { rumboDeg: 90 });
    ponerEquipo(armado, t.x0 + 0.65, t.y0 + 0.75, grabadorDe(camarasTotales, espec.marca));
    const puertosHacen = camarasTotales + terminales;
    const unSwitch = elegirEquipo("switch", undefined, (m) => (m.datos.puertos ?? 0) >= 16);
    const porSwitch = unSwitch?.datos.puertos ?? 24;
    for (let i = 0; i < Math.max(1, Math.ceil(puertosHacen / porSwitch)); i++) ponerEquipo(armado, t.x0 + 0.65, t.y0 + 0.75, unSwitch);
    ponerEquipo(armado, t.x0 + 0.65, t.y0 + 0.75, elegirEquipo("ups", undefined));
  }
  planos.set(0, armado.plano);

  // Se junta el edificio. La planta baja es la raíz.
  raizBase = planos.get(0) as Plano;
  let raiz = raizBase;
  for (const piso of pisos.filter((p) => p > 0)) {
    const nuevo = agregarNivel(raiz, { nombre: `Piso ${piso}`, elevacionM: piso * Math.max(alturaM, 3.5) });
    raiz = reemplazarNivel(nuevo.raiz, nuevo.id, planos.get(piso) as Plano);
  }

  const partes = [
    `${planosCuartos.length} ${planosCuartos.length === 1 ? "área" : "áreas"} interiores`,
    `${camarasTotales} ${camarasTotales === 1 ? "cámara" : "cámaras"}`,
    terminales ? `${terminales} con control de acceso` : null,
    pisos.length > 1 ? `${pisos.length} pisos` : null,
    `${W} × ${D} m`,
  ].filter(Boolean);
  return { raiz, resumen: partes.join(", "), avisos, grabacionDias: espec.grabacionDias && espec.grabacionDias > 0 ? Math.round(espec.grabacionDias) : null };
}
