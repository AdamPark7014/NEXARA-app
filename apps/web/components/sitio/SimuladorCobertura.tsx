"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import PublicIcon from "@/app/components/PublicIcon";
import s from "./sitio.module.css";
import c from "./simulador.module.css";
import Flecha from "./Flecha";

/*
 * Plano de una tienda (unidades del viewBox, 640 × 400): muros, góndolas que tapan la vista y tres zonas de riesgo.
 * La cobertura se mide en una rejilla de puntos del piso: un punto cuenta si alguna cámara lo ve (dentro del ángulo
 * y del alcance, sin muro ni góndola de por medio).
 */

type P = { x: number; y: number };
type Seg = [P, P];
type Camara = { id: number; x: number; y: number; ang: number };

const ANCHO = 640;
const ALTO = 400;
const FOV = 80;
const ALCANCE = 250;
const MAX_CAMARAS = 5;

const GONDOLAS = [
  { x: 262, y: 86, w: 16, h: 150 },
  { x: 342, y: 86, w: 16, h: 150 },
  { x: 422, y: 86, w: 16, h: 150 },
];

/** Zonas de riesgo; `etiqueta` es el centro de su rótulo, fuera de puertas y muebles. */
const ZONAS = [
  { id: "acceso", nombre: "Acceso", x: 268, y: 320, w: 104, h: 56, etiqueta: { x: 320, y: 305 } },
  { id: "caja", nombre: "Caja", x: 470, y: 250, w: 126, h: 64, etiqueta: { x: 533, y: 237 } },
  { id: "almacen", nombre: "Almacén", x: 28, y: 28, w: 168, h: 118, etiqueta: { x: 140, y: 128 } },
];

/* Mobiliario que no tapa la vista (solo se dibuja): refrigeradores contra el muro, mostrador y tarimas. */
const REFRIGERADORES = Array.from({ length: 6 }, (_, i) => ({ x: 246 + i * 58, y: 26, w: 52, h: 16 }));
const TARIMAS = [
  { x: 40, y: 40, w: 34, h: 28 },
  { x: 80, y: 40, w: 34, h: 28 },
  { x: 40, y: 74, w: 34, h: 28 },
  { x: 152, y: 40, w: 34, h: 50 },
];
const DIVISIONES = [116, 146, 176, 206];
/** Mesas de exhibición bajas: se ven por encima, así que no tapan. */
const EXHIBIDORES = [
  { x: 58, y: 206, w: 96, h: 40 },
  { x: 58, y: 284, w: 96, h: 40 },
];

const rect = (r: { x: number; y: number; w: number; h: number }): Seg[] => [
  [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }],
  [{ x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }],
  [{ x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }],
  [{ x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }],
];

/** Muros exteriores, el cuarto del almacén (con su puerta) y las góndolas. */
const OBSTACULOS: Seg[] = [
  ...rect({ x: 20, y: 20, w: 600, h: 360 }),
  [{ x: 200, y: 20 }, { x: 200, y: 150 }],
  [{ x: 20, y: 150 }, { x: 140, y: 150 }],
  ...GONDOLAS.flatMap(rect),
];

const dentroDe = (p: P, r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Puntos del piso donde se mide la cobertura (fuera de las góndolas). */
const MUESTRAS: P[] = (() => {
  const out: P[] = [];
  for (let y = 30; y <= 372; y += 14) for (let x = 30; x <= 612; x += 14) {
    const p = { x, y };
    if (!GONDOLAS.some((g) => dentroDe(p, g))) out.push(p);
  }
  return out;
})();

/** Distancia (0–1) a la que el segmento a→b cruza el obstáculo, o null si no lo cruza. */
function cruce(a: P, b: P, [p, q]: Seg): number | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s2 = { x: q.x - p.x, y: q.y - p.y };
  const den = r.x * s2.y - r.y * s2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p.x - a.x) * s2.y - (p.y - a.y) * s2.x) / den;
  const u = ((p.x - a.x) * r.y - (p.y - a.y) * r.x) / den;
  return t > 1e-6 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

