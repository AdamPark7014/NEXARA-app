"use client";

/**
 * Pestaña «Costos» del proyecto (mockup aprobado 01-11-2026): lo cotizado contra lo real por rubro,
 * cada renglón con su origen. Lo que aún no se captura sale en cero y lo dice. Solo lee: el libro no
 * cambia nómina, facturas ni pólizas. Contrato: `GET /api/costos/proyectos/:id`.
 */

import { useEffect, useState } from "react";
import { EmptyState, SkeletonRows } from "@/components/base";
import { Aviso } from "@/components/mesa-contable/piezas";
import { Kpi, c } from "@/components/costos/piezas";
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

/** Debajo del nombre de cada rubro: de dónde sale. */
const ORIGEN: Record<Rubro, string> = {
  MATERIAL: "Salidas de almacén",
  MANO_OBRA: "Reloj de actividades",
  VEHICULO: "Gasolina y casetas por ahora; el costo por km llega con su ficha",
  HERRAMIENTA: "Llega con su ficha de costo",
  VIATICO_GASTO: "Comprobados o aprobados",
  SUBCONTRATO: "Llega con compras por proyecto",
};

export default function SeccionCostos({ proyecto, token }: Pick<SeccionProps, "proyecto" | "token">) {
  const [datos, setDatos] = useState<CostosProyecto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setError(null);
    getCostosProyecto(token, proyecto.id)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(formatApiError(e, "No se pudieron leer los costos del proyecto.")));
    return () => {
      vivo = false;
    };
  }, [token, proyecto.id]);

  if (error) return <EmptyState title="Costos no disponibles" description={error} />;
  if (!datos) return <SkeletonRows rows={6} />;

  const { avisos: a, margen, directo, indirecto } = datos;
  return (
    <div className={c.page}>
      <div className={c.band}>
        <div className={c.kpis}>
          <Kpi cifra={pesos(datos.venta)} texto="Venta sin IVA" />
          <Kpi cifra={pct(margen.cotizado?.pct)} texto="Margen cotizado" tono={tonoDeMargen(margen.cotizado?.pct)} />
          <Kpi cifra={pct(margen.hoy?.pct)} texto="Margen hoy, con lo gastado" tono={tonoDeMargen(margen.hoy?.pct)} />
          <Kpi cifra={pct(proyecto.resumen.avance.porcentaje)} texto="Avance por actividades" />
          <Kpi cifra={horas(datos.manoDeObra.horas)} texto="Horas de trabajo" />
        </div>
      </div>

      <div className={c.cols2}>
        <section className={`${c.card} ${c.scroll}`} aria-label="Cotizado contra real">
          <div className={c.rubros}>
            <div className={c.rubro}>
              <span className={c.rubroHead}>Rubro</span>
              <span className={`${c.rubroHead} ${c.der}`}>Cotizado</span>
              <span className={`${c.rubroHead} ${c.der}`}>Real</span>
              <span className={c.rubroHead}>Real contra cotizado (raya = 100 %)</span>
              <span className={`${c.rubroHead} ${c.der}`}>%</span>
            </div>
            {datos.rubros.map((r) => (
              <Renglon key={r.rubro} titulo={r.etiqueta} detalle={ORIGEN[r.rubro]} cotizado={r.cotizado} real={r.real} />
            ))}
            <Renglon titulo="Costo directo" fuerte cotizado={directo.cotizado} real={directo.real} />
            {indirecto.pct != null ? (
              <Renglon titulo={`Indirectos ${pct(indirecto.pct * 100)}`} cotizado={indirecto.cotizado} real={indirecto.real ?? 0} />
            ) : null}
          </div>
        </section>

        <div className={c.page}>
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
                {a.partidasSinCosto} de {a.partidas} partidas no traen costo interno.
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
              <Aviso tono="warning">{a.sesionesSinSueldo} sesiones valen cero porque esa persona no tiene sueldo capturado.</Aviso>
            ) : null}
            {a.salidasSinCosto ? (
              <Aviso tono="warning">{a.salidasSinCosto} salidas de almacén no traen costo: valen cero.</Aviso>
            ) : null}
            {a.sesionesRecortadas ? (
              <Aviso tono="info">{a.sesionesRecortadas} relojes los cerró el sistema: cuentan a lo mucho una jornada.</Aviso>
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
}: {
  titulo: string;
  detalle?: string;
  cotizado: number | null;
  real: number;
  fuerte?: boolean;
}) {
  const tono = tonoDeAvance(real, cotizado);
  const avance = pctDeAvance(real, cotizado);
  const peso = fuerte ? { fontWeight: 600 } : undefined;
  return (
    <div className={c.rubro} style={peso}>
      <span>
        {titulo}
        {detalle ? <small>{detalle}</small> : null}
      </span>
      <span className={c.der}>{pesos(cotizado)}</span>
      <span className={c.der}>{pesos(real)}</span>
      <span className={c.bar} aria-hidden="true">
        <i data-tone={tono} style={{ width: `${anchoDeBarra(real, cotizado)}%` }} />
        <u />
      </span>
      <span className={`${c.der} ${c.tx}`} data-tone={tono}>
        {avance ?? "—"}
      </span>
    </div>
  );
}
