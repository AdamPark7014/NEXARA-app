"use client";

/**
 * Costos · Por proyecto. Solo CEO y contadora: cuánto va costando cada proyecto, qué cotizaciones ya
 * traen horas sin tener proyecto y cuánta mano de obra sigue sin ligar. Contrato: `/api/costos/proyectos`.
 */

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { ButtonLink, EmptyState } from "@/components/base";
import { Aviso } from "@/components/mesa-contable/piezas";
import { Banda, Kpi, c, useAccesoCostos } from "@/components/costos/piezas";
import { formatApiError } from "@/lib/erp-api";
import {
  getListaProyectos,
  horas,
  pct,
  pesos,
  rutaProyectoDesdeCotizacion,
  type ListaProyectos,
} from "@/lib/costos";

export default function CostosPorProyecto() {
  const { token } = useUser();
  const acceso = useAccesoCostos(token);
  const [datos, setDatos] = useState<ListaProyectos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !acceso?.veTodo) return;
    getListaProyectos(token)
      .then(setDatos)
      .catch((e) => setError(formatApiError(e, "No se pudieron leer los costos.")));
  }, [token, acceso?.veTodo]);

  if (acceso && !acceso.veTodo) {
    return (
      <div className={c.page}>
        <Banda acceso={acceso} titulo="Por proyecto" />
        <EmptyState title="Esta vista es de dirección y contabilidad" description="Los costos de tus proyectos están en la pestaña Costos de cada uno." />
      </div>
    );
  }

  const mo = datos?.manoDeObra;
  const pctSinLigar = mo && mo.importe > 0 ? Math.round((mo.importeSinLigar / mo.importe) * 1000) / 10 : null;

  return (
    <div className={c.page}>
      <Banda
        acceso={acceso}
        titulo="Por proyecto"
        subtitulo="El libro se calcula de noche con lo que la operación registra. No cambia nómina, facturas ni pólizas."
      >
        <div className={c.kpis}>
          <Kpi cifra={pesos(mo?.importe)} texto={`Mano de obra real · ${horas(mo?.horas)}`} />
          <Kpi cifra={pesos(mo?.importeSinLigar)} texto={`Sin ligar a nada · ${horas(mo?.horasSinLigar)}`} tono={pctSinLigar && pctSinLigar > 20 ? "mal" : "ok"} />
          <Kpi cifra={pesos(mo?.importeInterno)} texto={`Trabajo interno · ${horas(mo?.horasInternas)}`} />
          <Kpi cifra={pct(pctSinLigar)} texto="De la mano de obra sigue sin ligar" tono={pctSinLigar && pctSinLigar > 20 ? "mal" : "ok"} />
        </div>
      </Banda>

      {error ? <Aviso tono="danger" role="alert">{error}</Aviso> : null}

      <section className={c.card} aria-label="Proyectos">
        <h2 className={c.cardTitle}>Proyectos</h2>
        <p className={c.hint}>Consulta venta, costo real y margen en el listado único de Proyectos.</p>
        <ButtonLink href="/erp/proyectos" variant="secondary">Ver proyectos y margen real</ButtonLink>
      </section>

      {datos?.cotizacionesSinProyecto.length ? (
        <section className={`${c.card} ${c.scroll}`} aria-label="Cotizaciones con horas y sin proyecto">
          <h2 className={c.cardTitle}>Cotizaciones con horas y sin proyecto</h2>
          <table className={c.tabla}>
            <thead>
              <tr>
                <th>Cotización</th>
                <th className={c.der}>Costo hasta hoy</th>
                <th aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {datos.cotizacionesSinProyecto.map((q) => (
                <tr key={q.id}>
                  <td>
                    {q.nombre}
                    <small>{q.folio}</small>
                  </td>
                  <td className={c.der}>{pesos(q.costo)}</td>
                  <td className={c.der}>
                    <ButtonLink href={rutaProyectoDesdeCotizacion(q.id, q.clienteId)} variant="secondary" size="sm">
                      Se ganó: crear proyecto
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={c.hint}>Lo gastado en la cotización pasa solo al proyecto que nazca de ella. Si no se gana, es costo de venta.</p>
        </section>
      ) : null}
    </div>
  );
}
