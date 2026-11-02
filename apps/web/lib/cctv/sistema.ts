/**
 * El sistema que resulta de lo colocado: de cada equipo al gabinete, con su cable, su consumo y su
 * ancho de banda. Sale de aquí lo que muestran el diagrama, la capa de cableado, el plano técnico y
 * la revisión automática. Todo es puro y en metros.
 */
import {
  ETIQUETA_TIPO_CAMARA,
  ETIQUETA_TIPO_EQUIPO,
  FAMILIA_DE_TIPO,
  PREFIJO_TIPO,
  TIPOS_DE_RACK,
  modeloPorId,
  type FamiliaEquipo,
  type ModeloCamara,
  type TipoCamara,
  type TipoEquipo,
} from "./catalogo";
import type { ResumenDiseno } from "./editor";
import { AVISO_UTP_M, LIMITE_UTP_M, METROS_POR_BOBINA, REGLAS_CABLE_POR_OMISION, WATTS_POR_TIPO, bobinas, canalesNvr, discosNecesarios, mbpsCamara, presupuestoPoe, type Grabacion } from "./infraestructura";
import { claveCamara, claveEquipo, limitesEdificio } from "./medidas";
import { listaNiveles } from "./niveles";
import { RESOLUCIONES } from "./optica";
import { aMetros, distancia, problemasDelPlano, type CamaraPlano, type EquipoPlano, type Plano, type Punto } from "./plano";
import { distanciaPuntoSegmento } from "./visibilidad";

/** Por dónde corre cada cable: define su color en el plano, la maqueta y el diagrama. */
export type ClaseCable = "video" | "acceso" | "alarmas" | "red";

export const COLOR_CABLE: Readonly<Record<ClaseCable, string>> = { video: "#0f9e86", acceso: "#d6921c", alarmas: "#d13f3f", red: "#3b5bd9" };
export const ETIQUETA_CABLE: Readonly<Record<ClaseCable, string>> = { video: "Video, Cat6 PoE", acceso: "Acceso, Cat6", alarmas: "Alarmas", red: "Red y grabación" };

const claseDeFamilia = (f: FamiliaEquipo): ClaseCable => (f === "acceso" ? "acceso" : f === "alarmas" ? "alarmas" : "red");

/* ── Consumo ─────────────────────────────────────────────────────────────────────── */

function tipoPoe(t: TipoCamara | undefined): keyof typeof WATTS_POR_TIPO {
  if (t === "ptz") return "ptz";
  if (t === "panoramica" || t === "ojo-de-pez") return "panoramica";
  if (t === "bala") return "bala";
  return "domo";
}

/** Lo que consume una cámara: el dato de su ficha o, si falta, el típico de su tipo. */
export function wattsCamara(c: CamaraPlano): number {
  const m = modeloPorId(c.productoId);
  return m?.wattsPoe ?? WATTS_POR_TIPO[c.esPtz ? "ptz" : tipoPoe(m?.tipo)];
}

function mpDe(c: CamaraPlano): number {
  const o = c.lentes[0]?.optica;
  if (!o) return 2;
  const conocida = RESOLUCIONES.find((r) => r.pxHoriz === o.pxHoriz && r.pxVert === o.pxVert);
  return conocida ? conocida.mp : (o.pxHoriz * o.pxVert) / 1_000_000;
}

/* ── Rutas de cable ──────────────────────────────────────────────────────────────── */

type Tramo = { a: Punto; b: Punto };

function largoRuta(ruta: readonly Punto[]): number {
  let t = 0;
  for (let i = 1; i < ruta.length; i++) t += distancia(ruta[i - 1], ruta[i]);
  return t;
}

/** Qué tan lejos de los muros corre una ruta: el cable va en charola pegada a ellos. */
function alejamiento(ruta: readonly Punto[], muros: readonly Tramo[]): number {
  if (!muros.length) return 0;
  let suma = 0;
  for (let i = 1; i < ruta.length; i++) {
    const a = ruta[i - 1];
    const b = ruta[i];
    const pasos = Math.max(1, Math.ceil(distancia(a, b)));
    for (let k = 0; k <= pasos; k++) {
      const t = k / pasos;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      let d = 3;
      for (const m of muros) {
        d = Math.min(d, distanciaPuntoSegmento(p, m.a, m.b));
        if (d < 0.05) break;
      }
      suma += d;
    }
  }
  return suma;
}

