"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { triggerFileDownload } from "@/lib/file-download";
import { smartQuoteSearch, type SmartOffer } from "@/lib/smart-quote-api";
import {
  ESTADO_TONO,
  GRUPOS_PARTIDA,
  GRUPO_LABEL,
  SEGMENTOS,
  SEGMENTO_LABEL,
  actualizarCotizacion,
  aprobarCotizacion,
  aplicarPaquete,
  enviarCotizacion,
  formatoFecha,
  formatoMoneda,
  listarPaquetes,
  marcarRevisada,
  obtenerCotizacion,
  quitarPlano,
  rechazarCotizacion,
  subirPlano,
  urlPdfCotizacion,
  versionesDeCotizacion,
  type BloqueAlcance,
  type CotizacionDetalle,
  type EstadoCotizacion,
  type GrupoPartida,
  type PaqueteCotizacion,
  type PartidaCotizacion,
  type Segmento,
  type VersionCotizacion,
} from "@/lib/cotizaciones-api";
import styles from "../cotizaciones-core.module.css";

function chipClase(estado: EstadoCotizacion) {
  const tono = ESTADO_TONO[estado];
  if (tono === "info") return `${styles.chip} ${styles.chipInfo}`;
  if (tono === "ok") return `${styles.chip} ${styles.chipOk}`;
  if (tono === "alerta") return `${styles.chip} ${styles.chipAlerta}`;
  return styles.chip;
}

const partidaVacia = (): PartidaCotizacion => ({
  name: "",
  unit: "Pieza",
  qty: 1,
  unitPrice: 0,
  discount: 0,
  tax: 16,
});

function importeDeLinea(p: PartidaCotizacion) {
  const base = Number(p.qty || 0) * Number(p.unitPrice || 0) +
    Number(p.laborHours || 0) * Number(p.laborRate || 0);
  const conDescuento = base - base * (Number(p.discount || 0) / 100);
  return conDescuento;
}

