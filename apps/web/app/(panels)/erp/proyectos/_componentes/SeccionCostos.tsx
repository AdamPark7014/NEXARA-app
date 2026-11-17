"use client";

/**
 * Pestaña «Costos» del proyecto (mockup aprobado 01-11-2026): lo cotizado contra lo real por rubro,
 * cada renglón con su origen. Lo que aún no se captura sale en cero y lo dice. Solo lee: el libro no
 * cambia nómina, facturas ni pólizas. Contrato: `GET /api/costos/proyectos/:id`.
 */

import { useEffect, useState } from "react";
import { Button, EmptyState, SkeletonRows } from "@/components/base";
import { Aviso } from "@/components/mesa-contable/piezas";
import { Kpi, c } from "@/components/costos/piezas";
import v from "@/components/vehiculos/vehiculos.module.scss";
import { fechaCorta } from "@/lib/vehiculos-ficha";
import { formatApiError } from "@/lib/erp-api";
import {
  anchoDeBarra,
  getCostosProyecto,
  horas,
  pct,
  pctDeAvance,
  pesos,
  tonoDeAvance,
  tonoDeMargen,
  type CostosProyecto,
  type Rubro,
} from "@/lib/costos";
import type { SeccionProps } from "./tipos";
import vista from "./costos.module.css";

/** Debajo del nombre de cada rubro: de dónde sale. */
const ORIGEN: Record<Rubro, string> = {
  MATERIAL: "Salidas de almacén",
  MANO_OBRA: "Reloj de actividades",
  VEHICULO: "Km de cada salida a la tarifa de su ficha, y casetas",
  HERRAMIENTA: "Llega con su ficha de costo",
  VIATICO_GASTO: "Comprobados o aprobados",
  SUBCONTRATO: "Llega con compras por proyecto",
};