/** Valores donde corren muros rectos: las rutas candidatas pasan por ahí. */
function lineasDeMuros(muros: readonly Tramo[]): { xs: number[]; ys: number[] } {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const m of muros) {
    const l = distancia(m.a, m.b);
    if (l < 0.5) continue;
    if (Math.abs(m.a.x - m.b.x) < 0.05 * l) xs.add(Math.round(((m.a.x + m.b.x) / 2) * 10) / 10);
    if (Math.abs(m.a.y - m.b.y) < 0.05 * l) ys.add(Math.round(((m.a.y + m.b.y) / 2) * 10) / 10);
  }
  return { xs: [...xs].slice(0, 16), ys: [...ys].slice(0, 16) };
}

/**
 * Ruta en ángulos rectos de un equipo al gabinete, por donde más se pegue a los muros. Compara la L
 * en sus dos sentidos y las Z que pasan por cada línea de muros; el largo también cuenta.
 */
export function rutaCable(desde: Punto, hasta: Punto, muros: readonly Tramo[]): Punto[] {
  const { xs, ys } = lineasDeMuros(muros);
  const candidatas: Punto[][] = [
    [desde, { x: hasta.x, y: desde.y }, hasta],
    [desde, { x: desde.x, y: hasta.y }, hasta],
  ];
  for (const x of xs) candidatas.push([desde, { x, y: desde.y }, { x, y: hasta.y }, hasta]);
  for (const y of ys) candidatas.push([desde, { x: desde.x, y }, { x: hasta.x, y }, hasta]);
  let mejor = candidatas[0];
  let puntaje = Infinity;
  for (const r of candidatas) {
    const p = alejamiento(r, muros) + largoRuta(r) * 0.6;
    if (p < puntaje) {
      puntaje = p;
      mejor = r;
    }
  }
  return mejor.filter((p, i) => i === 0 || distancia(p, mejor[i - 1]) > 0.01);
}

/* ── Conexiones ──────────────────────────────────────────────────────────────────── */

/** Mientras los muros no cambien, cada ruta se calcula una vez: al mover un equipo solo se rehace la suya. */
const rutasPorMuros = new WeakMap<object, Map<string, Punto[]>>();

function rutaGuardada(muros: object, desde: Punto, hasta: Punto, tramos: readonly Tramo[]): Punto[] {
  let guardadas = rutasPorMuros.get(muros);
  if (!guardadas) rutasPorMuros.set(muros, (guardadas = new Map()));
  const clave = `${desde.x},${desde.y},${hasta.x},${hasta.y}`;
  let ruta = guardadas.get(clave);
  if (!ruta) {
    // Arrastrar deja muchos puntos de paso que no vuelven: no se dejan crecer.
    if (guardadas.size > 2000) guardadas.clear();
    ruta = rutaCable(desde, hasta, tramos);
    guardadas.set(clave, ruta);
  }
  return ruta;
}

/** Altura a la que corre la charola: la de los muros, sin bajar de los 2.5 m. */
function alturaCharola(plano: Plano): number {
  const alturas = plano.muros.filter((m) => m.tipo === "muro").map((m) => m.alturaM);
  return Math.max(2.5, alturas.length ? Math.min(...alturas) : 2.8);
}

export type Conexion = {
  id: string;
  clave: string;
  clase: ClaseCable;
  /** Nivel del equipo. */
  nivelId: string;
  /** Ruta en metros, en el nivel del equipo. */
  ruta: Punto[];
  alturaEquipoM: number;
  alturaCharolaM: number;
  /** Metros totales con subidas, holgura y reserva. */
  largoM: number;
  estado: "ok" | "aviso" | "excede";
};

type Ubicado = { id: string; clave: string; clase: ClaseCable; pos: Punto; alturaM: number };

/**
 * El cable de cada equipo al gabinete de su nivel; si su nivel no tiene, al de otro nivel, sumando
 * el desnivel. Lo que va adentro del gabinete no lleva ruta. Sin gabinete no hay conexiones.
 */
