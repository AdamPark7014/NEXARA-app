import { azar } from "./azar";
import { EMBLEMA_ALTO, EMBLEMA_ANCHO, SILUETA } from "./emblema-silueta";

/**
 * Circuitos del hero: el motor que dibuja en un `<canvas>` las pistas que salen del emblema.
 *
 * Tres cosas, en este orden:
 *  1. Rutas de servicio: una pista por servicio, del borde inferior del emblema a su nodo, con dobleces a 45°.
 *  2. Pistas de fondo: crecen sobre una rejilla desde los costados del emblema, sin cruzarse ni pisar el texto.
 *  3. La entrada: cada pista llega partida en trozos desalineados y de colores (un disco fragmentado) que se
 *     deslizan a su lugar; cuando el emblema termina de armarse sale un pulso hacia cada servicio.
 *
 * No sabe nada de React ni del DOM de la página: recibe medidas y devuelve controles. Todo el azar va sembrado.
 */

export type Caja = { x: number; y: number; w: number; h: number };

export type Medidas = {
  ancho: number;
  alto: number;
  /** Caja del emblema dentro del escenario. */
  emblema: Caja;
  /** Nodos de servicio: la caja de su hexágono y su color. */
  destinos: { caja: Caja; color: string }[];
  /** Zonas donde no debe pasar ninguna pista (texto, botones, etiquetas). */
  vetos: Caja[];
};

export type Opciones = {
  medir: () => Medidas | null;
  /** Segundos transcurridos de la entrada en CSS al arrancar; `null` = sin entrada (ya vista o sin movimiento). */
  entrada: number | null;
  /** Sin pulsos ni luz del cursor: solo el dibujo quieto. */
  quieto: boolean;
  /** Avisa cuando un pulso llega a su nodo. */
  alLlegar?: (indice: number) => void;
};

export type Circuitos = {
  destruir: () => void;
  /** Pausa o reanuda los pulsos de ambiente. */
  pausar: (si: boolean) => void;
  /** Manda un pulso al nodo (al pasar el cursor o enfocar). */
  pulsar: (indice: number) => void;
  /** Vuelve a medir y a trazar (cambió el tamaño). */
  ajustar: () => void;
  /** El escenario entra o sale de la vista. */
  visible: (si: boolean) => void;
};

/* Tiempos de la entrada, en segundos desde que el CSS arranca. Los mismos números viven en `ensamble.module.css`. */
export const T_ARMADO = 1.08;
export const T_NODO = 1.62;
export const T_NODO_PASO = 0.07;

const PISTA = "#22324d";
const PISTA_VIVA = "140, 186, 255";
const ESPECTRO = ["#20a385", "#6ec6d9", "#aa549a", "#f18c1c", "#fbc223", "#e2523c"];
/** Radio de las almohadillas, en px. */
const RADIO = 3.2;

type Trozo = { pts: number[]; ox: number; oy: number; ini: number; sale: number; color: string };
type Pista = {
  pts: number[];
  acum: number[];
  largo: number;
  servicio: number;
  color: string;
  /** Almohadillas (anillos) en las puntas que terminan dentro del escenario: x, y de cada una. */
  anillos: number[];
  trozos: Trozo[];
};
/** `dur` es lo que tarda la cabeza en recorrer la pista; la cola sale después. */
type Pulso = { pista: number; t0: number; dur: number; color: string; cola: number; tinte: boolean; llega?: () => void };

const expoFuera = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function acumular(pts: number[]): { acum: number[]; largo: number } {
  const acum = [0];
  let largo = 0;
  for (let i = 2; i < pts.length; i += 2) {
    largo += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    acum.push(largo);
  }
  return { acum, largo };
}

/** Punto a cierta distancia del inicio de la polilínea. */
function puntoEn(p: Pista, d: number): [number, number] {
  const { pts, acum } = p;
  if (d <= 0) return [pts[0], pts[1]];
  if (d >= p.largo) return [pts[pts.length - 2], pts[pts.length - 1]];
  let i = 1;
  while (acum[i] < d) i++;
  const u = (d - acum[i - 1]) / (acum[i] - acum[i - 1] || 1);
  const j = i * 2;
  return [pts[j - 2] + (pts[j] - pts[j - 2]) * u, pts[j - 1] + (pts[j + 1] - pts[j - 1]) * u];
}

