"use client";

/**
 * Maqueta 3D del sitio (mockup aprobado 01-11-2026): se gira y se acerca como un objeto, las claves
 * de las cámaras flotan encima y las herramientas del plano funcionan sobre el piso. Pesa lo suyo
 * (three.js), así que se carga solo al abrirla; sin WebGL, el editor usa `Lienzo3D`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { etiquetaModelo, modeloPorId, type ModeloCamara } from "@/lib/cctv/catalogo";
import {
  agregarAbertura,
  agregarArea,
  agregarCamara,
  agregarMueble,
  agregarMuro,
  agregarObstaculo,
  agregarPersona,
  ajustarPunto,
  mover,
  muroMasCercano,
  type Seleccion,
  type TipoElemento,
} from "@/lib/cctv/editor";
import { elevacionTexto, type NivelConPlano } from "@/lib/cctv/niveles";
import { MotorMaqueta } from "@/lib/cctv/maqueta/motor";
import { limitesEdificio, limitesSitio } from "@/lib/cctv/medidas";
import { type MaterialPiso, type Plano, type Punto, type Tapa, type TipoMueble } from "@/lib/cctv/plano";
import { camaraEnMetros, coberturaCamara, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import type { Herramienta } from "./Lienzo";
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
};

const MOVIBLES: ReadonlySet<TipoElemento> = new Set(["camara", "persona", "mueble", "etiqueta", "obstaculo", "area"]);
const SIN_NIVELES: readonly NivelConPlano[] = [];

type Arrastre =
  | { modo: "mover"; sel: Seleccion; ultimo: Punto; fusion: string; movido: boolean }
  | { modo: "rect"; tipo: "obstaculo" | "area"; inicio: Punto };

type Rotulo = { clave: string; texto: string; pos: THREE.Vector3; clase: "area" | "nivel" };

export default function Maqueta3D({
  plano,
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
  numeroNuevo,
  verDesde,
  onVerDesde,
  onAplicar,
  onSeleccionar,
  onAviso,
  onPedirMedida,
  onPedirTexto,
  onHerramienta,
  onPerderWebGL,
  alMotor,
}: {
  plano: Plano;
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
  numeroNuevo: number;
  verDesde: string | null;
  onVerDesde: (id: string | null) => void;
  onAplicar: (plano: Plano, opciones?: { seleccion?: Seleccion | null; fusion?: string }) => void;
  onSeleccionar: (s: Seleccion | null) => void;
  onAviso: (texto: string) => void;
  onPedirMedida: (a: Punto, b: Punto) => void;
  onPedirTexto: (pos: Punto) => void;
  onHerramienta: (h: Herramienta) => void;
  onPerderWebGL: () => void;
  alMotor?: (m: MotorMaqueta | null) => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const motor = useRef<MotorMaqueta | null>(null);
  const [listo, setListo] = useState(false);
  const planoRef = useRef(plano);
  planoRef.current = plano;
  const k = plano.escala.metrosPorPx;

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
      while (puestas.some((q) => Math.abs(q.x - p.x) < 72 && Math.abs(q.y - y) < 24)) y -= 24;
      if (p.visible) puestas.push({ x: p.x, y });
      el.style.visibility = p.visible ? "visible" : "hidden";
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
        alPintar: colocar,
        alPerderContexto: () => perderRef.current(),
        alFallarCroquis: () => avisoRef.current("El croquis no se pudo cargar en la maqueta; sigue en el dibujo 2D."),
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
    setListo(true);
    alMotor?.(m);
    return () => {
      ro.disconnect();
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
      coberturas: coberturaVisible,
      elevacionM,
      debajo,
      seleccion,
      verDesde,
      capas: { cobertura: capas.cobertura, personas: capas.humanoides, noche: capas.noche, tamanoReal: capas.tamanoReal, translucidos: capas.translucidos, croquis: capas.croquis },
    });
    setClaves(m.etiquetas);
  }, [listo, plano, coberturaVisible, elevacionM, debajo, seleccion, verDesde, capas.cobertura, capas.humanoides, capas.noche, capas.tamanoReal, capas.translucidos, capas.croquis]);

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
        if (verDesde) onVerDesde(null);
      }
      if (e.key.toLowerCase() === "f") enfocarSeleccion();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const enfocarSeleccion = () => {
    const m = motor.current;
    if (!m || seleccion?.tipo !== "camara") return;
    const e = m.etiquetas.find((x) => x.id === seleccion.id);
    if (e) m.enfocar(e.pos, capas.tamanoReal ? 2.5 : 7);
  };

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

  const colocarCamara = (p: Punto, modelo: ModeloCamara) => {
    const r = agregarCamara(planoRef.current, p, modelo, { numero: numeroNuevo, nombre: `Cámara ${numeroNuevo}` });
    onAplicar(r.plano, { seleccion: { tipo: "camara", id: r.camara.id } });
  };
  const colocarMueble = (p: Punto, tipo: TipoMueble) => {
    const r = agregarMueble(planoRef.current, p, tipo);
    onAplicar(r.plano, { seleccion: { tipo: "mueble", id: r.mueble.id } });
  };

  const alPresionar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = motor.current;
    if (!m || e.target !== lienzo.current || verDesde) return;
    if (e.button !== 0 || e.shiftKey) return;
    const { x, y } = relativo(e);
    const p = enPlano(x, y);
    if (herramienta === "seleccionar") {
      const sel = m.tocar(x, y);
      presion.current = { x, y, sel };
      if (sel && MOVIBLES.has(sel.tipo) && p) {
        m.controles(false);
        arrastre.current = { modo: "mover", sel, ultimo: p, fusion: `mover3d-${sel.id}-${Date.now()}`, movido: false };
        lienzo.current?.setPointerCapture(e.pointerId);
      }
      return;
    }
    m.controles(false);
    if (!p) return;
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
      case "camara":
        colocarCamara(p, modeloNuevo);
        onHerramienta("seleccionar");
        return;
      case "mueble":
        colocarMueble(p, muebleNuevo);
        onHerramienta("seleccionar");
        return;
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
    if (a?.modo === "mover") {
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
    if (e.buttons === 0 && herramienta === "seleccionar" && !movPendiente.current) {
      movPendiente.current = requestAnimationFrame(() => {
        movPendiente.current = 0;
        const sel = motor.current?.tocar(x, y);
        setCursor(sel ? "pointer" : "grab");
      });
    }
  };
  useEffect(() => () => cancelAnimationFrame(movPendiente.current), []);

  const alSoltar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = motor.current;
    if (!m) return;
    const a = arrastre.current;
    arrastre.current = null;
    m.controles(true);
    setMarco(null);
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
    const dato = leerArrastre(e.dataTransfer.getData(TIPO_ARRASTRE));
    if (!dato) return;
    const { x, y } = relativo(e);
    const p = enPlano(x, y);
    if (!p) return;
    if (dato.clase === "camara") {
      const m = modeloPorId(dato.id);
      if (m) colocarCamara(p, m);
    } else {
      colocarMueble(p, dato.id);
    }
  };

  const camaraPov = verDesde ? plano.camaras.find((c) => c.id === verDesde) : null;

  return (
    <div
      ref={caja}
      className={styles.maqueta}
      style={{ background: capas.noche ? "#0c0f15" : "#d9dcdf" }}
      onPointerDownCapture={alPresionar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onDoubleClick={() => {
        setInicioMuro(null);
        setGuia(null);
        if (herramienta === "seleccionar") enfocarSeleccion();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={alSoltarEquipo}
    >
      <canvas
        ref={lienzo}
        className={styles.maquetaLienzo}
        style={{ cursor: herramienta === "seleccionar" ? cursor : "crosshair" }}
        role="img"
        aria-label="Vista 3D del sitio: maqueta con muros, equipos a su altura de montaje y cobertura en el piso. Arrastra para girar y usa la rueda para acercar."
        onContextMenu={(e) => e.preventDefault()}
      />
      {!listo ? <p className={styles.maquetaCarga}>Armando la maqueta…</p> : null}

      <div className={styles.maquetaEncima} aria-hidden={verDesde ? true : undefined}>
        {!verDesde && capas.claves
          ? claves.map((c) => {
              const sel = seleccion?.tipo === "camara" && seleccion.id === c.id;
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
                    else onSeleccionar({ tipo: "camara", id: c.id });
                  }}
                >
                  <i />
                  {c.clave}
                </button>
              );
            })
          : null}
        {!verDesde
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
        {guia ? (
          <svg className={styles.maquetaGuia} aria-hidden="true">
            <line x1={guia.a.x} y1={guia.a.y} x2={guia.b.x} y2={guia.b.y} stroke="#0f7f6c" strokeWidth={2.5} strokeDasharray="7 5" />
          </svg>
        ) : null}
        {marco ? <span className={styles.maquetaMarco} style={{ left: marco.x, top: marco.y, width: marco.w, height: marco.h }} /> : null}
      </div>

      {camaraPov ? (
        <div className={styles.povBarra}>
          <b>Viendo desde {camaraPov.nombre}</b>
          <span>{etiquetaModelo({ marca: "", modelo: camaraPov.modelo })}</span>
          <button type="button" onClick={() => onVerDesde(null)}>
            Salir
          </button>
        </div>
      ) : null}

      {!verDesde ? (
        <>
          <div className={styles.controles3d}>
            <button type="button" className={styles.boton3d} onClick={() => motor.current?.vistaGeneral()}>
              Vista general
            </button>
            <button type="button" className={styles.boton3d} onClick={() => motor.current?.vistaSuperior()}>
              Vista superior
            </button>
          </div>
          <span ref={brujula} className={styles.brujula} role="img" aria-label="Norte" title="Norte">
            <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
              <text x="16" y="8.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="var(--ui-brand-text)">
                N
              </text>
              <path d="M16 10l3.6 7H12.4z" fill="var(--ui-brand)" />
              <path d="M16 27l-3.6-10h7.2z" fill="var(--ui-fg-4)" />
              <circle cx="16" cy="17" r="1.6" fill="var(--ui-surface)" stroke="var(--ui-fg-3)" strokeWidth="0.8" />
            </svg>
          </span>
          <Navegacion
            lugar="abajo"
            botones={[
              { etiqueta: "Girar a la izquierda", icono: ICONO.girarIzq, accion: () => motor.current?.girar(-45) },
              { etiqueta: "Girar a la derecha", icono: ICONO.girarDer, accion: () => motor.current?.girar(45) },
              { etiqueta: "Alejar", icono: ICONO.menos, accion: () => motor.current?.acercar(0.8) },
              { etiqueta: "Acercar", icono: ICONO.mas, accion: () => motor.current?.acercar(1.25) },
              { etiqueta: "Encuadrar todo", icono: ICONO.encuadrar, accion: () => motor.current?.vistaGeneral() },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