export function conexionesDelSistema(raiz: Plano): Conexion[] {
  const niveles = listaNiveles(raiz);
  const gabinetes = niveles.flatMap((n) => (n.plano.equipos ?? []).filter((e) => e.tipo === "gabinete").map((g) => ({ g, nivel: n.nivel, plano: n.plano })));
  if (!gabinetes.length) return [];
  const salida: Conexion[] = [];
  for (const n of niveles) {
    const { plano, nivel } = n;
    const muros = plano.muros.filter((m) => m.tipo === "muro").map((m) => ({ a: aMetros(m.a, plano.escala), b: aMetros(m.b, plano.escala) }));
    const propios = gabinetes.filter((x) => x.nivel.id === nivel.id);
    const ubicados: Ubicado[] = [
      ...plano.camaras.map((c) => ({ id: c.id, clave: claveCamara(c.numero), clase: "video" as const, pos: aMetros(c.pos, plano.escala), alturaM: c.alturaM })),
      ...(plano.equipos ?? [])
        .filter((e) => e.tipo !== "gabinete" && !e.gabineteId)
        .map((e) => ({ id: e.id, clave: claveEquipo(e), clase: claseDeFamilia(FAMILIA_DE_TIPO[e.tipo]), pos: aMetros(e.pos, plano.escala), alturaM: e.alturaM })),
    ];
    const charola = alturaCharola(plano);
    for (const u of ubicados) {
      const cercanos = (propios.length ? propios : gabinetes)
        .map((x) => ({ x, pos: aMetros(x.g.pos, x.plano.escala) }))
        .sort((p, q) => distancia(p.pos, u.pos) - distancia(q.pos, u.pos));
      const destino = cercanos[0];
      const ruta = rutaGuardada(plano.muros, u.pos, destino.pos, muros);
      const desnivel = Math.abs(destino.x.nivel.elevacionM - nivel.elevacionM);
      const verticales = Math.abs(charola - u.alturaM) + Math.abs(charola - 1.5) + desnivel;
      const largoM = (largoRuta(ruta) + verticales) * REGLAS_CABLE_POR_OMISION.holgura + REGLAS_CABLE_POR_OMISION.loopServicioM;
      salida.push({
        id: u.id,
        clave: u.clave,
        clase: u.clase,
        nivelId: nivel.id,
        ruta,
        alturaEquipoM: u.alturaM,
        alturaCharolaM: charola,
        largoM,
        estado: largoM > LIMITE_UTP_M ? "excede" : largoM > AVISO_UTP_M ? "aviso" : "ok",
      });
    }
  }
  return salida;
}

/* ── Grupos y balance ────────────────────────────────────────────────────────────── */

export type GrupoEquipo = {
  clave: string;
  familia: FamiliaEquipo | "camaras";
  tipo: TipoEquipo | TipoCamara;
  nombre: string;
  modelo: string;
  foto: string;
  cantidad: number;
  claves: string[];
  watts: number;
  mbps: number;
};

/** Foto de estudio del modelo 3D propio. */
export function fotoDeTipo(tipo: TipoEquipo | TipoCamara): string {
  if (tipo === "panoramica" || tipo === "ojo-de-pez") return "/cctv/modelos/domo.webp";
  return `/cctv/modelos/${tipo}.webp`;
}