/** Tramo de la polilínea entre dos distancias, con sus dobleces. */
function tramo(p: Pista, a: number, b: number): number[] {
  const sal: number[] = [];
  const [ax, ay] = puntoEn(p, a);
  sal.push(ax, ay);
  for (let i = 1; i < p.acum.length - 1; i++) {
    if (p.acum[i] > a && p.acum[i] < b) sal.push(p.pts[i * 2], p.pts[i * 2 + 1]);
  }
  const [bx, by] = puntoEn(p, b);
  sal.push(bx, by);
  return sal;
}

function trazar(ctx: CanvasRenderingContext2D, pts: number[], dx = 0, dy = 0) {
  ctx.beginPath();
  ctx.moveTo(pts[0] + dx, pts[1] + dy);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] + dx, pts[i + 1] + dy);
  ctx.stroke();
}

export function crearCircuitos(lienzo: HTMLCanvasElement, op: Opciones): Circuitos {
  const ctx = lienzo.getContext("2d");
  if (!ctx) return { destruir() {}, pausar() {}, pulsar() {}, ajustar() {}, visible() {} };

  const capa = document.createElement("canvas");
  const fija = document.createElement("canvas");
  const ctxCapa = capa.getContext("2d")!;
  const ctxFija = fija.getContext("2d")!;

  let m: Medidas | null = null;
  let dpr = 1;
  let pistas: Pista[] = [];
  let rutas: number[] = []; // índice de pista por servicio
  let encendidas: boolean[] = [];
  let pulsos: Pulso[] = [];
  let cuadro = 0;
  let reloj = 0; // temporizador de ambiente
  let vivo = true;
  let aLaVista = true;
  let enPausa = false;
  let puntero: [number, number] | null = null;
  let punteroSucio = false;
  let centro: [number, number] = [0, 0];

  // Reloj de la entrada: `t` son segundos desde que arrancó el CSS.
  const arranque = performance.now();
  const desfase = op.entrada ?? 0;
  const ahora = () => (performance.now() - arranque) / 1000 + desfase;
  const conEntrada = op.entrada !== null && op.entrada < 2.2 && !op.quieto;
  /** Momento en que todos los trozos ya están en su lugar. */
  let finArmado = conEntrada ? Math.max(T_ARMADO, desfase + 0.9) : 0;
  let entradaLista = !conEntrada;
  /** Aparición suave cuando no hay entrada. */
  const iniVelo = ahora();

  /* ── Geometría ─────────────────────────────────────────────────────────── */

  function trazarTodo() {
    m = op.medir();
    if (!m || m.ancho < 10 || m.alto < 10) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [lienzo, capa, fija]) {
      c.width = Math.round(m.ancho * dpr);
      c.height = Math.round(m.alto * dpr);
    }
    const r = azar(7 + Math.round(m.ancho / 40));
    const e = m.emblema;
    const sx = e.w / EMBLEMA_ANCHO;
    const sy = e.h / EMBLEMA_ALTO;
    const sil = SILUETA.map(([x, y]) => [e.x + x * sx, e.y + y * sy] as [number, number]);
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    centro = [cx, cy];
    const movil = m.ancho < 640;

    /** Cruces de una recta vertical (o horizontal) con el contorno del emblema. */
    const cruces = (valor: number, vertical: boolean): number[] => {
      const sal: number[] = [];
      for (let i = 0; i < sil.length; i++) {
        const a = sil[i];
        const b = sil[(i + 1) % sil.length];
        const [a0, a1, b0, b1] = vertical ? [a[0], a[1], b[0], b[1]] : [a[1], a[0], b[1], b[0]];
        if ((a0 <= valor && b0 > valor) || (b0 <= valor && a0 > valor)) sal.push(a1 + ((valor - a0) / (b0 - a0)) * (b1 - a1));
      }
      return sal;
    };
    const dentro = (x: number, y: number) => {
      const xs = cruces(y, false);
      let n = 0;
      for (const v of xs) if (v > x) n++;
      return n % 2 === 1;
    };

    const nuevas: Pista[] = [];
    const agregar = (pts: number[], servicio: number, color: string, almohadilla: boolean, almohadillaIni = false) => {
      const { acum, largo } = acumular(pts);
      if (largo < 8) return -1;
      // La almohadilla es un anillo: la pista llega a su orilla, no a su centro.
      const anillos: number[] = [];
      const L = pts.length;
      if (almohadilla) {
        anillos.push(pts[L - 2], pts[L - 1]);
        const d = Math.hypot(pts[L - 2] - pts[L - 4], pts[L - 1] - pts[L - 3]) || 1;
        pts[L - 2] -= ((pts[L - 2] - pts[L - 4]) / d) * RADIO;
        pts[L - 1] -= ((pts[L - 1] - pts[L - 3]) / d) * RADIO;
      }
      if (almohadillaIni) {
        anillos.push(pts[0], pts[1]);
        const d = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) || 1;
        pts[0] += ((pts[2] - pts[0]) / d) * RADIO;
        pts[1] += ((pts[3] - pts[1]) / d) * RADIO;
      }
      const medida = acumular(pts);
      nuevas.push({ pts, acum: medida.acum, largo: medida.largo, servicio, color, anillos, trozos: [] });
      return nuevas.length - 1;
    };

    /* 1. Rutas de servicio: abanico desde el borde inferior del emblema. */
    const orden = m.destinos.map((d, i) => ({ i, x: d.caja.x + d.caja.w / 2, y: d.caja.y + 1 })).sort((a, b) => a.x - b.x);
    const n = orden.length;
    const paso = Math.min(e.w * 0.125, 26);
    const base = e.y + e.h + (movil ? 9 : 13);
    const sep = movil ? 7 : 9;
    const izq = orden.filter((o) => o.x < cx - 2);
    const der = orden.filter((o) => o.x > cx + 2).reverse();
    const carril = new Map<number, number>();
    izq.forEach((o, k) => carril.set(o.i, k));
    der.forEach((o, k) => carril.set(o.i, k));
    rutas = new Array(m.destinos.length).fill(-1);
    orden.forEach((o, k) => {
      const px = cx + (k - (n - 1) / 2) * paso;
      const fondo = Math.max(...cruces(px, true), e.y + e.h * 0.6);
      const y0 = fondo - 5;
      let pts: number[];
      if (Math.abs(o.x - px) < 2) {
        pts = [px, y0, px, o.y];
      } else {
        const s = o.x < px ? -1 : 1;
        const L = base + (carril.get(o.i) ?? 0) * sep;
        const ch = Math.min(movil ? 7 : 10, Math.abs(o.x - px) / 2);
        pts = [px, y0, px, L - ch, px + s * ch, L, o.x - s * ch, L, o.x, L + ch, o.x, o.y];
      }
      rutas[o.i] = agregar(pts, o.i, m!.destinos[o.i].color, false);
    });

    /* 2. Pistas de fondo sobre una rejilla, con ocupación para que no se crucen. */
    const g = movil ? 10 : 12;
    const ox = (((cx % g) + g) % g) - g;
    const oy = (((cy % g) + g) % g) - g;
    const cols = Math.ceil((m.ancho - ox) / g) + 1;
    const filas = Math.ceil((m.alto - oy) / g) + 1;
    const ocupada = new Uint8Array(cols * filas);
    const diagonal = new Uint8Array(cols * filas);
    const X = (i: number) => ox + i * g;
    const Y = (j: number) => oy + j * g;
    const marcar = (c: Caja, margen: number) => {
      const i0 = Math.max(0, Math.floor((c.x - margen - ox) / g));
      const i1 = Math.min(cols - 1, Math.ceil((c.x + c.w + margen - ox) / g));
      const j0 = Math.max(0, Math.floor((c.y - margen - oy) / g));
      const j1 = Math.min(filas - 1, Math.ceil((c.y + c.h + margen - oy) / g));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ocupada[j * cols + i] = 1;
    };
    for (const v of m.vetos) marcar(v, g * 1.2);
    marcar({ x: 0, y: 0, w: m.ancho, h: 56 }, 0); // la barra de navegación queda limpia
    for (const d of m.destinos) marcar(d.caja, g * 0.8);
    // El emblema y un respiro alrededor.
    for (let j = 0; j < filas; j++) {
      for (let i = 0; i < cols; i++) {
        if (dentro(X(i), Y(j))) ocupada[j * cols + i] = 1;
      }
    }
    // Las rutas de servicio, con una celda de holgura.
    for (const p of nuevas) {
      for (let d = 0; d <= p.largo; d += g / 2) {
        const [x, y] = puntoEn(p, d);
        marcar({ x, y, w: 0, h: 0 }, g * 0.75);
      }
    }

    const libre = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < filas && !ocupada[j * cols + i];
    const fuera = (i: number, j: number) => i < 0 || j < 0 || i >= cols || j >= filas;

    /** Hace crecer una pista desde una celda. `s` es hacia dónde se aleja del emblema. */
    const crecer = (i: number, j: number, s: number, inicio: number[] | null, maximo: number, sesgo: number) => {
      if (!libre(i, j)) return;
      const celdas: number[] = [i, j];
      ocupada[j * cols + i] = 2;
      let dx = s;
      let dy = 0;
      let recto = 2 + Math.floor(r() * 4);
      let salio = false;
      for (let k = 0; k < maximo; k++) {
        // Dobleces de 45°: horizontal ↔ diagonal ↔ vertical. Nunca un ángulo recto.
        const dobleces: [number, number][] = [];
        if (dx !== 0 && dy === 0) {
          const a = r() < 0.5 + sesgo ? 1 : -1;
          dobleces.push([dx, a], [dx, -a]);
        } else if (dx !== 0 && dy !== 0) {
          dobleces.push([dx, 0]);
          if (r() < 0.3) dobleces.unshift([0, dy]);
        } else {
          dobleces.push([s, dy]);
        }
        const sigue: [number, number] = [dx, dy];
        const candidatos = recto > 0 || r() < 0.8 ? [sigue, ...dobleces] : [...dobleces, sigue];
        let paso: [number, number] | null = null;
        for (const [ax, ay] of candidatos) {
          const ni = i + ax;
          const nj = j + ay;
          if (fuera(ni, nj)) {
            paso = [ax, ay];
            salio = true;
            break;
          }
          if (!libre(ni, nj)) continue;
          if (ax !== 0 && ay !== 0) {
            const q = Math.min(j, nj) * cols + Math.min(i, ni);
            const tipo = ax === ay ? 1 : 2;
            if (diagonal[q] && diagonal[q] !== tipo) continue;
            diagonal[q] = tipo;
          }
          paso = [ax, ay];
          break;
        }
        if (!paso) break;
        if (paso[0] !== dx || paso[1] !== dy) recto = 2 + Math.floor(r() * 5);
        else recto--;
        [dx, dy] = paso;
        i += dx;
        j += dy;
        celdas.push(i, j);
        if (salio) break;
        ocupada[j * cols + i] = 2;
        if (k > 5 && r() < 0.03) break;
      }
      if (celdas.length < 10) {
        // Muy corta: no se dibuja y devuelve sus celdas.
        for (let k = 0; k < celdas.length; k += 2) {
          if (!fuera(celdas[k], celdas[k + 1])) ocupada[celdas[k + 1] * cols + celdas[k]] = 0;
        }
        return;
      }
      // De celdas a puntos, fundiendo los pasos en línea.
      const pts: number[] = inicio ? [...inicio] : [];
      for (let k = 0; k < celdas.length; k += 2) {
        const x = X(celdas[k]);
        const y = Y(celdas[k + 1]);
        const L = pts.length;
        if (L >= 4) {
          const ux = pts[L - 2] - pts[L - 4];
          const uy = pts[L - 1] - pts[L - 3];
          const vx = x - pts[L - 2];
          const vy = y - pts[L - 1];
          if (Math.abs(ux * vy - uy * vx) < 0.01 && ux * vx + uy * vy > 0) {
            pts[L - 2] = x;
            pts[L - 1] = y;
            continue;
          }
        }
        pts.push(x, y);
      }
      agregar(pts, -1, PISTA, !salio, !inicio);
    };

    // Puertos en los dos costados del emblema, de arriba abajo y alternando lado.
    const j0 = Math.ceil((e.y + e.h * 0.12 - oy) / g);
    const j1 = Math.floor((e.y + e.h * 0.84 - oy) / g);
    const puertos: [number, number][] = [];
    for (let j = j0; j <= j1; j++) for (const s of [-1, 1]) puertos.push([j, s]);
    for (let k = puertos.length - 1; k > 0; k--) {
      const q = Math.floor(r() * (k + 1));
      [puertos[k], puertos[q]] = [puertos[q], puertos[k]];
    }
    for (const [j, s] of puertos) {
      if (r() < 0.12) continue;
      const y = Y(j);
      const xs = cruces(y, false);
      if (xs.length < 2) continue;
      const borde = s < 0 ? Math.min(...xs) : Math.max(...xs);
      let i = s < 0 ? Math.floor((borde - ox) / g) : Math.ceil((borde - ox) / g);
      while (!fuera(i, j) && dentro(X(i), y)) i += s;
      if (fuera(i, j) || !libre(i, j)) continue;
      const sesgo = limitar(((y - cy) / e.h) * 1.1, -0.42, 0.42);
      crecer(i, j, s, [borde - s * 6, y], 18 + Math.floor(r() * cols), sesgo);
    }
    // Islas: tramos sueltos en las orillas, con almohadilla en las dos puntas.
    const islas = movil ? 4 : Math.round(m.ancho / 100);
    let hechas = 0;
    for (let k = 0; k < islas * 5 && hechas < islas; k++) {
      const i = Math.floor(r() * cols);
      const j = Math.floor(r() * filas);
      if (Math.abs(X(i) - cx) < e.w * 1.1) continue;
      const antes = nuevas.length;
      crecer(i, j, X(i) < cx ? -1 : 1, null, 10 + Math.floor(r() * 26), 0);
      if (nuevas.length > antes) hechas++;
    }

    /* 3. Trozos para la entrada: cada pista partida, con su desalineación en múltiplos de la rejilla. */
    const lejosMax = Math.hypot(Math.max(cx, m.ancho - cx), Math.max(cy, m.alto - cy));
    for (const p of nuevas) {
      const cortes = Math.max(1, Math.round(p.largo / (g * (2.6 + r() * 2.4))));
      for (let k = 0; k < cortes; k++) {
        const a = (p.largo * k) / cortes;
        const b = (p.largo * (k + 1)) / cortes;
        const pts = tramo(p, a, b);
        const [mx, my] = puntoEn(p, (a + b) / 2);
        const lejos = Math.hypot(mx - cx, my - cy) / lejosMax;
        const ventana = Math.max(0.26, finArmado - desfase - 0.64);
        const salto = () => (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 3)) * g;
        const horizontal = Math.abs(pts[pts.length - 2] - pts[0]) > Math.abs(pts[pts.length - 1] - pts[1]);
        p.trozos.push({
          pts,
          ox: horizontal ? (r() - 0.5) * 4 * g : salto(),
          oy: horizontal ? salto() : (r() - 0.5) * 4 * g,
          ini: desfase + r() * 0.16,
          // Lo de afuera se acomoda primero; lo pegado al emblema, al final.
          sale: desfase + 0.06 + (1 - limitar(lejos * 1.5, 0, 1)) * ventana + r() * 0.08,
          color: ESPECTRO[Math.floor(r() * ESPECTRO.length)],
        });
      }
    }

    pistas = nuevas;
    if (encendidas.length !== m.destinos.length) encendidas = m.destinos.map(() => !conEntrada);
    pintarCapa(entradaLista ? Infinity : ahora());
    pintarFija();
  }

  /* ── Pintura ───────────────────────────────────────────────────────────── */

  /** Pistas y almohadillas en la capa con velo radial. Durante la entrada, cada trozo va donde le toca en `t`. */
  function pintarCapa(t: number) {
    if (!m) return;
    const c = ctxCapa;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, m.ancho, m.alto);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = m.ancho < 640 ? 1.1 : 1.25;
    const armado = t === Infinity;
    for (const p of pistas) {
      if (armado) {
        c.globalAlpha = 1;
        c.strokeStyle = PISTA;
        trazar(c, p.pts);
      } else {
        for (const z of p.trozos) {
          const aparece = limitar((t - z.ini) / 0.2, 0, 1);
          if (aparece <= 0) continue;
          const u = limitar((t - z.sale) / 0.5, 0, 1);
          const e = expoFuera(u);
          const dx = z.ox * (1 - e);
          const dy = z.oy * (1 - e);
          const fijo = limitar((u - 0.55) / 0.45, 0, 1);
          if (fijo < 1) {
            c.globalAlpha = aparece * (1 - fijo) * 0.85;
            c.strokeStyle = z.color;
            trazar(c, z.pts, dx, dy);
          }
          if (fijo > 0) {
            c.globalAlpha = fijo;
            c.strokeStyle = PISTA;
            trazar(c, z.pts, dx, dy);
            // Chispazo al encajar.
            const chispa = 1 - Math.abs(fijo - 0.5) * 2;
            if (chispa > 0) {
              c.globalAlpha = chispa * 0.55;
              c.strokeStyle = "#cfe3ff";
              trazar(c, z.pts, dx, dy);
            }
          }
        }
      }
      if (p.anillos.length) {
        const listo = armado ? 1 : limitar((t - finArmado + 0.25) / 0.25, 0, 1);
        if (listo > 0) {
          c.globalAlpha = listo;
          c.strokeStyle = PISTA;
          for (let k = 0; k < p.anillos.length; k += 2) {
            c.beginPath();
            c.arc(p.anillos[k], p.anillos[k + 1], RADIO, 0, Math.PI * 2);
            c.stroke();
          }
        }
      }
    }
    // Velo: las pistas se apagan al alejarse del emblema y hacia el pie del escenario.
    c.globalAlpha = 1;
    c.globalCompositeOperation = "destination-in";
    const radio = Math.max(m.ancho, m.alto) * 0.78;
    const velo = c.createRadialGradient(centro[0], centro[1], 0, centro[0], centro[1], radio);
    velo.addColorStop(0, "rgba(0,0,0,1)");
    velo.addColorStop(0.42, "rgba(0,0,0,0.78)");
    velo.addColorStop(1, "rgba(0,0,0,0.2)");
    c.fillStyle = velo;
    c.fillRect(0, 0, m.ancho, m.alto);
    c.globalCompositeOperation = "source-over";
  }

  /** Capa fija del reposo: pistas con velo + las rutas de servicio ya encendidas, en su color. */
  function pintarFija() {
    if (!m) return;
    const c = ctxFija;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, fija.width, fija.height);
    c.drawImage(capa, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = 1.4;
    rutas.forEach((idx, j) => {
      if (idx < 0 || !encendidas[j]) return;
      c.globalAlpha = 0.62;
      c.strokeStyle = pistas[idx].color;
      trazar(c, pistas[idx].pts);
    });
    c.globalAlpha = 1;
  }

  function pintar() {
    cuadro = 0;
    if (!m || !vivo) return;
    const t = ahora();
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, lienzo.width, lienzo.height);

    /** El velo de aparición sigue a medias: hay que pintar otro cuadro aunque no haya pulsos ni cursor. */
    let velando = false;
    if (!entradaLista) {
      pintarCapa(t);
      if (t >= finArmado + 0.1) {
        entradaLista = true;
        pintarCapa(Infinity);
        pintarFija();
      }
      ctx!.drawImage(capa, 0, 0);
    } else {
      // Sin entrada, las pistas aparecen de un velo corto en vez de brincar.
      const velo = conEntrada || op.quieto ? 1 : limitar((t - iniVelo) / 0.6, 0, 1);
      ctx!.globalAlpha = velo;
      ctx!.drawImage(fija, 0, 0);
      ctx!.globalAlpha = 1;
      velando = velo < 1;
    }

    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.lineCap = "round";
    ctx!.lineJoin = "round";

    // Luz del cursor: las pistas cercanas se avivan.
    if (puntero && entradaLista) {
      const luz = ctx!.createRadialGradient(puntero[0], puntero[1], 0, puntero[0], puntero[1], 190);
      luz.addColorStop(0, `rgba(${PISTA_VIVA}, 0.85)`);
      luz.addColorStop(1, `rgba(${PISTA_VIVA}, 0)`);
      ctx!.strokeStyle = luz;
      ctx!.lineWidth = 1.3;
      for (const p of pistas) if (p.servicio < 0) trazar(ctx!, p.pts);
    }
    punteroSucio = false;

    // Pulsos: cola que se desvanece y cabeza con brillo.
    const siguen: Pulso[] = [];
    for (const q of pulsos) {
      const p = pistas[q.pista];
      if (!p) continue;
      const u = (t - q.t0) / q.dur;
      if (u < 0) {
        siguen.push(q);
        continue;
      }
      const cabeza = u * p.largo;
      const vive = cabeza < p.largo + q.cola;
      if (q.tinte && cabeza < p.largo) {
        // La ruta se va tiñendo detrás del pulso.
        ctx!.globalAlpha = 0.62;
        ctx!.strokeStyle = q.color;
        ctx!.lineWidth = 1.4;
        trazar(ctx!, tramo(p, 0, Math.min(p.largo, cabeza)));
      }
      const N = 9;
      for (let k = 0; k < N; k++) {
        const a = cabeza - q.cola * (1 - k / N);
        const b = cabeza - q.cola * (1 - (k + 1) / N);
        if (b <= 0 || a >= p.largo) continue;
        ctx!.globalAlpha = Math.pow((k + 1) / N, 2) * 0.95;
        ctx!.strokeStyle = q.color;
        ctx!.lineWidth = 1.9;
        trazar(ctx!, tramo(p, Math.max(0, a), Math.min(p.largo, b)));
      }
      if (cabeza <= p.largo) {
        const [hx, hy] = puntoEn(p, cabeza);
        const brillo = ctx!.createRadialGradient(hx, hy, 0, hx, hy, 9);
        brillo.addColorStop(0, "rgba(255,255,255,0.9)");
        brillo.addColorStop(0.25, q.color);
        brillo.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.globalCompositeOperation = "lighter";
        ctx!.globalAlpha = 0.9;
        ctx!.fillStyle = brillo;
        ctx!.beginPath();
        ctx!.arc(hx, hy, 9, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalCompositeOperation = "source-over";
      }
      if (q.llega && cabeza >= p.largo) {
        q.llega();
        q.llega = undefined;
      }
      if (vive) siguen.push(q);
    }
    ctx!.globalAlpha = 1;
    pulsos = siguen;

    if (!entradaLista || pulsos.length || punteroSucio || velando) pedir();
  }

  function pedir() {
    if (!cuadro && vivo && aLaVista) cuadro = requestAnimationFrame(pintar);
  }

  /* ── Pulsos ────────────────────────────────────────────────────────────── */

  function pulsoServicio(j: number, cuando: number, dur?: number) {
    const idx = rutas[j];
    if (idx === undefined || idx < 0) return;
    const p = pistas[idx];
    const d = dur ?? limitar(p.largo / 760, 0.3, 0.62);
    pulsos.push({
      pista: idx,
      t0: cuando,
      dur: d,
      color: p.color,
      cola: Math.min(90, p.largo * 0.5),
      tinte: !encendidas[j],
      llega: () => {
        if (!encendidas[j]) {
          encendidas[j] = true;
          pintarFija();
        }
        op.alLlegar?.(j);
      },
    });
    pedir();
  }

  function ambiente() {
    window.clearTimeout(reloj);
    if (!vivo || op.quieto || enPausa || !aLaVista || document.hidden) return;
    reloj = window.setTimeout(
      () => {
        if (entradaLista && pistas.length) {
          if (Math.random() < 0.68 && rutas.length) {
            pulsoServicio(Math.floor(Math.random() * rutas.length), ahora());
          } else {
            const fondo = pistas.map((p, i) => (p.servicio < 0 && p.largo > 120 ? i : -1)).filter((i) => i >= 0);
            if (fondo.length) {
              const idx = fondo[Math.floor(Math.random() * fondo.length)];
              pulsos.push({ pista: idx, t0: ahora(), dur: limitar(pistas[idx].largo / 520, 0.5, 1.6), color: `rgb(${PISTA_VIVA})`, cola: 70, tinte: false });
              pedir();
            }
          }
        }
        ambiente();
      },
      1100 + Math.random() * 1500,
    );
  }

  /* ── Arranque ──────────────────────────────────────────────────────────── */

  trazarTodo();
  if (conEntrada) {
    // El pulso de cada servicio llega justo cuando el CSS enciende su nodo (o al terminar de armar, si vamos tarde).
    const medidas = m as Medidas | null; // `trazarTodo` ya lo llenó; el compilador no sigue esa asignación
    const ordenX = (medidas?.destinos ?? []).map((d, i) => ({ i, x: d.caja.x })).sort((a, b) => a.x - b.x);
    ordenX.forEach((o, k) => {
      const idx = rutas[o.i];
      if (idx < 0) return;
      const dur = limitar(pistas[idx].largo / 760, 0.26, 0.42);
      const llegada = Math.max(T_NODO, finArmado + 0.1 + dur) + k * T_NODO_PASO;
      pulsoServicio(o.i, llegada - dur, dur);
    });
  }
  pedir();
  ambiente();

  const alMover = (ev: PointerEvent) => {
    if (op.quieto || ev.pointerType === "touch") return;
    const caja = lienzo.getBoundingClientRect();
    puntero = [ev.clientX - caja.left, ev.clientY - caja.top];
    punteroSucio = true;
    pedir();
  };
  const alSalir = () => {
    puntero = null;
    punteroSucio = true;
    pedir();
  };
  const alOcultar = () => {
    if (!document.hidden) {
      pedir();
      ambiente();
    }
  };
  const escenario = lienzo.parentElement ?? lienzo;
  escenario.addEventListener("pointermove", alMover, { passive: true });
  escenario.addEventListener("pointerleave", alSalir, { passive: true });
  document.addEventListener("visibilitychange", alOcultar);

  return {
    destruir() {
      vivo = false;
      cancelAnimationFrame(cuadro);
      window.clearTimeout(reloj);
      escenario.removeEventListener("pointermove", alMover);
      escenario.removeEventListener("pointerleave", alSalir);
      document.removeEventListener("visibilitychange", alOcultar);
    },
    pausar(si) {
      enPausa = si;
      if (si) window.clearTimeout(reloj);
      else ambiente();
    },
    pulsar(j) {
      if (op.quieto || !entradaLista) return;
      pulsoServicio(j, ahora());
    },
    ajustar() {
      const antes = m;
      const nuevo = op.medir();
      if (!nuevo) return;
      if (antes && !entradaLista && antes.ancho === nuevo.ancho) return; // a media entrada no se rehace el trazo
      if (!entradaLista) {
        entradaLista = true;
        finArmado = 0;
      }
      encendidas = encendidas.map(() => true);
      pulsos = [];
      trazarTodo();
      pedir();
    },
    visible(si) {
      aLaVista = si;
      if (si) {
        pedir();
        ambiente();
      } else {
        window.clearTimeout(reloj);
      }
    },
  };
}
