/**
 * Motor de la maqueta 3D: render con WebGL, luz de día y de noche, vuelo de la cámara, elegir con
 * el puntero y reconstrucción por capas (solo se rehace lo que cambió del plano). Se ve de dos modos:
 * desde arriba como un mapa que se desliza, o caminando adentro a la altura de una persona.
 *
 * Se pinta a pedido: sin cambios no gasta GPU. Mientras se mueve va sin sombreado de contacto y al
 * soltar se afina el último cuadro; así gira con soltura también en una laptop sin tarjeta gráfica.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { Seleccion } from "../editor";
import { cajaDe, limitesEdificio, limitesSitio, unirLimites, type Limites } from "../medidas";
import type { NivelConPlano } from "../niveles";
import { aRad } from "../optica";
import { aMetros, dirRumbo, type Plano, type Punto } from "../plano";
import { ALTURA_OJOS_M, moverConChoques, tramosDelPlano, type Tramo } from "../recorrido";
import type { Conexion } from "../sistema";
import { camaraEnMetros, type PoligonoCobertura } from "../visibilidad";
import {
  construirAlcances,
  construirArquitectura,
  construirAreas,
  construirCables,
  construirCamaras,
  construirCoberturas,
  construirEquipos,
  construirLosa,
  construirMuebles,
  construirObstaculos,
  construirPersonas,
  construirRayos,
  construirTerreno,
  escalaVisualEquipos,
  lamparasDeNoche,
  materialesArquitectura,
  MARGEN_BASE_M,
  type EtiquetaEquipo,
  type MuroMaqueta,
} from "./escena";

export type CapasMaqueta = {
  cobertura: boolean;
  personas: boolean;
  noche: boolean;
  tamanoReal: boolean;
  translucidos: boolean;
  croquis: boolean;
  cableado: boolean;
};

export type DatosMaqueta = {
  plano: Plano;
  nivelId: string;
  /** Las rutas de cable de todo el edificio; se pinta lo de este nivel. */
  conexiones: readonly Conexion[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  elevacionM: number;
  debajo: readonly NivelConPlano[];
  seleccion: Seleccion | null;
  capas: CapasMaqueta;
  /** Cámara desde la que se está viendo («Ver lo que ve»). */
  verDesde: string | null;
};

export type AvisosMotor = {
  /** Después de cada cuadro: para poner encima las claves, que son HTML. */
  alPintar?: () => void;
  /** Se perdió el contexto de WebGL: la pantalla cae a la vista SVG. */
  alPerderContexto?: () => void;
  /** El croquis no se pudo usar como textura. */
  alFallarCroquis?: () => void;
  /** Terminó solo el recorrido automático, o alguien tomó el control. */
  alTerminarGuiado?: () => void;
};

/** Qué hace arrastrar sobre el sitio: deslizarlo como un mapa o girarlo como un objeto. */
export type ModoArrastre = "deslizar" | "girar";

/** Dónde queda pegado algo al ponerlo: en el muro o en el piso que hay bajo el puntero. */
export type Montaje = { punto: Punto; alturaM: number | null; rumboDeg: number | null };

type Recorrido = {
  pos: Punto;
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  yawMeta: number;
  pitchMeta: number;
  ojoM: number;
  ojoMeta: number;
  viaje: { a: Punto; b: Punto; t0: number; dur: number } | null;
};

type Transicion = { t0: number; dur: number; p0: THREE.Vector3; q0: THREE.Quaternion; f0: number; p1: THREE.Vector3; q1: THREE.Quaternion; f1: number; alFinal?: () => void };

const FOV_MAQUETA = 23;
const FOV_RECORRIDO = 62;
const VEL_CAMINAR = 2.6;
const VEL_CORRER = 6.2;
const CIELO_DIA = 0xcddbe8;
const CIELO_NOCHE = 0x0c0f15;
const FONDO_DIA = 0xd9dcdf;
const MIRADA = new THREE.Euler(0, 0, 0, "YXZ");
const suave = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
/** El giro corto entre dos ángulos. */
const giroCorto = (de: number, a: number) => Math.atan2(Math.sin(a - de), Math.cos(a - de));
const DIR_GENERAL = new THREE.Vector3(-0.405, 0.7, 0.583).normalize();

function liberar(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (n.userData.compartido) return;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const x of mats) {
      if (!x.userData?.compartido) x.dispose();
    }
    (n as THREE.InstancedMesh).dispose?.();
  });
}

function mismaCaja(a: Limites | null, b: Limites | null) {
  if (!a || !b) return a === b;
  return Math.abs(a.min.x - b.min.x) + Math.abs(a.min.y - b.min.y) + Math.abs(a.max.x - b.max.x) + Math.abs(a.max.y - b.max.y) < 1e-3;
}

export class MotorMaqueta {
  readonly camara: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly ao: GTAOPass | null;
  private readonly brillo: UnrealBloomPass;
  private readonly escena = new THREE.Scene();
  private readonly ctrl: OrbitControls;
  private readonly mats = materialesArquitectura();
  private readonly raiz = new THREE.Group();
  private readonly capas = {
    terreno: new THREE.Group(),
    areas: new THREE.Group(),
    arquitectura: new THREE.Group(),
    obstaculos: new THREE.Group(),
    muebles: new THREE.Group(),
    personas: new THREE.Group(),
    camaras: new THREE.Group(),
    equipos: new THREE.Group(),
    alcances: new THREE.Group(),
    cables: new THREE.Group(),
    coberturas: new THREE.Group(),
    rayos: new THREE.Group(),
    abajo: new THREE.Group(),
    croquis: new THREE.Group(),
    marca: new THREE.Group(),
  };
  private readonly dia = new THREE.Group();
  private readonly noche = new THREE.Group();
  private readonly sol: THREE.DirectionalLight;
  private readonly raycaster = new THREE.Raycaster();
  private muros: MuroMaqueta[] = [];
  private estadoMuro = new Map<string, THREE.Material>();
  private previo: DatosMaqueta | null = null;
  private limites: Limites = { min: { x: 0, y: 0 }, max: { x: 20, y: 12 } };
  private limEdificio: Limites | null = null;
  /** Lo que se encuadra: lo construido, sin los conos, que pueden salirse mucho y dejar el edificio chiquito. */
  private limVista: Limites = { min: { x: 0, y: 0 }, max: { x: 20, y: 12 } };
  private escalaActual = -1;
  private croquisUrl: string | null = null;
  private idCuadro = 0;
  private sucio = true;
  private pendienteCalidad = false;
  private ultimaActividad = 0;
  /** Cuándo rehacer las sombras: se espera a que termine el arrastre, porque el mapa es grande. */
  private sombrasEn = 0;
  private vuelo: { t0: number; p0: THREE.Vector3; m0: THREE.Vector3; p: THREE.Vector3; m: THREE.Vector3 } | null = null;
  private pov: { p: THREE.Vector3; m: THREE.Vector3 } | null = null;
  private tiempos: number[] = [];
  private ultimoCuadro = 0;
  private etiquetasCamaras: EtiquetaEquipo[] = [];
  private etiquetasEquipos: EtiquetaEquipo[] = [];
  private readonly teclas = new Set<string>();
  private ultimoPaso = 0;
  private rec: Recorrido | null = null;
  private tramos: Tramo[] = [];
  private transicion: Transicion | null = null;
  private orbitaGuardada: { p: THREE.Vector3; m: THREE.Vector3 } | null = null;
  private guiado: { paradas: Punto[]; i: number; hasta: number } | null = null;
  private readonly ambiente = new THREE.Group();
  private readonly reticula: THREE.Mesh;
  private readonly niebla = new THREE.Fog(FONDO_DIA, 1e5, 2e5);
  private ancho = 900;
  private alto = 640;
  private primeraVista = true;
  private destruido = false;
  private readonly quieto: boolean;
  private readonly movil: boolean;
  etiquetas: EtiquetaEquipo[] = [];

