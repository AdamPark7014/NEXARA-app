"use client";

/**
 * Pasar a cotización: lo que lleva el diseño, cuánto hay de cada cosa y a qué precio. El precio lo pone
 * el servidor; aquí solo se enseña. Lo que no tiene precio queda en cero y avisado, para capturarlo allá.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Alert, Button } from "@/components/base";
import { adjuntarPlanoACotizacion, pasarACotizacion, type ResultadoCotizacion } from "@/lib/cctv/api";
import type { FilaCatalogo } from "@/lib/cctv/catalogo";
import { equipoPorId, modeloPorId } from "@/lib/cctv/catalogo";
import { lineaParaEnviar, pesos, renglonesDeCotizacion, totalesDe, type Disponibilidad } from "@/lib/cctv/existencias";
import type { Grabacion } from "@/lib/cctv/infraestructura";
import { svgAPng } from "@/lib/cctv/planoImagen";
import type { Plano } from "@/lib/cctv/plano";
import { balanceDelSistema, conexionesDelSistema, gruposDeEquipos } from "@/lib/cctv/sistema";
import { useCalculoDiseno } from "./calculo";
import PlanoEstatico from "./PlanoEstatico";
import styles from "./existencias.module.css";

export default function PasarACotizacion({
  token,
  disenoId,
  raiz,
  grabacion,
  cotizacionId,
  disponibilidad,
  filas,
  guardar,
  onCerrar,
  onHecho,
}: {
  token: string;
  disenoId: number;
  raiz: Plano;
  grabacion: Grabacion;
  cotizacionId: number | null;
  disponibilidad: ReadonlyMap<string, Disponibilidad>;
  filas: readonly FilaCatalogo[];
  /** Guarda lo pendiente: la cotización sale de lo que está guardado y dibujado. */
  guardar: () => Promise<unknown>;
  onCerrar: () => void;
  onHecho: (cotizacionId: number) => void;
}) {
  const calculo = useCalculoDiseno(raiz, grabacion);
  const renglones = useMemo(() => {
    const grupos = gruposDeEquipos(raiz, grabacion);
    const balance = balanceDelSistema(raiz, calculo.resumen, conexionesDelSistema(raiz));
    return renglonesDeCotizacion(grupos, balance, disponibilidad, {
      modeloDe: (id) => {
        const m = modeloPorId(id) ?? equipoPorId(id);
        return m ? { id: m.id, marca: m.marca, modelo: m.modelo, descripcion: m.descripcion } : null;
      },
      filas,
    });
  }, [raiz, grabacion, calculo.resumen, disponibilidad, filas]);
  const totales = useMemo(() => totalesDe(renglones), [renglones]);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ya salió al cliente: hay que hacer otra o abrirla allá. */
  const [ocupada, setOcupada] = useState(false);
  const [hecho, setHecho] = useState<ResultadoCotizacion | null>(null);
  const [avisoPlano, setAvisoPlano] = useState<string | null>(null);
  const planos = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !enviando) onCerrar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [enviando, onCerrar]);

  const adjuntarPlanos = async () => {
    const hojas = [...(planos.current?.querySelectorAll<HTMLElement>("[data-hoja]") ?? [])];
    for (const hoja of hojas) {
      const svg = hoja.querySelector("svg");
      if (!svg) continue;
      const nombre = hojas.length > 1 ? `Plano de videovigilancia · ${hoja.dataset.hoja}` : "Plano de videovigilancia";
      await adjuntarPlanoACotizacion(token, disenoId, await svgAPng(svg, 2400), nombre);
    }
  };

  const enviar = async (nueva: boolean) => {
    setEnviando(true);
    setError(null);
    setOcupada(false);
    try {
      await guardar();
      const r = await pasarACotizacion(token, disenoId, renglones.map(lineaParaEnviar), nueva);
      try {
        await adjuntarPlanos();
      } catch (e) {
        // Las partidas ya quedaron: que no parezca que falló todo.
        setAvisoPlano(e instanceof Error ? e.message : "No se pudo adjuntar el plano.");
      }
      setHecho(r);
      onHecho(r.cotizacionId);
    } catch (e) {
      const texto = e instanceof Error ? e.message : "No se pudo pasar a cotización.";
      setError(texto);
      if (/ya salió al cliente/.test(texto)) setOcupada(true);
    } finally {
      setEnviando(false);
    }
  };

  return createPortal(
    <div className={styles.fondo} role="dialog" aria-modal="true" aria-label="Pasar a cotización" onClick={(e) => e.target === e.currentTarget && !enviando && onCerrar()}>
      <div className={`${styles.hoja} ${styles.hojaAncha}`}>
        <header className={styles.cabeza}>
          <div>
            <h2>{hecho ? (hecho.creada ? "Cotización creada" : "Cotización actualizada") : cotizacionId ? "Actualizar la cotización" : "Pasar a cotización"}</h2>
            <p>{hecho ? "Queda en borrador: ahí se revisa, se completa y se envía." : "Se lleva los equipos, el cable y el plano. Lo que ya capturaste a mano en esa cotización no se toca."}</p>
          </div>
          <button type="button" className={styles.cerrar} aria-label="Cerrar" disabled={enviando} onClick={onCerrar}>
            <CloseRoundedIcon fontSize="small" />
          </button>
        </header>

        {hecho ? (
          <div className={styles.hecho}>
            <p>
              <b>{hecho.quoteNumber}</b> · {hecho.partidas} {hecho.partidas === 1 ? "partida" : "partidas"} del diseño
              {hecho.conservadas ? ` y ${hecho.conservadas} que ya tenía` : ""}.
            </p>
            {hecho.sinPrecio ? (
              <Alert tone="warning">
                {hecho.sinPrecio === 1 ? "Una partida va" : `${hecho.sinPrecio} partidas van`} sin precio, en $0: captúralo antes de enviar.
              </Alert>
            ) : null}
            {avisoPlano ? <Alert tone="warning">No se adjuntó el plano: {avisoPlano}. Puedes volver a pasarlo o subirlo en la cotización.</Alert> : null}
            <div className={styles.acciones}>
              <Link className={styles.botonLiga} href={`/erp/cotizaciones/${hecho.cotizacionId}`}>
                Abrir la cotización
              </Link>
              <Button variant="ghost" onClick={onCerrar}>
                Seguir en el diseño
              </Button>
            </div>
          </div>
        ) : (
          <>
            {error ? <Alert tone={ocupada ? "warning" : "danger"}>{error}</Alert> : null}
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th className={styles.numero}>Necesitas</th>
                    <th className={styles.numero}>En almacén</th>
                    <th className={styles.numero}>En CT</th>
                    <th className={styles.numero}>Precio</th>
                    <th className={styles.numero}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {renglones.map((r) => (
                    <tr key={r.clave}>
                      <td>
                        <b>{r.nombre}</b>
                        {r.grupo === "MATERIALES" ? <span>{r.descripcion}</span> : r.faltan > 0 ? <span className={styles.falta}>{r.faltan === 1 ? "Falta 1" : `Faltan ${r.faltan}`} entre Almacén y CT</span> : null}
                      </td>
                      <td className={styles.numero}>
                        {r.cantidad}
                        {r.unidad === "bobina" ? " bob." : ""}
                      </td>
                      <td className={styles.numero}>{r.grupo === "MATERIALES" ? "—" : r.almacen}</td>
                      <td className={styles.numero}>{r.enCt == null ? "—" : r.enCt}</td>
                      <td className={styles.numero}>{r.precio == null ? <span className={styles.sinPrecio}>Sin precio</span> : pesos(r.precio)}</td>
                      <td className={styles.numero}>{r.precio == null ? "—" : pesos(r.precio * r.cantidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.totales}>
              <span>
                {totales.sinPrecio ? `${totales.sinPrecio} sin precio · ` : ""}
                {totales.faltan ? `${totales.faltan} piezas por conseguir` : "Hay piezas para todo lo que se pudo ligar"}
              </span>
              <b>{pesos(totales.sinIva)} sin IVA</b>
            </div>
            <p className={styles.nota}>El precio sale de CT con margen del 30 % y aún no incluye mano de obra. En la cotización se ajusta todo.</p>
            <div className={styles.acciones}>
              {ocupada || !cotizacionId ? (
                <Button variant="primary" loading={enviando} onClick={() => void enviar(true)}>
                  {ocupada ? "Crear otra cotización" : "Crear cotización"}
                </Button>
              ) : (
                <>
                  <Button variant="primary" loading={enviando} onClick={() => void enviar(false)}>
                    Actualizar cotización
                  </Button>
                  <Button disabled={enviando} onClick={() => void enviar(true)}>
                    Crear otra
                  </Button>
                </>
              )}
              {ocupada && cotizacionId ? (
                <Link className={styles.botonLigaSec} href={`/erp/cotizaciones/${cotizacionId}`}>
                  Abrir la que ya salió
                </Link>
              ) : null}
              <Button variant="ghost" disabled={enviando} onClick={onCerrar}>
                Cancelar
              </Button>
            </div>
          </>
        )}
        {/* El plano que se adjunta: se dibuja aquí, fuera de la vista, y se vuelve imagen. */}
        <div ref={planos} className={styles.planosOcultos} aria-hidden="true">
          {calculo.niveles
            .filter((n) => n.plano.muros.length || n.plano.camaras.length)
            .map((n) => (
              <div key={n.nivel.id} data-hoja={n.nivel.nombre}>
                <PlanoEstatico plano={n.plano} tapas={n.tapas} coberturas={n.coberturas} conEtiquetasCono={false} alto={900} titulo={`Plano de ${n.nivel.nombre}`} />
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
