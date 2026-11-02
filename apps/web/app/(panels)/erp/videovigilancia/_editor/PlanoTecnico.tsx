"use client";

/**
 * Plano técnico (mockup aprobado 01-11-2026): hoja doble carta con ejes y cotas, muros con su
 * relleno, puertas y ventanas, cobertura recortada por muros, símbolos con clave, cédula de equipos,
 * simbología, cobertura calculada, revisión del sistema y carátula. Sale del diseño real.
 *
 * La hoja mide 17 × 11 pulgadas a 96 px por pulgada; quien la muestra la ajusta en pantalla y al
 * imprimirse sale a su tamaño, así la escala del plano es cierta en el papel.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { modeloPorId } from "@/lib/cctv/catalogo";
import type { ResumenDiseno } from "@/lib/cctv/editor";
import type { Grabacion } from "@/lib/cctv/infraestructura";
import { claveCamara, limitesSitio } from "@/lib/cctv/medidas";
import { aMetros, dirRumbo, hojasPuerta, type Abertura, type CamaraPlano, type Muro, type Nivel, type Plano, type Punto, type TipoMueble } from "@/lib/cctv/plano";
import { cedulaDeEquipos, ejesDelPlano, escalaNormalizada, pasoBarraEscala, revisionDelSistema } from "@/lib/cctv/planoTecnico";
import { areaPoligono, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { COLOR_NIVEL, LEYENDA_NIVELES } from "./colores";
import styles from "./planoTecnico.module.css";

export const HOJA_ANCHO_PX = 1632;
export const HOJA_ALTO_PX = 1056;
const DIBUJO_ANCHO = 1196;
const PX_POR_MM = 96 / 25.4;

const OPACIDAD: Readonly<Record<string, number>> = { identificacion: 0.42, reconocimiento: 0.32, observacion: 0.24, deteccion: 0.14, general: 0.08 };
const COLOR_CAM = "#0a7f6d";

type TipoSimbolo = "domo" | "turret" | "bala" | "ptz";

function tipoSimbolo(c: CamaraPlano): TipoSimbolo {
  const t = modeloPorId(c.productoId)?.tipo;
  if (c.esPtz || t === "ptz") return "ptz";
  return t === "bala" || t === "turret" ? t : "domo";
}

/** Símbolo de cada tipo de cámara: se leen en la simbología y al pie de cada clave. */
export function SimboloCamara({ tipo, color = COLOR_CAM, escala = 1 }: { tipo: TipoSimbolo; color?: string; escala?: number }) {
  const comun = { fill: "none", stroke: color, strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <g transform={`scale(${escala})`} {...comun}>
      {tipo === "domo" ? (
        <>
          <circle r={9} fill="#fff" />
          <circle r={4.6} />
          <circle r={1.6} fill={color} stroke="none" />
          <line x1={0} y1={-9} x2={0} y2={-12.5} />
        </>
      ) : tipo === "turret" ? (
        <>
          <circle r={9} fill="#fff" />
          <path d="M-6.2,3 A6.6,6.6 0 1 1 6.2,3 Z" fill={color} stroke="none" />
          <circle cy={-1.8} r={1.8} fill="#fff" stroke="none" />
        </>
      ) : tipo === "bala" ? (
        <>
          <rect x={-5.8} y={-4} width={11.6} height={13} rx={1.6} fill="#fff" />
          <path d="M-4,-4 L-7.4,-10.6 L7.4,-10.6 L4,-4" fill="#fff" />
          <line x1={-5} y1={-7.4} x2={5} y2={-7.4} />
        </>
      ) : (
        <>
          <circle r={10} fill="#fff" />
          <circle r={3.8} fill={color} stroke="none" />
          {[0, 90, 180, 270].map((r) => (
            <path key={r} d="M-2.5,-7 L0,-9.2 L2.5,-7" transform={`rotate(${r})`} />
          ))}
        </>
      )}
    </g>
  );
}

