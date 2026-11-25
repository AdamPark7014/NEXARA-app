"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, EmptyState, SkeletonRows, Stat, StatRow, StatusBadge } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import { ETIQUETA_ESTADO, formatoAjuste, formatoMonedaMx, semanaPago, type SemanaPago } from "@/lib/nomina-pago-api";
import DetallePago from "./DetallePago";
import s from "./pago.module.css";

const personas = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;

/** Pestaña «Pago» del Control semanal: sugerido, ajuste, pagado y saldo de cada persona. */
export default function PagoSemanal({ token, semana }: { token: string; semana: string }) {
  const [datos, setDatos] = useState<SemanaPago | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<{ userId: number; nombre: string; vista: "calculo" | "registrar" } | null>(null);
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    if (!token) return;
    const id = ++pedido.current;
    setError(null);
    try {
      const r = await semanaPago(token, semana);
      if (id === pedido.current) setDatos(r);
    } catch (e) {
      if (id === pedido.current) setError(formatApiError(e, "No se pudieron cargar los pagos."));
    }
  }, [token, semana]);

  useEffect(() => {
    setAbierto(null);
    void cargar();
  }, [cargar]);

  const v = datos?.semana.inicio === semana ? datos : null;

  if (!v) {
    return error ? (
      <div className={s.cuerpo}>
        <Alert
          tone="danger"
          role="alert"
          title="No se pudieron cargar los pagos"
          action={
            <Button size="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    ) : (
      <SkeletonRows rows={6} label="Cargando pagos" />
    );
  }
  if (v.montosOcultos) {
    return (
      <div className={s.cuerpo}>
        <EmptyState title="Montos ocultos" description="Los montos los ven dirección y contabilidad." tone="neutral" />
      </div>
    );
  }
  if (!v.filas.length) {
    return (
      <div className={s.cuerpo}>
        <EmptyState title="Nadie en esta semana" description="Aparecen las personas que tienen nómina en la semana elegida." />
      </div>
    );
  }

  const t = v.totales!;
  const siguiente = v.filas.find((f) => (f.saldo?.saldo ?? 0) > 0);
  return (
    <div className={s.cuerpo}>
      {error ? (
        <Alert tone="warning" role="alert">
          {error} Se muestra la última versión que cargó.
        </Alert>
      ) : null}
      <StatRow ariaLabel="Resumen del pago">
        <Stat label="Por pagar" value={formatoMonedaMx(t.saldo)} hint={personas(t.porPagar)} />
        <Stat label="Pagado" value={formatoMonedaMx(t.pagado)} hint={`${t.completas} ${t.completas === 1 ? "completo" : "completos"}, ${t.parciales} ${t.parciales === 1 ? "parcial" : "parciales"}`} />
        <Stat label="Sugerido" value={formatoMonedaMx(t.sugerido)} hint="el total del Control semanal" />
        <Stat label="Ajustes" value={formatoAjuste(t.ajustes)} hint="cada uno con su motivo" />
      </StatRow>
      {v.puedeRegistrar && siguiente ? (
        <div className={s.acciones}>
          <Button
            variant="primary"
            onClick={() => setAbierto({ userId: siguiente.userId, nombre: siguiente.nombre, vista: "registrar" })}
          >
            Registrar pago
          </Button>
        </div>
      ) : null}
      <div className={s.marco} tabIndex={0} role="region" aria-label="Pago de la semana">
        <table className={s.tabla}>
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col" className={s.n}>
                Sugerido
              </th>
              <th scope="col" className={s.n}>
                Ajuste
              </th>
              <th scope="col" className={s.n}>
                A pagar
              </th>
              <th scope="col" className={s.n}>
                Pagado
              </th>
              <th scope="col" className={s.n}>
                Saldo
              </th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="ui-sr-only">Detalle</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {v.filas.map((f) => {
              const e = ETIQUETA_ESTADO[f.estado ?? "sin_monto"];
              const x = f.saldo!;
              return (
                <tr key={f.userId}>
                  <th scope="row">
                    <span className={s.nombre}>{f.nombre}</span>
                    {f.area ? <span className={s.meta}>{f.area}</span> : null}
                  </th>
                  <td className={s.n} data-l="Sugerido">
                    {formatoMonedaMx(x.sugerido)}
                  </td>
                  <td className={s.n} data-l="Ajuste">
                    {formatoAjuste(x.ajustes)}
                  </td>
                  <td className={`${s.n} ${s.fuerte}`} data-l="A pagar">
                    {formatoMonedaMx(x.final)}
                  </td>
                  <td className={s.n} data-l="Pagado">
                    {x.pagado ? formatoMonedaMx(x.pagado) : "—"}
                  </td>
                  <td className={`${s.n} ${s.fuerte}`} data-l="Saldo">
                    {formatoMonedaMx(x.saldo)}
                  </td>
                  <td data-l="Estado">
                    <StatusBadge label={e.texto} tone={e.tono} size="sm" />
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="tertiary"
                      aria-label={`Ver el cálculo de ${f.nombre}`}
                      onClick={() => setAbierto({ userId: f.userId, nombre: f.nombre, vista: "calculo" })}
                    >
                      Ver cálculo
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{personas(v.filas.length)}</th>
              <td className={s.n} data-l="Sugerido">
                {formatoMonedaMx(t.sugerido)}
              </td>
              <td className={s.n} data-l="Ajuste">
                {formatoAjuste(t.ajustes)}
              </td>
              <td className={s.n} data-l="A pagar">
                {formatoMonedaMx(t.final)}
              </td>
              <td className={s.n} data-l="Pagado">
                {formatoMonedaMx(t.pagado)}
              </td>
              <td className={s.n} data-l="Saldo">
                {formatoMonedaMx(t.saldo)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {abierto ? (
        <DetallePago
          key={abierto.userId}
          token={token}
          semana={semana}
          userId={abierto.userId}
          nombre={abierto.nombre}
          vistaInicial={abierto.vista}
          onCerrar={() => setAbierto(null)}
          onCambio={() => void cargar()}
        />
      ) : null}
    </div>
  );
}
