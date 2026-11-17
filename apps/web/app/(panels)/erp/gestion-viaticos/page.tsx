"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { approveViatico } from "@/lib/viatics-api";
import {
  facturarTicket,
  fetchBandeja,
  fetchPorFacturar,
  revisarTicket,
  type BandejaResponse,
  type FilaBandeja,
  type TicketViatico,
} from "@/lib/gestion-viaticos-api";
import styles from "./gestion-viaticos.module.css";
import ExcelExportadorDinamico from "@/components/excel/ExcelExportadorDinamico";

type Vista = "bandeja" | "tickets" | "por-facturar" | "asignar";

const ETIQUETA: Record<string, string> = {
  ticket_hoy: "Vence hoy",
  comprobacion: "Comprobación",
  viatico: "Viático",
  vehiculo: "Vehículo",
  multa: "Multa",
  mantenimiento: "Mantenimiento",
  sin_responsable: "Sin responsable",
};

export default function GestionViaticosPage() {
  const { token, user } = useUser();
  const search = useSearchParams();
  const vistaUrl = search?.get("vista");
  const vistaIni = (search?.get("vista") as Vista | null) || "bandeja";
  const [vista, setVista] = useState<Vista>(
    vistaIni === "por-facturar" || vistaIni === "tickets" ? vistaIni : "bandeja",
  );
  const [bandeja, setBandeja] = useState<BandejaResponse | null>(null);
  const [porFacturar, setPorFacturar] = useState<TicketViatico[]>([]);
  const [puedeFacturar, setPuedeFacturar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<number, string>>({});
  const requestId = useRef(0);

  useEffect(() => {
    if (vistaUrl === "por-facturar" || vistaUrl === "tickets") setVista(vistaUrl);
  }, [vistaUrl]);

  const cargar = useCallback(async () => {
    if (!token) return;
    const req = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      if (vista === "por-facturar") {
        const data = await fetchPorFacturar(token);
        if (req === requestId.current) {
          setPorFacturar(data.items ?? []);
          setPuedeFacturar(data.puedeFacturarTickets === true);
        }
      } else {
        const data = await fetchBandeja(token);
        if (req === requestId.current) setBandeja(data);
      }
    } catch (e) {
      if (req === requestId.current) setError(formatApiError(e, "No se pudo cargar la mesa."));
    } finally {
      if (req === requestId.current) setLoading(false);
    }
  }, [token, vista]);

  useEffect(() => {
    void cargar();
    return () => { requestId.current++; };
  }, [cargar]);

  const filas = useMemo(() => {
    if (!bandeja?.items) return [] as FilaBandeja[];
    if (vista === "tickets") {
      return bandeja.items.filter((f) => f.clave.startsWith("ticket_"));
    }
    return bandeja.items;
  }, [bandeja, vista]);

  const actuar = async (fn: () => Promise<unknown>, mensaje: string) => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await fn();
      setOk(mensaje);
      await cargar();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Mesa de viáticos y vehículos</h1>
        <p className={styles.vacio}>Inicia sesión para ver tu bandeja.</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <p style={{ marginBottom: 8 }}>
        <a href="/erp/finance/viatics" style={{ fontWeight: 600 }}>
          Asignar anticipo / lote →
        </a>{" "}
        (Lizeth y dirección) · historial por persona/vehículo en finanzas.
      </p>
      <h1 className={styles.title}>Mesa de viáticos y vehículos</h1>
      {filas.length ? (
        <div style={{ marginBottom: 12 }}>
          <ExcelExportadorDinamico
            preferenciaKey="nx-excel-cols-gestion-viaticos"
            titulo="Mesa de viáticos"
            filename="gestion-viaticos"
            rows={filas.map((f) => ({
              fecha: String(f.createdAt ?? "").slice(0, 10),
              tipo: ETIQUETA[f.urgencia] ?? f.urgencia,
              titulo: f.titulo,
              resumen: f.resumen,
              monto: Number(f.monto ?? 0),
              urgencia: f.urgencia,
            }))}
            getFecha={(r) => r.fecha || null}
            getPersonaArea={(r) => `${r.titulo} ${r.resumen}`}
            estadoKey="urgencia"
            estados={Object.entries(ETIQUETA).map(([value, label]) => ({ value, label }))}
            columns={[
              { key: "fecha", label: "Fecha" },
              { key: "tipo", label: "Tipo" },
              { key: "titulo", label: "Título" },
              { key: "resumen", label: "Resumen" },
              { key: "monto", label: "Monto", tipo: "dinero" as const, total: "suma" as const },
              { key: "urgencia", label: "Urgencia" },
            ]}
            generadoPor={user?.nombre}
          />
        </div>
      ) : null}
      <p className={styles.lead}>
        Todo lo que llega a la gestora, ordenado por urgencia. Hola
        {user?.nombre ? `, ${user.nombre}` : ""}.
      </p>

      <div className={styles.tabs}>
        {(
          [
            ["bandeja", "Bandeja"],
            ["tickets", "Tickets por revisar"],
            ["por-facturar", "Por facturar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={vista === id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => {
              requestId.current++;
              setError(null);
              setOk(null);
              setVista(id);
            }}
          >
            {label}
            {id === "bandeja" && bandeja?.conteo?.total ? ` (${bandeja.conteo.total})` : ""}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
          <button type="button" className={styles.btn} disabled={loading} onClick={() => void cargar()}>Reintentar</button>
        </p>
      ) : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      {loading ? <p className={styles.resumen}>Cargando…</p> : null}
      {!loading && !error && vista !== "por-facturar" && bandeja?.avisoLimite ? <p className={styles.resumen}>{bandeja.avisoLimite}</p> : null}
      {!loading && !error && vista === "por-facturar" ? <p className={styles.resumen}>Se muestran hasta 200 tickets, empezando por los de vencimiento más próximo.</p> : null}

      {!loading && !error && vista !== "por-facturar" && filas.length === 0 ? (
        <div className={styles.vacio}>No hay nada pendiente en esta vista.</div>
      ) : null}

      {!loading && !error && vista !== "por-facturar" ? (
        <div className={styles.lista}>
          {filas.map((fila) => (
            <article key={fila.clave} className={styles.fila}>
              <div className={styles.filaHeader}>
                <strong>{fila.titulo}</strong>
                <span className={fila.venceHoy ? `${styles.badge} ${styles.badgeHoy}` : styles.badge}>
                  {ETIQUETA[fila.urgencia] ?? fila.urgencia}
                </span>
              </div>
              <p className={styles.resumen}>{fila.resumen}</p>
              {fila.fotoUrl ? <a href={fila.fotoUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.foto} src={fila.fotoUrl} alt="Abrir foto del ticket" />
              </a> : null}
              <div className={styles.acciones}>
                {fila.urgencia === "viatico" && fila.puedeRevisar ? (
                  <>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={busy}
                      onClick={() =>
                        actuar(
                          () => approveViatico(token, fila.entidadId, "approve"),
                          fila.accion.includes("Christian")
                            ? "Enviado a Christian."
                            : "Viático autorizado.",
                        )
                      }
                    >
                      {fila.accion}
                    </button>
                    <input
                      className={styles.motivo}
                      placeholder="Motivo si rechazas"
                      value={motivos[fila.entidadId] ?? ""}
                      onChange={(e) => setMotivos((m) => ({ ...m, [fila.entidadId]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnDanger}`}
                      disabled={busy}
                      onClick={() =>
                        actuar(
                          () =>
                            approveViatico(
                              token,
                              fila.entidadId,
                              "reject",
                              motivos[fila.entidadId] || "",
                            ),
                          "Viático rechazado.",
                        )
                      }
                    >
                      Rechazar
                    </button>
                  </>
                ) : null}

                {fila.clave.startsWith("ticket_pend") ? (
                  <>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={busy}
                      onClick={() =>
                        actuar(
                          () => revisarTicket(token, fila.entidadId, { accion: "aprobar" }),
                          "Ticket aprobado; pasó a la contadora.",
                        )
                      }
                    >
                      Aprobar ticket
                    </button>
                    <input
                      className={styles.motivo}
                      placeholder="Motivo del rechazo"
                      value={motivos[fila.entidadId] ?? ""}
                      onChange={(e) => setMotivos((m) => ({ ...m, [fila.entidadId]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnDanger}`}
                      disabled={busy}
                      onClick={() =>
                        actuar(
                          () =>
                            revisarTicket(token, fila.entidadId, {
                              accion: "rechazar",
                              motivo: motivos[fila.entidadId] || "",
                            }),
                          "Ticket rechazado.",
                        )
                      }
                    >
                      Rechazar ticket
                    </button>
                  </>
                ) : null}

                <Link className={styles.btn} href={fila.href}>
                  Abrir detalle
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && !error && vista === "por-facturar" && porFacturar.length === 0 ? (
        <div className={styles.vacio}>No hay tickets por facturar.</div>
      ) : null}

      {!loading && !error && vista === "por-facturar" ? (
        <div className={styles.lista}>
          {porFacturar.map((t) => (
            <article key={t.id} className={styles.fila}>
              <div className={styles.filaHeader}>
                <strong>
                  {t.tipo} · ${Number(t.monto).toFixed(2)}
                </strong>
                {t.venceHoy ? <span className={`${styles.badge} ${styles.badgeHoy}`}>Vence hoy</span> : null}
              </div>
              <p className={styles.resumen}>
                {t.viatico?.User?.nombre ?? "Técnico"} · {t.estacionComercio || "sin comercio"} ·{" "}
                {t.viatico?.motivo || "sin motivo"}
              </p>
              {t.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.foto} src={t.fotoUrl} alt={`Ticket ${t.id}`} />
              ) : null}
              {puedeFacturar ? <div className={styles.acciones}>
                <label className={styles.btn}>
                  XML
                  <input
                    type="file"
                    disabled={busy}
                    accept=".xml,application/xml,text/xml"
                    hidden
                    onChange={(e) => {
                      const xml = e.target.files?.[0];
                      if (!xml) return;
                      void actuar(
                        () => facturarTicket(token, t.id, { accion: "facturado" }, { xml }),
                        "Marcado como facturado.",
                      );
                    }}
                  />
                </label>
                <label className={styles.btn}>
                  PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={busy}
                    hidden
                    onChange={(e) => {
                      const pdf = e.target.files?.[0];
                      if (!pdf) return;
                      void actuar(
                        () => facturarTicket(token, t.id, { accion: "facturado" }, { pdf }),
                        "Marcado como facturado.",
                      );
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={busy}
                  onClick={() =>
                    actuar(
                      () =>
                        facturarTicket(token, t.id, {
                          accion: "no_facturable",
                          notas: "No facturable",
                        }),
                      "Marcado como no facturable.",
                    )
                  }
                >
                  No facturable
                </button>
              </div> : <p className={styles.resumen}>La contadora registra la factura de este ticket.</p>}
            </article>
          ))}
        </div>
      ) : null}
    </main>
  );
}