/** Huella en planta de la ambientación, en metros. */
const PLANTA_MUEBLE: Readonly<Record<TipoMueble, { ancho: number; fondo: number; redondo?: boolean }>> = {
  escritorio: { ancho: 1.5, fondo: 0.72 },
  "mesa-juntas": { ancho: 3.2, fondo: 1.25 },
  mostrador: { ancho: 3.2, fondo: 0.7 },
  sofa: { ancho: 2.5, fondo: 0.85 },
  planta: { ancho: 0.5, fondo: 0.5, redondo: true },
  arbol: { ancho: 2.1, fondo: 2.1, redondo: true },
  camion: { ancho: 2.5, fondo: 7 },
  auto: { ancho: 1.8, fondo: 4.5 },
};

const NOMBRE_SIMBOLO: ReadonlyArray<[TipoSimbolo, string]> = [
  ["domo", "Cámara domo"],
  ["turret", "Cámara turret"],
  ["bala", "Cámara bala"],
  ["ptz", "Cámara PTZ"],
];

/** Para imprimir solo la hoja desde el editor, en doble carta y a su tamaño. */
export const IMPRIMIR_HOJA = `
@media print {
  @page { size: 17in 11in; margin: 0; }
  html, body { height: 11in !important; overflow: hidden !important; }
  body * { visibility: hidden !important; }
  .cctv-hoja-plano, .cctv-hoja-plano * { visibility: visible !important; }
  .cctv-plano-escala { transform: none !important; }
  .cctv-plano-marco { position: static !important; overflow: visible !important; }
  .cctv-hoja-plano { position: fixed; left: 0; top: 0; box-shadow: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

/** Ajusta la hoja al ancho disponible en pantalla; la hoja conserva su tamaño de papel. */
export function HojaAjustada({ children }: { children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setEscala(Math.min(w / HOJA_ANCHO_PX, 1));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={caja} className={`${styles.marcoHoja} cctv-plano-marco`} style={{ height: HOJA_ALTO_PX * escala }}>
      <div className={`${styles.escalaHoja} cctv-plano-escala`} style={{ transform: `scale(${escala})` }}>
        {children}
      </div>
    </div>
  );
}

const fechaCorta = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function PlanoTecnico({
  raiz,
  plano,
  nivel,
  numeroHoja,
  coberturas,
  resumen,
  grabacion,
  datos,
}: {
  raiz: Plano;
  plano: Plano;
  nivel: Nivel;
  /** Hoja 1, 2… del juego: una por nivel. */
  numeroHoja: number;
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  resumen: ResumenDiseno | null;
  grabacion: Grabacion;
  datos: { proyecto: string; cliente: string | null; elaboro: string | null; fecha: string; version: number };
}) {
  const dibujo = useMemo(() => construirDibujo(plano, coberturas), [plano, coberturas]);
  const cedula = useMemo(() => cedulaDeEquipos(raiz), [raiz]);
  const revision = useMemo(() => revisionDelSistema(raiz, resumen, grabacion), [raiz, resumen, grabacion]);
  const cob = resumen?.cobertura;
  const tipos = useMemo(() => new Set(plano.camaras.map(tipoSimbolo)), [plano.camaras]);
  const { X, Y, S, den } = dibujo;
  const k = plano.escala.metrosPorPx;
  const paso = pasoBarraEscala(den);
  const barraX = 520;
  const barraY = HOJA_ALTO_PX - 58;
  const muros = new Map(plano.muros.map((m) => [m.id, m]));

  return (
    <article className={`${styles.hoja} cctv-hoja-plano`} aria-label={`Plano técnico: ${nivel.nombre}`}>
      <svg className={styles.dibujo} width={DIBUJO_ANCHO} height={HOJA_ALTO_PX} viewBox={`0 0 ${DIBUJO_ANCHO} ${HOJA_ALTO_PX}`} role="img" aria-label={`Planta de ${nivel.nombre} con ejes, cotas, muros, cobertura y cámaras`}>
        <defs>
          <pattern id="pt-poche" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill="#2a2f37" />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#59606b" strokeWidth={1} />
          </pattern>
          <pattern id="pt-anaquel" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width={8} height={8} fill="#eef0f3" />
            <line x1={0} y1={0} x2={0} y2={8} stroke="#aab1bb" strokeWidth={0.9} />
          </pattern>
        </defs>
        <rect x={18} y={18} width={DIBUJO_ANCHO - 36} height={HOJA_ALTO_PX - 36} fill="none" stroke="#14181f" strokeWidth={1.3} />

        {/* Ejes y cotas entre ejes */}
        {dibujo.ejes.x.map((e) => (
          <g key={`x-${e.nombre}`}>
            <line x1={X(e.m)} y1={dibujo.topeEjes} x2={X(e.m)} y2={dibujo.pieEjes} stroke="#c34b4b" strokeWidth={0.7} strokeDasharray="18 4 3 4" />
            <circle cx={X(e.m)} cy={dibujo.topeEjes - 13} r={12} fill="#fff" stroke="#14181f" strokeWidth={1.1} />
            <text x={X(e.m)} y={dibujo.topeEjes - 9} fontSize={12} fontWeight={700} textAnchor="middle" fill="#14181f">
              {e.nombre}
            </text>
          </g>
        ))}
        {dibujo.ejes.y.map((e) => (
          <g key={`y-${e.nombre}`}>
            <line x1={dibujo.izqEjes} y1={Y(e.m)} x2={dibujo.derEjes} y2={Y(e.m)} stroke="#c34b4b" strokeWidth={0.7} strokeDasharray="18 4 3 4" />
            <circle cx={dibujo.izqEjes - 13} cy={Y(e.m)} r={12} fill="#fff" stroke="#14181f" strokeWidth={1.1} />
            <text x={dibujo.izqEjes - 13} y={Y(e.m) + 4} fontSize={12} fontWeight={700} textAnchor="middle" fill="#14181f">
              {e.nombre}
            </text>
          </g>
        ))}
        {dibujo.ejes.x.slice(0, -1).map((e, i) => {
          const f = dibujo.ejes.x[i + 1];
          return <Cota key={`cx-${i}`} x1={X(e.m)} y1={dibujo.topeEjes + 14} x2={X(f.m)} y2={dibujo.topeEjes + 14} texto={(f.m - e.m).toFixed(2)} />;
        })}
        {dibujo.ejes.y.slice(0, -1).map((e, i) => {
          const f = dibujo.ejes.y[i + 1];
          return <Cota key={`cy-${i}`} x1={dibujo.izqEjes + 14} y1={Y(e.m)} x2={dibujo.izqEjes + 14} y2={Y(f.m)} texto={(f.m - e.m).toFixed(2)} />;
        })}

        {/* Áreas */}
        {(plano.areas ?? []).map((a) => (
          <polygon key={a.id} points={a.puntos.map((p) => `${X(p.x * k)},${Y(p.y * k)}`).join(" ")} fill={a.piso === "asfalto" ? "#eceef1" : a.piso === "pasto" ? "#f1f4ec" : "#fbfbfc"} />
        ))}

        {/* Cobertura */}
        <g>
          {[...coberturas.values()].flat().map((pol, i) => (
            <polygon key={i} points={pol.puntos.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} fill={COLOR_NIVEL[pol.nivel]} fillOpacity={OPACIDAD[pol.nivel]} stroke={COLOR_NIVEL[pol.nivel]} strokeOpacity={0.35} strokeWidth={0.5} />
          ))}
        </g>

        {/* Ambientación, tenue y a su tamaño real */}
        {(plano.muebles ?? []).map((m) => {
          const t = PLANTA_MUEBLE[m.tipo];
          return (
            <g key={m.id} transform={`translate(${X(m.pos.x * k)} ${Y(m.pos.y * k)}) rotate(${m.rumboDeg})`} fill="#fff" fillOpacity={0.6} stroke="#aab1bb" strokeWidth={0.8}>
              {t.redondo ? <circle r={(t.ancho * S) / 2} /> : <rect x={(-t.ancho * S) / 2} y={(-t.fondo * S) / 2} width={t.ancho * S} height={t.fondo * S} rx={1.5} />}
            </g>
          );
        })}

        {/* Obstáculos */}
        {plano.obstaculos.map((o) => {
          const pts = o.puntos.map((p) => aMetros(p, plano.escala));
          const poligono = pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ");
          return (
            <g key={o.id}>
              <polygon points={poligono} fill="url(#pt-anaquel)" stroke="#5a6370" strokeWidth={0.9} />
              {pts.length === 4 ? (
                <>
                  <line x1={X(pts[0].x)} y1={Y(pts[0].y)} x2={X(pts[2].x)} y2={Y(pts[2].y)} stroke="#8b93a0" strokeWidth={0.6} />
                  <line x1={X(pts[1].x)} y1={Y(pts[1].y)} x2={X(pts[3].x)} y2={Y(pts[3].y)} stroke="#8b93a0" strokeWidth={0.6} />
                </>
              ) : null}
            </g>
          );
        })}

        {/* Muros con relleno y huecos */}
        {plano.muros.map((m) => (
          <MuroPlano key={m.id} muro={m} plano={plano} X={X} Y={Y} S={S} />
        ))}
        {plano.aberturas.map((h) => {
          const m = muros.get(h.muroId);
          return m ? <HuecoPlano key={h.id} hueco={h} muro={m} plano={plano} X={X} Y={Y} S={S} /> : null;
        })}

        {/* Nombres */}
        {(plano.areas ?? []).map((a) => {
          if (!a.nombre || a.puntos.length < 3) return null;
          const pts = a.puntos.map((p) => aMetros(p, plano.escala));
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          return <NombreArea key={a.id} x={X(cx)} y={Y(cy)} nombre={a.nombre} m2={areaPoligono(pts)} />;
        })}
        {plano.etiquetas.map((e) => (
          <NombreArea key={e.id} x={X(e.pos.x * k)} y={Y(e.pos.y * k)} nombre={e.texto} />
        ))}

        {/* Cámaras: símbolo girado a su rumbo y clave del lado contrario */}
        {plano.camaras.map((c) => {
          const p = aMetros(c.pos, plano.escala);
          const d = dirRumbo(c.rumboDeg);
          const dx = -d.x * 26;
          const dy = -d.y * 26;
          const clave = claveCamara(c.numero);
          const w = clave.length * 6 + 12;
          return (
            <g key={c.id} transform={`translate(${X(p.x)} ${Y(p.y)})`}>
              <g transform={`rotate(${c.rumboDeg})`}>
                <SimboloCamara tipo={tipoSimbolo(c)} />
              </g>
              <line x1={0} y1={0} x2={dx} y2={dy} stroke={COLOR_CAM} strokeWidth={0.8} />
              <rect x={dx - w / 2} y={dy - 8} width={w} height={16} rx={8} fill={COLOR_CAM} />
              <text x={dx} y={dy + 3.6} fontSize={9.6} fontWeight={700} textAnchor="middle" fill="#fff">
                {clave}
              </text>
            </g>
          );
        })}

        {/* Título, escala y norte */}
        <text x={40} y={HOJA_ALTO_PX - 62} fontSize={18} fontWeight={700} letterSpacing=".05em" fill="#14181f">
          {nivel.nombre.toUpperCase()}
        </text>
        <text x={40} y={HOJA_ALTO_PX - 42} fontSize={11.5} fill="#5a6370">
          Cámaras y cobertura · nivel {nivel.elevacionM >= 0 ? "+" : ""}
          {nivel.elevacionM.toFixed(2)} m
        </text>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={barraX + i * paso * S} y={barraY} width={paso * S} height={6} fill={i % 2 ? "#fff" : "#14181f"} stroke="#14181f" strokeWidth={0.8} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <text key={i} x={barraX + i * paso * S} y={barraY - 4} fontSize={9.5} textAnchor="middle" fill="#14181f">
            {i * paso}
          </text>
        ))}
        <text x={barraX + 5 * paso * S + 16} y={barraY + 7} fontSize={10} fill="#3a4450">
          metros · ESC. 1:{den}
        </text>
        <g transform={`translate(${DIBUJO_ANCHO - 72} ${HOJA_ALTO_PX - 70}) rotate(${plano.norteDeg})`}>
          <circle r={28} fill="none" stroke="#14181f" strokeWidth={1} />
          <path d="M0,-26 L8.5,12 L0,6 Z" fill="#14181f" />
          <path d="M0,-26 L-8.5,12 L0,6 Z" fill="#fff" stroke="#14181f" strokeWidth={0.8} />
          <text y={-33} fontSize={12} fontWeight={700} textAnchor="middle" fill="#14181f">
            N
          </text>
        </g>
      </svg>

      <div className={styles.lado}>
        <div className={styles.marca}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-nexara.png" alt="NEXARA" />
          <div>
            <b>Sistema de videovigilancia</b>
            <span>Plano de distribución de equipos</span>
          </div>
        </div>
        <section className={styles.bloque}>
          <h3>Cédula de equipos</h3>
          <table>
            <thead>
              <tr>
                <th>Clave</th>
                <th>Equipo</th>
                <th className={styles.n}>Cant.</th>
                <th className={styles.n}>PoE (W)</th>
              </tr>
            </thead>
            <tbody>
              {cedula.filas.map((f) => (
                <tr key={f.modelo}>
                  <td>
                    <b>{f.clave}</b>
                  </td>
                  <td>
                    {f.tipo} <span className={styles.tenue}>· {f.modelo}</span>
                  </td>
                  <td className={styles.n}>{f.cantidad}</td>
                  <td className={styles.n}>{f.watts.toFixed(1)}</td>
                </tr>
              ))}
              {!cedula.filas.length ? (
                <tr>
                  <td colSpan={4} className={styles.tenue}>
                    Aún no hay equipos colocados.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Totales</td>
                <td className={styles.n}>{cedula.total}</td>
                <td className={styles.n}>{cedula.watts.toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
        <section className={styles.bloque}>
          <h3>Simbología</h3>
          <div className={styles.simbolos}>
            {NOMBRE_SIMBOLO.filter(([t]) => tipos.has(t)).map(([t, n]) => (
              <span key={t}>
                <svg width={30} height={30} viewBox="-15 -15 30 30" aria-hidden="true">
                  <SimboloCamara tipo={t} escala={0.92} />
                </svg>
                {n}
              </span>
            ))}
            <span>
              <svg width={30} height={14} viewBox="0 0 30 14" aria-hidden="true">
                <rect width={30} height={14} fill="url(#pt-poche)" stroke="#14181f" />
              </svg>
              Muro
            </span>
            <span>
              <svg width={30} height={14} viewBox="0 0 30 14" aria-hidden="true">
                <line x1={0} y1={2} x2={30} y2={2} stroke="#14181f" />
                <line x1={0} y1={7} x2={30} y2={7} stroke="#2a7fbf" strokeWidth={2} />
                <line x1={0} y1={12} x2={30} y2={12} stroke="#14181f" />
              </svg>
              Ventana
            </span>
            <span>
              <svg width={30} height={14} viewBox="0 0 30 14" aria-hidden="true">
                <rect width={30} height={14} fill="url(#pt-anaquel)" stroke="#5a6370" />
              </svg>
              Obstáculo
            </span>
            <span>
              <svg width={30} height={14} viewBox="0 0 30 14" aria-hidden="true">
                <line x1={0} y1={7} x2={30} y2={7} stroke="#c34b4b" strokeDasharray="10 3 2 3" />
              </svg>
              Eje
            </span>
          </div>
        </section>
        <section className={styles.bloque}>
          <h3>Cobertura calculada</h3>
          {cob ? (
            <>
              <p className={styles.grande}>
                <b>{cob.cubierto.toFixed(1)} %</b> <span>del interior · IEC 62676-4</span>
              </p>
              <div className={styles.barra}>
                <i style={{ width: `${cob.identificacion}%`, background: COLOR_NIVEL.identificacion }} />
                <i style={{ width: `${cob.reconocimiento}%`, background: COLOR_NIVEL.reconocimiento }} />
                <i style={{ width: `${cob.observacion}%`, background: COLOR_NIVEL.observacion }} />
                <i style={{ width: `${cob.deteccion}%`, background: COLOR_NIVEL.deteccion }} />
              </div>
              <div className={styles.niveles}>
                {LEYENDA_NIVELES.map((n) => (
                  <span key={n.nivel}>
                    <i style={{ background: COLOR_NIVEL[n.nivel] }} />
                    {n.etiqueta} ({n.ppm})
                    <b>{(cob[n.nivel as keyof typeof cob] as number).toFixed(1)} %</b>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.tenue}>Se calcula al guardar, con muros y cámaras en el plano.</p>
          )}
        </section>
        <section className={styles.bloque}>
          <h3>Revisión del sistema</h3>
          {revision.map((r) => (
            <div key={r.titulo} className={styles.revision}>
              <span className={r.ok ? styles.bien : styles.alerta} aria-label={r.ok ? "Bien" : "Por revisar"}>
                {r.ok ? "✓" : "!"}
              </span>
              <span>
                <b>{r.titulo}</b>
                <br />
                <span className={styles.tenue}>{r.detalle}</span>
              </span>
            </div>
          ))}
        </section>
        <div className={styles.caratula}>
          <div className={styles.ancho}>
            <small>Proyecto</small>
            {datos.proyecto}
          </div>
          <div className={styles.ancho}>
            <small>Cliente</small>
            {datos.cliente ?? "—"}
          </div>
          <div>
            <small>Plano</small>
            CCTV-{String(numeroHoja).padStart(2, "0")} · {nivel.nombre}
          </div>
          <div>
            <small>Escala</small>
            1:{den} en doble carta
          </div>
          <div>
            <small>Fecha</small>
            {fechaCorta.format(new Date(datos.fecha))}
          </div>
          <div>
            <small>Revisión</small>R{datos.version}
          </div>
          <div>
            <small>Elaboró</small>
            {datos.elaboro ?? "—"}
          </div>
          <div>
            <small>Revisó</small>
            &nbsp;
          </div>
        </div>
      </div>
    </article>
  );
}

function construirDibujo(plano: Plano, coberturas: ReadonlyMap<string, PoligonoCobertura[]>) {
  const lim = limitesSitio(plano, coberturas);
  const ejes = ejesDelPlano(plano);
  const anchoM = Math.max(lim.max.x - lim.min.x, 1);
  const altoM = Math.max(lim.max.y - lim.min.y, 1);
  // Lo que queda libre dentro del marco, descontando ejes, título y márgenes.
  const libreW = DIBUJO_ANCHO - 36 - 96 - 40;
  const libreH = HOJA_ALTO_PX - 36 - 90 - 110;
  const den = escalaNormalizada(anchoM, altoM, libreW / PX_POR_MM, libreH / PX_POR_MM);
  const S = (1000 / den) * PX_POR_MM;
  const ox = 18 + 96 + (libreW - anchoM * S) / 2;
  const oy = 18 + 90 + (libreH - altoM * S) / 2;
  const X = (x: number) => ox + (x - lim.min.x) * S;
  const Y = (y: number) => oy + (y - lim.min.y) * S;
  return { X, Y, S, den, ejes, topeEjes: 18 + 42, pieEjes: oy + altoM * S + 14, izqEjes: 18 + 42, derEjes: ox + anchoM * S + 14 };
}

function Cota({ x1, y1, x2, y2, texto }: { x1: number; y1: number; x2: number; y2: number; texto: string }) {
  const h = y1 === y2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  if (Math.hypot(x2 - x1, y2 - y1) < 26) return null;
  return (
    <g stroke="#14181f">
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={0.7} />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([a, b], i) => (
        <line key={i} x1={a - 3} y1={b + 3} x2={a + 3} y2={b - 3} strokeWidth={1.2} />
      ))}
      <text x={h ? mx : mx - 4} y={h ? my - 4 : my} fontSize={9.5} textAnchor="middle" stroke="none" fill="#14181f" transform={h ? undefined : `rotate(-90 ${mx - 4} ${my})`}>
        {texto}
      </text>
    </g>
  );
}

function NombreArea({ x, y, nombre, m2 }: { x: number; y: number; nombre: string; m2?: number }) {
  const t = nombre.toUpperCase();
  const w = t.length * 6.6 + 16;
  const alto = m2 != null ? 28 : 18;
  return (
    <g>
      <rect x={x - w / 2} y={y - 12} width={w} height={alto} rx={2.5} fill="#fff" fillOpacity={0.88} />
      <text x={x} y={y + 1} fontSize={9.6} fontWeight={700} letterSpacing=".08em" textAnchor="middle" fill="#14181f">
        {t}
      </text>
      {m2 != null ? (
        <text x={x} y={y + 12} fontSize={9} textAnchor="middle" fill="#5a6370">
          {m2.toFixed(0)} m²
        </text>
      ) : null}
    </g>
  );
}

function MuroPlano({ muro, plano, X, Y, S }: { muro: Muro; plano: Plano; X: (x: number) => number; Y: (y: number) => number; S: number }) {
  const a = aMetros(muro.a, plano.escala);
  const b = aMetros(muro.b, plano.escala);
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-3) return null;
  if (muro.tipo !== "muro") {
    return <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={muro.tipo === "vidrio" ? "#2a7fbf" : "#14181f"} strokeWidth={1.4} strokeDasharray={muro.tipo === "reja" ? "14 4 3 4" : undefined} />;
  }
  const huecos = plano.aberturas
    .filter((h) => h.muroId === muro.id)
    .map((h) => [Math.max(0, Math.min(h.desde, h.hasta)) * L, Math.min(1, Math.max(h.desde, h.hasta)) * L] as const)
    .sort((p, q) => p[0] - q[0]);
  const tramos: Array<readonly [number, number]> = [];
  let d = 0;
  for (const [d0, d1] of huecos) {
    if (d0 > d) tramos.push([d, d0]);
    d = Math.max(d, d1);
  }
  if (d < L) tramos.push([d, L]);
  const n = { x: (-(b.y - a.y) / L) * (muro.grosorM / 2), y: ((b.x - a.x) / L) * (muro.grosorM / 2) };
  const en = (t: number): Punto => ({ x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L });
  // En papel, un muro nunca se dibuja más delgado que 1.6 px.
  const f = Math.max(1, 1.6 / (muro.grosorM * S));
  return (
    <>
      {tramos.map(([d0, d1], i) => {
        const p = en(d0);
        const q = en(d1);
        const pts = [
          { x: p.x + n.x * f, y: p.y + n.y * f },
          { x: q.x + n.x * f, y: q.y + n.y * f },
          { x: q.x - n.x * f, y: q.y - n.y * f },
          { x: p.x - n.x * f, y: p.y - n.y * f },
        ];
        return <polygon key={i} points={pts.map((c) => `${X(c.x)},${Y(c.y)}`).join(" ")} fill="url(#pt-poche)" stroke="#14181f" strokeWidth={1} />;
      })}
    </>
  );
}

function HuecoPlano({ hueco: h, muro, plano, X, Y, S }: { hueco: Abertura; muro: Muro; plano: Plano; X: (x: number) => number; Y: (y: number) => number; S: number }) {
  const a0 = aMetros(muro.a, plano.escala);
  const b0 = aMetros(muro.b, plano.escala);
  const en = (t: number): Punto => ({ x: a0.x + (b0.x - a0.x) * t, y: a0.y + (b0.y - a0.y) * t });
  const a = en(h.desde);
  const b = en(h.hasta);
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-3) return null;
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  const off = muro.grosorM / 2;
  if (h.tipo === "ventana") {
    return (
      <g>
        {[-off, 0, off].map((o) => (
          <line key={o} x1={X(a.x + n.x * o)} y1={Y(a.y + n.y * o)} x2={X(b.x + n.x * o)} y2={Y(b.y + n.y * o)} stroke={o ? "#14181f" : "#2a7fbf"} strokeWidth={o ? 0.9 : 1.7} />
        ))}
        {[a, b].map((p, i) => (
          <line key={i} x1={X(p.x + n.x * off)} y1={Y(p.y + n.y * off)} x2={X(p.x - n.x * off)} y2={Y(p.y - n.y * off)} stroke="#14181f" strokeWidth={1} />
        ))}
      </g>
    );
  }
  if (h.tipo === "acceso") {
    return <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke="#14181f" strokeWidth={1} strokeDasharray="8 4" />;
  }
  const cerradas = hojasPuerta({ ...h, abierta: false }, a, b);
  return (
    <g>
      {hojasPuerta(h, a, b).map((hoja, i) => {
        const r = Math.hypot(hoja.b.x - hoja.a.x, hoja.b.y - hoja.a.y) * S;
        const c = cerradas[i].b;
        const giro = (c.x - hoja.a.x) * (hoja.b.y - hoja.a.y) - (c.y - hoja.a.y) * (hoja.b.x - hoja.a.x) > 0 ? 1 : 0;
        return (
          <g key={i}>
            <line x1={X(hoja.a.x)} y1={Y(hoja.a.y)} x2={X(hoja.b.x)} y2={Y(hoja.b.y)} stroke="#14181f" strokeWidth={1.3} />
            {h.abierta ? <path d={`M${X(c.x)},${Y(c.y)} A${r},${r} 0 0 ${giro} ${X(hoja.b.x)},${Y(hoja.b.y)}`} fill="none" stroke="#14181f" strokeWidth={0.7} strokeDasharray="4 3" /> : null}
          </g>
        );
      })}
    </g>
  );
}
