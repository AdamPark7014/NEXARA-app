"use client";

/**
 * Ficha de una cámara (artboard 3 del mockup aprobado): alcance por nivel en el piso y por la
 * visual, vista desde la cámara, referencia de detalle pixelada a cada densidad, ubicación en el
 * plano, óptica, montaje y características del equipo.
 */
import Link from "next/link";
import { useMemo } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import { Badge, ButtonLink } from "@/components/base";
import { ETIQUETA_TIPO_CAMARA, modeloPorId } from "@/lib/cctv/catalogo";
import {
  ETIQUETA_NIVEL,
  NIVELES_DORI,
  UMBRAL_DORI,
  metros,
  resumenOptico,
  tramoVisible,
  type NivelCobertura,
} from "@/lib/cctv/optica";
import { elevacionTexto } from "@/lib/cctv/niveles";
import type { CamaraPlano, Nivel, Plano, Tapa } from "@/lib/cctv/plano";
import { camaraEnMetros, leerPersona, personaDeCamara, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { COLOR_NIVEL } from "./colores";
import LaminaDetalle from "./LaminaDetalle";
import PlanoEstatico from "./PlanoEstatico";
import VistaCamara from "./VistaCamara";
import styles from "./ficha.module.css";

const CARDINALES = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
export const cardinal = (rumboDeg: number, norteDeg = 0) => CARDINALES[Math.round((((rumboDeg - norteDeg) % 360) + 360) % 360 / 45) % 8];

const TONO_NIVEL: Record<NivelCobertura, "success" | "info" | "warning" | "neutral" | "danger"> = {
  identificacion: "success",
  reconocimiento: "info",
  observacion: "warning",
  deteccion: "neutral",
  general: "danger",
};

export default function FichaCamara({
  disenoId,
  disenoNombre,
  plano,
  camaraId,
  tapas,
  coberturas,
  esHoja,
  todas,
  nivel,
}: {
  disenoId: number;
  disenoNombre: string;
  plano: Plano;
  camaraId: string;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  esHoja: (t: Tapa) => boolean;
  /** Todas las cámaras del edificio, para pasar de una a otra entre niveles. */
  todas?: ReadonlyArray<{ camara: CamaraPlano }>;
  /** El nivel de la cámara, cuando el diseño tiene varios. */
  nivel?: Nivel | null;
}) {
  const ordenadas = useMemo(() => (todas ? todas.map((t) => t.camara) : [...plano.camaras].sort((a, b) => a.numero - b.numero)), [todas, plano.camaras]);
  const i = ordenadas.findIndex((c) => c.id === camaraId);
  const c = ordenadas[i];
  const k = plano.escala.metrosPorPx;

  const datos = useMemo(() => {
    if (!c) return null;
    const optica = c.lentes[0]?.optica;
    const ficha = optica ? resumenOptico({ optica, distanciaM: c.distanciaM, alturaCamM: c.alturaM, inclinacionDeg: c.inclinacionDeg }) : null;
    const cm = camaraEnMetros(c, plano.escala);
    const persona = cm ? personaDeCamara(cm, plano.personas.map((p) => ({ id: p.id, pos: { x: p.pos.x * k, y: p.pos.y * k } }))) : null;
    const lectura = cm && persona ? leerPersona(cm, tapas, persona.pos) : null;
    const piso = cm ? tramoVisible(cm.alturaM, cm.inclinacionDeg, cm.vfovDeg) : null;
    return { optica, ficha, lectura, piso, modelo: modeloPorId(c.productoId) };
  }, [c, plano, k, tapas]);

  if (!c || !datos) return <p style={{ padding: "var(--ui-s5)" }}>Esta cámara ya no está en el diseño.</p>;
  const { optica, ficha, lectura, piso, modelo } = datos;
  const anterior = ordenadas[i - 1];
  const siguiente = ordenadas[i + 1];
  const base = `/erp/videovigilancia/${disenoId}`;

  return (
    <div className={styles.pagina}>
      <nav className={styles.migas} aria-label="Migas">
        <Link href={`${base}?camara=${encodeURIComponent(c.id)}`} className={styles.volver}>
          <ChevronLeftRoundedIcon fontSize="small" /> {disenoNombre}
        </Link>
        <span aria-hidden="true">›</span>
        <b>Cámara {c.numero}</b>
        <span className={styles.paginador}>
          {anterior ? <Link href={`${base}/camara/${encodeURIComponent(anterior.id)}`}>‹ Cámara {anterior.numero}</Link> : null}
          <span>
            {i + 1} de {ordenadas.length}
          </span>
          {siguiente ? <Link href={`${base}/camara/${encodeURIComponent(siguiente.id)}`}>Cámara {siguiente.numero} ›</Link> : null}
        </span>
      </nav>

      <section className={styles.tarjeta + " " + styles.cabeza}>
        <span className={styles.numero}>{c.numero}</span>
        <div className={styles.cabezaTexto}>
          <div className={styles.insignias}>
            {ficha ? (
              <Badge tone={TONO_NIVEL[ficha.nivelFinal]}>
                {ETIQUETA_NIVEL[ficha.nivelFinal]} a {metros(c.distanciaM)}
              </Badge>
            ) : null}
            {lectura ? (
              <Badge tone={lectura.estado === "visible" ? "success" : lectura.estado === "parcial" ? "warning" : "danger"}>
                Persona {lectura.estado === "visible" ? "visible" : lectura.estado === "parcial" ? "parcialmente visible" : "oculta"} · {Math.round(lectura.ppm)} PPM
              </Badge>
            ) : null}
            {modelo && !modelo.verificado ? <Badge tone="warning">Ficha sin verificar</Badge> : null}
          </div>
          <h1 className={styles.titulo}>{c.nombre}</h1>
          <div className={styles.sub}>
            {nivel ? (
              <span>
                {nivel.nombre} · {elevacionTexto(nivel.elevacionM)}
              </span>
            ) : null}
            <span>{c.modelo}</span>
            {modelo ? <span>{ETIQUETA_TIPO_CAMARA[modelo.tipo]} · {modelo.descripcion}</span> : null}
            <span>Montaje en {c.montaje ?? "muro"} a {metros(c.alturaM)}</span>
          </div>
        </div>
        <ButtonLink href={`${base}?camara=${encodeURIComponent(c.id)}`} variant="primary">
          Ver en el plano
        </ButtonLink>
      </section>

      <div className={styles.columnas}>
        <div className={styles.principal}>
          <section className={styles.tarjeta}>
            <h2 className={styles.h2}>Alcance por nivel de detalle</h2>
            <p className={styles.sub2}>Medido en el piso desde el pie de la cámara, con la altura de montaje descontada. A la derecha, lo que reportaría una calculadora que mide por la visual.</p>
            {ficha ? (
              <>
                <div className={styles.nivelCabeza}>
                  <span>Nivel</span>
                  <span>0 m — {metros(c.distanciaM)} (fin del cono)</span>
                  <span className={styles.num}>En el piso</span>
                  <span className={styles.num}>Visual</span>
                </div>
                {NIVELES_DORI.map((n, j) => {
                  const desde = j === 0 ? (ficha.zonaCiegaM ?? 0) : ficha.alcances[NIVELES_DORI[j - 1]];
                  const hasta = ficha.alcances[n];
                  return (
                    <div key={n} className={styles.nivel}>
                      <span>
                        <span className={styles.punto} style={{ background: COLOR_NIVEL[n] }} />
                        {ETIQUETA_NIVEL[n]}
                      </span>
                      <span className={styles.pista}>
                        {hasta > desde ? <i style={{ left: `${(desde / c.distanciaM) * 100}%`, width: `${((hasta - desde) / c.distanciaM) * 100}%`, background: COLOR_NIVEL[n] }} /> : null}
                      </span>
                      <span className={styles.num}>{metros(hasta)}</span>
                      <span className={`${styles.num} ${styles.tenue}`}>{metros(ficha.alcancesVisual[n])}</span>
                    </div>
                  );
                })}
                <div className={styles.datosLinea}>
                  <span>
                    Zona ciega al pie: <b>{ficha.zonaCiegaM != null ? metros(ficha.zonaCiegaM) : "—"}</b>
                  </span>
                  <span>
                    Al final del cono: <b>{Math.round(ficha.ppmFinal)} PPM · {ETIQUETA_NIVEL[ficha.nivelFinal]}</b>
                  </span>
                  {piso && Number.isFinite(piso.dMaxM) ? (
                    <span>
                      El cuadro toca el piso hasta: <b>{metros(piso.dMaxM)}</b>
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <p className={styles.sub2}>Falta el sensor o el ángulo de esta lente para calcular el alcance.</p>
            )}
          </section>

          <section className={styles.tarjeta}>
            <h2 className={styles.h2}>Vista desde esta cámara</h2>
            <p className={styles.sub2}>
              Simulación con la óptica real{ficha ? ` (${Math.round(ficha.hfovDeg)}° horizontal${ficha.vfovDeg ? `, ${Math.round(ficha.vfovDeg)}° vertical` : ""}, ${c.inclinacionDeg}° de inclinación)` : ""}. Mueve a la persona en el plano y aquí cambia.
            </p>
            <div className={styles.vistaGrande}>
              <VistaCamara plano={plano} camara={c} tapas={tapas} coberturas={coberturas} esHoja={esHoja} />
            </div>
          </section>

          {ficha ? (
            <section className={styles.tarjeta}>
              <h2 className={styles.h2}>Referencia de detalle</h2>
              <p className={styles.sub2}>
                La misma lámina (persona de 1.70 m con placa de prueba y barras de 4, 2 y 1 cm) reducida a cada densidad. Así se ve lo que entrega esta cámara a cada distancia.
              </p>
              <div className={styles.laminas}>
                {[
                  { ppm: UMBRAL_DORI.identificacion, titulo: "250 PPM · Identificación", pie: `hasta ${metros(ficha.alcances.identificacion)} de esta cámara` },
                  { ppm: UMBRAL_DORI.reconocimiento, titulo: "125 PPM · Reconocimiento", pie: `hasta ${metros(ficha.alcances.reconocimiento)}` },
                  { ppm: ficha.ppmFinal, titulo: `${Math.round(ficha.ppmFinal)} PPM · fin del cono`, pie: `a ${metros(c.distanciaM)}` },
                  { ppm: UMBRAL_DORI.deteccion, titulo: "25 PPM · Detección", pie: "el mínimo para notar a alguien" },
                ].map((l) => (
                  <figure key={l.titulo} className={styles.lamina}>
                    <LaminaDetalle ppm={l.ppm} etiqueta={`Lámina de referencia a ${Math.round(l.ppm)} píxeles por metro`} />
                    <figcaption>
                      <b>{l.titulo}</b>
                      <span>{l.pie}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className={styles.lateral}>
          <section className={styles.tarjeta}>
            <p className={styles.seccion}>Ubicación</p>
            <div className={styles.mini}>
              <PlanoEstatico plano={plano} tapas={tapas} coberturas={coberturas} soloCamara={c.id} titulo={`Ubicación de la cámara ${c.numero} y su cono`} />
            </div>
          </section>
          {optica ? (
            <section className={styles.tarjeta}>
              <p className={styles.seccion}>Óptica configurada</p>
              <dl className={styles.datos}>
                <dt>Resolución</dt>
                <dd>
                  {optica.pxHoriz} × {optica.pxVert}
                </dd>
                <dt>Focal</dt>
                <dd>
                  {optica.focalMm} mm{optica.focalMaxMm && optica.focalMinMm && optica.focalMaxMm > optica.focalMinMm ? ` (${optica.focalMinMm}–${optica.focalMaxMm} mm)` : " (fija)"}
                </dd>
                <dt>Sensor</dt>
                <dd>{optica.sensorFormato ? `${optica.sensorFormato}"` : optica.sensorAnchoMm ? `${optica.sensorAnchoMm} mm` : "—"}</dd>
                {ficha ? (
                  <>
                    <dt>Ángulo horizontal</dt>
                    <dd>{Math.round(ficha.hfovDeg)}°</dd>
                    <dt>Ángulo vertical</dt>
                    <dd>{ficha.vfovDeg ? `${Math.round(ficha.vfovDeg)}°` : "—"}</dd>
                  </>
                ) : null}
                <dt>Alcance IR</dt>
                <dd>{optica.irM ? `${optica.irM} m` : "—"}</dd>
              </dl>
            </section>
          ) : null}
          <section className={styles.tarjeta}>
            <p className={styles.seccion}>Montaje</p>
            <dl className={styles.datos}>
              <dt>Altura</dt>
              <dd>
                {metros(c.alturaM)} · en {c.montaje ?? "muro"}
              </dd>
              <dt>Inclinación</dt>
              <dd>{c.inclinacionDeg}°</dd>
              <dt>Rumbo</dt>
              <dd>
                {Math.round(c.rumboDeg)}° ({cardinal(c.rumboDeg, plano.norteDeg)})
              </dd>
              <dt>Zona ciega al pie</dt>
              <dd>{ficha?.zonaCiegaM != null ? metros(ficha.zonaCiegaM) : "—"}</dd>
              <dt>Largo del cono</dt>
              <dd>{metros(c.distanciaM)}</dd>
            </dl>
          </section>
          {modelo?.caracteristicas.length ? (
            <section className={styles.tarjeta}>
              <p className={styles.seccion}>Características del equipo</p>
              <ul className={styles.lista}>
                {modelo.caracteristicas.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {!modelo.verificado ? <p className={styles.aviso}>Ficha tomada del catálogo; falta que un encargado la confirme contra la hoja técnica del fabricante.</p> : null}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
