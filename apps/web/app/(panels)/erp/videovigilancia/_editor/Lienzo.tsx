"use client";

/**
 * Lienzo del plano (SVG en px del croquis): croquis de fondo, muros con sus huecos, puertas con su
 * giro, ventanas, obstáculos, cotas, etiquetas, conos DORI recortados por muros, cámaras con su
 * manija para apuntar y humanoides. Rueda = zoom; arrastrar el fondo = mover la vista.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ModeloCamara } from "@/lib/cctv/catalogo";
import {
  agregarAbertura,
  agregarCamara,
  agregarMuro,
  agregarObstaculo,
  agregarPersona,
  ajustarPunto,
  apuntarCamara,
  limitesEnMetros,
  mover,
  moverExtremo,
  muroMasCercano,
  type Seleccion,
  type TipoElemento,
} from "@/lib/cctv/editor";
import { etiquetaCono, hfovDeg, distanciaInclinadaM, ppm } from "@/lib/cctv/optica";
import { dirRumbo, hojasPuerta, type Plano, type Punto, type Tapa } from "@/lib/cctv/plano";
import { camaraEnMetros, mejorNivelEn, type CamaraM, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { COLOR_NIVEL, OPACIDAD_NIVEL } from "./colores";
import styles from "./editor.module.css";

export type Herramienta =
  | "seleccionar"
  | "muro"
  | "puerta"
  | "ventana"
  | "acceso"
  | "obstaculo"
  | "cota"
  | "etiqueta"
  | "camara"
  | "persona";

type Vista = { x: number; y: number; w: number; h: number };

type Arrastre =
  | { modo: "pan"; inicio: { x: number; y: number }; vista: Vista }
  | { modo: "mover"; sel: Seleccion; ultimo: Punto; fusion: string; movido: boolean }
  | { modo: "extremo"; muroId: string; extremo: "a" | "b"; fusion: string }
  | { modo: "apuntar"; camaraId: string; fusion: string }
  | { modo: "obstaculo"; inicio: Punto };

const MOVIBLES: ReadonlySet<TipoElemento> = new Set(["muro", "camara", "persona", "etiqueta", "obstaculo", "cota"]);

const f1 = (n: number) => Math.round(n * 10) / 10;
const pts = (ps: readonly Punto[]) => ps.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" ");

function vistaInicial(plano: Plano): Vista {
  if (plano.croquis) return { x: 0, y: 0, w: plano.croquis.anchoPx, h: plano.croquis.altoPx };
  const ps = [...plano.muros.flatMap((m) => [m.a, m.b]), ...plano.camaras.map((c) => c.pos)];
  if (ps.length) {
    const minX = Math.min(...ps.map((p) => p.x));
    const minY = Math.min(...ps.map((p) => p.y));
    const maxX = Math.max(...ps.map((p) => p.x));
    const maxY = Math.max(...ps.map((p) => p.y));
    const margen = Math.max(maxX - minX, maxY - minY) * 0.08 + 10;
    return { x: minX - margen, y: minY - margen, w: maxX - minX + 2 * margen, h: maxY - minY + 2 * margen };
  }
  const k = plano.escala.metrosPorPx;
  return { x: 0, y: 0, w: 60 / k, h: 30 / k };
}

export default function Lienzo({
  plano,
  seleccion,
  herramienta,
  capas,
  tapas,
  coberturas,
  modeloNuevo,
  onAplicar,
  onSeleccionar,
  onAviso,
  onPedirMedida,
  onPedirTexto,
  onHerramienta,
}: {
  plano: Plano;
  seleccion: Seleccion | null;
  herramienta: Herramienta;
  capas: { croquis: boolean; etiquetas: boolean; calor: boolean };
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  modeloNuevo: ModeloCamara;
  onAplicar: (plano: Plano, opciones?: { seleccion?: Seleccion | null; fusion?: string }) => void;
  onSeleccionar: (s: Seleccion | null) => void;
  onAviso: (texto: string) => void;
  onPedirMedida: (a: Punto, b: Punto) => void;
  onPedirTexto: (pos: Punto) => void;
  onHerramienta: (h: Herramienta) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const planoRef = useRef(plano);
  planoRef.current = plano;
  const [vista, setVista] = useState<Vista>(() => vistaInicial(plano));
  const [anchoPantalla, setAnchoPantalla] = useState(900);
  const [altoPantalla, setAltoPantalla] = useState(600);
  const [cursor, setCursor] = useState<Punto | null>(null);
  const [inicioMuro, setInicioMuro] = useState<Punto | null>(null);
  const [inicioCota, setInicioCota] = useState<Punto | null>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const [arrastrando, setArrastrando] = useState<Arrastre["modo"] | null>(null);
  const croquisPrevio = useRef(plano.croquis?.url ?? null);

  // Al cambiar de croquis, la vista se ajusta al nuevo.
  useEffect(() => {
    const url = plano.croquis?.url ?? null;
    if (url !== croquisPrevio.current) {
      croquisPrevio.current = url;
      setVista(vistaInicial(plano));
    }
  }, [plano]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const medir = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0) setAnchoPantalla(r.width);
      if (r.height > 0) setAltoPantalla(r.height);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  /** Px del plano por px de pantalla (el SVG se ajusta con «meet»). */
  const u = Math.max(vista.w / anchoPantalla, vista.h / altoPantalla);
  const k = plano.escala.metrosPorPx;

  const aPlano = useCallback((clientX: number, clientY: number): Punto => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // Rueda: zoom alrededor del cursor (listener no pasivo para poder frenar el scroll de la página).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const p = aPlano(e.clientX, e.clientY);
      const f = Math.exp(-e.deltaY * 0.0015);
      setVista((v) => {
        const w = Math.min(Math.max(v.w / f, 20), 200_000);
        const h = (v.h * w) / v.w;
        return { x: p.x - ((p.x - v.x) * w) / v.w, y: p.y - ((p.y - v.y) * h) / v.h, w, h };
      });
    };
    svg.addEventListener("wheel", rueda, { passive: false });
    return () => svg.removeEventListener("wheel", rueda);
  }, [aPlano]);

  // Esc cancela el trazo en curso.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInicioMuro(null);
        setInicioCota(null);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  useEffect(() => {
    setInicioMuro(null);
    setInicioCota(null);
  }, [herramienta]);

  const ajustar = (p: Punto, desde?: Punto | null, libre = false, exceptoMuro?: string) =>
    ajustarPunto(planoRef.current, p, { radio: 10 * u, desde, libre, exceptoMuro }).punto;

  const objetivo = (e: ReactPointerEvent): { sel: Seleccion | null; manija: string | null } => {
    const el = (e.target as Element).closest?.("[data-sel],[data-manija]");
    const manija = el?.getAttribute("data-manija") ?? null;
    const raw = el?.closest("[data-sel]")?.getAttribute("data-sel") ?? null;
    if (!raw) return { sel: null, manija };
    const [tipo, ...resto] = raw.split(":");
    return { sel: { tipo: tipo as TipoElemento, id: resto.join(":") }, manija };
  };

  const alPresionar = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const p = aPlano(e.clientX, e.clientY);
    const actual = planoRef.current;
    const capturar = () => svgRef.current?.setPointerCapture(e.pointerId);
    if (e.button === 1) {
      arrastre.current = { modo: "pan", inicio: { x: e.clientX, y: e.clientY }, vista };
      setArrastrando("pan");
      capturar();
      return;
    }
    const libre = e.altKey;
    switch (herramienta) {
      case "seleccionar": {
        const { sel, manija } = objetivo(e);
        if (manija && sel) {
          const fusion = `${manija}-${sel.id}-${Date.now()}`;
          if (manija === "apuntar") arrastre.current = { modo: "apuntar", camaraId: sel.id, fusion };
          else arrastre.current = { modo: "extremo", muroId: sel.id, extremo: manija === "extremo-a" ? "a" : "b", fusion };
          setArrastrando(arrastre.current.modo);
          capturar();
          return;
        }
        if (sel) {
          onSeleccionar(sel);
          if (MOVIBLES.has(sel.tipo)) {
            arrastre.current = { modo: "mover", sel, ultimo: p, fusion: `mover-${sel.id}-${Date.now()}`, movido: false };
            setArrastrando("mover");
            capturar();
          }
          return;
        }
        onSeleccionar(null);
        arrastre.current = { modo: "pan", inicio: { x: e.clientX, y: e.clientY }, vista };
        setArrastrando("pan");
        capturar();
        return;
      }
      case "muro": {
        const q = ajustar(p, inicioMuro, libre);
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
        const cerca = muroMasCercano(actual, p, 14 * u);
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
        arrastre.current = { modo: "obstaculo", inicio: p };
        setArrastrando("obstaculo");
        capturar();
        return;
      case "cota": {
        const q = ajustar(p, inicioCota, libre);
        if (!inicioCota) {
          setInicioCota(q);
          return;
        }
        setInicioCota(null);
        onPedirMedida(inicioCota, q);
        return;
      }
      case "etiqueta":
        onPedirTexto(p);
        return;
      case "camara": {
        const r = agregarCamara(actual, p, modeloNuevo);
        onAplicar(r.plano, { seleccion: { tipo: "camara", id: r.camara.id } });
        onHerramienta("seleccionar");
        return;
      }
      case "persona": {
        const nuevo = agregarPersona(actual, p);
        const persona = nuevo.personas[nuevo.personas.length - 1];
        onAplicar(nuevo, { seleccion: { tipo: "persona", id: persona.id } });
        return;
      }
    }
  };

  const alMover = (e: ReactPointerEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    if (a?.modo === "pan") {
      const dx = (e.clientX - a.inicio.x) * u;
      const dy = (e.clientY - a.inicio.y) * u;
      setVista({ ...a.vista, x: a.vista.x - dx, y: a.vista.y - dy });
      return;
    }
    const p = aPlano(e.clientX, e.clientY);
    setCursor(p);
    if (!a) return;
    const actual = planoRef.current;
    if (a.modo === "mover") {
      const delta = { x: p.x - a.ultimo.x, y: p.y - a.ultimo.y };
      if (!a.movido && Math.hypot(delta.x, delta.y) < 3 * u) return;
      a.movido = true;
      a.ultimo = p;
      onAplicar(mover(actual, a.sel, delta), { fusion: a.fusion });
    } else if (a.modo === "extremo") {
      const q = ajustar(p, null, e.altKey, a.muroId);
      onAplicar(moverExtremo(actual, a.muroId, a.extremo, q), { fusion: a.fusion });
    } else if (a.modo === "apuntar") {
      onAplicar(apuntarCamara(actual, a.camaraId, p), { fusion: a.fusion });
    }
  };

  const alSoltar = (e: ReactPointerEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    arrastre.current = null;
    setArrastrando(null);
    if (a?.modo === "obstaculo") {
      const p = aPlano(e.clientX, e.clientY);
      const r = agregarObstaculo(planoRef.current, a.inicio, p);
      if (r.obstaculo) onAplicar(r.plano, { seleccion: { tipo: "obstaculo", id: r.obstaculo.id } });
    }
  };

  /* ── Lo que se dibuja ── */

  const muroDe = useMemo(() => new Map(plano.muros.map((m) => [m.id, m])), [plano.muros]);

  // Tramos llenos de cada muro (en px) para dibujar los huecos.
  const tramos = useMemo(() => {
    const porMuro = new Map<string, Array<{ a: Punto; b: Punto }>>();
    for (const t of tapas) {
      const m = muroDe.get(t.origen);
      if (!m || t.baseM !== 0 || Math.abs(t.topeM - m.alturaM) > 1e-6) continue;
      const lista = porMuro.get(m.id) ?? [];
      lista.push({ a: { x: t.a.x / k, y: t.a.y / k }, b: { x: t.b.x / k, y: t.b.y / k } });
      porMuro.set(m.id, lista);
    }
    return porMuro;
  }, [tapas, muroDe, k]);

  const camarasM = useMemo(() => {
    const m = new Map<string, CamaraM>();
    for (const c of plano.camaras) {
      const cm = camaraEnMetros(c, plano.escala);
      if (cm) m.set(c.id, cm);
    }
    return m;
  }, [plano.camaras, plano.escala]);

  const calor = useMemo(() => {
    if (!capas.calor) return null;
    const lim = limitesEnMetros(plano);
    if (!lim) return null;
    const area = (lim.max.x - lim.min.x) * (lim.max.y - lim.min.y);
    const celda = Math.max(0.5, Math.sqrt(area / 12_000));
    const cams = [...camarasM.values()];
    const celdas: Array<{ x: number; y: number; nivel: keyof typeof COLOR_NIVEL }> = [];
    for (let y = lim.min.y; y < lim.max.y; y += celda) {
      for (let x = lim.min.x; x < lim.max.x; x += celda) {
        const n = mejorNivelEn(cams, tapas, { x: x + celda / 2, y: y + celda / 2 });
        if (n) celdas.push({ x, y, nivel: n });
      }
    }
    return { celdas, celda };
  }, [capas.calor, plano, camarasM, tapas]);

  const selId = seleccion?.id;
  const esSel = (tipo: TipoElemento, id: string) => seleccion?.tipo === tipo && selId === id;
  const camaraSel = seleccion?.tipo === "camara" ? plano.camaras.find((c) => c.id === selId) : undefined;
  const muroSel = seleccion?.tipo === "muro" ? muroDe.get(selId ?? "") : undefined;

  // Paso de la retícula: 1 m, o 5 m cuando 1 m queda en menos de 8 px de pantalla.
  const pasoGrid = (1 / k) / u < 8 ? 5 / k : 1 / k;
  const preview = cursor && inicioMuro ? ajustar(cursor, inicioMuro) : null;
  const previewCota = cursor && inicioCota ? ajustar(cursor, inicioCota) : null;
  const ob = arrastrando === "obstaculo" && arrastre.current?.modo === "obstaculo" && cursor ? arrastre.current.inicio : null;

  const cursorCss =
    arrastrando === "pan" ? "grabbing" : herramienta === "seleccionar" ? "default" : herramienta === "camara" || herramienta === "persona" || herramienta === "etiqueta" ? "copy" : "crosshair";

  // Barra de escala: el largo «redondo» (1, 2, 5, 10, 20, 50 m…) que ocupa entre 70 y 170 px de pantalla.
  const metrosPorPantalla = u * k;
  const largoBarra = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((m) => m / metrosPorPantalla >= 70) ?? 1000;
  const anchoBarra = largoBarra / metrosPorPantalla;

  return (
    <>
    <div className={styles.escalaNorte} aria-hidden="true">
      <span className={styles.norte} style={{ transform: `rotate(${plano.norteDeg}deg)` }} title="Norte">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M12 2l5 14-5-3-5 3z" fill="var(--ui-fg)" />
          <text x="12" y="23" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--ui-fg)">N</text>
        </svg>
      </span>
      <span className={styles.barraEscala}>
        <span style={{ width: anchoBarra }} />
        <b>{largoBarra < 1 ? `${largoBarra * 100} cm` : `${largoBarra} m`}</b>
      </span>
    </div>
    <svg
      ref={svgRef}
      className={styles.lienzo}
      viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ cursor: cursorCss }}
      onPointerDown={alPresionar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onPointerLeave={() => setCursor(null)}
      onDoubleClick={() => setInicioMuro(null)}
      onContextMenu={(e) => e.preventDefault()}
      role="application"
      aria-label="Plano del sitio: muros, cámaras y su cobertura"
    >
      <defs>
        <pattern id="cctv-reticula" width={pasoGrid} height={pasoGrid} patternUnits="userSpaceOnUse">
          <path d={`M ${pasoGrid} 0 L 0 0 0 ${pasoGrid}`} fill="none" stroke="var(--ui-border)" strokeWidth={u} />
        </pattern>
      </defs>
      <rect x={vista.x - vista.w} y={vista.y - vista.h} width={vista.w * 3} height={vista.h * 3} fill="url(#cctv-reticula)" />

      {plano.croquis && capas.croquis ? (
        <image
          href={plano.croquis.url}
          x={0}
          y={0}
          width={plano.croquis.anchoPx}
          height={plano.croquis.altoPx}
          opacity={plano.croquis.opacidad}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none", filter: plano.croquis.invertido ? "invert(1) hue-rotate(180deg)" : undefined }}
        />
      ) : null}

      {calor
        ? calor.celdas.map((c, i) => (
            <rect key={i} x={c.x / k} y={c.y / k} width={calor.celda / k} height={calor.celda / k} fill={COLOR_NIVEL[c.nivel]} fillOpacity={0.45} style={{ pointerEvents: "none" }} />
          ))
        : null}

      {/* Conos: los demás primero, la seleccionada encima. */}
      <g style={{ pointerEvents: "none" }}>
        {[...plano.camaras]
          .sort((a, b) => Number(a.id === selId) - Number(b.id === selId))
          .flatMap((c) =>
            (coberturas.get(c.id) ?? []).map((pol, i) => (
              <polygon
                key={`${c.id}-${i}`}
                points={pts(pol.puntos.map((p) => ({ x: p.x / k, y: p.y / k })))}
                fill={COLOR_NIVEL[pol.nivel]}
                fillOpacity={c.id === selId ? OPACIDAD_NIVEL[pol.nivel] + 0.16 : OPACIDAD_NIVEL[pol.nivel]}
              />
            )),
          )}
      </g>

      {plano.obstaculos.map((o) => (
        <polygon
          key={o.id}
          data-sel={`obstaculo:${o.id}`}
          points={pts(o.puntos)}
          fill="var(--ui-neutral-bg)"
          stroke={esSel("obstaculo", o.id) ? "var(--ui-brand)" : "var(--ui-neutral)"}
          strokeWidth={(esSel("obstaculo", o.id) ? 2.5 : 1.2) * u}
        />
      ))}

      {plano.muros.map((m) => {
        const sel = esSel("muro", m.id);
        const grosor = Math.max(m.grosorM / k, 2.5 * u);
        if (m.tipo !== "muro") {
          return (
            <line
              key={m.id}
              data-sel={`muro:${m.id}`}
              x1={m.a.x}
              y1={m.a.y}
              x2={m.b.x}
              y2={m.b.y}
              stroke={sel ? "var(--ui-brand)" : m.tipo === "vidrio" ? "var(--ui-info)" : "var(--ui-neutral)"}
              strokeWidth={grosor}
              strokeDasharray={`${6 * u} ${4 * u}`}
            />
          );
        }
        return (
          <g key={m.id} data-sel={`muro:${m.id}`}>
            {/* Franja ancha invisible para que el clic atine. */}
            <line x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y} stroke="transparent" strokeWidth={Math.max(grosor, 12 * u)} />
            {(tramos.get(m.id) ?? []).map((t, i) => (
              <line
                key={i}
                x1={t.a.x}
                y1={t.a.y}
                x2={t.b.x}
                y2={t.b.y}
                stroke={sel ? "var(--ui-brand)" : m.alturaM >= 4 ? "#3a4150" : "#5b6272"}
                strokeWidth={grosor}
                strokeLinecap="square"
              />
            ))}
          </g>
        );
      })}

      {plano.aberturas.map((ab) => {
        const m = muroDe.get(ab.muroId);
        if (!m) return null;
        const en = (t: number) => ({ x: m.a.x + (m.b.x - m.a.x) * t, y: m.a.y + (m.b.y - m.a.y) * t });
        const a = en(ab.desde);
        const b = en(ab.hasta);
        const sel = esSel("abertura", ab.id);
        const color = sel ? "var(--ui-brand)" : "var(--ui-fg-3)";
        if (ab.tipo === "acceso" || ab.tipo === "ventana") {
          return (
            <g key={ab.id} data-sel={`abertura:${ab.id}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12 * u} />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={ab.tipo === "ventana" ? (sel ? "var(--ui-brand)" : "var(--ui-info)") : color}
                strokeWidth={(ab.tipo === "ventana" ? 3 : 1.5) * u}
                strokeDasharray={ab.tipo === "acceso" ? `${4 * u} ${3 * u}` : undefined}
              />
            </g>
          );
        }
        const cerradas = hojasPuerta({ ...ab, abierta: false }, a, b);
        return (
          <g key={ab.id} data-sel={`abertura:${ab.id}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12 * u} />
            {hojasPuerta(ab, a, b).map((h, i) => {
              const r = Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y);
              const c = cerradas[i].b;
              const v1 = { x: c.x - h.a.x, y: c.y - h.a.y };
              const v2 = { x: h.b.x - h.a.x, y: h.b.y - h.a.y };
              const giro = v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0;
              return (
                <g key={i}>
                  <line x1={h.a.x} y1={h.a.y} x2={h.b.x} y2={h.b.y} stroke={color} strokeWidth={1.6 * u} />
                  {ab.abierta ? (
                    <path d={`M ${c.x} ${c.y} A ${r} ${r} 0 0 ${giro} ${h.b.x} ${h.b.y}`} fill="none" stroke="var(--ui-fg-4)" strokeWidth={u} strokeDasharray={`${2 * u} ${2 * u}`} />
                  ) : null}
                </g>
              );
            })}
          </g>
        );
      })}

      {plano.cotas.map((c) => {
        const mx = (c.a.x + c.b.x) / 2;
        const my = (c.a.y + c.b.y) / 2;
        const ang = (Math.atan2(c.b.y - c.a.y, c.b.x - c.a.x) * 180) / Math.PI;
        const giro = ang > 90 || ang < -90 ? ang + 180 : ang;
        return (
          <g key={c.id} data-sel={`cota:${c.id}`}>
            <line x1={c.a.x} y1={c.a.y} x2={c.b.x} y2={c.b.y} stroke="transparent" strokeWidth={10 * u} />
            <line x1={c.a.x} y1={c.a.y} x2={c.b.x} y2={c.b.y} stroke={esSel("cota", c.id) ? "var(--ui-brand)" : "#b07a1a"} strokeWidth={1.2 * u} />
            <circle cx={c.a.x} cy={c.a.y} r={2.5 * u} fill="#b07a1a" />
            <circle cx={c.b.x} cy={c.b.y} r={2.5 * u} fill="#b07a1a" />
            {c.texto ? (
              <text x={mx} y={my - 5 * u} fontSize={12 * u} fontWeight={600} fill="#8a5a06" textAnchor="middle" transform={`rotate(${giro} ${mx} ${my})`}>
                {c.texto}
              </text>
            ) : null}
          </g>
        );
      })}

      {capas.etiquetas
        ? plano.etiquetas.map((e) => (
            <text
              key={e.id}
              data-sel={`etiqueta:${e.id}`}
              x={e.pos.x}
              y={e.pos.y}
              fontSize={(e.tamano ?? 14) * u}
              fontWeight={600}
              fill={esSel("etiqueta", e.id) ? "var(--ui-brand-text)" : "var(--ui-fg-2)"}
              textAnchor="middle"
              style={{ userSelect: "none" }}
            >
              {e.texto}
            </text>
          ))
        : null}

      {plano.personas.map((h) => {
        const sel = esSel("persona", h.id);
        return (
          <g key={h.id} data-sel={`persona:${h.id}`} transform={`translate(${h.pos.x} ${h.pos.y}) scale(${u})`}>
            <circle r={9} fill="var(--ui-surface)" stroke={sel ? "var(--ui-brand)" : "var(--ui-info)"} strokeWidth={sel ? 3 : 2} />
            <circle cy={-2.2} r={2.3} fill="var(--ui-info-text)" />
            <path d="M -3.4 4.4 Q 0 -0.8 3.4 4.4 Z" fill="var(--ui-info-text)" />
          </g>
        );
      })}

      {/* «14 m · 109 PPM · Observación» al final de cada cono (la seleccionada lleva la suya, más grande). */}
      {capas.etiquetas
        ? plano.camaras
            .filter((c) => c.id !== selId)
            .map((c) => {
              const cm = camarasM.get(c.id);
              const h = c.lentes[0] ? hfovDeg(c.lentes[0].optica) : null;
              if (!cm || h == null) return null;
              const d = dirRumbo(c.rumboDeg + (c.lentes[0]?.desfaseRumboDeg ?? 0));
              const largo = (c.distanciaM * 0.82) / k;
              const texto = etiquetaCono(c.distanciaM, ppm(cm.pxHoriz, distanciaInclinadaM(c.distanciaM, c.alturaM), h));
              return (
                <g key={`et-${c.id}`} transform={`translate(${c.pos.x + d.x * largo} ${c.pos.y + d.y * largo}) scale(${u})`} style={{ pointerEvents: "none" }}>
                  <rect x={-74} y={-9} width={148} height={18} rx={9} fill="var(--ui-surface)" fillOpacity={0.92} stroke="var(--ui-border-strong)" strokeWidth={0.8} />
                  <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ui-fg-2)">
                    {texto}
                  </text>
                </g>
              );
            })
        : null}

      {/* Cámara seleccionada: eje, manija para apuntar y etiqueta del final del cono. */}
      {camaraSel ? (() => {
        const d = dirRumbo(camaraSel.rumboDeg + (camaraSel.lentes[0]?.desfaseRumboDeg ?? 0));
        const largo = camaraSel.distanciaM / k;
        const tip = { x: camaraSel.pos.x + d.x * largo, y: camaraSel.pos.y + d.y * largo };
        const cm = camarasM.get(camaraSel.id);
        const h = camaraSel.lentes[0] ? hfovDeg(camaraSel.lentes[0].optica) : null;
        const texto =
          cm && h != null
            ? etiquetaCono(camaraSel.distanciaM, ppm(cm.pxHoriz, distanciaInclinadaM(camaraSel.distanciaM, camaraSel.alturaM), h))
            : null;
        return (
          <g>
            <line x1={camaraSel.pos.x} y1={camaraSel.pos.y} x2={tip.x} y2={tip.y} stroke="var(--ui-brand)" strokeWidth={1.5 * u} strokeDasharray={`${5 * u} ${4 * u}`} style={{ pointerEvents: "none" }} />
            {texto ? (
              <g transform={`translate(${tip.x + d.x * 18 * u} ${tip.y + d.y * 18 * u}) scale(${u})`} style={{ pointerEvents: "none" }}>
                <rect x={-88} y={-11} width={176} height={22} rx={11} fill="#14171f" opacity={0.88} />
                <text y={4} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#fff">
                  {texto}
                </text>
              </g>
            ) : null}
            <g data-sel={`camara:${camaraSel.id}`} data-manija="apuntar" transform={`translate(${tip.x} ${tip.y}) scale(${u})`} style={{ cursor: "grab" }}>
              <circle r={7} fill="var(--ui-surface)" stroke="var(--ui-brand)" strokeWidth={2.5} />
              <title>Arrastra para apuntar la cámara y cambiar el largo del cono</title>
            </g>
          </g>
        );
      })() : null}

      {plano.camaras.map((c) => {
        const sel = c.id === selId && seleccion?.tipo === "camara";
        const d = dirRumbo(c.rumboDeg);
        return (
          <g key={c.id} data-sel={`camara:${c.id}`} transform={`translate(${c.pos.x} ${c.pos.y}) scale(${u})`} style={{ cursor: herramienta === "seleccionar" ? "move" : undefined }}>
            <line x1={0} y1={0} x2={d.x * 14} y2={d.y * 14} stroke="#14171f" strokeWidth={1.5} />
            <circle r={2.6} fill="#14171f" />
            {sel ? <circle cx={d.x * 14} cy={d.y * 14} r={15} fill="var(--ui-brand)" opacity={0.22} /> : null}
            <circle cx={d.x * 14} cy={d.y * 14} r={10} fill={sel ? "var(--ui-brand)" : "#14171f"} stroke="#fff" strokeWidth={2} />
            <text x={d.x * 14} y={d.y * 14 + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff" style={{ userSelect: "none" }}>
              {c.numero}
            </text>
          </g>
        );
      })}

      {muroSel ? (
        <>
          {(["a", "b"] as const).map((ext) => (
            <g key={ext} data-sel={`muro:${muroSel.id}`} data-manija={`extremo-${ext}`} transform={`translate(${muroSel[ext].x} ${muroSel[ext].y}) scale(${u})`} style={{ cursor: "grab" }}>
              <rect x={-6} y={-6} width={12} height={12} rx={2} fill="var(--ui-surface)" stroke="var(--ui-brand)" strokeWidth={2.5} />
            </g>
          ))}
        </>
      ) : null}

      {/* Lo que se está dibujando. */}
      {inicioMuro && preview ? (
        <g style={{ pointerEvents: "none" }}>
          <line x1={inicioMuro.x} y1={inicioMuro.y} x2={preview.x} y2={preview.y} stroke="var(--ui-brand)" strokeWidth={Math.max(0.15 / k, 2.5 * u)} strokeOpacity={0.7} />
          <g transform={`translate(${preview.x} ${preview.y}) scale(${u})`}>
            <rect x={8} y={-24} width={64} height={20} rx={6} fill="#14171f" opacity={0.85} />
            <text x={40} y={-10} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
              {(Math.hypot(preview.x - inicioMuro.x, preview.y - inicioMuro.y) * k).toFixed(2)} m
            </text>
          </g>
        </g>
      ) : null}
      {inicioCota && previewCota ? (
        <line x1={inicioCota.x} y1={inicioCota.y} x2={previewCota.x} y2={previewCota.y} stroke="#b07a1a" strokeWidth={1.5 * u} strokeDasharray={`${4 * u} ${3 * u}`} style={{ pointerEvents: "none" }} />
      ) : null}
      {ob && cursor ? (
        <rect
          x={Math.min(ob.x, cursor.x)}
          y={Math.min(ob.y, cursor.y)}
          width={Math.abs(cursor.x - ob.x)}
          height={Math.abs(cursor.y - ob.y)}
          fill="var(--ui-neutral-bg)"
          stroke="var(--ui-brand)"
          strokeWidth={1.5 * u}
          style={{ pointerEvents: "none" }}
        />
      ) : null}
    </svg>
    </>
  );
}
