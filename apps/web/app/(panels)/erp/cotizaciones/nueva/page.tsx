"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useUser } from "@/components/UserContext";
import { listSalesClients, type SalesClient } from "@/lib/sales-api";
import {
  SEGMENTOS,
  SEGMENTO_LABEL,
  crearCotizacion,
  type Segmento,
} from "@/lib/cotizaciones-api";
import styles from "../cotizaciones-core.module.css";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function enDias(dias: number) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function NuevaCotizacion() {
  const router = useRouter();
  const search = useSearchParams();
  const { token } = useUser();

  // «Hacer cotización» desde una actividad comercial llega con ?activityId=
  const activityId = Number(search.get("activityId")) || null;

  const [clientes, setClientes] = useState<SalesClient[]>([]);
  const [salesClientId, setSalesClientId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [segmento, setSegmento] = useState<Segmento>("COMERCIAL");
  const [projectName, setProjectName] = useState("");
  const [issueDate, setIssueDate] = useState(hoyISO());
  const [validUntil, setValidUntil] = useState(enDias(15));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    listSalesClients(token)
      .then((rows) => vivo && setClientes(rows))
      .catch(() => vivo && setClientes([]));
    return () => {
      vivo = false;
    };
  }, [token]);

  const clienteElegido = useMemo(
    () => clientes.find((c) => String(c.id) === salesClientId) ?? null,
    [clientes, salesClientId],
  );

  const puedeGuardar = Boolean(clienteElegido || clientName.trim());

  async function guardar() {
    if (!token || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      const creada = await crearCotizacion(token, {
        segmento,
        salesClientId: clienteElegido ? clienteElegido.id : undefined,
        clientName: clienteElegido ? clienteElegido.name : clientName.trim(),
        clientCompany: clienteElegido?.legalName ?? undefined,
        clientEmail: (clienteElegido?.billingEmail || clientEmail).trim() || undefined,
        projectName: projectName.trim() || undefined,
        issueDate,
        validUntil,
        depositPercent: 50,
        activityId: activityId ?? undefined,
        // Una cotización nace con una partida vacía: el editor la completa.
        items: [
          {
            name: "Concepto por definir",
            unit: "Pieza",
            qty: 1,
            unitPrice: 0,
            discount: 0,
            tax: 16,
          },
        ],
      });
      router.replace(`/erp/cotizaciones/${creada.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la cotización");
      setGuardando(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>Nueva cotización</h1>
          <p className={styles.sub}>
            El folio se emite al guardar, con tu nomenclatura y tu consecutivo. El segmento decide
            los términos.
          </p>
        </div>
        <Link className={styles.secondaryBtn} href="/erp/cotizaciones">
          Cancelar
        </Link>
      </div>

      <div className={styles.panel}>
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

        <div>
          <label className={styles.fieldLabel} htmlFor="cliente">
            Cliente
          </label>
          <select
            id="cliente"
            className={styles.select}
            value={salesClientId}
            onChange={(e) => setSalesClientId(e.target.value)}
          >
            <option value="">Capturar uno nuevo…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {!clienteElegido ? (
          <div className={styles.grid2}>
            <div>
              <label className={styles.fieldLabel} htmlFor="clientName">
                Nombre del cliente
              </label>
              <input
                id="clientName"
                className={styles.input}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Como aparecerá en la propuesta"
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="clientEmail">
                Correo
              </label>
              <input
                id="clientEmail"
                className={styles.input}
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Para enviarle la propuesta"
              />
            </div>
          </div>
        ) : null}

        <div>
          <label className={styles.fieldLabel} htmlFor="proyecto">
            Proyecto
          </label>
          <input
            id="proyecto"
            className={styles.input}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Renovación y ampliación del sistema de CCTV"
          />
        </div>

        <div className={styles.grid2}>
          <div>
            <label className={styles.fieldLabel} htmlFor="emision">
              Emisión
            </label>
            <input
              id="emision"
              className={styles.input}
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
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
        </div>

        {activityId ? (
          <p className={styles.sub}>
            Queda ligada a la actividad #{activityId}: su evidencia entra como anexo de la propuesta.
          </p>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.acciones}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void guardar()}
            disabled={!puedeGuardar || guardando}
          >
            {guardando ? "Emitiendo folio…" : "Crear y continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NuevaCotizacionPage() {
  return (
    <Suspense fallback={<p className={styles.sub}>Cargando…</p>}>
      <NuevaCotizacion />
    </Suspense>
  );
}
