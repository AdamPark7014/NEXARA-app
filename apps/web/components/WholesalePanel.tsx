"use client";

/**
 * NEXARA · Compras a mayorista
 * -----------------------------
 * El organigrama nombra "Compras con Mayorista" como función propia de
 * Administración, pero el sistema trataba igual al mayorista con convenio y al
 * proveedor de una sola compra: un precio único, sin crédito pactado ni
 * escalones por volumen.
 *
 * Aquí se ven las condiciones, se editan los escalones y —lo importante— se
 * simula la compra antes de emitir la orden: qué precio toca por volumen,
 * cuánto se ahorra contra lista y si cabe en el crédito.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import { toast } from "@/components/Toast";
import {
  PRICE_ORIGIN_LABEL,
  deactivatePriceBreak,
  getWholesaleTerms,
  listPriceBreaks,
  listWholesalers,
  money,
  quoteWholesale,
  updateWholesaleTerms,
  upsertPriceBreak,
  type PriceBreakRow,
  type WholesaleQuote,
  type WholesaleTerms,
  type WholesalerRow,
} from "@/lib/wholesale-api";

const inp: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--surface)",
  color: "var(--foreground)",
  fontSize: 12.5,
  boxSizing: "border-box",
};

const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--muted-foreground)",
  marginBottom: 4,
};

const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "7px 8px" };

type SimLine = { productId: string; quantity: string; listPrice: string };

export default function WholesalePanel({
  token,
  canManage,
}: {
  token: string;
  canManage: boolean;
}) {
  const [mayoristas, setMayoristas] = useState<WholesalerRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seleccionado, setSeleccionado] = useState<WholesaleTerms | null>(null);
  const [escalones, setEscalones] = useState<PriceBreakRow[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setMayoristas(await listWholesalers(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los mayoristas");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrir = async (supplierId: number) => {
    setCargandoDetalle(true);
    try {
      const [terms, breaks] = await Promise.all([
        getWholesaleTerms(token, supplierId),
        listPriceBreaks(token, supplierId),
      ]);
      setSeleccionado(terms);
      setEscalones(breaks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir el proveedor");
    } finally {
      setCargandoDetalle(false);
    }
  };

  const refrescarDetalle = async () => {
    if (seleccionado) await abrir(seleccionado.supplierId);
    await cargar();
  };

  // ── Condiciones ─────────────────────────────────────────────────────────

  const [guardandoTerms, setGuardandoTerms] = useState(false);
  const [terms, setTerms] = useState({
    creditoDias: "",
    limiteCredito: "",
    descuentoBase: "",
    leadTimeDias: "",
    pedidoMinimo: "",
  });

  useEffect(() => {
    if (!seleccionado) return;
    setTerms({
      creditoDias: seleccionado.creditoDias?.toString() ?? "",
      limiteCredito: seleccionado.limiteCredito?.toString() ?? "",
      descuentoBase: seleccionado.descuentoBase?.toString() ?? "",
      leadTimeDias: seleccionado.leadTimeDias?.toString() ?? "",
      pedidoMinimo: seleccionado.pedidoMinimo?.toString() ?? "",
    });
  }, [seleccionado]);

  const guardarTerms = async () => {
    if (!seleccionado) return;
    setGuardandoTerms(true);
    try {
      // Un campo vacío significa "sin condición pactada", no cero: enviar 0
      // convertiría "no hay límite" en "límite de cero pesos".
      const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
      const actualizado = await updateWholesaleTerms(token, seleccionado.supplierId, {
        esMayorista: true,
        creditoDias: numOrNull(terms.creditoDias),
        limiteCredito: numOrNull(terms.limiteCredito),
        descuentoBase: numOrNull(terms.descuentoBase),
        leadTimeDias: numOrNull(terms.leadTimeDias),
        pedidoMinimo: numOrNull(terms.pedidoMinimo),
      });
      setSeleccionado(actualizado);
      await cargar();
      toast.success("Condiciones guardadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardandoTerms(false);
    }
  };

  // ── Escalones ───────────────────────────────────────────────────────────

  const [nuevoEscalon, setNuevoEscalon] = useState({
    productId: "",
    cantidadMinima: "",
    unitPrice: "",
    vigenteHasta: "",
  });
  const [guardandoEscalon, setGuardandoEscalon] = useState(false);

  const guardarEscalon = async () => {
    if (!seleccionado) return;
    setGuardandoEscalon(true);
    try {
      await upsertPriceBreak(token, seleccionado.supplierId, {
        productId: Number(nuevoEscalon.productId),
        cantidadMinima: Number(nuevoEscalon.cantidadMinima),
        unitPrice: Number(nuevoEscalon.unitPrice),
        vigenteHasta: nuevoEscalon.vigenteHasta || null,
      });
      setNuevoEscalon({ productId: "", cantidadMinima: "", unitPrice: "", vigenteHasta: "" });
      await refrescarDetalle();
      toast.success("Escalón guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el escalón");
    } finally {
      setGuardandoEscalon(false);
    }
  };

  const retirarEscalon = async (id: number) => {
    if (!seleccionado) return;
    try {
      await deactivatePriceBreak(token, seleccionado.supplierId, id);
      await refrescarDetalle();
      toast.success("Escalón retirado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo retirar");
    }
  };

  // ── Simulación de compra ────────────────────────────────────────────────

  const [simLineas, setSimLineas] = useState<SimLine[]>([
    { productId: "", quantity: "", listPrice: "" },
  ]);
  const [cotizacion, setCotizacion] = useState<WholesaleQuote | null>(null);
  const [simulando, setSimulando] = useState(false);

  const simular = async () => {
    if (!seleccionado) return;
    const items = simLineas
      .filter((l) => l.productId.trim() && Number(l.quantity) > 0)
      .map((l) => ({
        productId: Number(l.productId),
        quantity: Number(l.quantity),
        listPrice: l.listPrice.trim() ? Number(l.listPrice) : undefined,
      }));
    if (items.length === 0) {
      toast.warning("Agrega al menos una partida con producto y cantidad");
      return;
    }
    setSimulando(true);
    try {
      setCotizacion(await quoteWholesale(token, seleccionado.supplierId, items));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo simular");
    } finally {
      setSimulando(false);
    }
  };

  const totalCredito = useMemo(
    () => mayoristas.reduce((s, m) => s + (m.credito?.saldo ?? 0), 0),
    [mayoristas],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <Section title="Cargando mayoristas…">
        <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Un momento.</p>
      </Section>
    );
  }

  return (
    <>
      {error && <InlineAlert message={error} onDismiss={() => setError(null)} />}

      <Section
        title={`${mayoristas.length} mayoristas`}
        subtitle={
          mayoristas.length > 0
            ? `Saldo total por pagar: ${money(totalCredito)}`
            : undefined
        }
      >
        {mayoristas.length === 0 ? (
          <EmptyState
            icon="🏭"
            title="Ningún proveedor marcado como mayorista"
            description="Abre un proveedor desde una orden de compra y guarda sus condiciones de convenio: crédito, descuento, tiempo de entrega y pedido mínimo. A partir de ahí aparecerá aquí."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                  <th style={th}>Proveedor</th>
                  <th style={th}>Crédito</th>
                  <th style={{ ...th, textAlign: "right" }}>Saldo</th>
                  <th style={{ ...th, textAlign: "right" }}>Disponible</th>
                  <th style={{ ...th, textAlign: "right" }}>Descuento</th>
                  <th style={{ ...th, textAlign: "right" }}>Entrega</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {mayoristas.map((m) => {
                  const sinLimite = m.credito?.limite == null;
                  const apretado =
                    !sinLimite &&
                    m.credito.disponible != null &&
                    m.credito.limite != null &&
                    m.credito.disponible < m.credito.limite * 0.15;
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>
                        <strong>{m.nombre}</strong>
                        {m.rfc && (
                          <span style={{ color: "var(--muted-foreground)" }}> · {m.rfc}</span>
                        )}
                      </td>
                      <td style={td}>
                        {m.creditoDias ? `${m.creditoDias} días` : "Contado"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{money(m.credito?.saldo)}</td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          color: apretado ? "#b91c1c" : undefined,
                          fontWeight: apretado ? 700 : undefined,
                        }}
                      >
                        {sinLimite ? "sin límite" : money(m.credito.disponible)}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {m.descuentoBase ? `${m.descuentoBase}%` : "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {m.leadTimeDias ? `${m.leadTimeDias} d` : "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <Button size="sm" variant="secondary" onClick={() => abrir(m.id)}>
                          Abrir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Modal
        open={Boolean(seleccionado)}
        onClose={() => {
          setSeleccionado(null);
          setCotizacion(null);
        }}
        title={seleccionado?.nombre ?? "Mayorista"}
        maxWidth={780}
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setSeleccionado(null);
              setCotizacion(null);
            }}
          >
            Cerrar
          </Button>
        }
      >
        {cargandoDetalle || !seleccionado ? (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Cargando…</p>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            {/* Condiciones */}
            <div>
              <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13 }}>
                Condiciones de convenio
              </p>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}>
                <div>
                  <span style={lbl}>Días de crédito</span>
                  <input
                    type="number"
                    min={0}
                    value={terms.creditoDias}
                    onChange={(e) => setTerms({ ...terms, creditoDias: e.target.value })}
                    disabled={!canManage}
                    placeholder="Contado"
                    style={inp}
                  />
                </div>
                <div>
                  <span style={lbl}>Límite de crédito</span>
                  <input
                    type="number"
                    min={0}
                    value={terms.limiteCredito}
                    onChange={(e) => setTerms({ ...terms, limiteCredito: e.target.value })}
                    disabled={!canManage}
                    placeholder="Sin límite"
                    style={inp}
                  />
                </div>
                <div>
                  <span style={lbl}>Descuento base %</span>
                  <input
                    type="number"
                    min={0}
                    max={99.99}
                    step={0.01}
                    value={terms.descuentoBase}
                    onChange={(e) => setTerms({ ...terms, descuentoBase: e.target.value })}
                    disabled={!canManage}
                    style={inp}
                  />
                </div>
                <div>
                  <span style={lbl}>Entrega (días)</span>
                  <input
                    type="number"
                    min={0}
                    value={terms.leadTimeDias}
                    onChange={(e) => setTerms({ ...terms, leadTimeDias: e.target.value })}
                    disabled={!canManage}
                    style={inp}
                  />
                </div>
                <div>
                  <span style={lbl}>Pedido mínimo</span>
                  <input
                    type="number"
                    min={0}
                    value={terms.pedidoMinimo}
                    onChange={(e) => setTerms({ ...terms, pedidoMinimo: e.target.value })}
                    disabled={!canManage}
                    style={inp}
                  />
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", margin: "8px 0 0" }}>
                Dejar un campo vacío significa <em>sin condición pactada</em>, no cero.
                El crédito <strong>avisa</strong> al comprar; no bloquea la orden.
              </p>
              {canManage && (
                <div style={{ marginTop: 10 }}>
                  <Button size="sm" onClick={guardarTerms} loading={guardandoTerms}>
                    Guardar condiciones
                  </Button>
                </div>
              )}
            </div>

            {/* Escalones */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13 }}>
                Escalones por volumen ({escalones.length})
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--muted-foreground)" }}>
                Al comprar gana el escalón más alto que la cantidad alcanza. El escalón
                sustituye al descuento base, no se le suma.
              </p>

              {escalones.length > 0 && (
                <div style={{ overflowX: "auto", marginBottom: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                        <th style={th}>Producto</th>
                        <th style={{ ...th, textAlign: "right" }}>Desde</th>
                        <th style={{ ...th, textAlign: "right" }}>Precio</th>
                        <th style={th}>Vigencia</th>
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {escalones.map((e) => (
                        <tr
                          key={e.id}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            opacity: e.activo ? 1 : 0.5,
                          }}
                        >
                          <td style={td}>
                            {e.product ? `${e.product.sku} — ${e.product.name}` : `#${e.productId}`}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>{Number(e.cantidadMinima)}</td>
                          <td style={{ ...td, textAlign: "right" }}>{money(e.unitPrice)}</td>
                          <td style={td}>
                            {e.vigenteHasta ? `hasta ${e.vigenteHasta.slice(0, 10)}` : "sin caducidad"}
                            {!e.activo && " · retirado"}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {canManage && e.activo && (
                              <Button size="sm" variant="ghost" onClick={() => retirarEscalon(e.id)}>
                                Retirar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canManage && (
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr 1fr auto", alignItems: "end" }}>
                  <div>
                    <span style={lbl}>Producto (ID)</span>
                    <input
                      value={nuevoEscalon.productId}
                      onChange={(e) => setNuevoEscalon({ ...nuevoEscalon, productId: e.target.value })}
                      style={inp}
                    />
                  </div>
                  <div>
                    <span style={lbl}>Desde (piezas)</span>
                    <input
                      type="number"
                      min={1}
                      value={nuevoEscalon.cantidadMinima}
                      onChange={(e) =>
                        setNuevoEscalon({ ...nuevoEscalon, cantidadMinima: e.target.value })
                      }
                      style={inp}
                    />
                  </div>
                  <div>
                    <span style={lbl}>Precio unitario</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={nuevoEscalon.unitPrice}
                      onChange={(e) => setNuevoEscalon({ ...nuevoEscalon, unitPrice: e.target.value })}
                      style={inp}
                    />
                  </div>
                  <div>
                    <span style={lbl}>Vigente hasta</span>
                    <input
                      type="date"
                      value={nuevoEscalon.vigenteHasta}
                      onChange={(e) =>
                        setNuevoEscalon({ ...nuevoEscalon, vigenteHasta: e.target.value })
                      }
                      style={inp}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={guardarEscalon}
                    loading={guardandoEscalon}
                    disabled={
                      !nuevoEscalon.productId ||
                      !nuevoEscalon.cantidadMinima ||
                      !nuevoEscalon.unitPrice
                    }
                  >
                    Guardar
                  </Button>
                </div>
              )}
            </div>

            {/* Simulación */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13 }}>
                Simular compra antes de emitir la orden
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--muted-foreground)" }}>
                Qué precio toca por volumen, cuánto se ahorra contra lista y si cabe en el crédito.
              </p>

              {simLineas.map((l, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr auto", marginBottom: 8 }}
                >
                  <input
                    placeholder="Producto (ID)"
                    value={l.productId}
                    onChange={(e) =>
                      setSimLineas((p) => p.map((x, j) => (i === j ? { ...x, productId: e.target.value } : x)))
                    }
                    style={inp}
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="Cantidad"
                    value={l.quantity}
                    onChange={(e) =>
                      setSimLineas((p) => p.map((x, j) => (i === j ? { ...x, quantity: e.target.value } : x)))
                    }
                    style={inp}
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Precio lista (opcional)"
                    value={l.listPrice}
                    onChange={(e) =>
                      setSimLineas((p) => p.map((x, j) => (i === j ? { ...x, listPrice: e.target.value } : x)))
                    }
                    style={inp}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSimLineas((p) => p.filter((_, j) => j !== i))}
                    disabled={simLineas.length === 1}
                  >
                    ✕
                  </Button>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setSimLineas((p) => [...p, { productId: "", quantity: "", listPrice: "" }])
                  }
                >
                  + Partida
                </Button>
                <Button size="sm" onClick={simular} loading={simulando}>
                  Simular
                </Button>
              </div>

              {cotizacion && (
                <div style={{ marginTop: 14 }}>
                  {cotizacion.avisos.map((a, i) => (
                    <InlineAlert key={i} message={a} variant="warning" />
                  ))}

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                          <th style={th}>Producto</th>
                          <th style={{ ...th, textAlign: "right" }}>Cant.</th>
                          <th style={{ ...th, textAlign: "right" }}>Lista</th>
                          <th style={{ ...th, textAlign: "right" }}>Aplicado</th>
                          <th style={th}>Origen</th>
                          <th style={{ ...th, textAlign: "right" }}>Importe</th>
                          <th style={{ ...th, textAlign: "right" }}>Ahorro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cotizacion.lineas.map((l) => (
                          <tr key={l.productId} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={td}>{l.sku ? `${l.sku} — ${l.nombre}` : `#${l.productId}`}</td>
                            <td style={{ ...td, textAlign: "right" }}>{l.cantidad}</td>
                            <td style={{ ...td, textAlign: "right" }}>{money(l.precioLista)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                              {money(l.unitPrice)}
                            </td>
                            <td style={{ ...td, fontSize: 11.5 }}>
                              {PRICE_ORIGIN_LABEL[l.origen]}
                              {l.cantidadMinima ? ` (≥${l.cantidadMinima})` : ""}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>{money(l.importe)}</td>
                            <td style={{ ...td, textAlign: "right", color: l.ahorroLinea > 0 ? "#15803d" : undefined }}>
                              {l.ahorroLinea > 0 ? money(l.ahorroLinea) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 10,
                      background: "var(--muted)",
                      display: "grid",
                      gap: 6,
                      fontSize: 12.5,
                    }}
                  >
                    <Fila etiqueta="Importe" valor={money(cotizacion.importe)} fuerte />
                    <Fila
                      etiqueta="Ahorro contra lista"
                      valor={cotizacion.ahorro > 0 ? money(cotizacion.ahorro) : "—"}
                    />
                    <Fila
                      etiqueta="Crédito disponible después"
                      valor={
                        cotizacion.credito.limite == null
                          ? "sin límite pactado"
                          : money((cotizacion.credito.disponible ?? 0) - cotizacion.importe)
                      }
                    />
                    {cotizacion.credito.creditoDias ? (
                      <Fila
                        etiqueta={`Vence a ${cotizacion.credito.creditoDias} días`}
                        valor={cotizacion.vencimientoEstimado.slice(0, 10)}
                      />
                    ) : null}
                    {cotizacion.leadTimeDias ? (
                      <Fila etiqueta="Entrega pactada" valor={`${cotizacion.leadTimeDias} días`} />
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{etiqueta}</span>
      <span style={{ fontWeight: fuerte ? 700 : 500 }}>{valor}</span>
    </div>
  );
}