export default function CotizacionDetallePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { token } = useUser();

  const [cot, setCot] = useState<CotizacionDetalle | null>(null);
  const [partidas, setPartidas] = useState<PartidaCotizacion[]>([]);
  const [versiones, setVersiones] = useState<VersionCotizacion[]>([]);
  const [paquetes, setPaquetes] = useState<PaqueteCotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Cabecera editable
  const [segmento, setSegmento] = useState<Segmento>("COMERCIAL");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [depositPercent, setDepositPercent] = useState(50);

  // Envío
  const [emailDestino, setEmailDestino] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Alcance y anexos
  const [bloques, setBloques] = useState<BloqueAlcance[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  // Catálogo
  const [busqueda, setBusqueda] = useState("");
  const [ofertas, setOfertas] = useState<SmartOffer[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [catalogoDisponible, setCatalogoDisponible] = useState(true);

  const cargar = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    setCargando(true);
    setError(null);
    try {
      const detalle = await obtenerCotizacion(token, id);
      setCot(detalle);
      setPartidas(
        (detalle.items ?? []).map((p) => ({
          ...p,
          qty: Number(p.qty || 0),
          unitPrice: Number(p.unitPrice || 0),
          discount: Number(p.discount || 0),
          tax: Number(p.tax ?? 16),
          laborHours: Number(p.laborHours || 0),
          laborRate: Number(p.laborRate || 0),
        })),
      );
      setBloques(Array.isArray(detalle.alcanceBloques) ? detalle.alcanceBloques : []);
      setSegmento(detalle.segmento);
      setClientName(detalle.clientName ?? "");
      setClientEmail(detalle.clientEmail ?? "");
      setEmailDestino(detalle.clientEmail ?? "");
      setProjectName(detalle.projectName ?? "");
      setObjetivo(detalle.objetivo ?? "");
      setValidUntil(detalle.validUntil ? String(detalle.validUntil).slice(0, 10) : "");
      setDepositPercent(Number(detalle.depositPercent ?? 50));
      setVersiones(await versionesDeCotizacion(token, id).catch(() => []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la cotización");
    } finally {
      setCargando(false);
    }
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    listarPaquetes(token)
      .then((rows) => vivo && setPaquetes(rows))
      .catch(() => vivo && setPaquetes([]));
    return () => {
      vivo = false;
    };
  }, [token]);

  const bloqueada = cot?.bloqueada ?? false;

  const totales = useMemo(() => {
    const porGrupo: Record<GrupoPartida, number> = { EQUIPOS: 0, MATERIALES: 0, MANO_DE_OBRA: 0 };
    let subtotal = 0;
    let iva = 0;
    for (const p of partidas) {
      const linea = importeDeLinea(p);
      subtotal += linea;
      iva += linea * (Number(p.tax ?? 0) / 100);
      const grupo = (p.grupo as GrupoPartida) || "EQUIPOS";
      porGrupo[grupo] = (porGrupo[grupo] ?? 0) + linea;
    }
    return { porGrupo, subtotal, iva, total: subtotal + iva };
  }, [partidas]);

  const cambiarPartida = (indice: number, cambios: Partial<PartidaCotizacion>) => {
    setPartidas((prev) => prev.map((p, i) => (i === indice ? { ...p, ...cambios } : p)));
  };

  async function buscarEnCatalogo() {
    if (!token || !busqueda.trim()) return;
    setBuscando(true);
    try {
      const res = await smartQuoteSearch(token, { q: busqueda.trim(), take: 8 });
      setOfertas(res.data ?? []);
      setCatalogoDisponible(true);
    } catch {
      // Sin catálogo conectado se cotiza con líneas libres, que es lo que se hace hoy.
      setCatalogoDisponible(false);
      setOfertas([]);
    } finally {
      setBuscando(false);
    }
  }

  function agregarDeCatalogo(oferta: SmartOffer) {
    setPartidas((prev) => [
      ...prev,
      {
        name: oferta.nombre || oferta.clave || "Concepto",
        description: oferta.descripcion ?? null,
        unit: "Pieza",
        qty: 1,
        unitPrice: Number(oferta.sellPriceSuggested || oferta.precio || 0),
        discount: 0,
        tax: 16,
        grupo: "EQUIPOS",
      },
    ]);
  }

  async function guardar() {
    if (!token || !cot) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      await actualizarCotizacion(token, cot.id, {
        segmento,
        alcanceBloques: bloques,
        clientName: clientName.trim() || null,
        clientEmail: clientEmail.trim() || null,
        projectName: projectName.trim() || null,
        objetivo: objetivo.trim() || null,
        validUntil: validUntil || undefined,
        depositPercent,
        items: partidas
          .filter((p) => p.name.trim())
          .map((p) => ({
            ...p,
            qty: Math.max(1, Number(p.qty || 1)),
            unitPrice: Number(p.unitPrice || 0),
            discount: Number(p.discount || 0),
            tax: Number(p.tax ?? 16),
          })),
      });
      setAviso("Guardada.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function enviar() {
    if (!token || !cot || !emailDestino.trim()) return;
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const enviada = await enviarCotizacion(token, cot.id, {
        email: emailDestino.trim(),
        message: mensaje.trim() || undefined,
      });
      setAviso(`Enviada como ${enviada.quoteNumber}.`);
      setMensaje("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setEnviando(false);
    }
  }

  async function descargarPdf() {
    if (!cot) return;
    await triggerFileDownload(urlPdfCotizacion(cot.id), `${cot.folio}.pdf`, {
      authToken: token ?? undefined,
      mimeType: "application/pdf",
    });
  }

  async function usarPaquete(clave: string, cantidad: number) {
    if (!token || !cot || cantidad < 1) return;
    setError(null);
    try {
      await aplicarPaquete(token, cot.id, { clave, cantidad });
      await cargar();
      setAviso("Paquete agregado: partidas y alcance actualizados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar el paquete");
    }
  }

  if (cargando) return <p className={styles.sub}>Cargando…</p>;
  if (!cot) {
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>{error ?? "Cotización no encontrada"}</p>
        <Link className={styles.secondaryBtn} href="/erp/cotizaciones">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.title}>{cot.folio}</h1>
          <p className={styles.sub}>
            {cot.segmentoEtiqueta} · {formatoFecha(cot.issueDate)}
            {cot.validUntil ? ` · vence ${formatoFecha(cot.validUntil)}` : ""}
            {cot.revision > 1 ? ` · revisión ${cot.revision}` : ""}
          </p>
        </div>
        <span className={chipClase(cot.estado)}>{cot.estadoEtiqueta}</span>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {aviso ? <p className={styles.ok}>{aviso}</p> : null}

      {bloqueada ? (
        <p className={styles.sub}>
          Esta cotización ya salió al cliente: está bloqueada. Al editarla se guarda la versión
          enviada y vuelve a borrador para salir después como revisión.
        </p>
      ) : null}

      {cot.rejectedReason ? (
        <p className={styles.error}>
          Rechazada{cot.rejectedByName ? ` por ${cot.rejectedByName}` : ""}: {cot.rejectedReason}
        </p>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Datos</h2>
        <div>
          <span className={styles.fieldLabel}>Segmento</span>
          <div className={styles.filters}>
            {SEGMENTOS.map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.filterBtn} ${segmento === s ? styles.filterBtnOn : ""}`}
                onClick={() => setSegmento(s)}
              >
                {SEGMENTO_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.grid2}>
          <div>
            <label className={styles.fieldLabel} htmlFor="cliente">
              Cliente
            </label>
            <input
              id="cliente"
              className={styles.input}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="correo">
              Correo del cliente
            </label>
            <input
              id="correo"
              className={styles.input}
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.grid3}>
          <div>
            <label className={styles.fieldLabel} htmlFor="proyecto">
              Proyecto
            </label>
            <input
              id="proyecto"
              className={styles.input}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="vigencia">
              Vigencia
            </label>
            <input
              id="vigencia"
              className={styles.input}
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="anticipo">
              Anticipo (%)
            </label>
            <input
              id="anticipo"
              className={styles.input}
              type="number"
              min={0}
              max={100}
              value={depositPercent}
              onChange={(e) => setDepositPercent(Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="objetivo">
            01 Objetivo del proyecto
          </label>
          <textarea
            id="objetivo"
            className={styles.textarea}
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Qué gana el cliente con este proyecto, con las cifras de la cotización."
          />
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>02 Alcance</h2>
        <p className={styles.sub}>
          Bloques reutilizables. Los paquetes que agregues abajo escriben el suyo con la cantidad
          cotizada, para que el texto y la tabla digan lo mismo.
        </p>

        {bloques.map((bloque, i) => (
          <div key={bloque.clave || `bloque-${i}`} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className={styles.input}
                value={bloque.titulo}
                onChange={(e) =>
                  setBloques((prev) =>
                    prev.map((b, j) => (j === i ? { ...b, titulo: e.target.value } : b)),
                  )
                }
                placeholder="Título del bloque"
              />
              <button
                type="button"
                className={styles.filterBtn}
                aria-label="Quitar bloque"
                onClick={() => setBloques((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <textarea
              className={styles.textarea}
              value={bloque.texto ?? ""}
              onChange={(e) =>
                setBloques((prev) => prev.map((b, j) => (j === i ? { ...b, texto: e.target.value } : b)))
              }
              placeholder="Qué se hace en este bloque, con sus parámetros."
            />
          </div>
        ))}

        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() =>
            setBloques((prev) => [
              ...prev,
              { clave: `libre-${Date.now()}`, titulo: "", texto: "" },
            ])
          }
        >
          Agregar bloque de alcance
        </button>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>03 Planos y anexos</h2>
        {cot.planos?.length ? (
          <div className={styles.planos}>
            {cot.planos.map((p) => (
              <div key={p.url} className={styles.plano}>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.tipo === "pdf" ? (
                    <span className={styles.planoImg} style={{ display: "grid", placeItems: "center" }}>
                      PDF
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.planoImg} src={p.url} alt={p.nombre ?? "Plano"} />
                  )}
                </a>
                <span>{p.nombre ?? "Anexo"}</span>
                {p.origen === "actividad" ? (
                  <span className={styles.chip}>Del levantamiento</span>
                ) : (
                  <button
                    type="button"
                    className={styles.filterBtn}
                    disabled={bloqueada}
                    onClick={async () => {
                      if (!token) return;
                      try {
                        await quitarPlano(token, cot.id, p.url);
                        await cargar();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "No se pudo quitar");
                      }
                    }}
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.sub}>
            Sin anexos. Si la cotización está ligada a una actividad comercial, las fotos del
            levantamiento entran aquí solas.
          </p>
        )}

        <label className={styles.fieldLabel} htmlFor="plano">
          Subir plano o anexo (imagen o PDF)
        </label>
        <input
          id="plano"
          type="file"
          accept="image/*,application/pdf"
          disabled={bloqueada || subiendo}
          onChange={async (e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            if (!archivo || !token) return;
            setSubiendo(true);
            setError(null);
            try {
              await subirPlano(token, cot.id, archivo);
              await cargar();
              setAviso("Anexo agregado.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo subir el anexo");
            } finally {
              setSubiendo(false);
            }
          }}
        />
        {cot.actividades?.length ? (
          <p className={styles.sub}>
            Actividad ligada:{" "}
            {cot.actividades.map((a) => (
              <Link key={a.id} href={`/erp/actividades/${a.id}`} style={{ marginRight: 8 }}>
                {a.anNumber || `#${a.id}`}
              </Link>
            ))}
          </p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>04 Cotización</h2>

        {paquetes.length ? (
          <div className={styles.filters}>
            {paquetes.map((paquete) => (
              <button
                key={paquete.clave}
                type="button"
                className={styles.filterBtn}
                title={paquete.descripcion}
                disabled={bloqueada}
                onClick={() => {
                  const cantidad = Number(
                    window.prompt(`¿Cuántos «${paquete.titulo}»?`, "1") ?? "0",
                  );
                  if (cantidad > 0) void usarPaquete(paquete.clave, cantidad);
                }}
              >
                + {paquete.titulo}
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void buscarEnCatalogo();
            }}
            placeholder="Buscar en catálogo (cámara, DVR, cable…)"
          />
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void buscarEnCatalogo()}
            disabled={buscando}
          >
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>
        {!catalogoDisponible ? (
          <p className={styles.sub}>
            El catálogo no respondió: captura las partidas como líneas libres.
          </p>
        ) : null}
        {ofertas.length ? (
          <div className={styles.list}>
            {ofertas.map((o) => (
              <button
                key={o.id}
                type="button"
                className={styles.row}
                style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                onClick={() => agregarDeCatalogo(o)}
              >
                <span className={styles.folio}>{o.nombre ?? o.clave}</span>
                <span className={styles.rowSub}>{o.marca ?? ""}</span>
                <span className={styles.chip}>{o.stockTotal > 0 ? "En stock" : "Sobre pedido"}</span>
                <span className={styles.importe}>
                  {formatoMoneda(o.sellPriceSuggested || o.precio)}
                </span>
                <span className={styles.rowSub}>Agregar</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.partidaHead}>
          <span>Descripción</span>
          <span>Grupo</span>
          <span>Cantidad</span>
          <span>Precio</span>
          <span>Total</span>
          <span />
        </div>

        {partidas.map((p, i) => (
          <div className={styles.partida} key={`${p.id ?? "nueva"}-${i}`}>
            <input
              className={styles.input}
              value={p.name}
              onChange={(e) => cambiarPartida(i, { name: e.target.value })}
              placeholder="Concepto"
            />
            <select
              className={styles.select}
              value={(p.grupo as string) ?? ""}
              onChange={(e) => cambiarPartida(i, { grupo: (e.target.value || null) as GrupoPartida })}
            >
              <option value="">Auto</option>
              {GRUPOS_PARTIDA.map((g) => (
                <option key={g} value={g}>
                  {GRUPO_LABEL[g]}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={p.qty}
              onChange={(e) => cambiarPartida(i, { qty: Number(e.target.value) })}
            />
            <input
              className={styles.input}
              type="number"
              min={0}
              step="0.01"
              value={p.unitPrice}
              onChange={(e) => cambiarPartida(i, { unitPrice: Number(e.target.value) })}
            />
            <span className={styles.importe}>{formatoMoneda(importeDeLinea(p))}</span>
            <button
              type="button"
              className={styles.filterBtn}
              aria-label="Quitar partida"
              onClick={() => setPartidas((prev) => prev.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => setPartidas((prev) => [...prev, partidaVacia()])}
        >
          Agregar partida
        </button>

        <div className={styles.totales}>
          {GRUPOS_PARTIDA.filter((g) => totales.porGrupo[g] > 0).map((g) => (
            <div className={styles.totalRow} key={g}>
              <span>{GRUPO_LABEL[g]}</span>
              <span>{formatoMoneda(totales.porGrupo[g])}</span>
            </div>
          ))}
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span>{formatoMoneda(totales.subtotal)}</span>
          </div>
          <div className={styles.totalRow}>
            <span>IVA</span>
            <span>{formatoMoneda(totales.iva)}</span>
          </div>
          <div className={styles.totalFuerte}>
            <span>Total</span>
            <span>{formatoMoneda(totales.total)}</span>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{cot.terminos.titulo}</h2>
        <p className={styles.sub}>
          {cot.incluyeInstalacion
            ? "Se cobra mano de obra: los términos dicen suministro e instalación."
            : "Sin partidas de mano de obra: solo suministro."}
        </p>
        <ul className={styles.terminos}>
          {cot.terminos.lineas.map((linea) => (
            <li key={linea}>{linea}</li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Enviar por correo</h2>
        <div className={styles.grid2}>
          <div>
            <label className={styles.fieldLabel} htmlFor="destino">
              Para
            </label>
            <input
              id="destino"
              className={styles.input}
              type="email"
              value={emailDestino}
              onChange={(e) => setEmailDestino(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="mensaje">
              Mensaje (opcional)
            </label>
            <textarea
              id="mensaje"
              className={styles.textarea}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Va dentro del correo, como texto."
            />
          </div>
        </div>
        <div className={styles.acciones}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void enviar()}
            disabled={enviando || !emailDestino.trim()}
          >
            {enviando ? "Enviando…" : "Enviar por correo"}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => void descargarPdf()}>
            Ver PDF
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void guardar()}
            disabled={guardando}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <div className={styles.acciones}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={async () => {
              if (!token) return;
              await marcarRevisada(token, cot.id).catch(() => undefined);
              await cargar();
            }}
          >
            Marcar revisada
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={async () => {
              if (!token) return;
              try {
                await aprobarCotizacion(token, cot.id);
                await cargar();
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo aprobar");
              }
            }}
          >
            Aprobar
          </button>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={async () => {
              if (!token) return;
              const motivo = window.prompt("¿Por qué se rechaza?") ?? "";
              if (motivo.trim().length < 5) return;
              try {
                await rechazarCotizacion(token, cot.id, motivo.trim());
                await cargar();
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo rechazar");
              }
            }}
          >
            Rechazar
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Quién intervino</h2>
        <ul className={styles.timeline}>
          {cot.participantes.map((p) => (
            <li className={styles.timelineItem} key={`${p.userId}-${p.rol}`}>
              <span className={styles.timelineRol}>{p.rolEtiqueta}</span>
              <span>
                {p.nombre} <span className={styles.chip}>{p.siglas}</span>
              </span>
              <span className={styles.rowSub}>{formatoFecha(p.at)}</span>
            </li>
          ))}
          {cot.participantes.length === 0 ? (
            <li className={styles.sub}>Todavía nadie más.</li>
          ) : null}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Versiones</h2>
        <ul className={styles.timeline}>
          {versiones.map((v) => (
            <li className={styles.timelineItem} key={v.version}>
              <span className={styles.timelineRol}>v{v.version}</span>
              <span>
                {v.folio ?? "—"} · {formatoMoneda(v.total)}
                {v.note ? ` · ${v.note}` : ""}
              </span>
              <span className={styles.rowSub}>
                {formatoFecha(v.at)}
                {v.por ? ` · ${v.por.nombre}` : ""}
              </span>
            </li>
          ))}
          {versiones.length === 0 ? (
            <li className={styles.sub}>Sin versiones: todavía no se ha editado después de enviar.</li>
          ) : null}
        </ul>
      </section>

      <Link className={styles.secondaryBtn} href="/erp/cotizaciones">
        Volver a la lista
      </Link>
    </div>
  );
}
