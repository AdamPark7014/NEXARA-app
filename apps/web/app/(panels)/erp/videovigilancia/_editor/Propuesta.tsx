"use client";

/**
 * Propuesta de videovigilancia en hojas carta (artboard 4 del mockup aprobado), lista para
 * «Descargar PDF» con la impresión del navegador:
 * 1. portada y distribución de cámaras, cobertura del interior y leyenda DORI;
 * 2. vista 3D del sitio y vistas desde las cámaras;
 * 3. una ficha por cámara;
 * 4. infraestructura de grabación y lista de equipo.
 * Marca NEXARA (CCTV es de NEXARA; ver `.claude/rules/marcas-mailing.md`).
 */
import Link from "next/link";
import { useMemo } from "react";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import { Button } from "@/components/base";
import { etiquetaModelo, modeloPorId, type TipoCamara } from "@/lib/cctv/catalogo";
import { VISTA_ISOMETRICA, encuadrar, escena3D, proyector } from "@/lib/cctv/escena3d";
import { limitesEnMetros, type ResumenDiseno } from "@/lib/cctv/editor";
import {
  GRABACION_POR_OMISION,
  WATTS_POR_TIPO,
  almacenamientoTB,
  anchoBandaMbps,
  canalesNvr,
  discosNecesarios,
  presupuestoPoe,
  type Grabacion,
} from "@/lib/cctv/infraestructura";
import { DESCRIPCION_NIVEL, ETIQUETA_NIVEL, NIVELES_DORI, RESOLUCIONES, UMBRAL_DORI, metros, resumenOptico } from "@/lib/cctv/optica";
import type { CamaraPlano, Plano, Tapa } from "@/lib/cctv/plano";
import type { PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { COLOR_NIVEL } from "./colores";
import Figuras3D from "./Figuras3D";
import LaminaDetalle from "./LaminaDetalle";
import PlanoEstatico from "./PlanoEstatico";
import VistaCamara from "./VistaCamara";
import { cardinal } from "./FichaCamara";
import styles from "./propuesta.module.css";

const IMPRESION = `
@media print {
  @page { size: letter; margin: 0; }
  body * { visibility: hidden !important; }
  .cctv-propuesta, .cctv-propuesta * { visibility: visible !important; }
  .cctv-propuesta { position: absolute; left: 0; top: 0; width: 8.5in; background: #fff; }
  .cctv-no-imprimir { display: none !important; }
  .cctv-hoja { box-shadow: none !important; margin: 0 !important; border: 0 !important; break-after: page; page-break-after: always; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

const fechaLarga = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" });

function mpDe(c: CamaraPlano): number {
  const o = c.lentes[0]?.optica;
  if (!o) return 2;
  return RESOLUCIONES.find((r) => r.pxHoriz === o.pxHoriz && r.pxVert === o.pxVert)?.mp ?? (o.pxHoriz * o.pxVert) / 1_000_000;
}

/** Consumo típico por forma de cámara cuando la ficha no trae los watts. */
function tipoPoe(tipo: TipoCamara | undefined): keyof typeof WATTS_POR_TIPO {
  if (tipo === "ptz" || tipo === "bala") return tipo;
  if (tipo === "panoramica" || tipo === "ojo-de-pez") return "panoramica";
  return tipo ? "domo" : "otra";
}

function Pie({ hoja, total }: { hoja: number; total: number }) {
  return (
    <footer className={styles.pie}>
      <span>Preparado por NEXARA · gerencia@nexara.com.mx</span>
      <span>
        Hoja {hoja} de {total}
      </span>
    </footer>
  );
}

export default function Propuesta({
  disenoId,
  nombre,
  cliente,
  plano,
  tapas,
  coberturas,
  esHoja,
  resumen,
  grabacion,
}: {
  disenoId: number;
  nombre: string;
  cliente: string | null;
  plano: Plano;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  esHoja: (t: Tapa) => boolean;
  resumen: ResumenDiseno;
  grabacion: Grabacion | null;
}) {
  const camaras = useMemo(() => [...plano.camaras].sort((a, b) => a.numero - b.numero), [plano.camaras]);
  const g = grabacion ?? GRABACION_POR_OMISION;
  const totalHojas = 2 + camaras.length + 1;
  const cal = plano.escala.calibracion;

  const iso = useMemo(() => {
    const lim = limitesEnMetros(plano);
    if (!lim) return null;
    const vistaBase = { ...VISTA_ISOMETRICA, ancho: 720, alto: 380 };
    const vista = { ...vistaBase, ...encuadrar(lim, vistaBase) };
    return {
      figuras: escena3D({ plano, tapas, coberturas, vista, limites: lim }),
      matriz: proyector(vista).matrizPiso(plano.escala.metrosPorPx),
    };
  }, [plano, tapas, coberturas]);

  const infra = useMemo(() => {
    const mp = camaras.map(mpDe);
    const tb = almacenamientoTB(mp, g);
    const watts = camaras.map((c) => WATTS_POR_TIPO[tipoPoe(modeloPorId(c.productoId)?.tipo)]);
    const equipos = new Map<string, { modelo: string; descripcion: string; cantidad: number }>();
    for (const c of camaras) {
      const m = modeloPorId(c.productoId);
      const clave = c.modelo || "Cámara";
      const fila = equipos.get(clave) ?? { modelo: m ? etiquetaModelo(m) : c.modelo, descripcion: m?.descripcion ?? "Cámara", cantidad: 0 };
      fila.cantidad++;
      equipos.set(clave, fila);
    }
    return {
      canales: canalesNvr(camaras.length),
      tb,
      discos8: discosNecesarios(tb, 8),
      mbps: anchoBandaMbps(mp, g),
      poeW: presupuestoPoe(watts),
      puertosSwitch: [8, 16, 24, 48].find((p) => p >= camaras.length) ?? 48,
      equipos: [...equipos.values()],
    };
  }, [camaras, g]);

  const cob = resumen.cobertura;

  return (
    <div className={styles.fondo}>
      <style>{IMPRESION}</style>
      <div className={`${styles.barra} cctv-no-imprimir`}>
        <Link href={`/erp/videovigilancia/${disenoId}`} className={styles.volver}>
          <ChevronLeftRoundedIcon fontSize="small" /> Volver al plano
        </Link>
        <span className={styles.tenue}>
          {totalHojas} hojas carta · en el diálogo de impresión elige «Guardar como PDF»
        </span>
        <Button variant="primary" iconStart={<PrintOutlinedIcon fontSize="small" />} onClick={() => window.print()}>
          Descargar PDF
        </Button>
      </div>

      <div className="cctv-propuesta">
        {/* Hoja 1 · portada y distribución */}
        <article className={`${styles.hoja} cctv-hoja`} aria-label="Hoja 1: distribución de cámaras">
          <header className={styles.portada}>
            <div>
              <div className={styles.eyebrow}>Propuesta de videovigilancia</div>
              <h1 className={styles.titulo}>{nombre}</h1>
              <div className={styles.para}>
                Preparado para <b>{cliente ?? "[cliente]"}</b> · {fechaLarga.format(new Date())}
              </div>
            </div>
            <div className={styles.marca}>
              <b>NEXARA</b>
              <span>CCTV · control de acceso · redes</span>
            </div>
          </header>
          <div className={styles.regla} />
          <div className={styles.seccionCabeza}>
            <h2 className={styles.h2}>Distribución de cámaras</h2>
            <span className={styles.tenue}>
              {camaras.length} {camaras.length === 1 ? "cámara" : "cámaras"}
              {cal ? ` · sobre croquis calibrado (cota ${cal.metros.toFixed(2)} m)` : ""}
            </span>
          </div>
          <div className={styles.marco}>
            <PlanoEstatico plano={plano} tapas={tapas} coberturas={coberturas} conCroquis titulo="Plano con la cobertura de todas las cámaras" />
          </div>
          <ol className={styles.listaCamaras}>
            {camaras.map((c) => (
              <li key={c.id}>
                <b>{c.numero}.</b> {c.nombre} — {c.modelo.replace(/^HIKVISION\s+/i, "")}
              </li>
            ))}
          </ol>
          {cob ? (
            <>
              <h2 className={styles.h2}>Cobertura del interior</h2>
              <div className={styles.cifras}>
                <div className={styles.cifra}>
                  <b style={{ color: "var(--ui-brand-text)" }}>{Math.round(cob.cubierto)} %</b>
                  <span>del interior visible para alguna cámara</span>
                </div>
                <div className={styles.cifra}>
                  <b style={{ color: "var(--ui-success-text)" }}>{Math.round(cob.identificacion)} %</b>
                  <span>con identificación (rostros y placas)</span>
                </div>
                <div className={styles.cifra}>
                  <b style={{ color: "var(--ui-info-text)" }}>{Math.round(cob.reconocimiento)} %</b>
                  <span>con reconocimiento</span>
                </div>
                <div className={styles.cifra}>
                  <b style={{ color: "var(--ui-warning-text)" }}>{Math.round(cob.observacion)} %</b>
                  <span>con observación</span>
                </div>
              </div>
            </>
          ) : null}
          <div className={styles.leyenda}>
            <b className={styles.leyendaTitulo}>¿Qué significan los colores? Densidad de píxeles según IEC 62676-4 (DORI)</b>
            {NIVELES_DORI.map((n) => (
              <span key={n}>
                <span className={styles.punto} style={{ background: COLOR_NIVEL[n] }} />
                <b>
                  {ETIQUETA_NIVEL[n]} ({UMBRAL_DORI[n]} PPM).
                </b>{" "}
                {DESCRIPCION_NIVEL[n]}
              </span>
            ))}
          </div>
          <Pie hoja={1} total={totalHojas} />
        </article>

        {/* Hoja 2 · 3D y vistas */}
        <article className={`${styles.hoja} cctv-hoja`} aria-label="Hoja 2: vista 3D y vistas desde las cámaras">
          <h2 className={styles.h2}>Vista 3D del sitio</h2>
          <p className={styles.nota}>Cámaras a su altura real de montaje con su cobertura proyectada al piso; los humanoides marcan dónde se midió la densidad de píxeles.</p>
          {iso ? (
            <div className={styles.marco}>
              <svg viewBox="0 0 720 380" width="100%" role="img" aria-label="Vista isométrica del sitio">
                <rect width={720} height={380} fill="var(--ui-surface-2)" />
                <Figuras3D figuras={iso.figuras} plano={plano} matriz={iso.matriz} capas={{ croquis: true, etiquetas: true, translucidos: true }} />
              </svg>
            </div>
          ) : null}
          <h2 className={styles.h2}>Vistas desde las cámaras</h2>
          <p className={styles.nota}>Simulación con la óptica real de cada cámara y los humanoides en su posición actual.</p>
          <div className={styles.vistas}>
            {camaras.slice(0, 6).map((c) => (
              <VistaCamara key={c.id} plano={plano} camara={c} tapas={tapas} coberturas={coberturas} esHoja={esHoja} compacta />
            ))}
          </div>
          {camaras.length > 6 ? <p className={styles.nota}>Las vistas de las demás cámaras van en su ficha.</p> : null}
          <Pie hoja={2} total={totalHojas} />
        </article>

        {/* Una hoja por cámara */}
        {camaras.map((c, i) => {
          const o = c.lentes[0]?.optica;
          const f = o ? resumenOptico({ optica: o, distanciaM: c.distanciaM, alturaCamM: c.alturaM, inclinacionDeg: c.inclinacionDeg }) : null;
          const m = modeloPorId(c.productoId);
          return (
            <article key={c.id} className={`${styles.hoja} cctv-hoja`} aria-label={`Hoja ${3 + i}: cámara ${c.numero}`}>
              <div className={styles.fichaCabeza}>
                <span className={styles.numero}>{c.numero}</span>
                <div className={styles.fichaTitulo}>
                  <b>{c.nombre}</b>
                  <span>{c.modelo}</span>
                </div>
                {f ? (
                  <span className={styles.insignia}>
                    {ETIQUETA_NIVEL[f.nivelFinal]} a {metros(c.distanciaM)}
                  </span>
                ) : null}
              </div>
              <div className={styles.fichaArriba}>
                <div className={styles.marco}>
                  <PlanoEstatico plano={plano} tapas={tapas} coberturas={coberturas} soloCamara={c.id} titulo={`Ubicación de la cámara ${c.numero}`} />
                </div>
                <div>
                  <div className={styles.eyebrowGris}>Alcance por nivel (en el piso)</div>
                  {f
                    ? NIVELES_DORI.filter((n) => n !== "deteccion" || f.alcances.deteccion > f.alcances.observacion + 0.05).map((n) => (
                        <div key={n} className={styles.kv}>
                          <span>
                            <span className={styles.punto} style={{ background: COLOR_NIVEL[n] }} />
                            {ETIQUETA_NIVEL[n]}
                          </span>
                          <b>hasta {metros(f.alcances[n])}</b>
                        </div>
                      ))
                    : null}
                  {f ? <div className={styles.nota}>Al final del cono ({metros(c.distanciaM)}): {Math.round(f.ppmFinal)} PPM, {ETIQUETA_NIVEL[f.nivelFinal].toLowerCase()}.</div> : null}
                  <div className={styles.dosCol}>
                    <div className={styles.kv}>
                      <span>Resolución</span>
                      <b>{o ? `${o.pxHoriz}×${o.pxVert}` : "—"}</b>
                    </div>
                    <div className={styles.kv}>
                      <span>Focal</span>
                      <b>{o ? `${o.focalMm} mm` : "—"}</b>
                    </div>
                    <div className={styles.kv}>
                      <span>Ángulo horizontal</span>
                      <b>{f ? `${Math.round(f.hfovDeg)}°` : "—"}</b>
                    </div>
                    <div className={styles.kv}>
                      <span>Sensor</span>
                      <b>{o?.sensorFormato ? `${o.sensorFormato}"` : o?.sensorAnchoMm ? `${o.sensorAnchoMm} mm` : "—"}</b>
                    </div>
                    <div className={styles.kv}>
                      <span>Montaje</span>
                      <b>
                        {metros(c.alturaM)} · {c.inclinacionDeg}°
                      </b>
                    </div>
                    <div className={styles.kv}>
                      <span>Zona ciega al pie</span>
                      <b>{f?.zonaCiegaM != null ? metros(f.zonaCiegaM) : "—"}</b>
                    </div>
                    <div className={styles.kv}>
                      <span>Rumbo</span>
                      <b>{cardinal(c.rumboDeg, plano.norteDeg)}</b>
                    </div>
                    <div className={styles.kv}>
                      <span>Alcance IR</span>
                      <b>{o?.irM ? `${o.irM} m` : "—"}</b>
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.fichaAbajo}>
                <div>
                  <div className={styles.eyebrowGris}>Vista desde esta cámara</div>
                  <VistaCamara plano={plano} camara={c} tapas={tapas} coberturas={coberturas} esHoja={esHoja} compacta />
                </div>
                {f ? (
                  <div>
                    <div className={styles.eyebrowGris}>Detalle al final del cono</div>
                    <LaminaDetalle ppm={f.ppmFinal} ancho={150} etiqueta={`Lámina de referencia a ${Math.round(f.ppmFinal)} PPM`} />
                    <div className={styles.nota}>
                      {Math.round(f.ppmFinal)} PPM a {metros(c.distanciaM)}.
                    </div>
                  </div>
                ) : null}
              </div>
              {m?.caracteristicas.length ? (
                <div>
                  <div className={styles.eyebrowGris}>Características del equipo</div>
                  <ul className={styles.caracteristicas}>
                    {m.caracteristicas.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Pie hoja={3 + i} total={totalHojas} />
            </article>
          );
        })}

        {/* Última hoja · infraestructura y equipo */}
        <article className={`${styles.hoja} cctv-hoja`} aria-label="Infraestructura y lista de equipo">
          <h2 className={styles.h2}>Infraestructura de grabación</h2>
          <div className={styles.cifras}>
            <div className={styles.cifra}>
              <b>{infra.canales}</b>
              <span>canales de NVR ({camaras.length} en uso)</span>
            </div>
            <div className={styles.cifra}>
              <b>{infra.tb.toFixed(1)} TB</b>
              <span>
                {g.retencionDias} días {g.actividadPct >= 100 ? "continuos" : `al ${g.actividadPct} %`} en {g.codec.toUpperCase()} · {infra.discos8} {infra.discos8 === 1 ? "disco" : "discos"} de 8 TB
              </span>
            </div>
            <div className={styles.cifra}>
              <b>{Math.round(infra.mbps)} Mbps</b>
              <span>de grabación hacia el NVR</span>
            </div>
            <div className={styles.cifra}>
              <b>{Math.round(infra.poeW)} W</b>
              <span>de PoE en el switch (con 20 % de margen, consumo típico por tipo)</span>
            </div>
          </div>
          <h2 className={styles.h2}>Lista de equipo</h2>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Modelo</th>
                <th className={styles.derecha}>Cant.</th>
              </tr>
            </thead>
            <tbody>
              {infra.equipos.map((e) => (
                <tr key={e.modelo}>
                  <td>{e.descripcion}</td>
                  <td>{e.modelo}</td>
                  <td className={styles.derecha}>{e.cantidad}</td>
                </tr>
              ))}
              <tr>
                <td>NVR de {infra.canales} canales</td>
                <td>[modelo por elegir]</td>
                <td className={styles.derecha}>1</td>
              </tr>
              <tr>
                <td>Disco duro de 8 TB para videovigilancia</td>
                <td>[modelo por elegir]</td>
                <td className={styles.derecha}>{infra.discos8}</td>
              </tr>
              <tr>
                <td>Switch PoE de {infra.puertosSwitch} puertos</td>
                <td>[modelo por elegir]</td>
                <td className={styles.derecha}>1</td>
              </tr>
              <tr>
                <td>Cable UTP Cat 6</td>
                <td>[se calcula al trazar las rutas]</td>
                <td className={styles.derecha}>—</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.nota}>
            La cobertura es una simulación con la óptica de cada cámara y la norma DORI (IEC 62676-4); las distancias se miden en el piso desde el pie de cada cámara. La instalación
            real puede variar por obstáculos e iluminación.
          </p>
          <Pie hoja={totalHojas} total={totalHojas} />
        </article>
      </div>
    </div>
  );
}