const rad = (g: number) => (g * Math.PI) / 180;
const difAngulo = (a: number, b: number) => ((a - b + 540) % 360) - 180;

function ve(cam: Camara, p: P): boolean {
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  if (dx * dx + dy * dy > ALCANCE * ALCANCE) return false;
  if (Math.abs(difAngulo((Math.atan2(dy, dx) * 180) / Math.PI, cam.ang)) > FOV / 2) return false;
  return !OBSTACULOS.some((o) => cruce(cam, p, o) !== null);
}

/** Polígono de lo que ve la cámara: rayos dentro del ángulo, cortados en el primer obstáculo. */
function campoVisual(cam: Camara): string {
  const pasos = 48;
  const puntos: P[] = [{ x: cam.x, y: cam.y }];
  for (let i = 0; i <= pasos; i++) {
    const a = rad(cam.ang - FOV / 2 + (FOV * i) / pasos);
    const fin = { x: cam.x + Math.cos(a) * ALCANCE, y: cam.y + Math.sin(a) * ALCANCE };
    let t = 1;
    for (const o of OBSTACULOS) {
      const k = cruce(cam, fin, o);
      if (k !== null && k < t) t = k;
    }
    puntos.push({ x: cam.x + (fin.x - cam.x) * t, y: cam.y + (fin.y - cam.y) * t });
  }
  return `M${puntos.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")} Z`;
}

const INICIALES: Camara[] = [
  { id: 1, x: 600, y: 360, ang: -140 },
  { id: 2, x: 230, y: 360, ang: -60 },
];

const limitar = (p: P): P => ({ x: Math.min(608, Math.max(32, p.x)), y: Math.min(368, Math.max(32, p.y)) });

/**
 * Simulador de videovigilancia: el visitante mueve y gira cámaras sobre el plano de una tienda y ve qué porcentaje del
 * piso y qué zonas de riesgo quedan cubiertas. Arrastrar el cuerpo mueve; arrastrar la punta gira. Con teclado: Tab
 * para elegir cámara, flechas para mover, Q y E para girar.
 */
