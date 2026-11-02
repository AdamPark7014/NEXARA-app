"use client";

/**
 * Un equipo solo, para revisarlo: el modelo armado con las medidas de su ficha, con vistas de frente, de
 * lado y desde arriba, y sus cotas. Las cotas dicen solo lo que dice la ficha: lo que no trae, no se acota.
 * Pinta a pedido y se rearma cuando cambian las medidas. También saca la foto de estudio que se guarda en
 * el catálogo. Carga three.js, así que se importa con `next/dynamic`.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { TipoFicha } from "@/lib/cctv/ficha";
import { esCamara } from "@/lib/cctv/ficha";
import { crearModelo, inclinarModelo, type ParamsModelo, type TipoModelo } from "@/lib/cctv/maqueta/modelos";
import { crearModeloEquipo, type ParamsEquipo } from "@/lib/cctv/maqueta/modelosEquipos";
import type { TipoEquipo } from "@/lib/cctv/catalogo";
import styles from "./memoria.module.css";

export type RefVisor = {
  /** Foto del modelo con fondo transparente. Null si el navegador no la pudo sacar. */
  foto: (lado?: number) => string | null;
};

/** Medidas reales, en mm, tal como vienen en la ficha. */
export type CotasModelo = { anchoMm?: number | null; altoMm?: number | null; fondoMm?: number | null; diametroMm?: number | null };

/** Desde dónde se ve cada tipo, y cuánto se inclina la cámara para que se vea su lente. */
const VISTAS_TIPO: Readonly<Record<string, { yaw: number; pitch: number; inclina?: number }>> = {
  domo: { yaw: 16, pitch: -14, inclina: 36 },
  turret: { yaw: 24, pitch: -8, inclina: 24 },
  bala: { yaw: 40, pitch: 4, inclina: 4 },
  ptz: { yaw: 18, pitch: -8, inclina: 12 },
  gabinete: { yaw: 24, pitch: 8 },
  terminal: { yaw: 20, pitch: 2 },
  barrera: { yaw: 28, pitch: 12 },
  sirena: { yaw: 22, pitch: 6 },
  sismica: { yaw: 22, pitch: 6 },
  panel: { yaw: 22, pitch: 8 },
};
const VISTA_RACK = { yaw: 22, pitch: 18 };
const FOV = 20;
const COLOR_COTA = 0x0f7f6c;

type Vista = "tres" | "frente" | "lado" | "arriba";
const BOTONES: ReadonlyArray<[Vista, string]> = [
  ["tres", "3/4"],
  ["frente", "Frente"],
  ["lado", "Lado"],
  ["arriba", "Arriba"],
];

function tipoCamara(tipo: TipoFicha): TipoModelo {
  return tipo === "bala" || tipo === "turret" || tipo === "ptz" ? tipo : "domo";
}

function armar(tipo: TipoFicha, params: Record<string, unknown>): THREE.Group {
  if (esCamara(tipo)) {
    const t = tipoCamara(tipo);
    const m = crearModelo(t, { ...(params as ParamsModelo), estudio: true });
    inclinarModelo(m, VISTAS_TIPO[t].inclina ?? 20);
    return m;
  }
  return crearModeloEquipo(tipo as TipoEquipo, params as ParamsEquipo);
}

function etiquetaCota(texto: string, alto: number): THREE.Sprite {
  const el = document.createElement("canvas");
  const c = el.getContext("2d");
  const fuente = "600 44px system-ui, sans-serif";
  if (c) c.font = fuente;
  const ancho = Math.ceil((c?.measureText(texto).width ?? 200) + 44);
  el.width = ancho;
  el.height = 72;
  if (c) {
    c.font = fuente;
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.roundRect(0, 0, ancho, 72, 36);
    c.fill();
    c.fillStyle = "#0b5d50";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(texto, ancho / 2, 38);
  }
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set((alto * ancho) / 72, alto, 1);
  s.renderOrder = 11;
  return s;
}

