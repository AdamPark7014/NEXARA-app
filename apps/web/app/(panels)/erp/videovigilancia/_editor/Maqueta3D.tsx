"use client";

/**
 * Maqueta 3D del sitio (mockup aprobado 01-11-2026): se desliza como un mapa, se gira y se acerca, y
 * se puede entrar a caminar por dentro. Las claves de los equipos flotan encima y las herramientas del
 * plano funcionan sobre el piso y sobre los muros. Pesa lo suyo (three.js), así que se carga solo al
 * abrirla; sin WebGL, el editor usa `Lienzo3D`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { equipoPorId, especificacionesCamara, especificacionesEquipo, etiquetaModelo, modeloPorId, type ModeloCamara, type ModeloEquipo, type TipoEquipo } from "@/lib/cctv/catalogo";
import {
  agregarAbertura,
  agregarArea,
  agregarCamara,
  agregarEquipo,
  agregarMueble,
  agregarMuro,
  agregarObstaculo,
  agregarPersona,
  actualizarCamara,
  actualizarEquipo,
  ajustarPunto,
  avisoDeEquipo,
  mirarCamaraHacia,
  mover,
  muroMasCercano,
  type Seleccion,
  type TipoElemento,
} from "@/lib/cctv/editor";
import { elevacionTexto, type NivelConPlano } from "@/lib/cctv/niveles";
import type { Gesto } from "@/lib/cctv/maqueta/controlVista";
import { MotorMaqueta, type Montaje } from "@/lib/cctv/maqueta/motor";
import { claveCamara, claveEquipo, limitesEdificio, limitesSitio } from "@/lib/cctv/medidas";
import { lugarParaCamara, moverCamaraPegada, moverEquipoPegado, pegarAMuros, RADIO_PEGADO_M, type Pegado } from "@/lib/cctv/pegado";
import { dirRumbo, type MaterialPiso, type Plano, type Punto, type Tapa, type TipoMueble } from "@/lib/cctv/plano";
import { ALTURA_OJOS_M, areaEn, camarasQueTeVen, inicioDelRecorrido, moverConChoques, paradasDelSitio, tramosDelPlano, type TeVe } from "@/lib/cctv/recorrido";
import type { Conexion } from "@/lib/cctv/sistema";
import { camaraEnMetros, coberturaCamara, tapado, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { COLOR_NIVEL } from "./colores";
import type { Herramienta } from "./Lienzo";
import MiniMapa from "./MiniMapa";
import Navegacion, { ICONO } from "./Navegacion";
import { TIPO_ARRASTRE, leerArrastre } from "./PanelEquipos";
import styles from "./editor.module.css";

export type CapasDeMaqueta = {
  croquis: boolean;
  etiquetas: boolean;
  translucidos: boolean;
  humanoides: boolean;
  cobertura: boolean;
  claves: boolean;
  noche: boolean;
  tamanoReal: boolean;
  cableado: boolean;
};

const MOVIBLES: ReadonlySet<TipoElemento> = new Set(["camara", "persona", "mueble", "etiqueta", "obstaculo", "area", "equipo"]);
const SIN_NIVELES: readonly NivelConPlano[] = [];
const TIPO_RECORRER = "application/x-cctv-recorrer";
/** Lo que se mueve siempre al arrastrarlo. Lo demás (áreas, muebles) solo si ya está elegido: si no, arrastrar sobre el piso movería el piso. */
const MOVIBLES_DE_UNA: ReadonlySet<TipoElemento> = new Set(["camara", "persona", "equipo"]);
/** Ya usó dos gestos distintos: la ayuda de cómo moverse no vuelve a salir sola. */
const PISTA_APRENDIDA = "nx-cctv-gestos-aprendidos";
/** Más cerca de esto, el doble clic ya no acerca: entra a caminar. */
const DISTANCIA_PARA_ENTRAR_M = 14;
const TECLAS_DE_MOVER: ReadonlySet<string> = new Set(["KeyW", "Equal", "Minus", "NumpadAdd", "NumpadSubtract", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
const ICONO_CAMINAR = "M13.5 5.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM9.8 22l1.4-6-2.1-2V9.4L7 10.4V14H5V9.2l4.6-2.3c.6-.3 1.3-.3 1.9 0 .6.3 1 .7 1.4 1.3l1.1 1.8c.6 1 1.7 1.8 3 1.9v2c-1.8-.1-3.3-1-4.3-2.2l-.6 3 2.1 2V22h-2v-5.5l-2.1-2-1.3 7.5z";

type Arrastre =
  | { modo: "mover"; sel: Seleccion; ultimo: Punto; fusion: string; movido: boolean; agarre?: Punto; alturaM?: number }
  | { modo: "rect"; tipo: "obstaculo" | "area"; inicio: Punto };

type Rotulo = { clave: string; texto: string; pos: THREE.Vector3; clase: "area" | "nivel" };

export default function Maqueta3D({
  plano,
  nivelId,
  conexiones,
  nombreNivel,
  elevacionM = 0,
  debajo = SIN_NIVELES,
  seleccion,
  tapas,
  coberturas,
  capas,
  herramienta,
  modeloNuevo,
  muebleNuevo,
  pisoNuevo,
  equipoNuevo,
  numeroEquipo,
  numeroNuevo,
  verDesde,
  versionCatalogo,
  onVerDesde,
  onAplicar,
  onSeleccionar,
  onAviso,
  onPedirMedida,
  onPedirTexto,
  onHerramienta,
  onPerderWebGL,
  onRecorrido,
  alMotor,
}: {
  plano: Plano;
  nivelId: string;
  conexiones: readonly Conexion[];
  nombreNivel?: string;
  elevacionM?: number;
  debajo?: readonly NivelConPlano[];
  seleccion: Seleccion | null;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  capas: CapasDeMaqueta;
  herramienta: Herramienta;
  modeloNuevo: ModeloCamara;
  muebleNuevo: TipoMueble;
  pisoNuevo: MaterialPiso;
  equipoNuevo: ModeloEquipo | null;
  /** El siguiente número de ese tipo, entre todos los niveles. */
  numeroEquipo: (t: TipoEquipo) => number;
  numeroNuevo: number;
  verDesde: string | null;
  /** Sube cuando llega el catálogo. Antes reiniciaba toda la vista, y al abrir se armaba dos veces. */
  versionCatalogo: number;
  onVerDesde: (id: string | null) => void;
  onAplicar: (plano: Plano, opciones?: { seleccion?: Seleccion | null; fusion?: string }) => void;
  onSeleccionar: (s: Seleccion | null) => void;
  onAviso: (texto: string) => void;
  onPedirMedida: (a: Punto, b: Punto) => void;
  onPedirTexto: (pos: Punto) => void;
  onHerramienta: (h: Herramienta) => void;
  onPerderWebGL: () => void;
  /** Se entró o se salió de caminar: el editor quita lo que estorba. */
  onRecorrido?: (activo: boolean) => void;
  alMotor?: (m: MotorMaqueta | null) => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const motor = useRef<MotorMaqueta | null>(null);
  const [listo, setListo] = useState(false);
  const planoRef = useRef(plano);
  planoRef.current = plano;
  const tapasRef = useRef(tapas);
  tapasRef.current = tapas;
  const k = plano.escala.metrosPorPx;
  const [recorriendo, setRecorriendo] = useState(false);
  const recorriendoRef = useRef(false);
  recorriendoRef.current = recorriendo;
  const [guiando, setGuiando] = useState(false);
  /** Ya salió el primer cuadro: la primera vez en un navegador tarda en preparar sus gráficos. */
  const [pintada, setPintada] = useState(false);
  const [apuntando, setApuntando] = useState<string | null>(null);
  const [aqui, setAqui] = useState<{ area: string | null; teVen: TeVe[] }>({ area: null, teVen: [] });
  // La ayuda sale hasta que usa dos gestos distintos; después, con el botón «?».
  const [pistaVista, setPistaVista] = useState(() => {
    try {
      return localStorage.getItem(PISTA_APRENDIDA) !== "1";
    } catch {
      return true;
    }
  });
  const gestosUsados = useRef(new Set<Gesto>());
  const [completa, setCompleta] = useState(false);
  const marcador = useRef<SVGGElement>(null);
  const ultimaLectura = useRef("");
  const recorridoRef = useRef(onRecorrido);
  recorridoRef.current = onRecorrido;

  /* ── De noche, cada cámara ve hasta donde le alcanza su luz: el dato de IR de la ficha. ── */
  const coberturasNoche = useMemo(() => {
    if (!capas.noche) return null;
    const salida = new Map<string, PoligonoCobertura[]>();
    for (const c of plano.camaras) {
      const cm = camaraEnMetros(c, plano.escala);
      const ir = c.lentes[0]?.optica.irM;
      salida.set(c.id, cm ? coberturaCamara(ir ? { ...cm, distanciaM: Math.min(cm.distanciaM, ir) } : cm, tapas) : []);
    }
    return salida;
  }, [capas.noche, plano.camaras, plano.escala, tapas]);
  const coberturaVisible = coberturasNoche ?? coberturas;

  const rotulos = useMemo<Rotulo[]>(() => {
    const salida: Rotulo[] = [];
    if (capas.etiquetas) {
      for (const e of plano.etiquetas) salida.push({ clave: e.id, texto: e.texto, pos: new THREE.Vector3(e.pos.x * k, 0.2, e.pos.y * k), clase: "area" });
      for (const a of plano.areas ?? []) {
        if (!a.nombre || !a.puntos.length) continue;
        const cx = a.puntos.reduce((s, p) => s + p.x, 0) / a.puntos.length;
        const cy = a.puntos.reduce((s, p) => s + p.y, 0) / a.puntos.length;
        salida.push({ clave: a.id, texto: a.nombre, pos: new THREE.Vector3(cx * k, 0.2, cy * k), clase: "area" });
      }
    }
    if (debajo.length || elevacionM) {
      const ed = limitesEdificio(plano) ?? limitesSitio(plano);
      salida.push({
        clave: "nivel-activo",
        texto: `${nombreNivel ?? "Nivel"} ${elevacionTexto(elevacionM)}`,
        pos: new THREE.Vector3((ed.min.x + ed.max.x) / 2, 0.1, ed.max.y + 0.6),
        clase: "nivel",
      });
      for (const n of debajo) {
        const lim = limitesEdificio(n.plano);
        if (lim) salida.push({ clave: `nivel-${n.nivel.id}`, texto: `${n.nivel.nombre} ${elevacionTexto(n.nivel.elevacionM)}`, pos: new THREE.Vector3((lim.min.x + lim.max.x) / 2, n.nivel.elevacionM - elevacionM + 0.1, lim.max.y + 0.6), clase: "nivel" });
      }
    }
    return salida;
  }, [capas.etiquetas, plano, k, debajo, elevacionM, nombreNivel]);

  /* ── Motor: uno solo mientras la vista esté abierta ── */
  const [claves, setClaves] = useState<MotorMaqueta["etiquetas"]>([]);
  const nodos = useRef(new Map<string, HTMLElement>());
  const rotulosRef = useRef(rotulos);
  rotulosRef.current = rotulos;
  const clavesRef = useRef(claves);
  clavesRef.current = claves;
  const brujula = useRef<HTMLSpanElement>(null);
  const norteRef = useRef(plano.norteDeg);
  norteRef.current = plano.norteDeg;
  const avisoRef = useRef(onAviso);
  avisoRef.current = onAviso;
  const perderRef = useRef(onPerderWebGL);
  perderRef.current = onPerderWebGL;

  const colocar = useCallback(() => {
    const m = motor.current;
    if (!m) return;
    const yo = m.posicionRecorrido();
    if (yo) {
      marcador.current?.setAttribute("transform", `translate(${yo.x.toFixed(2)} ${yo.y.toFixed(2)}) rotate(${yo.rumboDeg.toFixed(1)})`);
      // Cada medio metro basta: es la misma cuenta que la persona de prueba y no hay que hacerla en cada cuadro.
      const lectura = `${Math.round(yo.x * 2)},${Math.round(yo.y * 2)}`;
      if (lectura !== ultimaLectura.current) {
        ultimaLectura.current = lectura;
        setAqui({ area: areaEn(planoRef.current, yo), teVen: camarasQueTeVen(planoRef.current, tapasRef.current, yo) });
      }
    }
    const poner = (id: string, pos: THREE.Vector3) => {
      const el = nodos.current.get(id);
      if (!el) return;
      const p = m.aPantalla(pos);
      el.style.visibility = p.visible ? "visible" : "hidden";
      el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
    };
    // Las claves que se enciman se apilan hacia arriba, para poder tocarlas todas.
    const puestas: Array<{ x: number; y: number }> = [];
    const orden = clavesRef.current.map((e) => ({ id: e.id, p: m.aPantalla(e.pos) })).sort((a, b) => b.p.y - a.p.y);
    for (const { id, p } of orden) {
      const el = nodos.current.get(`clave-${id}`);
      if (!el) continue;
      let y = p.y;
      while (puestas.some((q) => Math.abs(q.x - p.x) < 20 && Math.abs(q.y - y) < 20)) y -= 20;
      // Adentro solo se ve la clave de lo cercano y lo que no queda detrás de un muro.
      const e = yo ? clavesRef.current.find((c) => c.id === id) : null;
      const alcanza = !yo || !e || (Math.hypot(e.pos.x - yo.x, e.pos.z - yo.y) < 15 && !tapado(tapasRef.current, { x: e.pos.x, y: e.pos.z }, e.pos.y, yo, ALTURA_OJOS_M));
      const visible = p.visible && alcanza;
      if (visible) puestas.push({ x: p.x, y });
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.transform = `translate(${p.x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const r of rotulosRef.current) poner(`rotulo-${r.clave}`, r.pos);
    if (brujula.current) brujula.current.style.transform = `rotate(${m.rumboNorte(norteRef.current).toFixed(1)}deg)`;
  }, []);

  useEffect(() => {
    const el = lienzo.current;
    const contenedor = caja.current;
    if (!el || !contenedor) return;
    let m: MotorMaqueta;
    try {
      m = new MotorMaqueta(el, {
        alPintar: () => {
          setPintada(true);
          colocar();
        },
        alPerderContexto: () => perderRef.current(),
        alFallarCroquis: () => avisoRef.current("El croquis no se pudo cargar en la maqueta; sigue en el dibujo 2D."),
        alTerminarGuiado: () => setGuiando(false),
        alArrastrarVista: (activo) => setCursor(activo ? "grabbing" : "grab"),
        alUsarGesto: (g) => {
          const usados = gestosUsados.current;
          if (usados.has(g)) return;
          usados.add(g);
          if (usados.size < 2) return;
          setPistaVista(false);
          try {
            localStorage.setItem(PISTA_APRENDIDA, "1");
          } catch {
            // Sin almacenamiento la ayuda vuelve a salir la próxima vez, y ya.
          }
        },
      });
    } catch {
      perderRef.current();
      return;
    }
    motor.current = m;
    const r = contenedor.getBoundingClientRect();
    m.medir(r.width, r.height);
    const ro = new ResizeObserver(() => {
      const b = contenedor.getBoundingClientRect();
      m.medir(b.width, b.height);
    });
    ro.observe(contenedor);
    const rueda = (ev: WheelEvent) => {
      if (!m.recorriendo) return;
      ev.preventDefault();
      m.empujar((-ev.deltaY / 100) * 1.2);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    setListo(true);
    alMotor?.(m);
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", rueda);
      if (recorriendoRef.current) recorridoRef.current?.(false);
      alMotor?.(null);
      motor.current = null;
      m.destruir();
    };
    // El motor vive lo que vive la vista; `alMotor` y `colocar` no cambian su ciclo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = motor.current;
    if (!m || !listo) return;
    m.actualizar({
      plano,
      nivelId,
      conexiones,
      coberturas: coberturaVisible,
      elevacionM,
      debajo,
      seleccion,
      verDesde,
      catalogo: versionCatalogo,
      capas: { cobertura: capas.cobertura, personas: capas.humanoides, noche: capas.noche, tamanoReal: capas.tamanoReal, translucidos: capas.translucidos, croquis: capas.croquis, cableado: capas.cableado },
    });
    setClaves(m.etiquetas);
  }, [listo, plano, nivelId, conexiones, capas.cableado, coberturaVisible, elevacionM, debajo, seleccion, verDesde, versionCatalogo, capas.cobertura, capas.humanoides, capas.noche, capas.tamanoReal, capas.translucidos, capas.croquis]);

  // Las claves y rótulos recién montados necesitan su lugar.
  useEffect(() => {
    colocar();
  }, [claves, rotulos, capas.claves, colocar]);

  /* ── Puntero ── */
  const arrastre = useRef<Arrastre | null>(null);
  const presion = useRef<{ x: number; y: number; sel: Seleccion | null } | null>(null);
  const [inicioMuro, setInicioMuro] = useState<Punto | null>(null);
  const [inicioCota, setInicioCota] = useState<Punto | null>(null);
  const [cursor, setCursor] = useState<string>("grab");
  const [guia, setGuia] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [marco, setMarco] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** Dónde quedaría pegada, en pantalla, mientras se pone o se arrastra. */
  const [iman, setIman] = useState<{ x: number; y: number; tipo: Pegado["tipo"] } | null>(null);

  useEffect(() => {
    setInicioMuro(null);
    setInicioCota(null);
    setGuia(null);
  }, [herramienta]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "Escape") {
        setInicioMuro(null);
        setInicioCota(null);
        setGuia(null);
        if (apuntando) dejarDeApuntar();
        else if (verDesde) onVerDesde(null);
        else if (recorriendo) salirRecorrido();
      }
      if (e.key.toLowerCase() === "f") enfocarSeleccion();
      if (e.code === "Space" && t?.tagName !== "BUTTON" && !recorriendo) {
        motor.current?.conEspacio(true);
        e.preventDefault();
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && TECLAS_DE_MOVER.has(e.code)) {
        motor.current?.tecla(e.code, true);
        if (e.code.startsWith("Arrow")) e.preventDefault();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  useEffect(() => {
    const suelta = (e: KeyboardEvent) => {
      if (e.code === "Space") motor.current?.conEspacio(false);
      motor.current?.tecla(e.code, false);
    };
    const fuera = () => {
      motor.current?.conEspacio(false);
      motor.current?.soltarTeclas();
    };
    const pantalla = () => setCompleta(Boolean(document.fullscreenElement));
    window.addEventListener("keyup", suelta);
    window.addEventListener("blur", fuera);
    document.addEventListener("fullscreenchange", pantalla);
    return () => {
      window.removeEventListener("keyup", suelta);
      window.removeEventListener("blur", fuera);
      document.removeEventListener("fullscreenchange", pantalla);
    };
  }, []);

  const entrarRecorrido = (pos?: Punto, rumboDeg?: number, mirarAlturaM?: number) => {
    const m = motor.current;
    if (!m) return;
    onVerDesde(null);
    setPistaVista(false);
    setApuntando(null);
    const tramos = tramosDelPlano(plano);
    const sugerido = pos ? null : inicioDelRecorrido(plano, tramos);
    const inicio = pos ?? (sugerido as { pos: Punto }).pos;
    m.entrarRecorrido(moverConChoques(tramos, inicio, inicio), rumboDeg ?? sugerido?.rumboDeg, mirarAlturaM);
    ultimaLectura.current = "";
    setClaves(m.etiquetas);
    setRecorriendo(true);
    onRecorrido?.(true);
    if (!plano.escala.calibracion) onAviso("La escala no está calibrada: lo que ves puede no medir lo real.");
  };

  const salirRecorrido = () => {
    const m = motor.current;
    if (!m) return;
    m.salirRecorrido();
    setClaves(m.etiquetas);
    setGuiando(false);
    setRecorriendo(false);
    onRecorrido?.(false);
  };

  const dejarDeApuntar = () => {
    setApuntando(null);
    motor.current?.controles(true);
  };

  const alternarPantalla = () => {
    const el = caja.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => onAviso("Este navegador no dejó abrir la pantalla completa."));
  };

  const enfocarSeleccion = () => {
    const m = motor.current;
    if (!m || (seleccion?.tipo !== "camara" && seleccion?.tipo !== "equipo")) return;
    if (recorriendo) {
      m.revisar(idParaRevisar(seleccion.id));
      return;
    }
    const e = m.etiquetas.find((x) => x.id === seleccion.id);
    if (e) m.enfocar(e.pos, capas.tamanoReal ? 2.5 : 7);
  };

  /** Lo que va adentro de un gabinete se revisa en su gabinete. */
  const idParaRevisar = (id: string) => plano.equipos?.find((e) => e.id === id)?.gabineteId ?? id;

  const relativo = (e: { clientX: number; clientY: number }) => {
    const r = lienzo.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** Punto del piso en px del plano. */
  const enPlano = (x: number, y: number): Punto | null => {
    const p = motor.current?.pisoEn(x, y);
    return p ? { x: p.x / k, y: p.y / k } : null;
  };
  const ajustar = (p: Punto, desde: Punto | null) => ajustarPunto(planoRef.current, p, { radio: 0.35 / k, desde }).punto;

  /** Qué tan cerca se pega: de lejos, un metro son pocos píxeles y hay que dar más margen. */
  const radioIman = (m: MotorMaqueta, punto: Punto) => Math.max(RADIO_PEGADO_M, 18 / m.pxPorMetro(punto));

  const verIman = (m: MotorMaqueta, pegado: Pegado | null, alturaM: number) => {
    if (!pegado) {
      setIman(null);
      return;
    }
    const q = m.aPantalla(new THREE.Vector3(pegado.pos.x * k, alturaM, pegado.pos.y * k));
    setIman({ x: q.x, y: q.y, tipo: pegado.tipo });
  };

  /**
   * Cerca de una esquina o un muro se pega y ve al cuarto. Adentro, viendo el muro de frente, va a la altura
   * donde se tocó; desde arriba se usa la de siempre, porque ahí no se está eligiendo la altura.
   */
  const colocarCamara = (mon: Montaje, modelo: ModeloCamara, libre = false) => {
    const m = motor.current;
    const yo = m?.posicionRecorrido();
    const lugar = lugarParaCamara(planoRef.current, { x: mon.punto.x / k, y: mon.punto.y / k }, {
      libre,
      radioM: m ? radioIman(m, mon.punto) : undefined,
      alturaM: yo && mon.alturaM != null ? Math.round(mon.alturaM * 10) / 10 : undefined,
    });
    const r = agregarCamara(planoRef.current, lugar.pos, modelo, {
      numero: numeroNuevo,
      nombre: `Cámara ${numeroNuevo}`,
      ...(yo && !lugar.pegado ? { rumboDeg: Math.round((yo.rumboDeg + 360) % 360) } : {}),
      ...lugar.extra,
    });
    setIman(null);
    onAplicar(r.plano, { seleccion: { tipo: "camara", id: r.camara.id } });
  };
  const colocarMueble = (p: Punto, tipo: TipoMueble) => {
    const r = agregarMueble(planoRef.current, p, tipo);
    onAplicar(r.plano, { seleccion: { tipo: "mueble", id: r.mueble.id } });
  };

  const colocarEquipo = (mon: Montaje, modelo: ModeloEquipo) => {
    const r = agregarEquipo(planoRef.current, { x: mon.punto.x / k, y: mon.punto.y / k }, modelo, numeroEquipo(modelo.tipo));
    // En un muro va a la altura donde se tocó, salvo lo que entra a un gabinete.
    const final = mon.rumboDeg != null && mon.alturaM != null && !r.equipo.gabineteId ? actualizarEquipo(r.plano, r.equipo.id, { alturaM: Math.round(mon.alturaM * 10) / 10, rumboDeg: mon.rumboDeg }) : r.plano;
    onAplicar(final, { seleccion: { tipo: "equipo", id: r.equipo.id } });
    const texto = avisoDeEquipo(final, r.equipo);
    if (texto) onAviso(texto);
  };

  const mirada = useRef<{ x: number; y: number; ux: number; uy: number; movio: boolean; sel: Seleccion | null } | null>(null);
  const giroBrujula = useRef<{ x: number; y: number; movio: boolean } | null>(null);

  const alPresionar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = motor.current;
    if (!m || e.target !== lienzo.current || verDesde) return;
    if (e.button !== 0 || e.shiftKey) {
      if (recorriendo) {
        mirada.current = { x: e.clientX, y: e.clientY, ux: e.clientX, uy: e.clientY, movio: true, sel: null };
        lienzo.current?.setPointerCapture(e.pointerId);
      }
      return;
    }
    const { x, y } = relativo(e);
    const p = enPlano(x, y);
    if (apuntando) {
      dejarDeApuntar();
      return;
    }
    if (herramienta === "seleccionar") {
      const sel = recorriendo ? m.tocarDeFrente(x, y) : m.tocar(x, y);
      const yaElegido = sel && seleccion?.tipo === sel.tipo && seleccion.id === sel.id;
      if (recorriendo && !(yaElegido && sel && MOVIBLES.has(sel.tipo))) {
        // Adentro, arrastrar es mirar alrededor.
        mirada.current = { x: e.clientX, y: e.clientY, ux: e.clientX, uy: e.clientY, movio: false, sel };
        lienzo.current?.setPointerCapture(e.pointerId);
        return;
      }
      presion.current = { x, y, sel };
      if (sel && p && MOVIBLES.has(sel.tipo) && (MOVIBLES_DE_UNA.has(sel.tipo) || yaElegido)) {
        m.controles(false);
        // Lo que está en alto se agarra a su altura, para que siga al puntero sin brincar.
        const pieza = sel.tipo === "camara" ? plano.camaras.find((c) => c.id === sel.id) : sel.tipo === "equipo" ? plano.equipos?.find((c) => c.id === sel.id) : null;
        const enAlto = pieza ? m.puntoAAltura(x, y, pieza.alturaM) : null;
        arrastre.current = {
          modo: "mover",
          sel,
          ultimo: p,
          fusion: `mover3d-${sel.id}-${Date.now()}`,
          movido: false,
          ...(pieza && enAlto ? { agarre: { x: pieza.pos.x * k - enAlto.x, y: pieza.pos.y * k - enAlto.y }, alturaM: pieza.alturaM } : {}),
        };
        lienzo.current?.setPointerCapture(e.pointerId);
      }
      return;
    }
    m.controles(false);
    // Adentro, viendo de frente un muro, no hay piso bajo el puntero: se puede poner de todos modos.
    if (!p && herramienta !== "camara" && herramienta !== "equipo") return;
    if (!p) {
      const mon = m.montaje(x, y);
      if (mon && herramienta === "camara") colocarCamara(mon, modeloNuevo, e.altKey);
      else if (mon && equipoNuevo) colocarEquipo(mon, equipoNuevo);
      onHerramienta("seleccionar");
      return;
    }
    const actual = planoRef.current;
    switch (herramienta) {
      case "muro": {
        const q = ajustar(p, inicioMuro);
        if (!inicioMuro) {
          setInicioMuro(q);
          return;
        }
        const r = agregarMuro(actual, inicioMuro, q);
        if (r.muro) {
          onAplicar(r.plano, { seleccion: { tipo: "muro", id: r.muro.id } });
          setInicioMuro(q);
        }
        return;
      }
      case "puerta":
      case "ventana":
      case "acceso": {
        const cerca = muroMasCercano(actual, p, 0.8 / k);
        if (!cerca) {
          onAviso("Haz clic sobre un muro para poner el hueco.");
          return;
        }
        const r = agregarAbertura(actual, cerca.muro.id, cerca.t, herramienta);
        if (r.error || !r.abertura) {
          onAviso(r.error ?? "No cupo el hueco en ese muro.");
          return;
        }
        onAplicar(r.plano, { seleccion: { tipo: "abertura", id: r.abertura.id } });
        return;
      }
      case "obstaculo":
      case "area":
        arrastre.current = { modo: "rect", tipo: herramienta, inicio: p };
        setMarco({ x, y, w: 0, h: 0 });
        lienzo.current?.setPointerCapture(e.pointerId);
        return;
      case "cota": {
        const q = ajustar(p, inicioCota);
        if (!inicioCota) {
          setInicioCota(q);
          return;
        }
        setInicioCota(null);
        setGuia(null);
        onPedirMedida(inicioCota, q);
        return;
      }
      case "etiqueta":
        onPedirTexto(p);
        return;
      case "camara": {
        const mon = m.montaje(x, y);
        if (mon) colocarCamara(mon, modeloNuevo, e.altKey);
        onHerramienta("seleccionar");
        return;
      }
      case "mueble":
        colocarMueble(p, muebleNuevo);
        onHerramienta("seleccionar");
        return;
      case "equipo": {
        const mon = m.montaje(x, y);
        if (equipoNuevo && mon) colocarEquipo(mon, equipoNuevo);
        onHerramienta("seleccionar");
        return;
      }
      case "persona": {
        const nuevo = agregarPersona(actual, p);
        onAplicar(nuevo, { seleccion: { tipo: "persona", id: nuevo.personas[nuevo.personas.length - 1].id } });
        return;
      }
    }
  };

  const movPendiente = useRef(0);
  const alMover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = motor.current;
    if (!m) return;
    const { x, y } = relativo(e);
    const a = arrastre.current;
    const mi = mirada.current;
    if (mi) {
      if (Math.hypot(e.clientX - mi.x, e.clientY - mi.y) > 5) mi.movio = true;
      if (mi.movio) {
        m.mirar(e.clientX - mi.ux, e.clientY - mi.uy);
        m.marcarDestino(null);
      }
      mi.ux = e.clientX;
      mi.uy = e.clientY;
      return;
    }
    if (apuntando) {
      const mon = m.montaje(x, y);
      if (mon) onAplicar(mirarCamaraHacia(planoRef.current, apuntando, { x: mon.punto.x / k, y: mon.punto.y / k }, mon.alturaM ?? 0), { fusion: `apuntar-${apuntando}` });
      return;
    }
    if (a?.modo === "mover") {
      if (a.agarre && a.alturaM != null) {
        const enAlto = m.puntoAAltura(x, y, a.alturaM);
        if (!enAlto) return;
        const destinoM = { x: enAlto.x + a.agarre.x, y: enAlto.y + a.agarre.y };
        if (!a.movido && Math.hypot(destinoM.x - a.ultimo.x * k, destinoM.y - a.ultimo.y * k) < 0.1 && Math.hypot(x - (presion.current?.x ?? x), y - (presion.current?.y ?? y)) < 4) return;
        a.movido = true;
        const destino = { x: destinoM.x / k, y: destinoM.y / k };
        const radioM = radioIman(m, destinoM);
        const r = a.sel.tipo === "camara" ? moverCamaraPegada(planoRef.current, a.sel.id, destino, { radioM, libre: e.altKey }) : moverEquipoPegado(planoRef.current, a.sel.id, destino, { radioM, libre: e.altKey });
        verIman(m, r.pegado, a.alturaM);
        onAplicar(r.plano, { fusion: a.fusion });
        return;
      }
      const p = enPlano(x, y);
      if (!p) return;
      const delta = { x: p.x - a.ultimo.x, y: p.y - a.ultimo.y };
      if (!a.movido && Math.hypot(delta.x, delta.y) * k < 0.1) return;
      a.movido = true;
      a.ultimo = p;
      onAplicar(mover(planoRef.current, a.sel, delta), { fusion: a.fusion });
      return;
    }
    if (a?.modo === "rect") {
      const r = relativo(e);
      const pa = m.aPantalla(new THREE.Vector3(a.inicio.x * k, 0, a.inicio.y * k));
      setMarco({ x: Math.min(pa.x, r.x), y: Math.min(pa.y, r.y), w: Math.abs(r.x - pa.x), h: Math.abs(r.y - pa.y) });
      return;
    }
    const inicio = inicioMuro ?? inicioCota;
    if (inicio) {
      const p = enPlano(x, y);
      if (!p) return;
      const q = ajustar(p, inicio);
      const pa = m.aPantalla(new THREE.Vector3(inicio.x * k, 0, inicio.y * k));
      const pb = m.aPantalla(new THREE.Vector3(q.x * k, 0, q.y * k));
      setGuia({ a: pa, b: pb });
      return;
    }
    if (e.buttons === 0 && herramienta === "camara" && !movPendiente.current) {
      const libre = e.altKey;
      movPendiente.current = requestAnimationFrame(() => {
        movPendiente.current = 0;
        const mo = motor.current;
        const mon = mo?.montaje(x, y);
        if (!mo || !mon) return setIman(null);
        const pegado = libre ? null : pegarAMuros(planoRef.current, { x: mon.punto.x / k, y: mon.punto.y / k }, { radioM: radioIman(mo, mon.punto) });
        verIman(mo, pegado, pegado ? Math.min(3, pegado.alturaMaxM) : 0);
      });
    }
    if (e.buttons === 0 && herramienta === "seleccionar" && !movPendiente.current) {
      movPendiente.current = requestAnimationFrame(() => {
        movPendiente.current = 0;
        const mo = motor.current;
        if (!mo) return;
        if (recorriendoRef.current) {
          const sel = mo.tocarDeFrente(x, y);
          const equipo = sel?.tipo === "camara" || sel?.tipo === "equipo";
          const destino = equipo ? null : mo.destinoEnPiso(x, y);
          mo.marcarDestino(destino);
          setCursor(equipo || destino ? "pointer" : "grab");
          return;
        }
        const sel = mo.tocar(x, y);
        setCursor(sel && sel.tipo !== "area" ? "pointer" : "grab");
      });
    }
  };
  useEffect(() => () => cancelAnimationFrame(movPendiente.current), []);

  const alSoltar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = motor.current;
    if (!m) return;
    const mi = mirada.current;
    mirada.current = null;
    if (mi && !mi.movio) {
      // Un clic: lo que se revisa se revisa, y en el piso se camina hasta ahí.
      if (mi.sel?.tipo === "camara" || mi.sel?.tipo === "equipo") {
        onSeleccionar(mi.sel);
        m.revisar(idParaRevisar(mi.sel.id));
      } else if (mi.sel?.tipo === "persona" || mi.sel?.tipo === "mueble" || mi.sel?.tipo === "obstaculo") {
        onSeleccionar(mi.sel);
      } else {
        const { x, y } = relativo(e);
        const destino = m.destinoEnPiso(x, y);
        if (destino) {
          onSeleccionar(null);
          m.irA(destino);
        }
      }
      return;
    }
    if (mi) return;
    const a = arrastre.current;
    arrastre.current = null;
    if (!apuntando) m.controles(true);
    setMarco(null);
    setIman(null);
    if (a?.modo === "rect") {
      const { x, y } = relativo(e);
      const p = enPlano(x, y);
      if (p) {
        if (a.tipo === "obstaculo") {
          const r = agregarObstaculo(planoRef.current, a.inicio, p);
          if (r.obstaculo) onAplicar(r.plano, { seleccion: { tipo: "obstaculo", id: r.obstaculo.id } });
        } else {
          const r = agregarArea(planoRef.current, a.inicio, p, pisoNuevo);
          if (r.area) onAplicar(r.plano, { seleccion: { tipo: "area", id: r.area.id } });
        }
      }
      return;
    }
    const pr = presion.current;
    presion.current = null;
    if (pr && !(a?.modo === "mover" && a.movido)) {
      const { x, y } = relativo(e);
      if (Math.hypot(x - pr.x, y - pr.y) < 5) onSeleccionar(pr.sel);
    }
  };

  /* ── Soltar un equipo del panel ── */
  const alSoltarEquipo = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const { x, y } = relativo(e);
    const mon = motor.current?.montaje(x, y);
    if (!mon) return;
    // El muñeco se suelta donde se quiere entrar, como en un mapa de calle.
    if (e.dataTransfer.types.includes(TIPO_RECORRER)) {
      entrarRecorrido(mon.punto);
      return;
    }
    const dato = leerArrastre(e.dataTransfer.getData(TIPO_ARRASTRE));
    if (!dato) return;
    if (dato.clase === "camara") {
      const m = modeloPorId(dato.id);
      if (m) colocarCamara(mon, m, e.altKey);
    } else if (dato.clase === "equipo") {
      const m = equipoPorId(dato.id);
      if (m) colocarEquipo(mon, m);
    } else {
      colocarMueble({ x: mon.punto.x / k, y: mon.punto.y / k }, dato.id);
    }
  };

  const camaraPov = verDesde ? plano.camaras.find((c) => c.id === verDesde) : null;
  const indicePov = camaraPov ? plano.camaras.indexOf(camaraPov) : -1;
  const camaraSel = seleccion?.tipo === "camara" ? plano.camaras.find((c) => c.id === seleccion.id) ?? null : null;
  const equipoSel = seleccion?.tipo === "equipo" ? plano.equipos?.find((c) => c.id === seleccion.id) ?? null : null;
  const paradas = useMemo(() => (recorriendo ? paradasDelSitio(plano) : []), [recorriendo, plano]);
  const quienesVen = useMemo(() => new Set(aqui.teVen.map((c) => c.id)), [aqui.teVen]);

  const caminarHacia = (sel: { pos: Punto; rumboDeg: number; alturaM: number }) => {
    // Enfrente de lo elegido y mirándolo; se le queda a dos metros para verlo completo.
    const d = dirRumbo(sel.rumboDeg);
    const pos = { x: sel.pos.x * k + d.x * 2, y: sel.pos.y * k + d.y * 2 };
    const rumbo = (sel.rumboDeg + 180) % 360;
    if (recorriendo) motor.current?.irA(pos, true);
    else entrarRecorrido(pos, rumbo, sel.alturaM);
  };
  const cambiarAltura = (delta: number) => {
    if (camaraSel) onAplicar(actualizarCamara(plano, camaraSel.id, { alturaM: Math.max(0.5, Math.round((camaraSel.alturaM + delta) * 10) / 10) }), { fusion: `altura-${camaraSel.id}` });
    else if (equipoSel) onAplicar(actualizarEquipo(plano, equipoSel.id, { alturaM: Math.max(0.2, Math.round((equipoSel.alturaM + delta) * 10) / 10) }), { fusion: `altura-${equipoSel.id}` });
  };
  const modeloCamaraSel = camaraSel ? modeloPorId(camaraSel.productoId) : null;
  const modeloEquipoSel = equipoSel ? equipoPorId(equipoSel.productoId) : null;
  const detalleSel = modeloCamaraSel ? especificacionesCamara(modeloCamaraSel) : modeloEquipoSel ? especificacionesEquipo(modeloEquipoSel) : "";
  const piezaSel = camaraSel ?? equipoSel;

  return (
    <div
      ref={caja}
      className={styles.maqueta}
      style={{ background: capas.noche ? "#0c0f15" : "#c8d6e2" }}
      onPointerDownCapture={alPresionar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onDoubleClick={(e) => {
        setInicioMuro(null);
        setGuia(null);
        const m = motor.current;
        if (herramienta !== "seleccionar" || recorriendo || verDesde || !m || e.target !== lienzo.current) return;
        const { x, y } = relativo(e);
        const sel = m.tocar(x, y);
        if (sel?.tipo === "camara" || sel?.tipo === "equipo") {
          enfocarSeleccion();
          return;
        }
        const piso = m.pisoEn(x, y);
        if (!piso) return;
        // Doble clic acerca, y ya de cerca, entra: dos dobles clics y se está adentro.
        if (m.distanciaVista > DISTANCIA_PARA_ENTRAR_M) m.acercarseA(piso);
        else entrarRecorrido(piso);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={alSoltarEquipo}
    >
      <canvas
        ref={lienzo}
        className={styles.maquetaLienzo}
        style={{ cursor: apuntando || herramienta !== "seleccionar" ? "crosshair" : cursor }}
        role="img"
        aria-label={recorriendo ? "Caminando dentro del sitio. Usa las flechas o W A S D para moverte, arrastra para mirar y haz clic en el piso para ir." : "Vista 3D del sitio: maqueta con muros, equipos a su altura de montaje y cobertura en el piso. Arrastra para girar, usa dos dedos o clic derecho para deslizar, y pellizca o usa la rueda para acercar."}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!pintada ? <p className={styles.maquetaCarga}>Armando la maqueta…</p> : null}

      <div className={styles.maquetaEncima} aria-hidden={verDesde ? true : undefined}>
        {!verDesde && !recorriendo
          ? rotulos.map((r) => (
              <span
                key={r.clave}
                ref={(n) => {
                  if (n) nodos.current.set(`rotulo-${r.clave}`, n);
                  else nodos.current.delete(`rotulo-${r.clave}`);
                }}
                className={r.clase === "nivel" ? styles.rotuloNivel : styles.rotuloArea}
              >
                {r.texto}
              </span>
            ))
          : null}
        {!verDesde && capas.claves
          ? claves.map((c) => {
              const sel = seleccion?.tipo === c.tipoSel && seleccion.id === c.id;
              return (
                <button
                  key={c.id}
                  ref={(n) => {
                    if (n) nodos.current.set(`clave-${c.id}`, n);
                    else nodos.current.delete(`clave-${c.id}`);
                  }}
                  type="button"
                  className={styles.claveEquipo}
                  aria-pressed={sel}
                  title={`${c.clave} · ${c.nombre}`}
                  onClick={() => {
                    if (sel) enfocarSeleccion();
                    else onSeleccionar({ tipo: c.tipoSel, id: c.id });
                  }}
                >
                  <i style={sel ? undefined : { background: c.punto }} />
                  <span>{c.clave}</span>
                </button>
              );
            })
          : null}
        {guia ? (
          <svg className={styles.maquetaGuia} aria-hidden="true">
            <line x1={guia.a.x} y1={guia.a.y} x2={guia.b.x} y2={guia.b.y} stroke="#0f7f6c" strokeWidth={2.5} strokeDasharray="7 5" />
          </svg>
        ) : null}
        {marco ? <span className={styles.maquetaMarco} style={{ left: marco.x, top: marco.y, width: marco.w, height: marco.h }} /> : null}
        {iman ? (
          <span className={styles.iman} style={{ transform: `translate(${iman.x.toFixed(1)}px,${iman.y.toFixed(1)}px)` }}>
            <i />
            <b>{iman.tipo === "esquina" ? "Esquina" : "Muro"}</b>
          </span>
        ) : null}
      </div>

      {camaraPov ? (
        <div className={styles.povBarra}>
          {plano.camaras.length > 1 ? (
            <button type="button" className={styles.povFlecha} aria-label="Cámara anterior" title="Cámara anterior" onClick={() => onVerDesde(plano.camaras[(indicePov - 1 + plano.camaras.length) % plano.camaras.length].id)}>
              ‹
            </button>
          ) : null}
          <b>
            {claveCamara(camaraPov.numero)} · {camaraPov.nombre}
          </b>
          <span>{etiquetaModelo({ marca: "", modelo: camaraPov.modelo })}</span>
          {plano.camaras.length > 1 ? (
            <button type="button" className={styles.povFlecha} aria-label="Cámara siguiente" title="Cámara siguiente" onClick={() => onVerDesde(plano.camaras[(indicePov + 1) % plano.camaras.length].id)}>
              ›
            </button>
          ) : null}
          <button type="button" onClick={() => onVerDesde(null)}>
            Salir
          </button>
        </div>
      ) : null}

      {apuntando ? (
        <div className={styles.povBarra} style={{ top: 58 }}>
          <b>Mueve el puntero hacia lo que debe ver</b>
          <span>Clic para dejarla así</span>
          <button type="button" onClick={dejarDeApuntar}>
            Listo
          </button>
        </div>
      ) : null}

      {piezaSel && !verDesde && !apuntando ? (
        <div className={styles.tarjetaPieza} style={recorriendo ? { bottom: 96 } : undefined}>
          <div className={styles.tarjetaPiezaTexto}>
            <b>
              {camaraSel ? claveCamara(camaraSel.numero) : equipoSel ? claveEquipo(equipoSel) : ""} · {piezaSel.nombre}
            </b>
            <span>{[piezaSel.modelo, detalleSel].filter(Boolean).join(" · ")}</span>
          </div>
          {!equipoSel?.gabineteId ? (
            <span className={styles.tarjetaAltura} role="group" aria-label="Altura de instalación">
              <button type="button" aria-label="Bajar" onClick={() => cambiarAltura(-0.1)}>
                −
              </button>
              <i>{piezaSel.alturaM.toFixed(1)} m</i>
              <button type="button" aria-label="Subir" onClick={() => cambiarAltura(0.1)}>
                +
              </button>
            </span>
          ) : null}
          {camaraSel ? (
            <>
              <button
                type="button"
                className={styles.tarjetaBoton}
                onClick={() => {
                  motor.current?.controles(false);
                  setApuntando(camaraSel.id);
                }}
              >
                Apuntar
              </button>
              <button type="button" className={styles.tarjetaBoton} onClick={() => onVerDesde(camaraSel.id)}>
                Ver lo que ve
              </button>
            </>
          ) : null}
          {recorriendo ? (
            <button type="button" className={styles.tarjetaBoton} onClick={enfocarSeleccion}>
              Revisar de cerca
            </button>
          ) : (
            <button type="button" className={styles.tarjetaBoton} onClick={() => caminarHacia(piezaSel)}>
              Caminar ahí
            </button>
          )}
        </div>
      ) : null}

      {recorriendo && !verDesde ? (
        <>
          <aside className={styles.recPanel} aria-label="Dónde estás">
            <b className={styles.recLugar}>{aqui.area ?? "Sin área"}</b>
            <MiniMapa ref={marcador} plano={plano} camarasQueVen={quienesVen} onIr={(p) => motor.current?.irA(p, true)} />
            {aqui.teVen.length ? (
              <ul className={styles.recVen} aria-label="Cámaras que te ven aquí">
                {aqui.teVen.slice(0, 4).map((c) => (
                  <li key={c.id}>
                    <i style={{ background: COLOR_NIVEL[c.nivel] }} />
                    <button type="button" title={`Ver lo que ve ${c.nombre}`} onClick={() => onVerDesde(c.id)}>
                      {c.clave}
                    </button>
                    <span>{c.etiqueta}</span>
                    <em>{c.ppm} PPM</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.recCiego}>Aquí ninguna cámara te ve</p>
            )}
            {paradas.length > 1 ? (
              <div className={styles.recParadas} role="group" aria-label="Ir a un área">
                {paradas.map((x) => (
                  <button key={x.nombre} type="button" aria-pressed={aqui.area === x.nombre} onClick={() => motor.current?.irA(x.pos, true)}>
                    {x.nombre}
                  </button>
                ))}
              </div>
            ) : null}
          </aside>

          <div className={styles.recBarra}>
            <button type="button" className={styles.recSalir} onClick={salirRecorrido}>
              Salir del recorrido
            </button>
            {paradas.length > 1 ? (
              <button
                type="button"
                aria-pressed={guiando}
                onClick={() => {
                  if (guiando) motor.current?.terminarGuiado();
                  else {
                    motor.current?.iniciarGuiado(paradas.map((x) => x.pos));
                    setGuiando(true);
                  }
                }}
              >
                {guiando ? "Detener" : "Recorrido automático"}
              </button>
            ) : null}
            <span>W A S D o flechas para caminar · Mayús para correr · arrastra para mirar · clic en el piso para ir</span>
          </div>

          <div className={styles.recPad} role="group" aria-label="Caminar">
            {(
              [
                ["ArrowUp", "Avanzar", "M12 5l6 7H6z", "1 / 2"],
                ["ArrowLeft", "Voltear a la izquierda", "M5 12l7-6v12z", "2 / 1"],
                ["ArrowDown", "Retroceder", "M12 19l-6-7h12z", "2 / 2"],
                ["ArrowRight", "Voltear a la derecha", "M19 12l-7 6V6z", "2 / 3"],
              ] as const
            ).map(([codigo, etiqueta, icono, lugar]) => (
              <button
                key={codigo}
                type="button"
                aria-label={etiqueta}
                title={etiqueta}
                style={{ gridArea: lugar }}
                onPointerDown={() => motor.current?.tecla(codigo, true)}
                onPointerUp={() => motor.current?.tecla(codigo, false)}
                onPointerLeave={() => motor.current?.tecla(codigo, false)}
                onPointerCancel={() => motor.current?.tecla(codigo, false)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={icono} />
                </svg>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {!verDesde && !recorriendo ? (
        <>
          {pistaVista && herramienta === "seleccionar" ? (
            <p className={styles.pistaVista}>
              <span>
                <b>Arrastra</b> para girar
              </span>
              <span>
                <b>Dos dedos</b> o <b>clic derecho</b> para deslizar
              </span>
              <span>
                <b>Pellizca</b> o usa la <b>rueda</b> para acercar
              </span>
            </p>
          ) : null}
          <div className={styles.controles3d}>
            <button
              type="button"
              className={styles.botonRecorrer}
              draggable
              title="Entra a caminar por el sitio. También puedes arrastrar el muñeco al lugar donde quieres entrar."
              onDragStart={(e) => {
                e.dataTransfer.setData(TIPO_RECORRER, "1");
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => entrarRecorrido()}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={ICONO_CAMINAR} />
              </svg>
              Recorrer
            </button>
            <button type="button" className={styles.boton3d} onClick={() => motor.current?.vistaGeneral()}>
              Vista general
            </button>
            <button type="button" className={styles.boton3d} onClick={() => motor.current?.vistaSuperior()}>
              Vista superior
            </button>
          </div>
          <button
            type="button"
            className={styles.brujulaBoton}
            aria-label="Brújula: arrástrala para girar e inclinar; un clic pone el norte arriba"
            title="Arrástrala para girar e inclinar. Un clic pone el norte arriba."
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              giroBrujula.current = { x: e.clientX, y: e.clientY, movio: false };
            }}
            onPointerMove={(e) => {
              const g = giroBrujula.current;
              if (!g) return;
              const dx = e.clientX - g.x;
              const dy = e.clientY - g.y;
              if (!g.movio && Math.hypot(dx, dy) < 3) return;
              g.movio = true;
              g.x = e.clientX;
              g.y = e.clientY;
              motor.current?.girarPx(dx, dy);
            }}
            onPointerUp={(e) => {
              const g = giroBrujula.current;
              giroBrujula.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
              if (g && !g.movio) motor.current?.alNorte(plano.norteDeg);
            }}
            onPointerCancel={() => {
              giroBrujula.current = null;
            }}
          >
            <span ref={brujula} className={styles.brujula}>
              <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
                <text x="16" y="8.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="var(--ui-brand-text)">
                  N
                </text>
                <path d="M16 10l3.6 7H12.4z" fill="var(--ui-brand)" />
                <path d="M16 27l-3.6-10h7.2z" fill="var(--ui-fg-4)" />
                <circle cx="16" cy="17" r="1.6" fill="var(--ui-surface)" stroke="var(--ui-fg-3)" strokeWidth="0.8" />
              </svg>
            </span>
          </button>
          <Navegacion
            lugar="abajo"
            botones={[
              { etiqueta: "Cómo moverse", icono: ICONO.ayuda, accion: () => setPistaVista((v) => !v) },
              { etiqueta: "Alejar", icono: ICONO.menos, accion: () => motor.current?.acercar(0.8) },
              { etiqueta: "Acercar", icono: ICONO.mas, accion: () => motor.current?.acercar(1.25) },
              { etiqueta: completa ? "Salir de pantalla completa" : "Pantalla completa", icono: ICONO.pantalla, accion: alternarPantalla },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
