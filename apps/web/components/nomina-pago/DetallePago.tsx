"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Alert, Button, DateInput, Field, Input, Segmented, Select, SkeletonRows } from "@/components/base";
import { toast } from "@/components/Toast";
import Cajon from "@/components/ui/Cajon";
import { formatApiError } from "@/lib/erp-api";
import { diaLargo, hoyMx, minutosAHorasTexto, tituloSemana } from "@/lib/horarios-api";
import {
  abrirComprobante,
  ajustarPago,
  detallePago,
  etiquetaFormaPago,
  FORMAS_PAGO_NOMINA,
  formatoAjuste,
  formatoMonedaMx,
  leerMonto,
  registrarPago,
  type DetallePagoSemanal,
  type FormaPagoNomina,
} from "@/lib/nomina-pago-api";
import s from "./pago.module.css";

type Vista = "calculo" | "ajustar" | "registrar";
const COMPROBANTE_MAX = 10 * 1024 * 1024;
const dia = (iso: string) =>
  diaLargo(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(iso)));

/** El pago de una persona: cómo se calculó, ajustar y registrar. */
export default function DetallePago({
  token,
  semana,
  userId,
  nombre,
  vistaInicial,
  onCerrar,
  onCambio,
}: {
  token: string;
  semana: string;
  userId: number;
  nombre: string;
  vistaInicial: Vista;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [d, setD] = useState<DetallePagoSemanal | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ajuste, setAjuste] = useState("");
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState<FormaPagoNomina>("transferencia");
  const [fecha, setFecha] = useState(hoyMx());
  const [archivo, setArchivo] = useState<File | null>(null);
  const cerrojo = useRef(false);
  const archivoId = useId();

  const cargar = useCallback(async () => {
    setFalla(null);
    try {
      const r = await detallePago(token, semana, userId);
      setD(r);
      setMonto(r.saldo.saldo > 0 ? r.saldo.saldo.toFixed(2) : "");
    } catch (e) {
      setFalla(formatApiError(e, "No se pudo leer el pago."));
    }
  }, [token, semana, userId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const correr = async (fn: () => Promise<{ aviso?: string | null } | null | undefined>, exito: string) => {
    if (cerrojo.current) return;
    cerrojo.current = true;
    setOcupado(true);
    setError(null);
    try {
      const r = await fn();
      if (r?.aviso) toast.error(r.aviso);
      else toast.success(exito);
      setAjuste("");
      setMotivo("");
      setArchivo(null);
      setVista("calculo");
      onCambio();
      await cargar();
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar. Lo que escribiste sigue aquí para reintentar."));
      // El saldo pudo cambiar en otra pestaña: se lee de nuevo sin perder lo escrito.
      detallePago(token, semana, userId).then(setD, () => undefined);
    } finally {
      cerrojo.current = false;
      setOcupado(false);
    }
  };

  const guardarAjuste = () => {
    const n = leerMonto(ajuste);
    if (n == null || n === 0) return setError("Escribe cuánto sumar o restar, por ejemplo 150 o -120.");
    if (motivo.trim().length < 5) return setError("El motivo lleva al menos 5 letras.");
    void correr(() => ajustarPago(token, { semana, userId, monto: n, motivo: motivo.trim() }), "Ajuste guardado.");
  };

  const guardarPago = () => {
    const n = leerMonto(monto);
    if (n == null || n <= 0) return setError("Escribe un monto mayor a cero.");
    if (d && n > d.saldo.saldo) return setError(`Solo faltan ${formatoMonedaMx(d.saldo.saldo)} por pagar.`);
    if (!fecha || fecha > hoyMx()) return setError("La fecha del pago no puede ser futura.");
    void correr(() => registrarPago(token, { semana, userId, monto: n, fecha, forma }, archivo), "Pago registrado.");
  };

  const montoLeido = leerMonto(monto);
  const vistas: Array<{ id: Vista; label: string }> = [
    { id: "calculo", label: "Cómo se calculó" },
    ...(d?.puedeAjustar ? [{ id: "ajustar" as const, label: "Ajustar" }] : []),
    ...(d?.puedeRegistrar && d.saldo.saldo > 0 ? [{ id: "registrar" as const, label: "Registrar pago" }] : []),
  ];
  const activa = vistas.some((x) => x.id === vista) ? vista : "calculo";

  return (
    <Cajon
      titulo={nombre}
      subtitulo={d ? tituloSemana(d.semana, d.fin) : undefined}
      onCerrar={() => {
        if (!ocupado) onCerrar();
      }}
      pie={
        activa === "ajustar" ? (
          <Button variant="primary" loading={ocupado} onClick={guardarAjuste}>
            Guardar ajuste
          </Button>
        ) : activa === "registrar" ? (
          <Button variant="primary" loading={ocupado} onClick={guardarPago}>
            {montoLeido && montoLeido > 0 ? `Registrar ${formatoMonedaMx(montoLeido)}` : "Registrar pago"}
          </Button>
        ) : undefined
      }
    >
      {falla && !d ? (
        <Alert
          tone="danger"
          role="alert"
          title="No se pudo leer el pago"
          action={
            <Button size="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {falla}
        </Alert>
      ) : !d ? (
        <SkeletonRows rows={5} label="Cargando el pago" />
      ) : (
        <>
          <div className={s.resumen}>
            <div>
              <span className={s.meta}>Saldo por pagar</span>
              <p className={s.grande}>{formatoMonedaMx(d.saldo.saldo)}</p>
            </div>
            <div>
              <span className={s.meta}>A pagar {formatoMonedaMx(d.saldo.final)}</span>
              <span className={s.meta}>Pagado {formatoMonedaMx(d.saldo.pagado)}</span>
            </div>
          </div>
          {vistas.length > 1 ? (
            <Segmented
              ariaLabel="Qué ver"
              items={vistas}
              value={activa}
              onChange={(x) => {
                setVista(x);
                setError(null);
              }}
            />
          ) : null}
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          {activa === "calculo" ? (
            <>
              <ul className={s.renglones}>
                {d.comoSeCalculo.map((r) => (
                  <li key={r.clave}>
                    <span>
                      {r.titulo}
                      {r.detalle ? <span className={s.meta}>{r.detalle}</span> : null}
                    </span>
                    <span>{formatoMonedaMx(r.monto)}</span>
                  </li>
                ))}
                {d.movimientos
                  .filter((m) => m.tipo === "ajuste")
                  .map((m) => (
                    <li key={m.id}>
                      <span>
                        Ajuste manual
                        <span className={s.meta}>
                          {m.motivo}. {m.autorNombre ? `Lo puso ${m.autorNombre}, ` : ""}
                          {dia(m.at)}
                        </span>
                      </span>
                      <span>{formatoAjuste(m.monto)}</span>
                    </li>
                  ))}
                <li className={s.totalRenglon}>
                  <span>A pagar</span>
                  <span>{formatoMonedaMx(d.saldo.final)}</span>
                </li>
                {d.movimientos
                  .filter((m) => m.tipo === "pago")
                  .map((m) => (
                    <li key={m.id}>
                      <span>
                        {etiquetaFormaPago(m.forma)}
                        <span className={s.meta}>
                          {m.fecha ? diaLargo(m.fecha) : ""}
                          {m.autorNombre ? `, la registró ${m.autorNombre}` : ""}
                        </span>
                        {m.conComprobante && m.registroId ? (
                          <Button
                            size="sm"
                            variant="link"
                            onClick={() =>
                              abrirComprobante(token, m.registroId!).catch((e) =>
                                toast.error(formatApiError(e, "No se pudo abrir el comprobante.")),
                              )
                            }
                          >
                            Ver comprobante
                          </Button>
                        ) : null}
                      </span>
                      <span>{formatoMonedaMx(-m.monto)}</span>
                    </li>
                  ))}
              </ul>
              {d.extraPendienteMin > 0 ? (
                <p className={s.nota}>
                  Quedan {minutosAHorasTexto(d.extraPendienteMin)} extra sin autorizar; no se pagan hasta que su jefe decida.
                </p>
              ) : null}
            </>
          ) : activa === "ajustar" ? (
            <>
              <Field label="Cuánto sumar o restar" hint="Con signo menos para restar">
                <Input inputMode="text" value={ajuste} iconStart="$" placeholder="150.00" onChange={(e) => setAjuste(e.target.value)} />
              </Field>
              <Field label="Motivo">
                <Input value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
              </Field>
              <p className={s.nota}>No borra lo anterior: queda como un movimiento con tu nombre.</p>
            </>
          ) : (
            <>
              <Field label="Monto">
                <Input inputMode="decimal" value={monto} iconStart="$" onChange={(e) => setMonto(e.target.value)} />
              </Field>
              <Field label="Forma">
                <Select value={forma} onChange={(e) => setForma(e.target.value as FormaPagoNomina)}>
                  {FORMAS_PAGO_NOMINA.map((f) => (
                    <option key={f} value={f}>
                      {etiquetaFormaPago(f)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha">
                <DateInput value={fecha} max={hoyMx()} onChange={(e) => setFecha(e.target.value)} />
              </Field>
              <div>
                <label className={s.etiqueta} htmlFor={archivoId}>
                  Comprobante (opcional, PDF o imagen)
                </label>
                <input
                  id={archivoId}
                  className={s.archivo}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > COMPROBANTE_MAX) {
                      setError("El comprobante pesa más de 10 MB.");
                      e.target.value = "";
                      setArchivo(null);
                      return;
                    }
                    setError(null);
                    setArchivo(f);
                  }}
                />
              </div>
              <p className={s.nota}>Solo dirección registra pagos. Puedes pagar una parte. Al completar se marca «Pagado» en la lista y se asienta su póliza.</p>
            </>
          )}
        </>
      )}
    </Cajon>
  );
}