  constructor(
    private readonly lienzo: HTMLCanvasElement,
    private readonly avisos: AvisosMotor = {},
  ) {
    this.movil = window.innerWidth < 720;
    this.quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const r = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, powerPreference: "high-performance" });
    this.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    const generador = new THREE.PMREMGenerator(r);
    this.escena.environment = generador.fromScene(new RoomEnvironment(), 0.04).texture;
    generador.dispose();

    this.camara = new THREE.PerspectiveCamera(FOV_MAQUETA, 1.5, 0.05, 500);
    this.ctrl = new OrbitControls(this.camara, lienzo);
    this.ctrl.enableDamping = true;
    this.ctrl.dampingFactor = 0.09;
    this.ctrl.maxPolarAngle = 1.5;
    this.ctrl.minDistance = 0.6;
    this.ctrl.screenSpacePanning = false;
    this.ctrl.zoomToCursor = true;
    this.ctrl.addEventListener("change", this.alCambiarVista);
    this.modoArrastre("deslizar");

    const objetivo = new THREE.WebGLRenderTarget(this.ancho, this.alto, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, objetivo);
    this.composer.addPass(new RenderPass(this.escena, this.camara));
    this.ao = this.movil ? null : new GTAOPass(this.escena, this.camara, this.ancho, this.alto);
    if (this.ao) {
      this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.25, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 16 });
      this.composer.addPass(this.ao);
    }
    this.brillo = new UnrealBloomPass(new THREE.Vector2(this.ancho, this.alto), 0.32, 0.6, 0.82);
    this.brillo.enabled = false;
    this.composer.addPass(this.brillo);
    this.composer.addPass(new OutputPass());

    for (const g of Object.values(this.capas)) this.raiz.add(g);
    this.escena.add(this.raiz);
    this.sol = new THREE.DirectionalLight(0xfff1df, 2.35);
    this.sol.castShadow = true;
    this.sol.shadow.mapSize.set(this.movil ? 2048 : 4096, this.movil ? 2048 : 4096);
    this.sol.shadow.bias = -0.00028;
    this.sol.shadow.normalBias = 0.018;
    this.sol.shadow.radius = 5;
    this.dia.add(this.sol, this.sol.target, new THREE.HemisphereLight(0xdfeaf6, 0xb9b3a8, 0.42));
    this.escena.add(this.dia);
    this.ambiente.visible = false;
    this.escena.add(this.ambiente);
    this.escena.fog = this.niebla;
    this.reticula = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 44).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    );
    this.reticula.visible = false;
    this.reticula.renderOrder = 8;
    this.escena.add(this.reticula);

    lienzo.addEventListener("webglcontextlost", this.alPerder);
    this.idCuadro = requestAnimationFrame(this.cuadro);
  }

  /* ── Datos ── */

  actualizar(d: DatosMaqueta) {
    const a = this.previo;
    const p = d.plano;
    const pa = a?.plano;
    // La base abarca también los pisos de abajo, que pueden ser más grandes que el nivel activo.
    const lim = unirLimites([limitesSitio(p, d.coberturas), ...d.debajo.map((n) => limitesSitio(n.plano))]);
    const ed = limitesEdificio(p);
    const escalaPlano = pa?.escala.metrosPorPx !== p.escala.metrosPorPx;
    const nivelCambio = !a || a.elevacionM !== d.elevacionM || escalaPlano;
    let sombras = false;
    const cambioLimites = !mismaCaja(lim, this.limites) || !mismaCaja(ed, this.limEdificio);
    this.limites = lim;
    this.limEdificio = ed;
    this.limVista = unirLimites([limitesSitio(p), ...d.debajo.map((n) => limitesSitio(n.plano))]);

    if (nivelCambio || cambioLimites || a?.debajo !== d.debajo) {
      const base = new THREE.Group();
      base.add(construirTerreno(d.debajo[0]?.plano ?? p, lim));
      if (d.elevacionM > 0) {
        const losa = construirLosa(p, lim);
        losa.position.y = d.elevacionM;
        base.add(losa);
      }
      this.reponer(this.capas.terreno, base);
      this.ajustarSol();
      sombras = true;
    }
    if (nivelCambio || pa?.areas !== p.areas) {
      this.reponer(this.capas.areas, construirAreas(p));
    }
    if (nivelCambio || pa?.muros !== p.muros || pa?.aberturas !== p.aberturas) {
      const { grupo, muros } = construirArquitectura(p, this.mats);
      this.reponer(this.capas.arquitectura, grupo);
      this.muros = muros;
      this.estadoMuro.clear();
      sombras = true;
    }
    if (nivelCambio || pa?.obstaculos !== p.obstaculos) {
      this.reponer(this.capas.obstaculos, construirObstaculos(p, this.mats));
      sombras = true;
    }
    if (nivelCambio || pa?.muebles !== p.muebles) {
      this.reponer(this.capas.muebles, construirMuebles(p));
      sombras = true;
    }
    if (nivelCambio || pa?.personas !== p.personas) {
      this.reponer(this.capas.personas, construirPersonas(p));
      sombras = true;
    }
    // Adentro se ve todo de su tamaño: desde arriba los equipos se agrandan para que se distingan.
    const escala = d.capas.tamanoReal || this.rec ? 1 : escalaVisualEquipos(ed ?? lim);
    if (nivelCambio || pa?.camaras !== p.camaras || pa?.muros !== p.muros || escala !== this.escalaActual || a?.verDesde !== d.verDesde) {
      const { grupo, etiquetas } = construirCamaras(p, { escala, ocultar: d.verDesde });
      this.reponer(this.capas.camaras, grupo);
      this.etiquetasCamaras = etiquetas;
      this.etiquetas = [...this.etiquetasCamaras, ...this.etiquetasEquipos];
      sombras = true;
    }
    if (nivelCambio || pa?.equipos !== p.equipos || pa?.muros !== p.muros || escala !== this.escalaActual) {
      const { grupo, etiquetas } = construirEquipos(p, { escala });
      this.reponer(this.capas.equipos, grupo);
      this.etiquetasEquipos = etiquetas;
      this.etiquetas = [...this.etiquetasCamaras, ...this.etiquetasEquipos];
      sombras = true;
    }
    const equipoSel = d.seleccion?.tipo === "equipo" ? d.seleccion.id : null;
    const equipoSelAntes = a?.seleccion?.tipo === "equipo" ? a.seleccion.id : null;
    if (nivelCambio || pa?.equipos !== p.equipos || equipoSel !== equipoSelAntes) {
      this.reponer(this.capas.alcances, construirAlcances(p, equipoSel));
    }
    if (nivelCambio || a?.conexiones !== d.conexiones || a?.nivelId !== d.nivelId || escala !== this.escalaActual) {
      this.reponer(this.capas.cables, construirCables(d.conexiones, d.nivelId, escala));
    }
    this.escalaActual = escala;
    const idSel = d.seleccion?.tipo === "camara" ? d.seleccion.id : null;
    const idSelAntes = a?.seleccion?.tipo === "camara" ? a.seleccion.id : null;
    if (nivelCambio || a?.coberturas !== d.coberturas || idSel !== idSelAntes) {
      this.reponer(this.capas.coberturas, construirCoberturas(d.coberturas, idSel));
    }
    if (nivelCambio || idSel !== idSelAntes || pa?.camaras !== p.camaras) {
      const r = idSel && !d.verDesde ? construirRayos(p, idSel) : null;
      this.reponer(this.capas.rayos, r ?? new THREE.Group());
    }
    if (nivelCambio || a?.debajo !== d.debajo) {
      const g = new THREE.Group();
      for (const n of d.debajo) {
        const piso = new THREE.Group();
        piso.position.y = n.nivel.elevacionM;
        piso.add(construirArquitectura(n.plano, this.mats, { apagado: true }).grupo, construirObstaculos(n.plano, this.mats, { apagado: true }));
        g.add(piso);
      }
      this.reponer(this.capas.abajo, g);
    }
    if (!a || a.seleccion?.id !== d.seleccion?.id || nivelCambio || pa?.muebles !== p.muebles || pa?.obstaculos !== p.obstaculos || pa?.personas !== p.personas || pa?.equipos !== p.equipos) {
      this.marcarSeleccion(d.seleccion, p);
    }
    this.cargarCroquis(p, d.capas.croquis);

    // Lo del nivel activo va a su elevación; lo de abajo ya trae la suya.
    for (const clave of ["areas", "arquitectura", "obstaculos", "muebles", "personas", "camaras", "equipos", "alcances", "cables", "coberturas", "rayos", "croquis", "marca"] as const) {
      this.capas[clave].position.y = d.elevacionM;
    }
    this.capas.coberturas.visible = d.capas.cobertura && !d.verDesde;
    this.capas.personas.visible = d.capas.personas;
    this.capas.alcances.visible = d.capas.cobertura && !d.verDesde;
    // Adentro no: tan de cerca, una línea de cable se ve como un rayón en la pared.
    this.capas.cables.visible = d.capas.cableado && !d.verDesde && !this.rec;
    this.capas.rayos.visible = !this.rec;

    if (!a || a.capas.noche !== d.capas.noche || (d.capas.noche && pa?.muros !== p.muros)) this.aplicarLuz(p, d.capas.noche);
    if (sombras) this.sombrasEn = performance.now() + (a ? 150 : 0);
    if (a?.verDesde !== d.verDesde) {
      if (d.verDesde) this.entrarEnCamara(p, d.verDesde, d.elevacionM);
      else if (a?.verDesde) this.salirDeCamara();
    }
    this.previo = d;
    if (this.rec && (nivelCambio || pa?.muros !== p.muros || pa?.aberturas !== p.aberturas || pa?.obstaculos !== p.obstaculos)) {
      this.tramos = tramosDelPlano(p);
      this.armarAmbiente(p, d.elevacionM);
    }
    if (this.primeraVista) {
      this.primeraVista = false;
      this.vistaGeneral(false);
    }
    this.pintarMuros();
    this.invalidar();
  }

  private reponer(capa: THREE.Group, nuevo: THREE.Object3D) {
    for (const h of [...capa.children]) {
      capa.remove(h);
      liberar(h);
    }
    capa.add(nuevo);
  }

  private marcarSeleccion(sel: Seleccion | null, plano: Plano) {
    this.reponer(this.capas.marca, new THREE.Group());
    if (!sel || sel.tipo === "muro" || sel.tipo === "camara" || sel.tipo === "area") return;
    // Lo que va adentro de un gabinete se marca en su gabinete.
    const id = sel.tipo === "equipo" ? (plano.equipos?.find((e) => e.id === sel.id)?.gabineteId ?? sel.id) : sel.id;
    const caja = new THREE.Box3();
    this.raiz.traverse((n) => {
      const s = n.userData.sel as Seleccion | undefined;
      if (s?.id === id) {
        n.updateWorldMatrix(true, false);
        const geo = (n as THREE.Mesh).geometry;
        if (geo) {
          geo.computeBoundingBox();
          caja.union(geo.boundingBox!.clone().applyMatrix4(n.matrixWorld));
        }
      }
    });
    if (caja.isEmpty()) return;
    caja.min.y -= this.capas.marca.position.y;
    caja.max.y -= this.capas.marca.position.y;
    const ayuda = new THREE.Box3Helper(caja.expandByScalar(0.04), new THREE.Color(0x0f7f6c));
    ayuda.renderOrder = 6;
    this.capas.marca.children[0].add(ayuda);
  }

  private cargarCroquis(p: Plano, activo: boolean) {
    const url = activo ? (p.croquis?.url ?? null) : null;
    const clave = url ? `${url}|${p.escala.metrosPorPx}|${p.croquis?.opacidad}|${p.croquis?.invertido}` : null;
    if (clave === this.croquisUrl) return;
    this.croquisUrl = clave;
    this.reponer(this.capas.croquis, new THREE.Group());
    if (!url || !p.croquis) return;
    const c = p.croquis;
    const k = p.escala.metrosPorPx;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (this.destruido || this.croquisUrl !== clave) return;
      try {
        const el = document.createElement("canvas");
        el.width = img.naturalWidth;
        el.height = img.naturalHeight;
        const ctx = el.getContext("2d");
        if (!ctx) return;
        if (c.invertido) ctx.filter = "invert(1) hue-rotate(180deg)";
        ctx.drawImage(img, 0, 0);
        const t = new THREE.CanvasTexture(el);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(c.anchoPx * k, c.altoPx * k),
          new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: c.opacidad * 0.75, depthWrite: false, toneMapped: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set((c.anchoPx * k) / 2, 0.012, (c.altoPx * k) / 2);
        m.renderOrder = 1;
        this.reponer(this.capas.croquis, m);
        this.invalidar();
      } catch {
        this.avisos.alFallarCroquis?.();
      }
    };
    img.onerror = () => this.avisos.alFallarCroquis?.();
    img.src = url;
  }

  /* ── Luz ── */

  private ajustarSol() {
    const lim = this.limites;
    const cx = (lim.min.x + lim.max.x) / 2;
    const cz = (lim.min.y + lim.max.y) / 2;
    const r = Math.hypot(lim.max.x - lim.min.x, lim.max.y - lim.min.y) / 2 + MARGEN_BASE_M + 2;
    this.sol.position.set(cx - r * 0.85, r * 1.5 + 8, cz + r * 0.85);
    this.sol.target.position.set(cx, 0, cz);
    const s = this.sol.shadow.camera;
    s.left = -r * 1.1;
    s.right = r * 1.1;
    s.top = r * 1.1;
    s.bottom = -r * 1.1;
    s.near = 1;
    s.far = r * 5 + 40;
    s.updateProjectionMatrix();
  }

  private aplicarLuz(plano: Plano, noche: boolean) {
    for (const h of [...this.noche.children]) this.noche.remove(h);
    if (noche) {
      this.noche.add(new THREE.HemisphereLight(0x24324e, 0x0d1016, 0.4));
      const luna = new THREE.DirectionalLight(0x8fa6d9, 0.35);
      luna.position.copy(this.sol.position);
      luna.target.position.copy(this.sol.target.position);
      this.noche.add(luna, luna.target);
      for (const l of lamparasDeNoche(plano)) {
        const p = new THREE.PointLight(l.color, l.intensidad, l.alcance, 1.7);
        p.position.set(l.x, 3.2, l.z);
        this.noche.add(p);
      }
      this.noche.position.y = this.capas.arquitectura.position.y;
    }
    this.escena.remove(noche ? this.dia : this.noche);
    this.escena.add(noche ? this.noche : this.dia);
    this.pintarCielo(noche);
    this.escena.environmentIntensity = noche ? 0.12 : 0.34;
    this.renderer.toneMappingExposure = noche ? 0.8 : 0.86;
    this.brillo.enabled = noche;
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidar();
  }

  /** Afuera hay cielo y horizonte cuando se camina; desde arriba, fondo liso. */
  private pintarCielo(noche: boolean) {
    const color = this.rec ? (noche ? CIELO_NOCHE : CIELO_DIA) : noche ? CIELO_NOCHE : FONDO_DIA;
    this.escena.background = new THREE.Color(color);
    // La niebla siempre existe, solo se aleja: quitarla obligaría a recompilar todos los materiales al entrar.
    this.niebla.color.set(color);
    this.niebla.near = this.rec ? 70 : 1e5;
    this.niebla.far = this.rec ? 520 : 2e5;
  }

  /** Para caminar hace falta techo y un suelo que llegue al horizonte; desde arriba estorban. */
  private armarAmbiente(p: Plano, elevacionM: number) {
    const g = new THREE.Group();
    const suelo = new THREE.Mesh(new THREE.CircleGeometry(700, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa7ab9e, roughness: 1 }));
    suelo.position.y = -0.05;
    g.add(suelo);
    const paredes = p.muros.filter((m) => m.tipo !== "reja");
    if (paredes.length) {
      const caja = cajaDe(paredes.flatMap((m) => [aMetros(m.a, p.escala), aMetros(m.b, p.escala)]));
      const techo = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(caja.max.x - caja.min.x, 0.1), Math.max(caja.max.y - caja.min.y, 0.1)).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.95, side: THREE.DoubleSide }),
      );
      techo.position.set((caja.min.x + caja.max.x) / 2, elevacionM + Math.max(...paredes.map((m) => m.alturaM)), (caja.min.y + caja.max.y) / 2);
      g.add(techo);
    }
    this.reponer(this.ambiente, g);
  }

  /* ── Vista ── */

  /**
   * Encuadre del sitio visto desde `dir`: centra lo que se ve en pantalla (no el centro del terreno:
   * con perspectiva, lo cercano ocupa más) y se acerca hasta que justo cabe.
   */
  private encuadre(dir: THREE.Vector3, up: THREE.Vector3, holgura = 1.06): { p: THREE.Vector3; m: THREE.Vector3; dist: number } {
    const lim = this.limVista;
    const y0 = this.capas.arquitectura.position.y;
    const margen = 1;
    const centro = new THREE.Vector3((lim.min.x + lim.max.x) / 2, y0, (lim.min.y + lim.max.y) / 2);
    const adelante = dir.clone().negate();
    const derecha = new THREE.Vector3().crossVectors(adelante, up).normalize();
    const arriba = new THREE.Vector3().crossVectors(derecha, adelante).normalize();
    const tanV = Math.tan(aRad(FOV_MAQUETA) / 2);
    const tanH = tanV * this.camara.aspect;
    const esquinas: THREE.Vector3[] = [];
    for (const x of [lim.min.x - margen, lim.max.x + margen]) {
      for (const z of [lim.min.y - margen, lim.max.y + margen]) {
        for (const y of [y0 - 0.5, y0 + 3.2]) esquinas.push(new THREE.Vector3(x, y, z));
      }
    }
    let dist = Math.hypot(lim.max.x - lim.min.x, lim.max.y - lim.min.y) / tanV;
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0p = Infinity;
      let y1p = -Infinity;
      for (const e of esquinas) {
        const c = e.clone().sub(centro);
        const fondo = dist + c.dot(adelante);
        const sx = c.dot(derecha) / fondo;
        const sy = c.dot(arriba) / fondo;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0p = Math.min(y0p, sy);
        y1p = Math.max(y1p, sy);
      }
      centro.addScaledVector(derecha, ((x0 + x1) / 2) * dist);
      centro.addScaledVector(arriba, ((y0p + y1p) / 2) * dist);
      dist *= Math.max((x1 - x0) / 2 / tanH, (y1p - y0p) / 2 / tanV);
    }
    dist *= holgura;
    return { p: centro.clone().addScaledVector(dir, dist), m: centro, dist };
  }

  vistaGeneral(animar = true, holgura = 1.14) {
    const { p, m, dist } = this.encuadre(DIR_GENERAL, new THREE.Vector3(0, 1, 0), holgura);
    this.ctrl.maxDistance = dist * 3;
    this.volar(p, m, animar);
  }

  vistaSuperior() {
    const { p, m } = this.encuadre(new THREE.Vector3(0, 1, 0.001).normalize(), new THREE.Vector3(0, 0, -1));
    this.volar(p, m, true);
  }

  /** Lleva la vista a un punto del nivel activo, para ver de cerca un equipo. */
  enfocar(pos: THREE.Vector3, lejos = 7) {
    const destino = pos.clone();
    destino.y += this.capas.arquitectura.position.y;
    const dir = this.camara.position.clone().sub(this.ctrl.target).normalize();
    this.volar(destino.clone().addScaledVector(dir, lejos), destino, true);
  }

  acercar(factor: number) {
    const d = this.camara.position.clone().sub(this.ctrl.target);
    this.volar(this.ctrl.target.clone().addScaledVector(d, 1 / factor), this.ctrl.target.clone(), true, 260);
  }

  girar(grados: number) {
    const d = this.camara.position.clone().sub(this.ctrl.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), aRad(grados));
    this.volar(this.ctrl.target.clone().add(d), this.ctrl.target.clone(), true, 320);
  }

  private duracionVuelo = 900;

  private volar(p: THREE.Vector3, m: THREE.Vector3, animar: boolean, duracion = 900) {
    if (!animar || this.quieto) {
      this.vuelo = null;
      this.camara.position.copy(p);
      this.ctrl.target.copy(m);
      this.ctrl.update();
      this.invalidar();
      return;
    }
    this.duracionVuelo = duracion;
    this.vuelo = { t0: performance.now(), p0: this.camara.position.clone(), m0: this.ctrl.target.clone(), p, m };
    this.invalidar();
  }

  private entrarEnCamara(plano: Plano, id: string, elevacionM: number) {
    const c = plano.camaras.find((x) => x.id === id);
    const cm = c ? camaraEnMetros(c, plano.escala) : null;
    if (!cm) return;
    if (!this.pov) this.pov = { p: this.camara.position.clone(), m: this.ctrl.target.clone() };
    this.vuelo = null;
    this.ctrl.enabled = false;
    const d = dirRumbo(cm.rumboDeg);
    const inc = aRad(cm.inclinacionDeg);
    const ojo = new THREE.Vector3(cm.pos.x, cm.alturaM + elevacionM, cm.pos.y);
    const hacia = new THREE.Vector3(d.x * Math.cos(inc), -Math.sin(inc), d.y * Math.cos(inc));
    this.camara.fov = Math.min(cm.vfovDeg, 120);
    this.camara.position.copy(ojo);
    this.camara.lookAt(ojo.clone().add(hacia));
    this.camara.near = 0.05;
    this.camara.far = 600;
    this.camara.updateProjectionMatrix();
    this.invalidar();
  }

  private salirDeCamara() {
    this.ctrl.enabled = !this.rec;
    this.camara.fov = this.rec ? FOV_RECORRIDO : FOV_MAQUETA;
    this.camara.updateProjectionMatrix();
    if (this.pov) {
      this.camara.position.copy(this.pov.p);
      this.ctrl.target.copy(this.pov.m);
      this.pov = null;
      if (this.rec) this.aplicarPose();
      else this.ctrl.update();
    }
    this.invalidar();
  }

  /** Para arrastrar equipos: la vista no debe girar mientras tanto. */
  controles(activos: boolean) {
    this.ctrl.enabled = activos && !this.previo?.verDesde && !this.rec && !this.transicion;
  }

  modoArrastre(modo: ModoArrastre) {
    if (modo === "deslizar") {
      this.ctrl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
      this.ctrl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    } else {
      this.ctrl.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      this.ctrl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    }
  }

  /** Teclas que mueven: W A S D, flechas, Q y E, y Mayús para ir más rápido. */
  tecla(codigo: string, abajo: boolean) {
    if (abajo) this.teclas.add(codigo);
    else this.teclas.delete(codigo);
  }

  soltarTeclas() {
    this.teclas.clear();
  }

  /* ── Caminar adentro ── */

  get recorriendo() {
    return Boolean(this.rec);
  }

  get guiando() {
    return Boolean(this.guiado);
  }

  /** Dónde se está y hacia dónde se mira, en metros del plano. */
  posicionRecorrido(): { x: number; y: number; rumboDeg: number } | null {
    const r = this.rec;
    return r ? { x: r.pos.x, y: r.pos.y, rumboDeg: (r.yaw * 180) / Math.PI } : null;
  }

  private poseDeRecorrido(r: Recorrido): { p: THREE.Vector3; q: THREE.Quaternion } {
    MIRADA.set(r.pitch, -r.yaw, 0);
    return {
      p: new THREE.Vector3(r.pos.x, (this.previo?.elevacionM ?? 0) + r.ojoM, r.pos.y),
      q: new THREE.Quaternion().setFromEuler(MIRADA),
    };
  }

  private aplicarPose() {
    if (!this.rec) return;
    const { p, q } = this.poseDeRecorrido(this.rec);
    this.camara.position.copy(p);
    this.camara.quaternion.copy(q);
    this.invalidar();
  }

  entrarRecorrido(pos: Punto, rumboDeg?: number, mirarAlturaM?: number) {
    const d = this.previo;
    if (!d) return;
    if (!this.rec) this.orbitaGuardada = { p: this.camara.position.clone(), m: this.ctrl.target.clone() };
    this.vuelo = null;
    this.ctrl.enabled = false;
    const frente = this.ctrl.target.clone().sub(this.camara.position);
    const yaw = rumboDeg != null ? aRad(rumboDeg) : Math.atan2(frente.x, -frente.z);
    // Si se entra a ver algo en alto, ya se llega mirándolo.
    const pitch = mirarAlturaM != null ? Math.atan2(mirarAlturaM - ALTURA_OJOS_M, 2) : 0;
    this.rec = { pos: { ...pos }, vx: 0, vz: 0, yaw, pitch, yawMeta: yaw, pitchMeta: pitch, ojoM: ALTURA_OJOS_M, ojoMeta: ALTURA_OJOS_M, viaje: null };
    this.tramos = tramosDelPlano(d.plano);
    this.armarAmbiente(d.plano, d.elevacionM);
    this.ambiente.visible = true;
    this.pintarCielo(d.capas.noche);
    this.camara.near = 0.05;
    this.camara.far = 900;
    const { p, q } = this.poseDeRecorrido(this.rec);
    this.transicion = { t0: performance.now(), dur: this.quieto ? 0 : 1250, p0: this.camara.position.clone(), q0: this.camara.quaternion.clone(), f0: this.camara.fov, p1: p, q1: q, f1: FOV_RECORRIDO };
    this.actualizar(d);
  }

  salirRecorrido() {
    const d = this.previo;
    const vuelta = this.orbitaGuardada;
    if (!d || !this.rec) return;
    const terminoGuiado = this.guiado;
    this.rec = null;
    this.guiado = null;
    if (terminoGuiado) this.avisos.alTerminarGuiado?.();
    this.teclas.clear();
    this.reticula.visible = false;
    this.ambiente.visible = false;
    this.pintarCielo(d.capas.noche);
    const sobra = new THREE.Object3D();
    if (vuelta) {
      sobra.position.copy(vuelta.p);
      sobra.up.copy(this.camara.up);
      // `lookAt` de un Object3D apunta su +Z; la cámara mira por -Z.
      const atras = vuelta.p.clone().multiplyScalar(2).sub(vuelta.m);
      sobra.lookAt(atras);
    }
    this.transicion = {
      t0: performance.now(),
      dur: this.quieto ? 0 : 1050,
      p0: this.camara.position.clone(),
      q0: this.camara.quaternion.clone(),
      f0: this.camara.fov,
      p1: vuelta?.p ?? this.camara.position.clone(),
      q1: sobra.quaternion.clone(),
      f1: FOV_MAQUETA,
      alFinal: () => {
        if (vuelta) this.ctrl.target.copy(vuelta.m);
        this.ctrl.enabled = !this.previo?.verDesde;
        this.ctrl.update();
      },
    };
    this.orbitaGuardada = null;
    this.actualizar(d);
  }

  /** Arrastrar para mirar. Como en un mapa de calle: se arrastra el mundo. */
  mirar(dx: number, dy: number) {
    const r = this.rec;
    if (!r) return;
    this.terminarGuiado();
    const k = aRad(FOV_RECORRIDO) / Math.max(this.alto, 200);
    r.yawMeta -= dx * k;
    r.pitchMeta = Math.min(Math.max(r.pitchMeta + dy * k, -1.45), 1.45);
  }

  /** Avanza unos metros con la rueda: se desliza y frena solo. */
  empujar(metros: number) {
    const r = this.rec;
    if (!r) return;
    this.terminarGuiado();
    r.viaje = null;
    r.ojoMeta = ALTURA_OJOS_M;
    const v = Math.min(Math.max(metros, -1.5), 1.5) * 10;
    r.vx += Math.sin(r.yawMeta) * v;
    r.vz += -Math.cos(r.yawMeta) * v;
  }

  /** Va hasta ese punto sin cruzar por donde no cabe. Con `girar` voltea hacia donde va. */
  irA(pos: Punto, girar = false) {
    this.terminarGuiado();
    this.viajar(pos, girar);
  }

  private viajar(pos: Punto, girar: boolean) {
    const r = this.rec;
    if (!r) return;
    const b = moverConChoques(this.tramos, pos, pos);
    const largo = Math.hypot(b.x - r.pos.x, b.y - r.pos.y);
    if (largo < 0.05) return;
    r.viaje = { a: { ...r.pos }, b, t0: performance.now(), dur: this.quieto ? 1 : Math.min(Math.max((largo / 5) * 1000, 420), 2200) };
    r.vx = 0;
    r.vz = 0;
    r.ojoMeta = ALTURA_OJOS_M;
    if (girar && largo > 1) {
      r.yawMeta = r.yaw + giroCorto(r.yaw, Math.atan2(b.x - r.pos.x, -(b.y - r.pos.y)));
      r.pitchMeta = 0;
    }
    this.invalidar();
  }

  /** Se acerca a un equipo y lo mira de frente, a su altura. */
  revisar(id: string): boolean {
    const r = this.rec;
    if (!r) return false;
    const caja = this.cajaDe(id);
    if (!caja) return false;
    this.terminarGuiado();
    const centro = caja.getCenter(new THREE.Vector3());
    const alto = centro.y - (this.previo?.elevacionM ?? 0);
    const lejos = Math.max(caja.getSize(new THREE.Vector3()).length() * 1.7, 0.9);
    const dx = r.pos.x - centro.x;
    const dz = r.pos.y - centro.z;
    const l = Math.hypot(dx, dz) || 1;
    const destino = moverConChoques(this.tramos, { x: centro.x + (dx / l) * lejos, y: centro.z + (dz / l) * lejos }, { x: centro.x + (dx / l) * lejos, y: centro.z + (dz / l) * lejos });
    this.viajar(destino, false);
    r.yawMeta = r.yaw + giroCorto(r.yaw, Math.atan2(centro.x - destino.x, -(centro.z - destino.y)));
    // Un poco abajo del equipo y mirando hacia él: así se ve lo que tiene al frente.
    r.ojoMeta = Math.max(alto - 0.12, 0.4);
    r.pitchMeta = Math.atan2(0.12, Math.max(Math.hypot(centro.x - destino.x, centro.z - destino.y), 0.2));
    return true;
  }

  private cajaDe(id: string): THREE.Box3 | null {
    const caja = new THREE.Box3();
    for (const capa of [this.capas.camaras, this.capas.equipos]) {
      capa.traverse((n) => {
        const s = n.userData.sel as Seleccion | undefined;
        if (s?.id !== id) return;
        n.updateWorldMatrix(true, false);
        const geo = (n as THREE.Mesh).geometry;
        if (geo) {
          geo.computeBoundingBox();
          caja.union(geo.boundingBox!.clone().applyMatrix4(n.matrixWorld));
        }
      });
    }
    return caja.isEmpty() ? null : caja;
  }

  /** Recorre las áreas una por una, sin tocar nada: para enseñar el sitio. */
  iniciarGuiado(paradas: readonly Punto[]) {
    if (!this.rec || !paradas.length) return;
    this.guiado = { paradas: [...paradas], i: -1, hasta: 0 };
    this.siguienteParada();
  }

  terminarGuiado() {
    if (!this.guiado) return;
    this.guiado = null;
    this.avisos.alTerminarGuiado?.();
  }

  private siguienteParada() {
    const g = this.guiado;
    if (!g) return;
    g.i += 1;
    g.hasta = 0;
    if (g.i >= g.paradas.length) {
      this.terminarGuiado();
      return;
    }
    this.viajar(g.paradas[g.i], true);
  }

  private pasoRecorrido(r: Recorrido, ahora: number, dt: number) {
    const t = this.teclas;
    const adelante = (t.has("KeyW") || t.has("ArrowUp") ? 1 : 0) - (t.has("KeyS") || t.has("ArrowDown") ? 1 : 0);
    const lado = (t.has("KeyD") ? 1 : 0) - (t.has("KeyA") ? 1 : 0);
    const giro = (t.has("ArrowRight") || t.has("KeyE") ? 1 : 0) - (t.has("ArrowLeft") || t.has("KeyQ") ? 1 : 0);
    if (adelante || lado || giro) {
      this.terminarGuiado();
      if (adelante || lado) {
        r.viaje = null;
        r.ojoMeta = ALTURA_OJOS_M;
      }
    }
    r.yawMeta += giro * 1.55 * dt;
    if (this.guiado && !r.viaje) {
      if (!this.guiado.hasta) this.guiado.hasta = ahora + 4200;
      r.yawMeta += 0.55 * dt;
      if (ahora >= this.guiado.hasta) this.siguienteParada();
    }
    let cambio = false;
    if (r.viaje) {
      const k = Math.min((ahora - r.viaje.t0) / r.viaje.dur, 1);
      const f = suave(k);
      r.pos = { x: r.viaje.a.x + (r.viaje.b.x - r.viaje.a.x) * f, y: r.viaje.a.y + (r.viaje.b.y - r.viaje.a.y) * f };
      if (k >= 1) r.viaje = null;
      cambio = true;
    } else {
      const largo = Math.hypot(adelante, lado) || 1;
      const vel = t.has("ShiftLeft") || t.has("ShiftRight") ? VEL_CORRER : VEL_CAMINAR;
      const fx = Math.sin(r.yawMeta);
      const fz = -Math.cos(r.yawMeta);
      const quiereX = ((fx * adelante + -fz * lado) / largo) * vel;
      const quiereZ = ((fz * adelante + fx * lado) / largo) * vel;
      const s = 1 - Math.exp(-dt * 10);
      r.vx += (quiereX - r.vx) * s;
      r.vz += (quiereZ - r.vz) * s;
      if (Math.hypot(r.vx, r.vz) > 0.015) {
        r.pos = moverConChoques(this.tramos, r.pos, { x: r.pos.x + r.vx * dt, y: r.pos.y + r.vz * dt });
        cambio = true;
      } else {
        r.vx = 0;
        r.vz = 0;
      }
    }
    const dYaw = giroCorto(r.yaw, r.yawMeta);
    const dPitch = r.pitchMeta - r.pitch;
    const dOjo = r.ojoMeta - r.ojoM;
    if (Math.abs(dYaw) > 1e-4 || Math.abs(dPitch) > 1e-4 || Math.abs(dOjo) > 1e-3) {
      const s = 1 - Math.exp(-dt * 15);
      r.yaw += dYaw * s;
      r.pitch += dPitch * s;
      r.ojoM += dOjo * (1 - Math.exp(-dt * 6));
      cambio = true;
    }
    if (cambio) this.aplicarPose();
  }

  /** Desde arriba, con las teclas: el mapa se desliza y Q o E lo giran. */
  private pasoOrbita(dt: number) {
    const t = this.teclas;
    if (!t.size) return;
    const adelante = (t.has("KeyW") || t.has("ArrowUp") ? 1 : 0) - (t.has("KeyS") || t.has("ArrowDown") ? 1 : 0);
    const lado = (t.has("KeyD") || t.has("ArrowRight") ? 1 : 0) - (t.has("KeyA") || t.has("ArrowLeft") ? 1 : 0);
    const giro = (t.has("KeyE") ? 1 : 0) - (t.has("KeyQ") ? 1 : 0);
    if (!adelante && !lado && !giro) return;
    const d = this.camara.position.clone().sub(this.ctrl.target);
    if (giro) {
      d.applyAxisAngle(new THREE.Vector3(0, 1, 0), giro * 1.1 * dt);
      this.camara.position.copy(this.ctrl.target).add(d);
    }
    if (adelante || lado) {
      const l = Math.hypot(d.x, d.z) || 1;
      const fx = -d.x / l;
      const fz = -d.z / l;
      const largo = Math.hypot(adelante, lado) || 1;
      const vel = d.length() * (t.has("ShiftLeft") || t.has("ShiftRight") ? 1.3 : 0.55) * dt;
      const mx = ((fx * adelante + -fz * lado) / largo) * vel;
      const mz = ((fz * adelante + fx * lado) / largo) * vel;
      this.camara.position.x += mx;
      this.camara.position.z += mz;
      this.ctrl.target.x += mx;
      this.ctrl.target.z += mz;
    }
    this.invalidar();
    this.pintarMuros();
  }

  /** Que el sitio no se pierda de vista al deslizar. */
  private contenerVista() {
    const lim = this.limites;
    const holgura = Math.max(6, Math.hypot(lim.max.x - lim.min.x, lim.max.y - lim.min.y) * 0.25);
    const t = this.ctrl.target;
    const x = Math.min(Math.max(t.x, lim.min.x - holgura), lim.max.x + holgura);
    const z = Math.min(Math.max(t.z, lim.min.y - holgura), lim.max.y + holgura);
    if (x === t.x && z === t.z) return;
    this.camara.position.x += x - t.x;
    this.camara.position.z += z - t.z;
    t.x = x;
    t.z = z;
    this.invalidar();
  }

  private pasoTransicion(ahora: number) {
    const v = this.transicion;
    if (!v) return;
    const k = v.dur ? Math.min((ahora - v.t0) / v.dur, 1) : 1;
    const f = suave(k);
    this.camara.position.lerpVectors(v.p0, v.p1, f);
    this.camara.quaternion.slerpQuaternions(v.q0, v.q1, f);
    this.camara.fov = v.f0 + (v.f1 - v.f0) * f;
    this.camara.updateProjectionMatrix();
    this.invalidar();
    if (k >= 1) {
      this.transicion = null;
      v.alFinal?.();
    }
  }

  /** Rumbo en pantalla del norte del plano (para la brújula). */
  rumboNorte(norteDeg: number): number {
    const n = dirRumbo(norteDeg);
    const a = new THREE.Vector3(this.ctrl.target.x, this.ctrl.target.y, this.ctrl.target.z).project(this.camara);
    const b = new THREE.Vector3(this.ctrl.target.x + n.x, this.ctrl.target.y, this.ctrl.target.z + n.y).project(this.camara);
    return (Math.atan2((b.x - a.x) * this.ancho, (b.y - a.y) * this.alto) * 180) / Math.PI;
  }

  /* ── Puntero ── */

  private rayo(x: number, y: number) {
    this.raycaster.setFromCamera(new THREE.Vector2((x / this.ancho) * 2 - 1, -(y / this.alto) * 2 + 1), this.camara);
  }

  /** Lo que hay bajo el puntero. Los equipos y las personas ganan aunque estén detrás de un muro. */
  tocar(x: number, y: number): Seleccion | null {
    this.rayo(x, y);
    const primero = (capas: THREE.Object3D[]): Seleccion | null => {
      const elegibles: THREE.Object3D[] = [];
      for (const c of capas) c.traverse((n) => n.userData.sel && !n.userData.tenue && elegibles.push(n));
      const hit = this.raycaster.intersectObjects(elegibles, false)[0];
      return hit ? (hit.object.userData.sel as Seleccion) : null;
    };
    return (
      primero([this.capas.camaras, this.capas.equipos, this.capas.personas]) ??
      primero([this.capas.muebles, this.capas.obstaculos, this.capas.arquitectura]) ??
      primero([this.capas.areas])
    );
  }

  /** Lo primero que se topa la vista: adentro, lo que está tras un muro no se puede tocar. */
  tocarDeFrente(x: number, y: number): Seleccion | null {
    this.rayo(x, y);
    const elegibles: THREE.Object3D[] = [];
    for (const c of [this.capas.camaras, this.capas.equipos, this.capas.personas, this.capas.muebles, this.capas.obstaculos, this.capas.arquitectura]) {
      c.traverse((n) => n.userData.sel && !n.userData.tenue && elegibles.push(n));
    }
    const hit = this.raycaster.intersectObjects(elegibles, false)[0];
    return hit ? (hit.object.userData.sel as Seleccion) : null;
  }

  /** El punto del piso bajo el puntero, si no hay un muro antes. */
  destinoEnPiso(x: number, y: number): Punto | null {
    this.rayo(x, y);
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.capas.arquitectura.position.y);
    const p = this.raycaster.ray.intersectPlane(plano, new THREE.Vector3());
    if (!p) return null;
    const hasta = this.raycaster.ray.origin.distanceTo(p);
    const estorbo = this.raycaster.intersectObjects([this.capas.arquitectura, this.capas.obstaculos], true).find((h) => !h.object.userData.esProxy && !h.object.userData.tenue);
    return estorbo && estorbo.distance < hasta ? null : { x: p.x, y: p.z };
  }

  /** Marca en el piso a dónde se iría al hacer clic. */
  marcarDestino(p: Punto | null) {
    const visible = Boolean(p);
    if (visible !== this.reticula.visible) this.invalidar();
    this.reticula.visible = visible;
    if (p) {
      this.reticula.position.set(p.x, this.capas.arquitectura.position.y + 0.03, p.y);
      this.invalidar();
    }
  }

  /**
   * Dónde queda algo al ponerlo. Si el puntero cae sobre la cara de un muro, a esa altura y mirando hacia
   * afuera del muro; si no, sobre el piso. Es lo que deja poner una cámara viendo el muro de frente.
   */
  montaje(x: number, y: number): Montaje | null {
    this.rayo(x, y);
    const y0 = this.capas.arquitectura.position.y;
    const p = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0), new THREE.Vector3());
    const hasta = p ? this.raycaster.ray.origin.distanceTo(p) : Infinity;
    const hit = this.raycaster.intersectObject(this.capas.arquitectura, true).find((h) => !h.object.userData.esProxy && !h.object.userData.tenue);
    if (hit?.face && hit.distance < hasta) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const alturaM = Math.max(hit.point.y - y0, 0.3);
      if (Math.abs(n.y) > 0.5) return { punto: { x: hit.point.x, y: hit.point.z }, alturaM, rumboDeg: null };
      const rumbo = (Math.atan2(n.x, -n.z) * 180) / Math.PI;
      return { punto: { x: hit.point.x + n.x * 0.06, y: hit.point.z + n.z * 0.06 }, alturaM, rumboDeg: (Math.round(rumbo) + 360) % 360 };
    }
    return p ? { punto: { x: p.x, y: p.z }, alturaM: null, rumboDeg: null } : null;
  }

  /**
   * Punto bajo el puntero a cierta altura: lo que se arrastra sigue al puntero aunque esté a 3 m del
   * piso. Medido en el piso se vería corrido, más entre más inclinada esté la vista.
   */
  puntoAAltura(x: number, y: number, alturaM: number): Punto | null {
    this.rayo(x, y);
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.capas.arquitectura.position.y + alturaM));
    const p = this.raycaster.ray.intersectPlane(plano, new THREE.Vector3());
    return p ? { x: p.x, y: p.z } : null;
  }

  /** Cuántos px de pantalla mide un metro alrededor de ese punto. */
  pxPorMetro(pos: Punto): number {
    const d = this.camara.position.distanceTo(new THREE.Vector3(pos.x, this.capas.arquitectura.position.y, pos.y));
    return this.alto / (2 * Math.tan(aRad(this.camara.fov) / 2) * Math.max(d, 0.1));
  }

  /** Punto del piso (metros del plano) bajo el puntero. */
  pisoEn(x: number, y: number): Punto | null {
    this.rayo(x, y);
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.capas.arquitectura.position.y);
    const p = this.raycaster.ray.intersectPlane(plano, new THREE.Vector3());
    return p ? { x: p.x, y: p.z } : null;
  }

  /** Pasa un punto 3D a pantalla; `visible` es false si queda detrás de la vista. */
  aPantalla(pos: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = pos.clone();
    v.y += this.capas.arquitectura.position.y;
    // Puede llamarse antes del primer cuadro: la matriz de la vista debe estar al día.
    this.camara.updateMatrixWorld();
    v.project(this.camara);
    return { x: ((v.x + 1) / 2) * this.ancho, y: ((1 - v.y) / 2) * this.alto, visible: v.z < 1 };
  }

  /* ── Pintar ── */

  medir(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    this.ancho = w;
    this.alto = h;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.invalidar();
  }

  invalidar() {
    this.sucio = true;
    this.ultimaActividad = performance.now();
  }

  private readonly alCambiarVista = () => {
    this.invalidar();
    this.pintarMuros();
  };

  /** Los muros de afuera que quedan entre quien ve y el interior se vuelven tenues («casa de muñecas»). */
  private pintarMuros() {
    const d = this.previo;
    if (!d) return;
    const dx = this.camara.position.x - this.ctrl.target.x;
    const dz = this.camara.position.z - this.ctrl.target.z;
    const l = Math.hypot(dx, dz) || 1;
    const porEncima = this.camara.position.y - this.ctrl.target.y;
    const pendiente = Math.max(porEncima, 0.01) / l;
    const selMuro = d.seleccion?.tipo === "muro" ? d.seleccion.id : null;
    for (const m of this.muros) {
      // Un muro tapa, hacia adentro, altura ÷ pendiente: si son más de 4.5 m, estorba y se vuelve tenue.
      const tapa = !this.rec && m.exterior && m.alturaM / pendiente > 4.5 && (m.normal.x * dx + m.normal.y * dz) / l > 0.18;
      const material = m.id === selMuro ? this.mats.muroSeleccion : d.capas.translucidos || tapa ? this.mats.muroTenue : this.mats.muro;
      if (this.estadoMuro.get(m.id) === material) continue;
      this.estadoMuro.set(m.id, material);
      for (const malla of m.mallas) {
        malla.material = material;
        malla.userData.tenue = material === this.mats.muroTenue;
      }
    }
  }

  private readonly cuadro = (ahora: number) => {
    if (this.destruido) return;
    this.idCuadro = requestAnimationFrame(this.cuadro);
    const dt = Math.min((ahora - this.ultimoPaso) / 1000, 0.05);
    this.ultimoPaso = ahora;
    if (this.vuelo) {
      const k = Math.min((ahora - this.vuelo.t0) / this.duracionVuelo, 1);
      const f = suave(k);
      this.camara.position.lerpVectors(this.vuelo.p0, this.vuelo.p, f);
      this.ctrl.target.lerpVectors(this.vuelo.m0, this.vuelo.m, f);
      if (k >= 1) this.vuelo = null;
      this.invalidar();
    }
    if (this.transicion) this.pasoTransicion(ahora);
    else if (!this.previo?.verDesde) {
      if (this.rec) this.pasoRecorrido(this.rec, ahora, dt);
      else {
        if (!this.vuelo) this.pasoOrbita(dt);
        this.ctrl.update();
        if (!this.vuelo) this.contenerVista();
      }
    }
    if (this.sombrasEn && ahora >= this.sombrasEn) {
      this.sombrasEn = 0;
      this.renderer.shadowMap.needsUpdate = true;
      this.invalidar();
    }
    if (this.sucio) {
      this.sucio = false;
      this.pendienteCalidad = true;
      if (this.ao) this.ao.enabled = false;
      this.ajustarPlanos();
      this.medirRendimiento(ahora);
      this.composer.render();
      this.avisos.alPintar?.();
    } else if (this.pendienteCalidad && ahora - this.ultimaActividad > 180) {
      this.pendienteCalidad = false;
      this.ultimoCuadro = 0;
      if (this.ao) {
        this.ao.enabled = true;
        this.composer.render();
        this.ao.enabled = false;
      }
    }
  };

  /** Plano cercano según la distancia: evita que los pisos se peleen de lejos y deja acercarse a un domo. */
  private ajustarPlanos() {
    if (this.previo?.verDesde || this.rec || this.transicion) return;
    const dist = this.camara.position.distanceTo(this.ctrl.target);
    this.camara.near = Math.min(Math.max(dist * 0.03, 0.05), 3);
    this.camara.far = dist * 5 + 200;
    this.camara.updateProjectionMatrix();
  }

  /** Si no alcanza a 20 cuadros por segundo, baja la resolución: mejor fluido que nítido. */
  private medirRendimiento(ahora: number) {
    if (this.ultimoCuadro) {
      this.tiempos.push(ahora - this.ultimoCuadro);
      if (this.tiempos.length >= 30) {
        const prom = this.tiempos.reduce((s, t) => s + t, 0) / this.tiempos.length;
        this.tiempos = [];
        if (prom > 50 && this.renderer.getPixelRatio() > 1) {
          this.renderer.setPixelRatio(1);
          this.medir(this.ancho, this.alto);
        }
      }
    }
    this.ultimoCuadro = ahora;
  }

  /** Foto de la maqueta en JPEG, para la propuesta. */
  captura(w: number, h: number): string {
    const ratio = this.renderer.getPixelRatio();
    const ancho = this.ancho;
    const alto = this.alto;
    this.renderer.setPixelRatio(1);
    this.medir(w, h);
    this.ajustarPlanos();
    if (this.ao) this.ao.enabled = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render();
    const foto = this.lienzo.toDataURL("image/jpeg", 0.92);
    if (this.ao) this.ao.enabled = false;
    this.renderer.setPixelRatio(ratio);
    this.medir(ancho, alto);
    return foto;
  }

  private readonly alPerder = (e: Event) => {
    e.preventDefault();
    this.avisos.alPerderContexto?.();
  };

  destruir() {
    this.destruido = true;
    cancelAnimationFrame(this.idCuadro);
    this.lienzo.removeEventListener("webglcontextlost", this.alPerder);
    this.ctrl.removeEventListener("change", this.alCambiarVista);
    this.ctrl.dispose();
    for (const g of Object.values(this.capas)) liberar(g);
    liberar(this.ambiente);
    liberar(this.reticula);
    for (const m of Object.values(this.mats)) m.dispose();
    this.composer.dispose();
    this.ao?.dispose();
    this.brillo.dispose();
    this.escena.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
