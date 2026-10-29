"use client";

/**
 * Vista 3D del sitio (artboard 2 del mockup aprobado): muros a su altura real, cámaras a su altura
 * de montaje con su número, conos DORI en el piso, croquis de fondo y humanoides. Arrastrar gira,
 * Mayús + arrastrar (o clic derecho) mueve, la rueda acerca; «F» enfoca lo seleccionado.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { limitesEnMetros, type Seleccion, type TipoElemento } from "@/lib/cctv/editor";
import { VISTA_ISOMETRICA, VISTA_SUPERIOR, encuadrar, escena3D, proyector, unirLimites, type Vista3D } from "@/lib/cctv/escena3d";
import { elevacionTexto, type NivelConPlano } from "@/lib/cctv/niveles";
import { dirRumbo, tapasDelPlano, type Plano, type Tapa } from "@/lib/cctv/plano";
import { camaraEnMetros, coberturaCamara, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import Figuras3D from "./Figuras3D";
import Navegacion, { ICONO } from "./Navegacion";
import styles from "./editor.module.css";

type Arrastre = { modo: "girar" | "mover"; x: number; y: number; vista: Vista3D };

const acercar = (v: Vista3D, f: number): Vista3D => ({ ...v, pxPorMetro: Math.min(Math.max(v.pxPorMetro * f, 1), 400) });
const SIN_NIVELES: readonly NivelConPlano[] = [];

export default function Lienzo3D({
  plano,
  nombreNivel,
  elevacionM = 0,
  debajo = SIN_NIVELES,
  seleccion,
  tapas,
  coberturas,
  capas,
  onSeleccionar,
}: {
  plano: Plano;
  /** Nombre del nivel que se edita; con varios pisos se rotula en la vista. */
  nombreNivel?: string;
  /** Elevación del nivel que se edita (artboard 5: vista apilada). */
  elevacionM?: number;
  /** Niveles de abajo, que se dibujan en gris a su elevación. */
  debajo?: readonly NivelConPlano[];
  seleccion: Seleccion | null;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  capas: { croquis: boolean; etiquetas: boolean; translucidos: boolean; humanoides: boolean };
  onSeleccionar: (s: Seleccion | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  // El lienzo se ajusta al alto de la ventana (CSS); aquí se mide para que el dibujo no se deforme.
  const [ancho, setAncho] = useState(900);
  const [alto, setAlto] = useState(640);
  const limites = useMemo(() => limitesEnMetros(plano), [plano]);
  // El encuadre abarca todos los pisos que se ven.
  const limitesTodos = useMemo(() => unirLimites([limites, ...debajo.map((n) => limitesEnMetros(n.plano))]), [limites, debajo]);
  const k = plano.escala.metrosPorPx;
  const encuadreInicial = (orientacion: { azimutDeg: number; elevacionDeg: number }, w = ancho, h = alto): Vista3D => {
    const lim = limitesTodos ?? { min: { x: 0, y: 0 }, max: { x: 20, y: 12 } };
    return { ...orientacion, ancho: w, alto: h, ...encuadrar(lim, { ...orientacion, ancho: w, alto: h }, elevacionM) };
  };
  const encuadreRef = useRef(encuadreInicial);
  encuadreRef.current = encuadreInicial;
  const [vista, setVista] = useState<Vista3D>(() => encuadreInicial(VISTA_ISOMETRICA));
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  // Cambios de vista con botón (preset, girar, acercar, encuadrar): transición de ~300 ms.
  const animacion = useRef(0);
  const animarA = (destino: (v: Vista3D) => Vista3D) => {
    cancelAnimationFrame(animacion.current);
    const desde = vistaRef.current;
    const hasta = destino(desde);
    if (typeof document !== "undefined" && document.hidden) return setVista(hasta);
    const giro = ((((hasta.azimutDeg - desde.azimutDeg) % 360) + 540) % 360) - 180;
    const t0 = performance.now();
    const paso = (t: number) => {
      const u = Math.min(1, (t - t0) / 300);
      const e = 1 - Math.pow(1 - u, 3);
      setVista({
        ...hasta,
        azimutDeg: desde.azimutDeg + giro * e,
        elevacionDeg: desde.elevacionDeg + (hasta.elevacionDeg - desde.elevacionDeg) * e,
        pxPorMetro: desde.pxPorMetro * Math.pow(hasta.pxPorMetro / desde.pxPorMetro, e),
        centro: { x: desde.centro.x + (hasta.centro.x - desde.centro.x) * e, y: desde.centro.y + (hasta.centro.y - desde.centro.y) * e },
      });
      if (u < 1) animacion.current = requestAnimationFrame(paso);
    };
    animacion.current = requestAnimationFrame(paso);
  };
  useEffect(() => () => cancelAnimationFrame(animacion.current), []);
  const arrastre = useRef<Arrastre | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  // El puntero manda más eventos que cuadros pinta la pantalla: se junta todo en uno por cuadro.
  const pendiente = useRef<Vista3D | null>(null);
  const cuadro = useRef(0);
  const programar = (v: Vista3D) => {
    pendiente.current = v;
    if (cuadro.current) return;
    cuadro.current = requestAnimationFrame(() => {
      cuadro.current = 0;
      if (pendiente.current) setVista(pendiente.current);
      pendiente.current = null;
    });
  };
  useEffect(() => () => cancelAnimationFrame(cuadro.current), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let primera = true;
    const medir = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setAncho(r.width);
        setAlto(r.height);
        // La primera medida reencuadra (el encuadre inicial supuso 900 × 640); después solo se ajusta el tamaño.
        if (primera) setVista((v) => encuadreRef.current({ azimutDeg: v.azimutDeg, elevacionDeg: v.elevacionDeg }, r.width, r.height));
        else setVista((v) => ({ ...v, ancho: r.width, alto: r.height }));
        primera = false;
      }
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      setVista((v) => acercar(v, f));
    };
    svg.addEventListener("wheel", rueda, { passive: false });
    return () => svg.removeEventListener("wheel", rueda);
  }, []);

  // «F» enfoca la cámara o el humanoide seleccionado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key.toLowerCase() !== "f" || !seleccion) return;
      const c = plano.camaras.find((x) => x.id === seleccion.id) ?? plano.personas.find((x) => x.id === seleccion.id);
      if (c) setVista((v) => ({ ...v, centro: { x: c.pos.x * k, y: c.pos.y * k }, pxPorMetro: Math.max(v.pxPorMetro, 28) }));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [seleccion, plano, k]);

  const figuras = useMemo(
    () =>
      escena3D({
        plano: capas.humanoides ? plano : { ...plano, personas: [] },
        tapas,
        coberturas,
        vista,
        seleccionada: seleccion?.tipo === "camara" ? seleccion.id : null,
        limites,
        elevacionM,
      }),
    [plano, tapas, coberturas, vista, seleccion, limites, capas.humanoides, elevacionM],
  );
  const matriz = useMemo(() => proyector(vista).matrizPiso(k, elevacionM), [vista, k, elevacionM]);
  // Los pisos de abajo: su cobertura se calcula una vez; al girar solo se vuelven a proyectar.
  const calculoDeAbajo = useMemo(
    () =>
      debajo.map(({ nivel, plano: p }) => {
        const t = tapasDelPlano(p);
        const cob = new Map<string, PoligonoCobertura[]>();
        for (const c of p.camaras) {
          const cm = camaraEnMetros(c, p.escala);
          cob.set(c.id, cm ? coberturaCamara(cm, t) : []);
        }
        return { nivel, plano: p, tapas: t, coberturas: cob, limites: limitesEnMetros(p) };
      }),
    [debajo],
  );
  const pisosDeAbajo = useMemo(
    () =>
      calculoDeAbajo.map(({ nivel, plano: p, tapas: t, coberturas: cob, limites: lim }) => ({
        nivel,
        plano: p,
        limites: lim,
        figuras: escena3D({ plano: capas.humanoides ? p : { ...p, personas: [] }, tapas: t, coberturas: cob, vista, limites: lim, elevacionM: nivel.elevacionM }),
        matriz: proyector(vista).matrizPiso(p.escala.metrosPorPx, nivel.elevacionM),
      })),
    [calculoDeAbajo, vista, capas.humanoides],
  );
  // Rótulos de nivel y aristas punteadas entre pisos (artboard 5).
  const rotulos = useMemo(() => {
    if (!debajo.length && !elevacionM) return null;
    const pr = proyector(vista);
    type Lim = NonNullable<typeof limites>;
    const esquinas = (lim: Lim) => [lim.min.x, lim.max.x].flatMap((x) => [lim.min.y, lim.max.y].map((y) => ({ x, y })));
    // Centro del borde de enfrente (las dos esquinas más bajas en pantalla): así el rótulo no cae en las
    // esquinas, donde van la leyenda y los controles.
    const frente = (lim: Lim, z: number) => {
      const [a, b] = esquinas(lim)
        .map((e) => pr.pantalla({ ...e, z }))
        .sort((p, q) => q.y - p.y);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const pisoMasBajo = Math.min(elevacionM, ...debajo.map((n) => n.nivel.elevacionM));
    return {
      activo: limites ? { p: frente(limites, elevacionM), texto: `${nombreNivel ?? "Nivel"} ${elevacionTexto(elevacionM)}` } : null,
      abajo: pisosDeAbajo.flatMap((n) => (n.limites ? [{ id: n.nivel.id, p: frente(n.limites, n.nivel.elevacionM), texto: `${n.nivel.nombre} ${elevacionTexto(n.nivel.elevacionM)}` }] : [])),
      aristas: limites && debajo.length ? esquinas(limites).map((e) => ({ a: pr.pantalla({ ...e, z: pisoMasBajo }), b: pr.pantalla({ ...e, z: elevacionM }) })) : [],
    };
  }, [debajo, elevacionM, vista, limites, nombreNivel, pisosDeAbajo]);

  const alPresionar = (e: ReactPointerEvent<SVGSVGElement>) => {
    const el = (e.target as Element).closest?.("[data-sel]");
    const raw = el?.getAttribute("data-sel");
    if (raw && e.button === 0 && !e.shiftKey) {
      const [tipo, ...resto] = raw.split(":");
      onSeleccionar({ tipo: tipo as TipoElemento, id: resto.join(":") });
      return;
    }
    arrastre.current = { modo: e.button === 2 || e.shiftKey ? "mover" : "girar", x: e.clientX, y: e.clientY, vista };
    setArrastrando(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const alMover = (e: ReactPointerEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (a.modo === "girar") {
      programar({ ...a.vista, azimutDeg: a.vista.azimutDeg + dx * 0.35, elevacionDeg: Math.min(90, Math.max(8, a.vista.elevacionDeg + dy * 0.25)) });
    } else {
      const ang = (a.vista.azimutDeg * Math.PI) / 180;
      const se = Math.max(Math.sin((a.vista.elevacionDeg * Math.PI) / 180), 0.2);
      const mx = -dx / a.vista.pxPorMetro;
      const my = -dy / (a.vista.pxPorMetro * se);
      programar({
        ...a.vista,
        centro: { x: a.vista.centro.x + mx * Math.cos(ang) + my * Math.sin(ang), y: a.vista.centro.y - mx * Math.sin(ang) + my * Math.cos(ang) },
      });
    }
  };
  const alSoltar = () => {
    arrastre.current = null;
    setArrastrando(false);
    if (pendiente.current) {
      cancelAnimationFrame(cuadro.current);
      cuadro.current = 0;
      setVista(pendiente.current);
      pendiente.current = null;
    }
  };

  const selId = seleccion?.id;

  // Brújula: hacia dónde queda el norte en pantalla con la vista actual (gira con el modelo).
  const norte = (() => {
    const pr = proyector(vista);
    const c = vista.centro;
    const n = dirRumbo(plano.norteDeg);
    const a = pr.pantalla({ x: c.x, y: c.y, z: 0 });
    const b = pr.pantalla({ x: c.x + n.x, y: c.y + n.y, z: 0 });
    return (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  })();

  return (
    <>
      <div className={styles.controles3d}>
        <button type="button" className={styles.boton3d} onClick={() => animarA(() => encuadreInicial(VISTA_ISOMETRICA))}>
          Isométrica
        </button>
        <button type="button" className={styles.boton3d} onClick={() => animarA(() => encuadreInicial(VISTA_SUPERIOR))}>
          Vista superior
        </button>
      </div>
      <span className={styles.brujula} role="img" aria-label="Norte" title="Norte" style={{ transform: `rotate(${norte}deg)` }}>
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path d="M12 2l5 14-5-3-5 3z" fill="var(--ui-fg)" />
          <text x="12" y="23" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--ui-fg)">N</text>
        </svg>
      </span>
      <p className={styles.pista3d}>Arrastrar: girar · Mayús + arrastrar: mover · rueda: acercar · F: enfocar la selección</p>
      <Navegacion
        lugar="abajo"
        botones={[
          { etiqueta: "Girar a la izquierda", icono: ICONO.girarIzq, accion: () => animarA((v) => ({ ...v, azimutDeg: v.azimutDeg - 45 })) },
          { etiqueta: "Girar a la derecha", icono: ICONO.girarDer, accion: () => animarA((v) => ({ ...v, azimutDeg: v.azimutDeg + 45 })) },
          { etiqueta: "Alejar", icono: ICONO.menos, accion: () => animarA((v) => acercar(v, 0.8)) },
          { etiqueta: "Acercar", icono: ICONO.mas, accion: () => animarA((v) => acercar(v, 1.25)) },
          { etiqueta: "Encuadrar todo", icono: ICONO.encuadrar, accion: () => animarA((v) => encuadreInicial({ azimutDeg: v.azimutDeg, elevacionDeg: v.elevacionDeg })) },
        ]}
      />
      <svg
        ref={svgRef}
        className={styles.lienzo}
        viewBox={`0 0 ${ancho} ${alto}`}
        style={{ cursor: arrastrando ? "grabbing" : "grab" }}
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onContextMenu={(e) => e.preventDefault()}
        role="img"
        aria-label="Vista 3D del sitio: muros a su altura, cámaras a su altura de montaje y conos de cobertura en el piso"
      >
        <defs>
          <linearGradient id="cctv-cielo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ui-track)" />
            <stop offset="1" stopColor="var(--ui-surface-2)" />
          </linearGradient>
        </defs>
        <rect width={ancho} height={alto} fill="url(#cctv-cielo)" />
        {pisosDeAbajo.map((n) => (
          <g key={n.nivel.id} style={{ pointerEvents: "none" }}>
            <Figuras3D figuras={n.figuras} plano={n.plano} matriz={n.matriz} capas={{ ...capas, translucidos: true }} apagado />
          </g>
        ))}
        {rotulos ? (
          <g pointerEvents="none">
            {rotulos.aristas.map((l, i) => (
              <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="var(--ui-fg-4)" strokeDasharray="4 4" />
            ))}
            {rotulos.abajo.map((r) => (
              <text key={r.id} x={r.p.x} y={r.p.y + 22} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--ui-fg-2)">
                {r.texto}
              </text>
            ))}
          </g>
        ) : null}
        <Figuras3D figuras={figuras} plano={plano} matriz={matriz} capas={capas} selId={selId} />
        {rotulos?.activo ? <Pastilla x={rotulos.activo.p.x} y={rotulos.activo.p.y + 30} texto={rotulos.activo.texto} /> : null}
      </svg>
    </>
  );
}

/** Rótulo oscuro del nivel activo (artboard 5). */
function Pastilla({ x, y, texto }: { x: number; y: number; texto: string }) {
  const w = texto.length * 6.6 + 28;
  return (
    <g pointerEvents="none" transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} fill="#14171f" opacity={0.85} />
      <text y={4} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#fff">
        {texto}
      </text>
    </g>
  );
}