export default function SimuladorCobertura() {
  const [camaras, setCamaras] = useState<Camara[]>(INICIALES);
  const [elegida, setElegida] = useState<number>(1);
  const svg = useRef<SVGSVGElement>(null);
  const arrastre = useRef<{ id: number; modo: "mover" | "girar" } | null>(null);

  const { porcentaje, zonas, vistos } = useMemo(() => {
    const vistos = MUESTRAS.map((p) => camaras.some((cam) => ve(cam, p)));
    const total = vistos.filter(Boolean).length;
    const zonas = ZONAS.map((z) => {
      const dentro = MUESTRAS.map((p, i) => (dentroDe(p, z) ? vistos[i] : null)).filter((v) => v !== null);
      const cubierta = dentro.length ? dentro.filter(Boolean).length / dentro.length : 0;
      return { ...z, cubierta, ok: cubierta >= 0.7 };
    });
    return { porcentaje: Math.round((total / MUESTRAS.length) * 100), zonas, vistos };
  }, [camaras]);

  const conos = useMemo(() => camaras.map((cam) => ({ id: cam.id, d: campoVisual(cam) })), [camaras]);

  const aPlano = (ev: React.PointerEvent): P | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const pt = el.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };

  const actualizar = (id: number, cambio: (cam: Camara) => Partial<Camara>) =>
    setCamaras((cs) => cs.map((cam) => (cam.id === id ? { ...cam, ...cambio(cam) } : cam)));

  const empezar = (ev: React.PointerEvent, id: number, modo: "mover" | "girar") => {
    ev.preventDefault();
    ev.stopPropagation();
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    arrastre.current = { id, modo };
    setElegida(id);
  };

  const mover = (ev: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const p = aPlano(ev);
    if (!p) return;
    if (a.modo === "mover") actualizar(a.id, () => limitar(p));
    else actualizar(a.id, (cam) => ({ ang: (Math.atan2(p.y - cam.y, p.x - cam.x) * 180) / Math.PI }));
  };

  const teclado = (ev: React.KeyboardEvent, id: number) => {
    const paso = ev.shiftKey ? 30 : 10;
    const mapa: Record<string, (cam: Camara) => Partial<Camara>> = {
      ArrowLeft: (cam) => limitar({ x: cam.x - paso, y: cam.y }),
      ArrowRight: (cam) => limitar({ x: cam.x + paso, y: cam.y }),
      ArrowUp: (cam) => limitar({ x: cam.x, y: cam.y - paso }),
      ArrowDown: (cam) => limitar({ x: cam.x, y: cam.y + paso }),
      q: (cam) => ({ ang: cam.ang - 15 }),
      e: (cam) => ({ ang: cam.ang + 15 }),
    };
    const f = mapa[ev.key] ?? mapa[ev.key.toLowerCase()];
    if (!f) return;
    ev.preventDefault();
    actualizar(id, f);
  };

  const agregar = () => {
    if (camaras.length >= MAX_CAMARAS) return;
    const id = Math.max(0, ...camaras.map((cam) => cam.id)) + 1;
    setCamaras((cs) => [...cs, { id, x: 320, y: 270, ang: -90 }]);
    setElegida(id);
  };

  const quitar = () => {
    if (camaras.length <= 1) return;
    setCamaras((cs) => cs.filter((cam) => cam.id !== elegida));
    setElegida(camaras.find((cam) => cam.id !== elegida)?.id ?? 1);
  };

  const zonasOk = zonas.filter((z) => z.ok).length;

  return (
    <div className={c.simulador}>
      <div className={c.plano}>
        <svg
          ref={svg}
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          role="group"
          aria-label="Plano de una tienda con cámaras que se pueden mover y girar"
          onPointerMove={mover}
          onPointerUp={() => (arrastre.current = null)}
          onPointerCancel={() => (arrastre.current = null)}
        >
          <defs>
            <pattern id="sim-cuadricula" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0 H0 V20" className={c.cuadricula} />
            </pattern>
            <pattern id="sim-rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" className={c.rayado} />
            </pattern>
            <filter id="sim-sombra" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#0a2540" floodOpacity="0.28" />
            </filter>
            <clipPath id="sim-zonas">
              {ZONAS.map((z) => (
                <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} rx="6" />
              ))}
            </clipPath>
            {/* La luz de cada cámara se apaga con la distancia, como un cono real. */}
            {camaras.map((cam) => (
              <radialGradient key={cam.id} id={`sim-luz-${cam.id}`} gradientUnits="userSpaceOnUse" cx={cam.x} cy={cam.y} r={ALCANCE}>
                <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: cam.id === elegida ? 0.5 : 0.38 }} />
                <stop offset="0.6" style={{ stopColor: "var(--accent)", stopOpacity: cam.id === elegida ? 0.2 : 0.14 }} />
                <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0.03 }} />
              </radialGradient>
            ))}
          </defs>

          {/* Piso con retícula de plano arquitectónico */}
          <rect x="20" y="20" width="600" height="360" className={c.piso} />
          <rect x="20" y="20" width="600" height="360" fill="url(#sim-cuadricula)" />

          {/* Zonas de riesgo: verde cuando quedan cubiertas */}
          {zonas.map((z) => (
            <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} rx="6" className={z.ok ? c.zonaOk : c.zona} />
          ))}

          {/* Mobiliario */}
          {REFRIGERADORES.map((r, i) => (
            <g key={`r${i}`}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="2.5" className={c.mueble} />
              <line x1={r.x + r.w / 2} y1={r.y + 3} x2={r.x + r.w / 2} y2={r.y + r.h - 3} className={c.muebleLinea} />
            </g>
          ))}
          {TARIMAS.map((t, i) => (
            <g key={`t${i}`}>
              <rect x={t.x} y={t.y} width={t.w} height={t.h} rx="3" className={c.caja} />
              <path d={`M${t.x + 4} ${t.y + t.h / 2} H${t.x + t.w - 4}`} className={c.muebleLinea} />
            </g>
          ))}
          {EXHIBIDORES.map((e, i) => (
            <g key={`e${i}`}>
              <rect x={e.x} y={e.y} width={e.w} height={e.h} rx="20" className={c.mueble} />
              <rect x={e.x + 12} y={e.y + 12} width={e.w - 24} height={e.h - 24} rx="8" className={c.muebleLinea} />
            </g>
          ))}
          <rect x="486" y="270" width="96" height="20" rx="5" className={c.mueble} />
          <rect x="556" y="262" width="18" height="12" rx="2.5" className={c.registradora} />

          {/* Conos de visión, recortados por muros y góndolas */}
          {conos.map((k) => (
            <path key={k.id} d={k.d} fill={`url(#sim-luz-${k.id})`} className={k.id === elegida ? c.conoElegido : c.cono} />
          ))}

          {/* Punto ciego dentro de las zonas de riesgo: rayado, celda por celda de la rejilla de medición */}
          <g clipPath="url(#sim-zonas)">
            {MUESTRAS.map((p, i) =>
              !vistos[i] && ZONAS.some((z) => dentroDe(p, z)) ? (
                <rect key={i} x={p.x - 7} y={p.y - 7} width="14" height="14" fill="url(#sim-rayado)" />
              ) : null,
            )}
          </g>

          {/* Góndolas vistas desde arriba: estructura, entrepaños y lomo central */}
          {GONDOLAS.map((g, i) => (
            <g key={i}>
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" className={c.gondola} />
              <line x1={g.x + g.w / 2} y1={g.y + 4} x2={g.x + g.w / 2} y2={g.y + g.h - 4} className={c.muebleLinea} />
              {DIVISIONES.map((y) => (
                <line key={y} x1={g.x + 2} y1={y} x2={g.x + g.w - 2} y2={y} className={c.muebleLinea} />
              ))}
            </g>
          ))}

          {/* Muros con sus vanos y el abatimiento de cada puerta */}
          <path d="M268 380 H20 V20 H620 V380 H372 M200 20 V150 M20 150 H140" className={c.muro} />
          <path d="M268 380 V330 M372 380 V330 M200 150 V206" className={c.puerta} />
          <path d="M268 330 A50 50 0 0 1 318 380 M372 330 A50 50 0 0 0 322 380 M200 206 A56 56 0 0 1 144 150" className={c.abatimiento} />

          {/* Rótulos de las zonas */}
          {zonas.map((z) => {
            const ancho = z.nombre.length * 7.4 + 30;
            return (
              <g key={`e${z.id}`} className={c.rotulo} data-ok={z.ok ? "" : undefined}>
                <rect x={z.etiqueta.x - ancho / 2} y={z.etiqueta.y - 11} width={ancho} height="22" rx="11" />
                <circle cx={z.etiqueta.x - ancho / 2 + 12} cy={z.etiqueta.y} r="3.5" className={c.rotuloPunto} />
                <text x={z.etiqueta.x + 7} y={z.etiqueta.y + 4}>
                  {z.nombre}
                </text>
              </g>
            );
          })}

          {camaras.map((cam, n) => {
            const punta = { x: cam.x + Math.cos(rad(cam.ang)) * 50, y: cam.y + Math.sin(rad(cam.ang)) * 50 };
            return (
              <g
                key={cam.id}
                tabIndex={0}
                role="button"
                aria-label={`Cámara ${n + 1}. Flechas para mover, Q y E para girar.`}
                aria-pressed={cam.id === elegida}
                className={c.camara}
                data-elegida={cam.id === elegida ? "" : undefined}
                onFocus={() => setElegida(cam.id)}
                onKeyDown={(ev) => teclado(ev, cam.id)}
              >
                <line x1={cam.x} y1={cam.y} x2={punta.x} y2={punta.y} className={c.brazo} />
                {/* Áreas de agarre invisibles, más grandes que el dibujo, para que el dedo atine en el teléfono. */}
                <circle cx={punta.x} cy={punta.y} r="22" className={c.agarre} onPointerDown={(ev) => empezar(ev, cam.id, "girar")} />
                <circle cx={cam.x} cy={cam.y} r="26" className={c.agarre} onPointerDown={(ev) => empezar(ev, cam.id, "mover")} />
                <g transform={`translate(${punta.x} ${punta.y})`} className={c.giro}>
                  <circle r="8.5" />
                  <path d="M-3.4 -1.6 A3.8 3.8 0 1 1 -1.6 3.4 M-3.4 -1.6 V-4.6 M-3.4 -1.6 H-0.6" />
                </g>
                <g transform={`translate(${cam.x} ${cam.y})`} filter="url(#sim-sombra)" pointerEvents="none">
                  <circle r="20" className={c.halo} />
                  <circle r="13.5" className={c.cuerpo} />
                  {/* Cámara tipo bala vista desde arriba, apuntando a donde mira */}
                  <g transform={`rotate(${cam.ang})`}>
                    <rect x="-6" y="-4.6" width="15" height="9.2" rx="2.6" className={c.carcasa} />
                    <rect x="8" y="-3.4" width="3" height="6.8" rx="1" className={c.lente} />
                  </g>
                  <circle cx="10.5" cy="-10.5" r="7" className={c.insignia} />
                  <text x="10.5" y="-7.2" className={c.numero}>
                    {n + 1}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
        <ul className={c.leyenda} aria-hidden="true">
          <li>
            <i className={c.leyendaMuro} /> Muro
          </li>
          <li>
            <i className={c.leyendaGondola} /> Góndola, tapa la vista
          </li>
          <li>
            <i className={c.leyendaCiego} /> Punto ciego
          </li>
          <li>
            <i className={c.leyendaLuz} /> Campo de la cámara
          </li>
        </ul>
        <p className={c.ayuda}>Arrastra una cámara para moverla y su punta para girarla.</p>
      </div>

      <div className={c.tablero}>
        <p className={c.medida} aria-live="polite">
          <span className={c.cifra}>{porcentaje}%</span>
          <span>del piso a la vista</span>
        </p>
        <div className={c.barra} aria-hidden="true">
          <i style={{ width: `${porcentaje}%` }} />
        </div>
        <ul className={c.zonas} aria-label="Zonas de riesgo">
          {zonas.map((z) => (
            <li key={z.id} data-ok={z.ok ? "" : undefined}>
              <PublicIcon name={z.ok ? "check" : "alert"} size={18} />
              <span>{z.nombre}</span>
              <b>{Math.round(z.cubierta * 100)}%</b>
            </li>
          ))}
        </ul>
        <p className={c.veredicto}>
          {zonasOk === ZONAS.length
            ? `Las tres zonas de riesgo quedan cubiertas con ${camaras.length} ${camaras.length === 1 ? "cámara" : "cámaras"}.`
            : "Las góndolas y los muros tapan la vista: por eso diseñamos por zona de riesgo antes de contar cámaras."}
        </p>
        <div className={c.botones}>
          <button type="button" className={`${s.boton} ${s.botonSecundario}`} onClick={agregar} disabled={camaras.length >= MAX_CAMARAS}>
            <PublicIcon name="camera" size={16} /> Agregar cámara
          </button>
          <button type="button" className={c.textoBoton} onClick={quitar} disabled={camaras.length <= 1}>
            Quitar la elegida
          </button>
          <button type="button" className={c.textoBoton} onClick={() => { setCamaras(INICIALES); setElegida(1); }}>
            Reiniciar
          </button>
        </div>
        <p className={c.cta}>
          <Link href="/contacto?servicio=cctv" className={s.enlace} data-track-conversion="simulador_cctv_cta">
            Diseñamos la cobertura de tu sitio
            <Flecha />
          </Link>
        </p>
      </div>
    </div>
  );
}