/** Lo colocado, agrupado por modelo. Las cámaras primero. */
export function gruposDeEquipos(raiz: Plano, grabacion: Grabacion): GrupoEquipo[] {
  const grupos = new Map<string, GrupoEquipo>();
  const niveles = listaNiveles(raiz);
  for (const { plano } of niveles) {
    for (const c of plano.camaras) {
      const m: ModeloCamara | null = modeloPorId(c.productoId);
      const tipo: TipoCamara = c.esPtz ? "ptz" : (m?.tipo ?? "domo");
      const k = `cam|${c.productoId || c.modelo}`;
      const g = grupos.get(k) ?? { clave: k, familia: "camaras" as const, tipo, nombre: ETIQUETA_TIPO_CAMARA[tipo], modelo: m?.modelo ?? c.modelo, foto: fotoDeTipo(tipo), cantidad: 0, claves: [], watts: 0, mbps: 0 };
      g.cantidad += 1;
      g.claves.push(claveCamara(c.numero));
      g.watts += wattsCamara(c);
      g.mbps += mbpsCamara(mpDe(c), grabacion.codec, grabacion.fps);
      grupos.set(k, g);
    }
  }
  for (const { plano } of niveles) {
    for (const e of plano.equipos ?? []) {
      const k = `eq|${e.tipo}|${e.productoId || e.modelo}`;
      const g = grupos.get(k) ?? { clave: k, familia: FAMILIA_DE_TIPO[e.tipo], tipo: e.tipo, nombre: ETIQUETA_TIPO_EQUIPO[e.tipo], modelo: e.modelo, foto: fotoDeTipo(e.tipo), cantidad: 0, claves: [], watts: 0, mbps: 0 };
      g.cantidad += 1;
      g.claves.push(claveEquipo(e));
      g.watts += e.datos.poeW ?? 0;
      grupos.set(k, g);
    }
  }
  return [...grupos.values()].map((g) => ({ ...g, claves: [...g.claves].sort() }));
}

export type Balance = {
  camaras: number;
  /** Equipos que consumen de un puerto PoE. */
  dispositivosPoe: number;
  poeW: number;
  /** Lo que da el switch colocado; null si no hay. */
  poeDisponibleW: number | null;
  puertos: number | null;
  mbps: number;
  mbpsEntrada: number | null;
  tb: number;
  canales: number | null;
  bahias: number | null;
  discoTB: number;
  grabador: string | null;
  cableM: number;
  bobinas: number;
};

const todosLosEquipos = (raiz: Plano) => listaNiveles(raiz).flatMap((n) => n.plano.equipos ?? []);

/** Disco que se propone para sacar la capacidad de las bahías. */
export const DISCO_TB = 8;

export function balanceDelSistema(raiz: Plano, resumen: ResumenDiseno | null, conexiones: readonly Conexion[]): Balance {
  const camaras = listaNiveles(raiz).flatMap((n) => n.plano.camaras);
  const equipos = todosLosEquipos(raiz);
  const conPoe = equipos.filter((e) => (e.datos.poeW ?? 0) > 0);
  const switches = equipos.filter((e) => e.tipo === "switch");
  const grabadores = equipos.filter((e) => e.tipo === "nvr");
  const suma = (l: readonly EquipoPlano[], f: (e: EquipoPlano) => number | null | undefined) => (l.length ? l.reduce((s, e) => s + (f(e) ?? 0), 0) : null);
  const cableM = conexiones.reduce((s, c) => s + c.largoM, 0);
  return {
    camaras: camaras.length,
    dispositivosPoe: camaras.length + conPoe.length,
    poeW: camaras.reduce((s, c) => s + wattsCamara(c), 0) + conPoe.reduce((s, e) => s + (e.datos.poeW ?? 0), 0),
    poeDisponibleW: suma(switches, (e) => e.datos.poeTotalW),
    puertos: suma(switches, (e) => e.datos.puertos),
    mbps: resumen?.mbps ?? 0,
    mbpsEntrada: suma(grabadores, (e) => e.datos.mbpsEntrada),
    tb: resumen?.tb ?? 0,
    canales: suma(grabadores, (e) => e.datos.canales),
    bahias: suma(grabadores, (e) => e.datos.bahias),
    discoTB: DISCO_TB,
    grabador: grabadores[0]?.modelo.replace(/^HIKVISION\s+/i, "") ?? null,
    cableM,
    bobinas: bobinas(cableM),
  };
}

/* ── Revisión del sistema ────────────────────────────────────────────────────────── */

export type RenglonRevision = { ok: boolean; titulo: string; detalle: string };

const fmtW = (w: number) => `${w.toFixed(1)} W`;

