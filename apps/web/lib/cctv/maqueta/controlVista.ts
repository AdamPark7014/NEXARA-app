/**
 * Cómo se mueve la maqueta con la mano, sin modos ni botones que cambiar. Pedido de Adam, 02-11-2026:
 * «muy rápido y fácil con el mouse o el touchpad, tipo Apple».
 *
 *              Mouse                 Touchpad            Táctil
 *   Girar      arrastrar             clic y arrastrar    un dedo o torcer dos
 *   Deslizar   clic derecho          dos dedos           dos dedos
 *   Acercar    rueda                 pellizcar           pellizcar
 *
 * Mirando desde arriba es un plano: arrastrar lo desliza y el clic derecho lo gira. Se acerca hacia
 * donde apunta el cursor, lo que se desliza sigue pegado al cursor y lo que se suelta en movimiento
 * sigue un poco y frena solo.
 */
import * as THREE from "three";
import { clasificarRueda, factorDeRueda, gestoDeBoton, type EstadoRueda, type Gesto } from "../gestos";

export type { Gesto };

export type AvisosControl = {
  /** La vista se movió: hay que pintar. */
  alCambiar: () => void;
  /** Alguien tomó el control: se cancela cualquier vuelo en curso. */
  alEmpezar?: () => void;
  /** Para el cursor. */
  alArrastrar?: (activo: boolean) => void;
  /** Para saber cuándo ya aprendió a moverse. */
  alUsar?: (g: Gesto) => void;
  /** Girar alrededor de lo que se señala solo si eso es parte del sitio. */
  puntoValido?: (p: THREE.Vector3) => boolean;
};

const POLAR_MIN = 0.012;
const POLAR_MAX = 1.5;
/** Por debajo de esto ya se considera que se ve desde arriba. */
export const POLAR_DESDE_ARRIBA = 0.1;
const UMBRAL_PX = 3;
const TAU_GIRO = 0.022;
const TAU_ENDEREZAR = 0.11;
const TAU_RUEDA = 0.075;
const TAU_FRENO = 0.26;
const VENTANA_INERCIA_MS = 90;
const ARRIBA = new THREE.Vector3(0, 1, 0);

type Puntero = { x: number; y: number };
type Muestra = { t: number; az: number; pol: number; px: number; pz: number };

export class ControlVista {
  readonly target = new THREE.Vector3();
  enabled = true;
  minDistance = 0.6;
  maxDistance = 400;

  private readonly punteros = new Map<number, Puntero>();
  private gesto: Exclude<Gesto, "acercar"> | null = null;
  private pendiente = false;
  private inicio: Puntero = { x: 0, y: 0 };
  private tipoPuntero = "mouse";
  private pivote: THREE.Vector3 | null = null;
  private agarre: THREE.Vector3 | null = null;
  private espacio = false;
  private readonly rueda: EstadoRueda = { dosDedosHasta: 0 };
  private dosPrevio: { d: number; a: number; x: number; y: number } | null = null;

  private porGirar = { az: 0, pol: 0 };
  private tauGiro = TAU_GIRO;
  private porAcercar = 0;
  private puntoAcercar: THREE.Vector3 | null = null;
  private inercia = { az: 0, pol: 0, px: 0, pz: 0 };
  private muestras: Muestra[] = [];

  private readonly rayo = new THREE.Raycaster();
  private readonly esfera = new THREE.Spherical();
  private readonly desfase = new THREE.Vector3();
  private readonly arribaPantalla = new THREE.Vector3();
  private readonly ultima = new THREE.Vector3(NaN, NaN, NaN);
  private readonly ultimaQ = new THREE.Quaternion();
  private readonly quieto: boolean;

  constructor(
    private readonly camara: THREE.PerspectiveCamera,
    private readonly lienzo: HTMLElement,
    private readonly avisos: AvisosControl,
  ) {
    this.quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    lienzo.style.touchAction = "none";
    lienzo.addEventListener("pointerdown", this.alBajar);
    lienzo.addEventListener("pointermove", this.alMover);
    lienzo.addEventListener("pointerup", this.alSubir);
    lienzo.addEventListener("pointercancel", this.alSubir);
    lienzo.addEventListener("wheel", this.alRodar, { passive: false });
    lienzo.addEventListener("mousedown", this.sinAutoscroll);
  }

