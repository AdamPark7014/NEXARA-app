"use client";

/**
 * Mesa contable · Preparar y timbrar un CFDI (maqueta aprobada `EmitirCfdi.dc.html`, 29-10-2026).
 *
 * Revisión del borrador antes de timbrar: cliente (solo lectura), comprobante (uso, método,
 * forma y vencimiento, que se guardan al cambiar), conceptos y totales; a la derecha lo que
 * falta antes de timbrar, la póliza que se registrará y qué pasa después.
 * Contrato: `GET /mesa/facturas/:id/revision`, `PATCH /accounting/invoices/:id`,
 * `POST /accounting/invoices/:id/stamp`, `GET /accounting/invoices/:id/pdf`.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { Alert, SkeletonRows } from "@/components/base";
import { saveBlob } from "@/components/finance/download";
import {
  Aviso,
  IcoNivel,
  MesaEncabezado,
  TablaPoliza,
  cx,
  m,
} from "@/components/mesa-contable/piezas";
import { formatApiError } from "@/lib/erp-api";
import {
  FORMAS_PAGO,
  METODOS_PAGO,
  RUTA_BANDEJA,
  USOS_CFDI,
  actualizarFactura,
  avisarCambioMesa,
  avisoTimbrado,
  descargarArchivo,
  diasEntre,
  dinero,
  esBorrador,
  etiquetaEstadoFactura,
  etiquetaIva,
  formaBloqueada,
  formaParaMetodo,
  getRevision,
  motivoNoTimbrar,
  opcionesCon,
  plural,
  rutaCliente,
  rutaPdfFactura,
  textoOrigenConceptos,
  timbrarFactura,
  type CambiosFactura,
  type RevisionFactura,
} from "@/lib/mesa-contable";
import { usePuedeAbrir } from "../../_arranque";

type Form = { uso: string; metodo: "PUE" | "PPD" | ""; forma: string; vence: string };

function formDe(r: RevisionFactura): Form {
  const f = r.factura;
  return {
    uso: f.cfdiUsage ?? "",
    metodo: f.satPaymentMethod ?? "",
    forma: f.satPaymentForm ?? "",
    vence: (f.dueDate ?? "").slice(0, 10),
  };
}

export default function PrepararCfdiPage({ params }: { params: { id: string } }) {
  const invoiceId = Number(params.id);
  const router = useRouter();
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";
  const puedeAbrir = usePuedeAbrir();

  const [rev, setRev] = useState<RevisionFactura | null>(null);
  const [form, setForm] = useState<Form>({ uso: "", metodo: "", forma: "", vence: "" });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: "success" | "danger" | "warning"; texto: string } | null>(null);
  const [timbrando, setTimbrando] = useState(false);
  const [abriendoPdf, setAbriendoPdf] = useState(false);
  const peticion = useRef(0);
  const idMotivo = useId();
  const idUso = useId();
  const idMetodo = useId();
  const idForma = useId();
  const idVence = useId();
  const ids = { uso: idUso, metodo: idMetodo, forma: idForma, vence: idVence };

  const cargar = useCallback(
    async (reiniciarForm = true) => {
      if (!token || !Number.isFinite(invoiceId)) return;
      const turno = ++peticion.current;
      setError(null);
      try {
        const r = await getRevision(token, invoiceId);
        if (turno !== peticion.current) return;
        setRev(r);
        if (reiniciarForm) setForm(formDe(r));
      } catch (e) {
        if (turno !== peticion.current) return;
        setError(formatApiError(e, "No se pudo abrir el borrador."));
      } finally {
        if (turno === peticion.current) setCargando(false);
      }
    },
    [token, invoiceId],
  );

  useEffect(() => {
    if (!isContextReady) return;
    if (!token) {
      setCargando(false);
      return;
    }
    if (!Number.isFinite(invoiceId)) {
      setCargando(false);
      setError("El enlace no trae una factura válida.");
      return;
    }
    void cargar();
  }, [isContextReady, token, invoiceId, cargar]);

  /** Guarda un cambio del comprobante y vuelve a pedir la revisión (cambia lo que falta y la póliza). */
  const guardar = useCallback(
    async (campo: string, cambios: CambiosFactura) => {
      if (!token) return false;
      setGuardando(campo);
      setAviso(null);
      try {
        await actualizarFactura(token, invoiceId, cambios);
        await cargar(false);
        return true;
      } catch (e) {
        setAviso({ tono: "danger", texto: `No se guardó el cambio. ${formatApiError(e, "El servidor no respondió.")}` });
        if (rev) setForm(formDe(rev));
        return false;
      } finally {
        setGuardando(null);
      }
    },
    [token, invoiceId, cargar, rev],
  );

  const cambiarUso = (uso: string) => {
    setForm((f) => ({ ...f, uso }));
    void guardar("uso", { cfdiUsage: uso });
  };

  const cambiarMetodo = (metodo: "PUE" | "PPD") => {
    const forma = formaParaMetodo(metodo, form.forma || null);
    setForm((f) => ({ ...f, metodo, forma: forma ?? "" }));
    const cambios: CambiosFactura = { satPaymentMethod: metodo };
    if (forma && forma !== form.forma) cambios.satPaymentForm = forma;
    void guardar("metodo", cambios);
  };

  const cambiarForma = (forma: string) => {
    setForm((f) => ({ ...f, forma }));
    void guardar("forma", { satPaymentForm: forma });
  };

  const confirmarVence = () => {
    if (!rev || !/^\d{4}-\d{2}-\d{2}$/.test(form.vence)) return;
    if (form.vence === (rev.factura.dueDate ?? "").slice(0, 10)) return;
    void guardar("vence", { dueDate: form.vence });
  };

  const guardarBorrador = async () => {
    const cambios: CambiosFactura = {};
    if (form.uso) cambios.cfdiUsage = form.uso;
    if (form.metodo) cambios.satPaymentMethod = form.metodo;
    if (form.forma) cambios.satPaymentForm = form.forma;
    if (/^\d{4}-\d{2}-\d{2}$/.test(form.vence)) cambios.dueDate = form.vence;
    const ok = await guardar("todo", cambios);
    if (ok) setAviso({ tono: "success", texto: "Borrador guardado. Sigue en «Por facturar» hasta que se timbre." });
  };

  const verPdf = async () => {
    if (!token) return;
    setAbriendoPdf(true);
    // La pestaña se abre en el clic (si no, el navegador la bloquea) y se llena al llegar el PDF.
    const pestana = window.open("", "_blank");
    try {
      const blob = await descargarArchivo(token, rutaPdfFactura(invoiceId));
      const url = URL.createObjectURL(blob);
      if (pestana) {
        pestana.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        URL.revokeObjectURL(url);
        saveBlob(blob, `factura-${rev?.factura.folio ?? invoiceId}.pdf`);
      }
    } catch (e) {
      pestana?.close();
      setAviso({ tono: "danger", texto: `No se pudo generar el PDF. ${formatApiError(e, "El servidor no devolvió el archivo.")}` });
    } finally {
      setAbriendoPdf(false);
    }
  };

  const timbrar = async () => {
    if (!token || !rev) return;
    setTimbrando(true);
    setAviso(null);
    try {
      await timbrarFactura(token, invoiceId);
      avisarCambioMesa();
      router.push(`${RUTA_BANDEJA}?timbrada=${encodeURIComponent(rev.factura.folio)}`);
    } catch (e) {
      setAviso({ tono: "danger", texto: `No se timbró. ${formatApiError(e, "El PAC no respondió; el borrador sigue igual.")}` });
      setTimbrando(false);
      void cargar(false);
    }
  };

  if (cargando || (!rev && !error)) {
    return (
      <div className={m.page}>
        <MesaEncabezado eyebrow={<Link href={RUTA_BANDEJA}>Por facturar</Link>} titulo="Factura" />
        <div className={cx(m.card, m.cardPad)}>
          <SkeletonRows rows={6} label="Cargando el borrador" />
        </div>
      </div>
    );
  }

  if (!rev) {
    return (
      <div className={m.page}>
        <MesaEncabezado eyebrow={<Link href={RUTA_BANDEJA}>Por facturar</Link>} titulo="Factura" />
        <Alert
          tone="danger"
          role="alert"
          title="No se pudo abrir el borrador."
          action={
            <span className={m.buttons}>
              <button type="button" className={cx(m.btn, m.btnRow)} onClick={() => void cargar()}>
                Reintentar
              </button>
              <Link href={RUTA_BANDEJA} className={cx(m.btn, m.btnRow)}>
                Volver a Por facturar
              </Link>
            </span>
          }
        >
          {error}
        </Alert>
      </div>
    );
  }

  const f = rev.factura;
  const rc = f.receptor;
  const editable = esBorrador(f.status);
  const motivo = editable ? motivoNoTimbrar(rev) : null;
  const avisoT = avisoTimbrado(rev.timbrado);
  const plazo = diasEntre(f.issueDate?.slice(0, 10), form.vence || f.dueDate?.slice(0, 10));
  const editarConceptos = f.editarConceptosHref || `/erp/invoicing/${f.id}`;
  const fichaCliente = rc.clienteId != null ? rutaCliente(rc.clienteId) : null;
  const puedeEditarCliente = fichaCliente != null && puedeAbrir(fichaCliente);
  const datosCompletos = Boolean(rc.nombre && rc.rfc && rc.regimen && rc.cp);
  const bloqueado = !editable || guardando != null || timbrando;

  const acciones = (
    <>
      <button type="button" className={m.btn} onClick={() => void verPdf()} disabled={abriendoPdf} aria-busy={abriendoPdf || undefined}>
        {abriendoPdf ? "Abriendo…" : "Ver PDF"}
      </button>
      {editable ? (
        <>
          <button
            type="button"
            className={m.btn}
            onClick={() => void guardarBorrador()}
            disabled={bloqueado}
            aria-busy={guardando === "todo" || undefined}
          >
            {guardando === "todo" ? "Guardando…" : "Guardar borrador"}
          </button>
          <button
            type="button"
            className={cx(m.btn, m.btnPrimary)}
            onClick={() => void timbrar()}
            disabled={!rev.puedeTimbrar || bloqueado}
            aria-busy={timbrando || undefined}
            aria-describedby={motivo ? idMotivo : undefined}
          >
            {timbrando ? "Timbrando…" : "Timbrar y enviar"}
          </button>
        </>
      ) : null}
      {motivo ? (
        <span id={idMotivo} className={m.reason} style={{ flexBasis: "100%", textAlign: "right", marginLeft: "auto" }} role="status">
          {motivo}
        </span>
      ) : null}
    </>
  );

  return (
    <div className={m.page}>
      <MesaEncabezado
        eyebrow={
          <>
            <Link href={RUTA_BANDEJA}>Por facturar</Link> · {rev.origen?.folio ?? f.folio}
          </>
        }
        titulo={`Factura para ${rc.nombre || "cliente sin razón social"}`}
        junto={
          <span className={m.pill}>
            {etiquetaEstadoFactura(f.status)} · {f.folio}
          </span>
        }
        acciones={acciones}
      />

      {avisoT && avisoT.tono === "warning" ? (
        <Aviso tono="warning" titulo={avisoT.titulo}>
          {avisoT.texto || null}
        </Aviso>
      ) : null}

      {aviso ? (
        <Alert tone={aviso.tono} role={aviso.tono === "danger" ? "alert" : "status"} onDismiss={() => setAviso(null)}>
          {aviso.texto}
        </Alert>
      ) : null}

      {!editable ? (
        <Aviso tono="info" titulo={`Esta factura ya está ${etiquetaEstadoFactura(f.status).toLowerCase()}.`}>
          Ya no se edita aquí{f.cfdiUuid ? ` · UUID ${f.cfdiUuid}` : ""}.
        </Aviso>
      ) : null}

      <div className={m.split}>
        <div className={m.splitMain} style={{ flex: "3 1 560px", display: "flex", flexDirection: "column", gap: 16 }}>
          <section aria-label="Receptor" className={cx(m.card, m.cardPad)}>
            <div className={m.cardTitleRow}>
              <h2 className={m.cardTitle}>Cliente</h2>
              {datosCompletos ? (
                <span className={m.meta} data-tinta="ok" data-fuerte="true">
                  Datos tomados de su constancia fiscal
                </span>
              ) : (
                <span className={m.meta} data-tinta="warning" data-fuerte="true">
                  Faltan datos fiscales del cliente
                </span>
              )}
              {puedeEditarCliente && fichaCliente ? (
                <Link href={fichaCliente} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600 }}>
                  Editar cliente
                </Link>
              ) : null}
            </div>
            <div className={m.facts}>
              <Dato etiqueta="Razón social" valor={rc.nombre} />
              <Dato etiqueta="RFC" valor={rc.rfc} />
              <Dato
                etiqueta="Régimen fiscal"
                valor={rc.regimen ? [rc.regimen, rc.regimenTexto].filter(Boolean).join(" · ") : null}
              />
              <Dato etiqueta="Código postal fiscal" valor={rc.cp} />
              <Dato etiqueta="Enviar a" valor={rc.correo} faltante="Sin correo: no se manda solo" />
              <div className={m.fact}>
                <span className={m.factLabel}>Origen</span>
                <span className={m.factValue}>
                  {rev.origen ? (
                    <>
                      {rev.origen.href ? <Link href={rev.origen.href}>{rev.origen.folio}</Link> : rev.origen.folio}
                      {rev.origen.extra ? <> · {rev.origen.extra}</> : null}
                    </>
                  ) : (
                    "Factura libre"
                  )}
                </span>
              </div>
            </div>
          </section>

          <section aria-label="Comprobante" className={cx(m.card, m.cardPad)}>
            <h2 className={m.cardTitle}>Comprobante</h2>
            <div className={m.fields}>
              <div className={m.field}>
                <label htmlFor={ids.uso}>Uso del CFDI</label>
                <select
                  id={ids.uso}
                  className={m.control}
                  value={form.uso}
                  disabled={bloqueado}
                  onChange={(e) => cambiarUso(e.target.value)}
                  aria-invalid={!form.uso || undefined}
                >
                  {!form.uso ? <option value="">Elige el uso</option> : null}
                  {opcionesCon(USOS_CFDI, form.uso).map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.texto}
                    </option>
                  ))}
                </select>
              </div>
              <div className={m.field}>
                <label htmlFor={ids.metodo}>Método de pago</label>
                <select
                  id={ids.metodo}
                  className={m.control}
                  value={form.metodo}
                  disabled={bloqueado}
                  onChange={(e) => cambiarMetodo(e.target.value as "PUE" | "PPD")}
                  aria-invalid={!form.metodo || undefined}
                >
                  {!form.metodo ? <option value="">Elige el método</option> : null}
                  {METODOS_PAGO.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.texto}
                    </option>
                  ))}
                </select>
              </div>
              <div className={m.field}>
                <label htmlFor={ids.forma}>Forma de pago</label>
                <select
                  id={ids.forma}
                  className={m.control}
                  value={form.forma}
                  disabled={bloqueado || formaBloqueada(form.metodo || null)}
                  onChange={(e) => cambiarForma(e.target.value)}
                  aria-invalid={!form.forma || undefined}
                  aria-describedby={formaBloqueada(form.metodo || null) ? `${ids.forma}-ppd` : undefined}
                >
                  {!form.forma ? <option value="">Elige la forma</option> : null}
                  {opcionesCon(FORMAS_PAGO, form.forma)
                    .filter((o) => form.metodo !== "PUE" || o.valor !== "99")
                    .map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.texto}
                      </option>
                    ))}
                </select>
                {formaBloqueada(form.metodo || null) ? (
                  <span id={`${ids.forma}-ppd`} className={m.fieldHint}>
                    Con PPD el SAT pide 99
                  </span>
                ) : null}
              </div>
              <div className={m.field}>
                <label htmlFor={ids.vence}>Vence</label>
                <span className={m.dateBox}>
                  <input
                    id={ids.vence}
                    type="date"
                    value={form.vence}
                    disabled={bloqueado}
                    onChange={(e) => setForm((x) => ({ ...x, vence: e.target.value }))}
                    onBlur={confirmarVence}
                    aria-describedby={plazo != null ? `${ids.vence}-plazo` : undefined}
                  />
                  {plazo != null ? (
                    <span id={`${ids.vence}-plazo`}>· {plural(plazo, "día")}</span>
                  ) : null}
                </span>
              </div>
            </div>
            <div className={m.metaLine}>
              <span>Tipo I · Ingreso{f.esAnticipo ? " · anticipo" : ""}</span>
              <span className={m.sep} aria-hidden="true">
                |
              </span>
              <span>{f.currency || "MXN"}</span>
              <span className={m.sep} aria-hidden="true">
                |
              </span>
              <span>
                {f.relacionados.length === 0
                  ? "Sin CFDI relacionado"
                  : f.relacionados.map((x) => `Relacionado (${x.tipo})${x.folio ? ` · ${x.folio}` : ""}`).join(" · ")}
              </span>
              {editable ? (
                <Link href={editarConceptos} style={{ fontWeight: 600 }}>
                  Relacionar anticipo o sustitución
                </Link>
              ) : null}
              {guardando && guardando !== "todo" ? <span role="status">Guardando…</span> : null}
            </div>
          </section>

          <section aria-label="Conceptos" className={m.card} style={{ overflowX: "auto" }}>
            <div className={m.cardTitleRow} style={{ padding: "16px 20px 6px" }}>
              <h2 className={m.cardTitle}>Conceptos</h2>
              <span className={m.meta}>{textoOrigenConceptos(rev.origen?.tipo)}</span>
              {editable ? (
                <Link href={editarConceptos} className={cx(m.btn, m.btnRow)} style={{ marginLeft: "auto", height: 34, padding: "0 12px" }}>
                  Editar conceptos
                </Link>
              ) : null}
            </div>
            <table className={cx(m.table, m.tableCompact)} style={{ minWidth: 720 }}>
              <caption className={m.srOnly}>Conceptos de la factura {f.folio}</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ paddingLeft: 20 }}>
                    Descripción
                  </th>
                  <th scope="col">Clave SAT</th>
                  <th scope="col">Unidad</th>
                  <th scope="col" className={m.r}>
                    Cant.
                  </th>
                  <th scope="col" className={m.r}>
                    Precio
                  </th>
                  <th scope="col" className={m.r}>
                    IVA
                  </th>
                  <th scope="col" className={m.r} style={{ paddingRight: 20 }}>
                    Importe
                  </th>
                </tr>
              </thead>
              <tbody>
                {f.conceptos.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ paddingLeft: 20 }} data-tinta="warning">
                      El borrador no tiene conceptos. Agrégalos con «Editar conceptos».
                    </td>
                  </tr>
                ) : (
                  f.conceptos.map((c) => (
                    <tr key={c.id}>
                      <td style={{ paddingLeft: 20 }}>{c.descripcion}</td>
                      <td>{c.claveSat ?? <span data-tinta="warning">Falta</span>}</td>
                      <td>{c.unidadClave ? [c.unidadClave, c.unidad].filter(Boolean).join(" · ") : <span data-tinta="warning">Falta</span>}</td>
                      <td className={m.r}>{c.cantidad.toLocaleString("es-MX")}</td>
                      <td className={m.r} data-tinta={c.precio <= 0 ? "warning" : undefined} data-fuerte={c.precio <= 0 ? "true" : undefined}>
                        {dinero(c.precio)}
                      </td>
                      <td className={m.r}>{c.ivaPct} %</td>
                      <td className={m.r} style={{ paddingRight: 20 }}>
                        {dinero(c.importe)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className={m.totals}>
              <dl>
                <dt>Subtotal</dt>
                <dd>{dinero(f.subtotal)}</dd>
                {f.descuento > 0 ? (
                  <>
                    <dt>Descuento</dt>
                    <dd>{dinero(-f.descuento)}</dd>
                  </>
                ) : null}
                <dt>{etiquetaIva(f.conceptos)}</dt>
                <dd>{dinero(f.iva)}</dd>
                {f.retenciones > 0 ? (
                  <>
                    <dt>Retenciones</dt>
                    <dd>{dinero(-f.retenciones)}</dd>
                  </>
                ) : null}
                <dt style={{ fontWeight: 600, color: "var(--ui-fg)" }}>Total</dt>
                <dd className={m.totalBig}>{dinero(f.total)}</dd>
              </dl>
            </div>
          </section>
        </div>

        <aside aria-label="Revisión antes de timbrar" className={m.splitAside}>
          <section className={cx(m.card, m.cardPad)} style={{ gap: 12 }}>
            <h2 className={m.cardTitle}>Antes de timbrar</h2>
            {rev.revisiones.length === 0 ? (
              <p className={m.note}>Sin observaciones.</p>
            ) : (
              <ul className={m.checks}>
                {rev.revisiones.map((x) => (
                  <li key={x.clave}>
                    <IcoNivel nivel={x.nivel} />
                    <span>
                      <span className={m.srOnly}>{x.nivel === "ok" ? "Correcto: " : x.nivel === "error" ? "Corregir: " : "Aviso: "}</span>
                      {x.texto}
                      {x.detalle ? (
                        <>
                          <br />
                          <span className={m.sub}>{x.detalle}</span>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cx(m.card, m.cardPad)} style={{ gap: 12 }}>
            <h2 className={m.cardTitle}>Póliza que se registra al timbrar</h2>
            {rev.poliza.length ? (
              <TablaPoliza lineas={rev.poliza} caption={`Póliza de ingreso de ${f.folio}`} />
            ) : (
              <p className={m.note}>La póliza se arma en cuanto el borrador tenga conceptos con precio.</p>
            )}
            {rev.notaPoliza ? (
              <span className={m.note} style={{ color: "var(--ui-fg-2)" }}>
                {rev.notaPoliza}
              </span>
            ) : null}
          </section>

          <section className={m.dashed} aria-label="Después de timbrar">
            <strong>Después de timbrar</strong>
            <span>
              El XML y el PDF se guardan en la factura y se mandan al cliente.{" "}
              {rev.origen ? `${rev.origen.folio} sale de la bandeja y queda «facturada».` : "La factura queda timbrada en Facturación."} Si el SAT deja una
              cancelación en trámite, se marca «cancelación pendiente», no «cancelada».
            </span>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, faltante = "Falta" }: { etiqueta: string; valor: string | null | undefined; faltante?: string }) {
  return (
    <div className={m.fact}>
      <span className={m.factLabel}>{etiqueta}</span>
      {valor ? (
        <span className={m.factValue}>{valor}</span>
      ) : (
        <span className={m.factValue} data-tinta="warning">
          {faltante}
        </span>
      )}
    </div>
  );
}