/** Líneas de cota por fuera de la caja del modelo, con su valor. */
function armarCotas(caja: THREE.Box3, cotas: CotasModelo): THREE.Group {
  const g = new THREE.Group();
  const diag = caja.getSize(new THREE.Vector3()).length() || 1;
  const hueco = diag * 0.07;
  const marca = diag * 0.022;
  const alto = diag * 0.055;
  const { min, max } = caja;
  const puntos: number[] = [];
  const tramo = (a: THREE.Vector3, b: THREE.Vector3, normal: THREE.Vector3, texto: string) => {
    puntos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (const q of [a, b]) {
      const n = normal.clone().multiplyScalar(marca);
      puntos.push(q.x - n.x, q.y - n.y, q.z - n.z, q.x + n.x, q.y + n.y, q.z + n.z);
    }
    const e = etiquetaCota(texto, alto);
    e.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(normal, alto * 0.9);
    g.add(e);
  };
  const x = cotas.diametroMm ? `ø ${cotas.diametroMm} mm` : cotas.anchoMm ? `${cotas.anchoMm} mm` : null;
  if (x) tramo(new THREE.Vector3(min.x, min.y - hueco, max.z), new THREE.Vector3(max.x, min.y - hueco, max.z), new THREE.Vector3(0, -1, 0), x);
  if (cotas.altoMm) tramo(new THREE.Vector3(max.x + hueco, min.y, max.z), new THREE.Vector3(max.x + hueco, max.y, max.z), new THREE.Vector3(1, 0, 0), `${cotas.altoMm} mm`);
  if (cotas.fondoMm) tramo(new THREE.Vector3(max.x + hueco, min.y - hueco, min.z), new THREE.Vector3(max.x + hueco, min.y - hueco, max.z), new THREE.Vector3(1, 0, 0), `${cotas.fondoMm} mm`);
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));
  const lineas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COLOR_COTA, depthTest: false, transparent: true }));
  lineas.renderOrder = 10;
  g.add(lineas);
  return g;
}

function liberarGrupo(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.SpriteMaterial | undefined;
    mat?.map?.dispose?.();
    mat?.dispose?.();
  });
}

type Mundo = {
  r: THREE.WebGLRenderer;
  escena: THREE.Scene;
  camara: THREE.PerspectiveCamera;
  ctrl: OrbitControls;
  sombra: THREE.Mesh;
  actual: THREE.Object3D | null;
  cotas: THREE.Group | null;
  centro: THREE.Vector3;
  radio: number;
  base: { yaw: number; pitch: number };
  idVuelo: number;
  pintar: () => void;
};

/** Dónde se pone la vista para esa vista, a la distancia en que cabe el modelo. */
function poseDe(m: Mundo, vista: Vista, holgura: number): THREE.Vector3 {
  const v = vista === "frente" ? { yaw: 0, pitch: 0 } : vista === "lado" ? { yaw: 90, pitch: 0 } : vista === "arriba" ? { yaw: 0, pitch: 89 } : m.base;
  const yaw = (v.yaw * Math.PI) / 180;
  const pitch = (v.pitch * Math.PI) / 180;
  const dist = (m.radio / Math.tan((FOV / 2) * (Math.PI / 180))) * holgura;
  return new THREE.Vector3(m.centro.x + Math.sin(yaw) * Math.cos(pitch) * dist, m.centro.y + Math.sin(pitch) * dist, m.centro.z + Math.cos(yaw) * Math.cos(pitch) * dist);
}