export default function SeccionCostos({ proyecto, token }: Pick<SeccionProps, "proyecto" | "token">) {
  const [datos, setDatos] = useState<CostosProyecto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setError(null);
    setDatos(null);
    getCostosProyecto(token, proyecto.id)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(formatApiError(e, "No se pudieron leer los costos del proyecto.")));
    return () => {
      vivo = false;
    };
  }, [token, proyecto.id, intento]);

  if (error) return <EmptyState title="Costos no disponibles" description={error} action={<Button onClick={() => setIntento((n) => n + 1)}>Reintentar</Button>} />;
  if (!datos) return <SkeletonRows rows={6} />;

  const { avisos: a, margen, directo, indirecto } = datos;
  return (
    <div className={c.page}>
      <div className={c.band}>
        <div className={c.kpis}>
          <Kpi cifra={pesos(datos.venta)} texto="Venta sin IVA" />
          <Kpi cifra={pesos(datos.costoReal)} texto="Costo real a la fecha" />
          <Kpi cifra={`${pesos(margen.cotizado?.importe)} · ${pct(margen.cotizado?.pct)}`} texto="Margen cotizado" tono={tonoDeMargen(margen.cotizado?.pct)} />
          <Kpi cifra={`${pesos(margen.hoy?.importe)} · ${pct(margen.hoy?.pct)}`} texto="Margen real" tono={tonoDeMargen(margen.hoy?.pct)} />
          <Kpi cifra={pesos(datos.costoAlTerminar)} texto="Costo al terminar" />
          <Kpi cifra={pct(datos.avance)} texto="Avance calculable" />
          <Kpi cifra={horas(datos.manoDeObra.horas)} texto="Horas de trabajo" />
        </div>
      </div>

      <div className={c.page}>
        <p className={c.hint}>{datos.costoAlTerminar == null ? "No se proyecta el costo al terminar: el proyecto está incompleto o aún no tiene avance calculable." : "Costo al terminar: costo real dividido entre el avance calculable. Es una estimación; no modifica la cotización."}</p>
        <section className={c.card} aria-label="Cotizado contra real">
          <div className={vista.rubros}>
            <div className={`${vista.rubro} ${vista.encabezado}`}>
              <span className={c.rubroHead}>Rubro</span>
              <span className={`${c.rubroHead} ${c.der}`}>Cotizado</span>
              <span className={`${c.rubroHead} ${c.der}`}>Real</span>
              <span className={`${c.rubroHead} ${c.der}`}>Diferencia</span>
              <span className={c.rubroHead}>% consumido</span>
            </div>
            {datos.rubros.map((r) => (
              <div key={r.rubro}>
                <Renglon titulo={r.etiqueta} detalle={ORIGEN[r.rubro]} cotizado={r.cotizado} real={r.real} diferencia={r.diferencia} consumidoPct={r.consumidoPct} />
                <details className={vista.origen}>
                  <summary>Ver de dónde sale · {r.etiqueta}</summary>
                  {r.rubro === "MANO_OBRA" && !datos.acceso.detalle ? <p className={c.hint}>El detalle de mano de obra está disponible para dirección y contabilidad.</p> : r.movimientos?.length ? <ul className={vista.movimientos}>{r.movimientos.map((m, i) => <li key={`${m.origen}-${i}`}><span>{fechaCorta(m.fecha)} · {m.actividadId ? `Actividad #${m.actividadId}` : "Ligado al proyecto"}<small>{m.cantidad} {m.unidad}{m.nota ? ` · ${m.nota}` : ""}</small></span><strong>{pesos(m.importe)}</strong></li>)}</ul> : <p className={c.hint}>Todavía no hay movimientos en este rubro.</p>}
                </details>
              </div>
            ))}
            <Renglon titulo="Costo directo" fuerte cotizado={directo.cotizado} real={directo.real} />
            {indirecto.pct != null ? (
              <Renglon titulo={`Indirectos ${pct(indirecto.pct * 100)}`} cotizado={indirecto.cotizado} real={indirecto.real ?? 0} />
            ) : null}
          </div>
        </section>

        {datos.vehiculos && (datos.vehiculos.km > 0 || datos.vehiculos.otros > 0) ? (
          <section className={c.card} aria-label="Vehículos en este proyecto">
            <div className={v.cabecera} style={{ marginBottom: 2 }}>
              <h3 className={c.cardTitle} style={{ margin: 0 }}>
                Vehículos en este proyecto
              </h3>
              <strong className={c.num}>
                {datos.vehiculos.km.toLocaleString("es-MX")} km · {pesos(datos.vehiculos.importe + datos.vehiculos.otros)}
              </strong>
            </div>
            <p className={c.hint} style={{ marginTop: 0 }}>
              Cuando una salida se liga a una actividad de este proyecto, sus kilómetros se cargan aquí solos.
            </p>
            <div className={v.tablaCaja}>
              <table className={v.tabla} style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Actividad</th>
                    <th scope="col">Vehículo</th>
                    <th scope="col" className={v.der}>
                      Km
                    </th>
                    <th scope="col" className={v.der}>
                      Costo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datos.vehiculos.viajes.map((t, i) => (
                    <tr key={`${t.fecha}-${i}`}>
                      <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(t.fecha)}</td>
                      <td>{t.actividad ?? "—"}</td>
                      <td>{t.vehiculo ?? "—"}</td>
                      <td className={v.der}>{t.km.toLocaleString("es-MX")}</td>
                      <td className={v.der}>{pesos(t.importe)}</td>
                    </tr>
                  ))}
                  {datos.vehiculos.otros > 0 ? (
                    <tr>
                      <td />
                      <td>Casetas y gasolina sin vehículo</td>
                      <td>—</td>
                      <td className={v.der}>—</td>
                      <td className={v.der}>{pesos(datos.vehiculos.otros)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {datos.vehiculos.desglose.length ? (
              <p className={c.hint}>
                Los {datos.vehiculos.km.toLocaleString("es-MX")} km incluyen{" "}
                {datos.vehiculos.desglose.map((p) => `${p.nombre} ${pesos(p.importe)}`).join(", ")}. La gasolina se reparte por kilómetro: quien llena el tanque no paga todo el tanque.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className={c.cols3}>
          <section className={c.card} aria-label="Mano de obra">
            <h3 className={c.cardTitle}>Mano de obra: de dónde sale</h3>
            {datos.manoDeObra.categorias ? (
              datos.manoDeObra.categorias.length ? (
                <div className={c.lista}>
                  {datos.manoDeObra.categorias.map((k) => (
                    <div key={k.categoria}>
                      <span>
                        {k.categoria} · {horas(k.horas)}
                      </span>
                      <span className={c.num}>{pesos(k.importe)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={c.hint}>Todavía no hay horas ligadas a este proyecto. Lígalas en Costos › Horas sin proyecto.</p>
              )
            ) : (
              <p className={c.hint}>
                {horas(datos.manoDeObra.horas)} de reloj en total. El detalle por categoría es de dirección y contabilidad.
              </p>
            )}
            <p className={c.hint}>Costo por hora con factor de salario real, no el sueldo dividido entre horas.</p>
          </section>

          <div className={c.notas}>
            {a.psSinValidar ? (
              <Aviso tono="warning" titulo="Cifras provisionales.">
                Las cuotas de IMSS e Infonavit aún no las valida la contadora.
              </Aviso>
            ) : null}
            {a.sinCotizacion ? (
              <Aviso tono="info" titulo="Sin cotización.">
                No hay contra qué comparar: liga una cotización al proyecto.
              </Aviso>
            ) : a.partidasSinCosto ? (
              <Aviso tono="warning" titulo="Cotizado incompleto.">
                {a.partidasSinCosto} de {a.partidas} partidas {a.partidasSinCosto === 1 ? "no trae" : "no traen"} costo interno.
              </Aviso>
            ) : null}
            {a.sinVenta ? (
              <Aviso tono="info" titulo="Sin venta.">
                Captura el presupuesto del proyecto o liga su cotización para ver el margen.
              </Aviso>
            ) : null}
            {a.indirectoSinCapturar ? (
              <Aviso tono="info" titulo="Sin indirectos.">
                El margen todavía no descuenta oficina. Se captura en Costos › Tarifas.
              </Aviso>
            ) : null}
            {a.sesionesSinSueldo ? (
              <Aviso tono="warning">
                {a.sesionesSinSueldo === 1 ? "1 sesión vale" : `${a.sesionesSinSueldo} sesiones valen`} cero porque esa persona no
                tiene sueldo capturado.
              </Aviso>
            ) : null}
            {a.salidasSinCosto ? (
              <Aviso tono="warning">
                {a.salidasSinCosto === 1
                  ? "1 salida de almacén no trae costo: vale cero."
                  : `${a.salidasSinCosto} salidas de almacén no traen costo: valen cero.`}
              </Aviso>
            ) : null}
            {a.sesionesRecortadas ? (
              <Aviso tono="info">
                {a.sesionesRecortadas === 1
                  ? "1 reloj lo cerró el sistema: cuenta"
                  : `${a.sesionesRecortadas} relojes los cerró el sistema: cuentan`}{" "}
                a lo mucho una jornada.
              </Aviso>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Renglon({
  titulo,
  detalle,
  cotizado,
  real,
  fuerte = false,
  diferencia,
  consumidoPct,
}: {
  titulo: string;
  detalle?: string;
  cotizado: number | null;
  real: number;
  fuerte?: boolean;
  diferencia?: number | null;
  consumidoPct?: number | null;
}) {
  const tono = tonoDeAvance(real, cotizado);
  const avance = consumidoPct === undefined ? pctDeAvance(real, cotizado) : consumidoPct;
  return (
    <div className={vista.rubro} data-fuerte={fuerte}>
      <span>
        {titulo}
        {detalle ? <small>{detalle}</small> : null}
      </span>
      <span className={c.der} data-label="Cotizado">{pesos(cotizado)}</span>
      <span className={c.der} data-label="Real">{pesos(real)}</span>
      <span className={c.der} data-label="Diferencia">{pesos(diferencia === undefined ? (cotizado == null ? null : real - cotizado) : diferencia)}</span>
      <span className={vista.consumido} data-label="Consumido">
      <span className={c.bar} aria-hidden="true">
        <i data-tone={tono} style={{ width: `${anchoDeBarra(real, cotizado)}%` }} />
        <u />
      </span>
      <span className={`${c.der} ${c.tx}`} data-tone={tono}>
        {pct(avance)}
      </span>
      </span>
    </div>
  );
}