  dispose() {
    const l = this.lienzo;
    l.removeEventListener("pointerdown", this.alBajar);
    l.removeEventListener("pointermove", this.alMover);
    l.removeEventListener("pointerup", this.alSubir);
    l.removeEventListener("pointercancel", this.alSubir);
    l.removeEventListener("wheel", this.alRodar);
    l.removeEventListener("mousedown", this.sinAutoscroll);
  }

  /** El botón de en medio desliza; sin esto, Chrome en Windows abre su flecha de desplazar la página. */
  private readonly sinAutoscroll = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  };

  /** Con la barra espaciadora abajo, arrastrar desliza. */
  conEspacio(activo: boolean) {
    this.espacio = activo;
  }

  get desdeArriba() {
    const d = this.desfase.copy(this.camara.position).sub(this.target);
    return Math.acos(Math.min(Math.max(d.y / Math.max(d.length(), 1e-6), -1), 1)) < POLAR_DESDE_ARRIBA;
  }

  /** Para la brújula: arrastrarla gira e inclina igual que arrastrar la maqueta. */
  girarPx(dx: number, dy: number) {
    this.tauGiro = TAU_GIRO;
    const k = this.radianesPorPx();
    this.porGirar.az -= dx * k;
    this.porGirar.pol -= dy * k;
    this.pivote = null;
    this.inercia = { az: 0, pol: 0, px: 0, pz: 0 };
  }

  /** Gira con calma, para enderezar con la brújula. */
  girarSuave(rad: number) {
    this.pivote = null;
    this.tauGiro = TAU_ENDEREZAR;
    this.inercia = { az: 0, pol: 0, px: 0, pz: 0 };
    this.porGirar.az += rad;
  }

  /** Acerca sin señalar nada, desde el teclado. */
  acercarPaso(log: number) {
    this.puntoAcercar = null;
    this.porAcercar += log;
  }

  /** Corta lo que viniera moviéndose: vuela otra cosa, o se entra a caminar. */
  frenar() {
    this.inercia = { az: 0, pol: 0, px: 0, pz: 0 };
    this.porGirar = { az: 0, pol: 0 };
    this.porAcercar = 0;
    this.gesto = null;
    this.pendiente = false;
    this.punteros.clear();
  }

  private radianesPorPx() {
    // Con 6/10 de la pantalla da media vuelta: un arrastre corto basta para ver el otro lado.
    return Math.PI / Math.max(Math.min(this.lienzo.clientWidth, this.lienzo.clientHeight) * 0.62, 200);
  }

  private relativo(e: { clientX: number; clientY: number }): Puntero {
    const r = this.lienzo.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** El punto del piso, a la altura del centro de la vista, que queda bajo esa posición de pantalla. */
  private pisoBajo(p: Puntero, destino = new THREE.Vector3()): THREE.Vector3 | null {
    const w = this.lienzo.clientWidth || 1;
    const h = this.lienzo.clientHeight || 1;
    this.camara.updateMatrixWorld();
    this.rayo.setFromCamera(new THREE.Vector2((p.x / w) * 2 - 1, -(p.y / h) * 2 + 1), this.camara);
    const r = this.rayo.ray;
    const dy = r.direction.y;
    if (Math.abs(dy) < 1e-4) return null;
    const t = (this.target.y - r.origin.y) / dy;
    if (t <= 0) return null;
    return destino.copy(r.origin).addScaledVector(r.direction, t);
  }

  private readonly alBajar = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.avisos.alEmpezar?.();
    this.lienzo.setPointerCapture?.(e.pointerId);
    this.inercia = { az: 0, pol: 0, px: 0, pz: 0 };
    this.tauGiro = TAU_GIRO;
    const p = this.relativo(e);
    this.punteros.set(e.pointerId, p);
    this.tipoPuntero = e.pointerType;
    this.muestras = [];
    if (this.punteros.size === 1) {
      this.gesto = gestoDeBoton(e.button, { mayus: e.shiftKey, alt: e.altKey, espacio: this.espacio }, this.desdeArriba);
      this.pendiente = true;
      this.inicio = p;
      const piso = this.pisoBajo(p);
      this.agarre = piso;
      this.pivote = piso && (this.avisos.puntoValido?.(piso) ?? true) ? piso.clone() : null;
    } else if (this.punteros.size === 2) {
      this.gesto = null;
      this.pendiente = false;
      this.dosPrevio = this.medirDos();
    }
  };

  private medirDos() {
    const [a, b] = [...this.punteros.values()];
    if (!a || !b) return null;
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private readonly alMover = (e: PointerEvent) => {
    if (!this.enabled) return;
    const previo = this.punteros.get(e.pointerId);
    if (!previo) return;
    const p = this.relativo(e);
    this.punteros.set(e.pointerId, p);
    if (this.punteros.size >= 2) {
      this.moverDos();
      return;
    }
    const gesto = this.gesto;
    if (!gesto) return;
    if (this.pendiente) {
      if (Math.hypot(p.x - this.inicio.x, p.y - this.inicio.y) < UMBRAL_PX) return;
      this.pendiente = false;
      this.avisos.alArrastrar?.(true);
      this.avisos.alUsar?.(gesto);
    }
    if (gesto === "girar") {
      const k = this.radianesPorPx();
      this.porGirar.az -= (p.x - previo.x) * k;
      this.porGirar.pol -= (p.y - previo.y) * k;
      this.muestra(-(p.x - previo.x) * k, -(p.y - previo.y) * k, 0, 0);
    } else if (this.agarre) {
      this.deslizarHastaCursor(p);
    }
  };

  /** Lo que se agarró sigue bajo el cursor, a cualquier distancia e inclinación. */
  private deslizarHastaCursor(p: Puntero) {
    const agarre = this.agarre;
    const ahora = this.pisoBajo(p);
    if (!agarre || !ahora) return;
    const r = this.camara.position.distanceTo(this.target);
    // Muy cerca del horizonte un píxel son decenas de metros.
    const tope = r * 0.5;
    const dx = Math.min(Math.max(agarre.x - ahora.x, -tope), tope);
    const dz = Math.min(Math.max(agarre.z - ahora.z, -tope), tope);
    this.mover(dx, dz);
    this.muestra(0, 0, dx, dz);
  }

  private mover(dx: number, dz: number) {
    this.target.x += dx;
    this.target.z += dz;
    this.camara.position.x += dx;
    this.camara.position.z += dz;
  }

  private moverDos() {
    const previo = this.dosPrevio;
    const ahora = this.medirDos();
    if (!previo || !ahora) return;
    this.dosPrevio = ahora;
    if (ahora.d > 1 && previo.d > 1) {
      const punto = this.pisoBajo(ahora);
      if (punto) this.puntoAcercar = punto;
      this.porAcercar += Math.log(previo.d / ahora.d);
    }
    let torcer = ahora.a - previo.a;
    if (torcer > Math.PI) torcer -= 2 * Math.PI;
    if (torcer < -Math.PI) torcer += 2 * Math.PI;
    this.pivote = null;
    this.porGirar.az -= torcer;
    this.deslizarPx(ahora.x - previo.x, ahora.y - previo.y);
  }

  /** Desliza en píxeles de pantalla, en la dirección del gesto: el contenido sigue a los dedos. */
  private deslizarPx(dx: number, dy: number) {
    const d = this.desfase.copy(this.camara.position).sub(this.target);
    const r = d.length();
    const h = Math.max(this.lienzo.clientHeight, 1);
    const k = (2 * Math.tan((this.camara.fov * Math.PI) / 360) * r) / h;
    const sinEle = Math.max(Math.abs(d.y) / Math.max(r, 1e-6), 0.28);
    // «Hacia arriba de la pantalla» sobre el piso: vale también mirando en vertical, donde el desfase ya no dice nada.
    const u = this.arribaPantalla.set(0, 1, 0).applyQuaternion(this.camara.quaternion);
    const l = Math.hypot(u.x, u.z) || 1;
    const fx = u.x / l;
    const fz = u.z / l;
    const mx = -dx * k * -fz + (dy * k * fx) / sinEle;
    const mz = -dx * k * fx + (dy * k * fz) / sinEle;
    this.mover(mx, mz);
  }

  private muestra(az: number, pol: number, px: number, pz: number) {
    const t = performance.now();
    this.muestras.push({ t, az, pol, px, pz });
    while (this.muestras.length && t - this.muestras[0].t > VENTANA_INERCIA_MS) this.muestras.shift();
  }

  private readonly alSubir = (e: PointerEvent) => {
    if (!this.punteros.has(e.pointerId)) return;
    this.punteros.delete(e.pointerId);
    if (this.lienzo.hasPointerCapture?.(e.pointerId)) this.lienzo.releasePointerCapture(e.pointerId);
    if (this.punteros.size === 1) {
      // De dos dedos a uno: el que queda sigue girando desde donde está.
      this.gesto = "girar";
      this.pendiente = false;
      this.dosPrevio = null;
      this.pivote = null;
      this.muestras = [];
      return;
    }
    if (this.punteros.size) return;
    const movio = this.gesto && !this.pendiente;
    if (movio) {
      this.avisos.alArrastrar?.(false);
      this.lanzarInercia();
    }
    this.gesto = null;
    this.pendiente = false;
    this.dosPrevio = null;
    this.agarre = null;
    this.tipoPuntero = "mouse";
  };

  private lanzarInercia() {
    if (this.quieto) return;
    const m = this.muestras;
    this.muestras = [];
    if (m.length < 2) return;
    const ahora = performance.now();
    // Si se detuvo antes de soltar, ya no lleva impulso.
    if (ahora - m[m.length - 1].t > 50) return;
    const dt = Math.max((ahora - m[0].t) / 1000, 0.016);
    const suma = m.reduce((s, x) => ({ az: s.az + x.az, pol: s.pol + x.pol, px: s.px + x.px, pz: s.pz + x.pz }), { az: 0, pol: 0, px: 0, pz: 0 });
    // Un tirón al soltar no debe mandar la vista al otro lado del sitio.
    const topeGiro = 5;
    const topeMover = this.camara.position.distanceTo(this.target) * 2.5;
    const corta = (v: number, tope: number) => Math.min(Math.max(v, -tope), tope);
    this.inercia = { az: corta(suma.az / dt, topeGiro), pol: corta(suma.pol / dt, topeGiro), px: corta(suma.px / dt, topeMover), pz: corta(suma.pz / dt, topeMover) };
  }

  private readonly alRodar = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.avisos.alEmpezar?.();
    this.inercia = { az: 0, pol: 0, px: 0, pz: 0 };
    const ev = e as WheelEvent & { wheelDeltaY?: number };
    const tipo = clasificarRueda(ev, this.rueda, performance.now());
    const p = this.relativo(e);
    if (e.shiftKey && tipo !== "pellizco") {
      // Mayús más la rueda, o dos dedos: gira sin arrastrar. Windows pasa la rueda a lateral con Mayús.
      const k = this.radianesPorPx();
      this.pivote = null;
      this.porGirar.az -= (e.deltaX || e.deltaY) * k * 0.6;
      if (tipo === "dos-dedos" && e.deltaX) this.porGirar.pol -= e.deltaY * k * 0.6;
      this.avisos.alUsar?.("girar");
      return;
    }
    if (tipo === "dos-dedos") {
      this.deslizarPx(-e.deltaX, -e.deltaY);
      this.avisos.alUsar?.("deslizar");
      return;
    }
    const punto = this.pisoBajo(p);
    this.puntoAcercar = punto && (this.avisos.puntoValido?.(punto) ?? true) ? punto : null;
    this.porAcercar += Math.log(factorDeRueda(tipo, e.deltaY));
    this.avisos.alUsar?.("acercar");
  };

  /** Una vez por cuadro: aplica lo pendiente y deja la cámara mirando al centro. */
  update(dt = 1 / 60) {
    const cam = this.camara;
    const hayGiro = Math.abs(this.porGirar.az) > 1e-5 || Math.abs(this.porGirar.pol) > 1e-5;
    const hayAcercar = Math.abs(this.porAcercar) > 1e-4;
    const hayInercia = Math.abs(this.inercia.az) + Math.abs(this.inercia.pol) > 1e-3 || Math.abs(this.inercia.px) + Math.abs(this.inercia.pz) > 1e-3;

    if (hayGiro || hayAcercar || hayInercia) {
      const d = this.desfase.copy(cam.position).sub(this.target);
      this.esfera.setFromVector3(d);
      let az = 0;
      let pol = 0;
      if (hayGiro) {
        const s = this.quieto ? 1 : 1 - Math.exp(-dt / this.tauGiro);
        az = this.porGirar.az * s;
        pol = this.porGirar.pol * s;
        this.porGirar.az -= az;
        this.porGirar.pol -= pol;
      }
      if (hayInercia) {
        az += this.inercia.az * dt;
        pol += this.inercia.pol * dt;
        this.mover(this.inercia.px * dt, this.inercia.pz * dt);
        const freno = Math.exp(-dt / TAU_FRENO);
        this.inercia.az *= freno;
        this.inercia.pol *= freno;
        this.inercia.px *= freno;
        this.inercia.pz *= freno;
      }
      if (az) {
        this.esfera.theta += az;
        // Gira alrededor de lo que se señaló: eso no se sale de la vista.
        if (this.pivote) {
          const c = this.desfase.copy(this.target).sub(this.pivote).applyAxisAngle(ARRIBA, az);
          const antesX = this.target.x;
          const antesZ = this.target.z;
          this.target.x = this.pivote.x + c.x;
          this.target.z = this.pivote.z + c.z;
          cam.position.x += this.target.x - antesX;
          cam.position.z += this.target.z - antesZ;
        }
      }
      if (pol) this.esfera.phi = Math.min(Math.max(this.esfera.phi + pol, POLAR_MIN), POLAR_MAX);
      if (hayAcercar) {
        const s = this.quieto ? 1 : 1 - Math.exp(-dt / TAU_RUEDA);
        const paso = this.porAcercar * s;
        this.porAcercar -= paso;
        const r = this.esfera.radius;
        const nuevo = Math.min(Math.max(r * Math.exp(paso), this.minDistance), this.maxDistance);
        const f = nuevo / r;
        if (f === 1) this.porAcercar = 0;
        this.esfera.radius = nuevo;
        if (this.puntoAcercar) {
          this.target.x = this.puntoAcercar.x + (this.target.x - this.puntoAcercar.x) * f;
          this.target.z = this.puntoAcercar.z + (this.target.z - this.puntoAcercar.z) * f;
        }
      }
      cam.position.copy(this.target).add(this.desfase.setFromSpherical(this.esfera));
    } else {
      // Quien la mueve desde fuera (un vuelo) no pasa de lo vertical: `lookAt` se volvería loco.
      const d = this.desfase.copy(cam.position).sub(this.target);
      if (d.lengthSq() > 1e-8) {
        const min = d.length() * Math.sin(POLAR_MIN);
        const h = Math.hypot(d.x, d.z);
        if (h < min) {
          // Conserva hacia dónde queda el norte: de eso depende cómo sale el plano en pantalla.
          d.x = h > 1e-9 ? (d.x * min) / h : 0;
          d.z = h > 1e-9 ? (d.z * min) / h : min;
          cam.position.copy(this.target).add(d);
        }
      }
    }
    cam.lookAt(this.target);
    if (
      Number.isNaN(this.ultima.x) ||
      this.ultima.distanceToSquared(cam.position) > 1e-9 ||
      1 - Math.abs(this.ultimaQ.dot(cam.quaternion)) > 1e-9
    ) {
      this.ultima.copy(cam.position);
      this.ultimaQ.copy(cam.quaternion);
      this.avisos.alCambiar();
    }
  }
}