export default forwardRef<RefVisor, { tipo: TipoFicha; params: Record<string, unknown>; cotas?: CotasModelo; onSinWebGL?: () => void }>(function VisorModelo({ tipo, params, cotas, onSinWebGL }, ref) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const mundo = useRef<Mundo | null>(null);
  const aviso = useRef(onSinWebGL);
  aviso.current = onSinWebGL;
  const [vista, setVista] = useState<Vista>("tres");
  const [verCotas, setVerCotas] = useState(false);
  const hayCotas = Boolean(cotas && (cotas.anchoMm || cotas.altoMm || cotas.fondoMm || cotas.diametroMm));

  useEffect(() => {
    const el = lienzo.current;
    if (!el) return;
    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      aviso.current?.();
      return;
    }
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const generador = new THREE.PMREMGenerator(r);
    const escena = new THREE.Scene();
    escena.environment = generador.fromScene(new RoomEnvironment(), 0.02).texture;
    escena.environmentIntensity = 0.62;
    generador.dispose();
    const sol = new THREE.DirectionalLight(0xffffff, 1.7);
    sol.position.set(2, 4, 3);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.radius = 7;
    sol.shadow.bias = -0.0005;
    const relleno = new THREE.DirectionalLight(0xdfe9ff, 0.55);
    relleno.position.set(-3, 1, 1.5);
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.2 }));
    sombra.receiveShadow = true;
    escena.add(sol, sol.target, relleno, sombra);
    const camara = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200);
    const ctrl = new OrbitControls(camara, el);
    ctrl.enablePan = false;
    const pintar = () => r.render(escena, camara);
    ctrl.addEventListener("change", pintar);
    mundo.current = { r, escena, camara, ctrl, sombra, actual: null, cotas: null, centro: new THREE.Vector3(), radio: 1, base: VISTA_RACK, idVuelo: 0, pintar };
    const medir = () => {
      const b = el.parentElement?.getBoundingClientRect();
      if (!b?.width || !b.height) return;
      r.setSize(b.width, b.height, false);
      camara.aspect = b.width / b.height;
      camara.updateProjectionMatrix();
      pintar();
    };
    const ro = new ResizeObserver(medir);
    if (el.parentElement) ro.observe(el.parentElement);
    medir();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(mundo.current?.idVuelo ?? 0);
      ctrl.removeEventListener("change", pintar);
      ctrl.dispose();
      escena.environment?.dispose();
      r.dispose();
      mundo.current = null;
    };
  }, []);

  const volar = (m: Mundo, destino: THREE.Vector3) => {
    cancelAnimationFrame(m.idVuelo);
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (quieto) {
      m.camara.position.copy(destino);
      m.ctrl.update();
      m.pintar();
      return;
    }
    const inicio = m.camara.position.clone();
    const t0 = performance.now();
    const paso = (ahora: number) => {
      const k = Math.min((ahora - t0) / 420, 1);
      const f = 1 - (1 - k) ** 3;
      // En arco alrededor del modelo, para que no se atraviese al cambiar de lado.
      const dir = inicio.clone().sub(m.centro).lerp(destino.clone().sub(m.centro), f).normalize();
      const largo = inicio.distanceTo(m.centro) + (destino.distanceTo(m.centro) - inicio.distanceTo(m.centro)) * f;
      m.camara.position.copy(m.centro).addScaledVector(dir, largo);
      m.ctrl.update();
      m.pintar();
      if (k < 1) m.idVuelo = requestAnimationFrame(paso);
    };
    m.idVuelo = requestAnimationFrame(paso);
  };

  const clave = JSON.stringify([tipo, params]);
  useEffect(() => {
    const m = mundo.current;
    if (!m) return;
    if (m.actual) m.escena.remove(m.actual);
    if (m.cotas) {
      m.escena.remove(m.cotas);
      liberarGrupo(m.cotas);
      m.cotas = null;
    }
    const modelo = armar(tipo, params);
    modelo.traverse((n) => {
      if ((n as THREE.Mesh).isMesh) n.castShadow = true;
    });
    m.escena.add(modelo);
    m.actual = modelo;
    const caja = new THREE.Box3().setFromObject(modelo);
    m.centro = caja.getCenter(new THREE.Vector3());
    const tam = caja.getSize(new THREE.Vector3());
    const diagonal = tam.length() || 1;
    m.radio = diagonal / 2;
    m.base = VISTAS_TIPO[esCamara(tipo) ? tipoCamara(tipo) : tipo] ?? VISTA_RACK;
    m.sombra.position.set(m.centro.x, caja.min.y - diagonal * 0.005, m.centro.z);
    m.sombra.scale.setScalar(diagonal * 6);
    const sol = m.escena.children.find((n) => (n as THREE.DirectionalLight).castShadow) as THREE.DirectionalLight | undefined;
    if (sol) {
      sol.position.set(m.centro.x + diagonal, m.centro.y + diagonal * 2, m.centro.z + diagonal * 1.2);
      sol.target.position.copy(m.centro);
      const s = sol.shadow.camera;
      s.left = -diagonal * 2;
      s.right = diagonal * 2;
      s.top = diagonal * 2;
      s.bottom = -diagonal * 2;
      s.near = diagonal * 0.1;
      s.far = diagonal * 8;
      s.updateProjectionMatrix();
    }
    m.camara.near = diagonal * 0.05;
    m.camara.far = diagonal * 20;
    m.camara.updateProjectionMatrix();
    m.camara.position.copy(poseDe(m, "tres", 1.12));
    m.ctrl.target.copy(m.centro);
    m.ctrl.minDistance = diagonal;
    m.ctrl.maxDistance = diagonal * 18;
    m.ctrl.update();
    setVista("tres");
    setVerCotas(false);
    m.pintar();
    // El modelo se arma con `clave`: `params` es un objeto nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Las cotas cambian al editar un valor, sin rearmar el modelo si no cambió su forma.
  const claveCotas = JSON.stringify(cotas ?? null);
  useEffect(() => {
    const m = mundo.current;
    if (!m?.actual) return;
    if (m.cotas) {
      m.escena.remove(m.cotas);
      liberarGrupo(m.cotas);
      m.cotas = null;
    }
    if (verCotas && cotas) {
      m.cotas = armarCotas(new THREE.Box3().setFromObject(m.actual), cotas);
      m.escena.add(m.cotas);
    }
    m.pintar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verCotas, claveCotas, clave]);

  const irA = (v: Vista, conCotas = verCotas) => {
    const m = mundo.current;
    if (!m) return;
    setVista(v);
    volar(m, poseDe(m, v, conCotas ? 1.34 : 1.12));
  };

  useImperativeHandle(
    ref,
    () => ({
      foto: (lado = 256) => {
        const m = mundo.current;
        if (!m) return null;
        const pose = m.camara.position.clone();
        const conCotas = m.cotas?.visible;
        try {
          // Siempre igual en el catálogo, sin importar cómo lo dejó quien lo revisaba.
          cancelAnimationFrame(m.idVuelo);
          if (m.cotas) m.cotas.visible = false;
          m.sombra.visible = false;
          m.camara.position.copy(poseDe(m, "tres", 1.12));
          m.camara.lookAt(m.centro);
          m.pintar();
          const fuente = m.r.domElement;
          const ancho = fuente.width;
          const alto = fuente.height;
          const salida = document.createElement("canvas");
          salida.width = lado;
          salida.height = lado;
          const c = salida.getContext("2d");
          if (!c) return null;
          // Cuadrado del centro, para que el modelo llene la tarjeta.
          const q = Math.min(ancho, alto);
          c.drawImage(fuente, (ancho - q) / 2, (alto - q) / 2, q, q, 0, 0, lado, lado);
          const webp = salida.toDataURL("image/webp", 0.82);
          return webp.startsWith("data:image/webp") ? webp : salida.toDataURL("image/png");
        } catch {
          return null;
        } finally {
          if (m.cotas) m.cotas.visible = conCotas ?? true;
          m.sombra.visible = true;
          m.camara.position.copy(pose);
          m.ctrl.update();
          m.pintar();
        }
      },
    }),
    [],
  );

  return (
    <>
      <canvas ref={lienzo} role="img" aria-label="Modelo 3D armado con las medidas de la ficha. Arrastra para girarlo." style={{ display: "block", width: "100%", height: "100%", cursor: "grab" }} />
      <div className={styles.visorVistas} role="group" aria-label="Vistas del modelo">
        {BOTONES.map(([id, texto]) => (
          <button key={id} type="button" aria-pressed={vista === id} onClick={() => irA(id)}>
            {texto}
          </button>
        ))}
        {hayCotas ? (
          <button
            type="button"
            className={styles.visorCotas}
            aria-pressed={verCotas}
            onClick={() => {
              const nuevo = !verCotas;
              setVerCotas(nuevo);
              irA(vista, nuevo);
            }}
          >
            Cotas
          </button>
        ) : null}
      </div>
    </>
  );
});