/** Parte del edificio dentro del alcance de alguna alarma. Estimado: no descuenta los muros. */
export function coberturaDeAlarmas(plano: Plano): number | null {
  const ed = limitesEdificio(plano);
  const alarmas = (plano.equipos ?? []).filter((e) => (e.tipo === "sirena" || e.tipo === "sismica") && (e.datos.alcanceM ?? 0) > 0);
  if (!ed || !alarmas.length) return null;
  const centros = alarmas.map((a) => ({ pos: aMetros(a.pos, plano.escala), r: a.datos.alcanceM ?? 0 }));
  let dentro = 0;
  let total = 0;
  const paso = Math.max(0.5, Math.max(ed.max.x - ed.min.x, ed.max.y - ed.min.y) / 60);
  for (let x = ed.min.x + paso / 2; x < ed.max.x; x += paso) {
    for (let y = ed.min.y + paso / 2; y < ed.max.y; y += paso) {
      total += 1;
      if (centros.some((c) => distancia(c.pos, { x, y }) <= c.r)) dentro += 1;
    }
  }
  return total ? (dentro / total) * 100 : null;
}

/** Revisión con lo que hoy se puede calcular del diseño: lo que falta o no alcanza, y por cuánto. */
export function revisionDelSistema(raiz: Plano, resumen: ResumenDiseno | null, grabacion: Grabacion): RenglonRevision[] {
  const niveles = listaNiveles(raiz);
  const camaras = niveles.flatMap((n) => n.plano.camaras);
  const equipos = niveles.flatMap((n) => n.plano.equipos ?? []);
  const salida: RenglonRevision[] = [];
  const sinEscala = niveles.filter((n) => !n.plano.escala.calibracion && n.plano.muros.length).map((n) => n.nivel.nombre);
  salida.push(
    sinEscala.length
      ? { ok: false, titulo: "Escala", detalle: `Sin calibrar en ${sinEscala.join(", ")}: las medidas son aproximadas` }
      : { ok: true, titulo: "Escala", detalle: "Calibrada con una cota del sitio" },
  );
  const problemas = niveles.flatMap((n) => problemasDelPlano(n.plano));
  if (problemas.length) salida.push({ ok: false, titulo: "Plano", detalle: `${problemas.length} ${problemas.length === 1 ? "detalle" : "detalles"} por revisar` });
  if (!camaras.length && !equipos.length) return salida;

  const conexiones = conexionesDelSistema(raiz);
  const b = balanceDelSistema(raiz, resumen, conexiones);

  if (b.dispositivosPoe) {
    const minimo = Math.ceil(presupuestoPoe([b.poeW]));
    if (b.poeDisponibleW == null) salida.push({ ok: false, titulo: "Consumo PoE", detalle: `${fmtW(b.poeW)}; falta el switch: de al menos ${minimo} W con holgura` });
    else if (b.poeW > b.poeDisponibleW) salida.push({ ok: false, titulo: "Consumo PoE", detalle: `${fmtW(b.poeW)} y el switch da ${b.poeDisponibleW} W: faltan ${fmtW(b.poeW - b.poeDisponibleW)}` });
    else salida.push({ ok: true, titulo: "Consumo PoE", detalle: `${fmtW(b.poeW)} de ${b.poeDisponibleW} W del switch` });
    if (b.puertos != null && b.dispositivosPoe > b.puertos) salida.push({ ok: false, titulo: "Puertos del switch", detalle: `${b.dispositivosPoe} equipos y ${b.puertos} puertos: faltan ${b.dispositivosPoe - b.puertos}` });
  }
  if (camaras.length) {
    const nombre = camaras.length === 1 ? "cámara" : "cámaras";
    const propuesto = canalesNvr(camaras.length);
    if (b.canales == null) salida.push({ ok: false, titulo: "Canales del grabador", detalle: `${camaras.length} ${nombre}; falta colocar el grabador: grabador de ${propuesto} canales` });
    else if (camaras.length > b.canales) salida.push({ ok: false, titulo: "Canales del grabador", detalle: `Hay ${camaras.length} ${nombre} y el ${b.grabador ?? "grabador"} tiene ${b.canales} canales: se sugiere un grabador de ${propuesto} canales` });
    else salida.push({ ok: true, titulo: "Canales del grabador", detalle: `${camaras.length} ${nombre} en ${b.canales} canales del ${b.grabador ?? "grabador"}` });
    if (resumen) {
      if (b.mbpsEntrada != null && b.mbps > b.mbpsEntrada) salida.push({ ok: false, titulo: "Ancho de banda", detalle: `${Math.round(b.mbps)} Mbps y el grabador recibe ${b.mbpsEntrada} Mbps` });
      else salida.push({ ok: true, titulo: "Ancho de banda", detalle: b.mbpsEntrada != null ? `${Math.round(b.mbps)} Mbps de ${b.mbpsEntrada} Mbps de entrada` : `${Math.round(b.mbps)} Mbps de entrada al grabador` });
      const discos = discosNecesarios(resumen.tb, DISCO_TB);
      if (b.bahias != null && discos > b.bahias) salida.push({ ok: false, titulo: "Grabación", detalle: `${grabacion.retencionDias} días ocupan ${resumen.tb.toFixed(1)} TB: ${discos} discos de ${DISCO_TB} TB y el grabador tiene ${b.bahias} ${b.bahias === 1 ? "bahía" : "bahías"}` });
      else salida.push({ ok: true, titulo: "Grabación", detalle: `${grabacion.retencionDias} días ocupan ${resumen.tb.toFixed(1)} TB; ${discos} ${discos === 1 ? "disco" : "discos"} de ${DISCO_TB} TB` });
    }
  }

  const gabinetes = equipos.filter((e) => e.tipo === "gabinete");
  if (!gabinetes.length) {
    salida.push({ ok: false, titulo: "Gabinete", detalle: "Coloca el gabinete para trazar las rutas de cable y medirlas" });
  } else {
    const sueltos = equipos.filter((e) => TIPOS_DE_RACK.has(e.tipo) && !e.gabineteId);
    if (sueltos.length) salida.push({ ok: false, titulo: "Gabinete", detalle: `${sueltos.map(claveEquipo).join(", ")} fuera del gabinete` });
    for (const g of gabinetes) {
      const usadas = equipos.filter((e) => e.gabineteId === g.id).reduce((s, e) => s + Math.max(1, e.datos.unidades ?? 1), 0);
      const total = g.datos.unidades ?? 0;
      if (total && usadas > total) salida.push({ ok: false, titulo: claveEquipo(g), detalle: `${usadas} unidades en un gabinete de ${total}` });
    }
    if (conexiones.length) {
      const excede = conexiones.filter((c) => c.estado === "excede");
      const aviso = conexiones.filter((c) => c.estado === "aviso");
      const mayor = conexiones.reduce((m, c) => (c.largoM > m.largoM ? c : m), conexiones[0]);
      if (excede.length) salida.push({ ok: false, titulo: "Cable", detalle: `${excede.map((c) => c.clave).join(", ")} pasan de ${LIMITE_UTP_M} m de UTP: hace falta otro gabinete o fibra` });
      else if (aviso.length) salida.push({ ok: false, titulo: "Cable", detalle: `${aviso.map((c) => c.clave).join(", ")} pasan de ${AVISO_UTP_M} m: están al límite del UTP` });
      else salida.push({ ok: true, titulo: "Cable", detalle: `${Math.round(b.cableM)} m en total, ${b.bobinas} ${b.bobinas === 1 ? "bobina" : "bobinas"} de ${METROS_POR_BOBINA} m; el más largo mide ${Math.round(mayor.largoM)} m` });
    }
  }

  const sinPuerta = equipos.filter((e) => e.tipo === "terminal" && !e.puertaId);
  if (sinPuerta.length) salida.push({ ok: false, titulo: "Control de acceso", detalle: `${sinPuerta.map(claveEquipo).join(", ")} sin puerta ligada` });

  for (const n of niveles) {
    const pct = coberturaDeAlarmas(n.plano);
    if (pct == null) continue;
    salida.push({ ok: pct >= 95, titulo: niveles.length > 1 ? `Alarmas · ${n.nivel.nombre}` : "Alarmas", detalle: `Se escuchan en ~${Math.round(pct)} % del edificio (estimado, sin descontar muros)` });
  }
  return salida;
}

/** Prefijos presentes, para la simbología. */
export function tiposColocados(raiz: Plano): TipoEquipo[] {
  const tipos = new Set<TipoEquipo>();
  for (const e of todosLosEquipos(raiz)) tipos.add(e.tipo);
  return [...tipos].sort((a, b) => PREFIJO_TIPO[a].localeCompare(PREFIJO_TIPO[b]));
}
