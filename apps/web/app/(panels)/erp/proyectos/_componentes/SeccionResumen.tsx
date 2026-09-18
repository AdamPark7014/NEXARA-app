"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { listarCotizaciones, type CotizacionRow } from "@/lib/cotizaciones-api";
import {
  SALUD_TONO,
  formatoFecha,
  formatoMoneda,
  type ActualizarProyecto,
  type ProyectoDetalle,
} from "@/lib/proyectos-api";
import { aInputFecha, diaDe, diasEntre } from "@/lib/proyecto-plan";
import { leerImporte } from "@/lib/proyecto-alta";
import { SERVICE_PROJECT_TYPE_OPTIONS, getServiceProjectTypeLabel } from "@/lib/service-project-types";
import { guardarCabecera } from "./acciones";
import { PersonaSelect } from "./personas";
import { claseTono } from "./tono";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

type FormCabecera = {
  title: string;
  projectType: string;
  siteCount: string;
  responsableId: string;
  startDate: string;
  endDate: string;
  actualStartDate: string;
  actualEndDate: string;
  budget: string;
  currency: string;
  cotizacionId: string;
  description: string;
  objective: string;
  scopeSummary: string;
};

function formDe(p: ProyectoDetalle): FormCabecera {
  return {
    title: p.title,
    projectType: p.projectType ?? "OTRO",
    siteCount: p.siteCount == null ? "" : String(p.siteCount),
    responsableId: p.responsableId ? String(p.responsableId) : "",
    startDate: aInputFecha(p.startDate),
    endDate: aInputFecha(p.endDate),
    actualStartDate: aInputFecha(p.actualStartDate),
    actualEndDate: aInputFecha(p.actualEndDate),
    budget: p.budgetAmount == null ? "" : String(p.budgetAmount),
    currency: p.currency || "MXN",
    cotizacionId: p.cotizacionId ? String(p.cotizacionId) : "",
    description: p.description ?? "",
    objective: p.objective ?? "",
    scopeSummary: p.scopeSummary ?? "",
  };
}

/** Solo lo que cambió: mandar el responsable sin cambio dispararía otra vez la validación de alcance. */
function cambiosDe(p: ProyectoDetalle, f: FormCabecera): { cambios: ActualizarProyecto; errores: string[] } {
  const antes = formDe(p);
  const errores: string[] = [];
  const cambios: ActualizarProyecto = {};
  const texto = (v: string) => (v.trim() ? v.trim() : null);

  if (f.title.trim() !== antes.title.trim()) {
    if (f.title.trim().length < 3) errores.push("El nombre necesita al menos 3 letras.");
    else cambios.title = f.title.trim();
  }
  if (f.projectType !== antes.projectType) cambios.projectType = f.projectType;
  if (f.siteCount.trim() !== antes.siteCount) {
    const n = Number(f.siteCount);
    if (f.siteCount.trim() && (!Number.isInteger(n) || n < 0)) errores.push("Los sitios deben ser un número entero.");
    else cambios.siteCount = f.siteCount.trim() ? n : null;
  }
  if (f.responsableId !== antes.responsableId) cambios.responsableId = f.responsableId ? Number(f.responsableId) : null;
  if (!f.startDate) errores.push("El inicio planeado no puede quedar vacío.");
  else if (f.startDate !== antes.startDate) cambios.startDate = f.startDate;
  if (f.endDate !== antes.endDate) cambios.endDate = f.endDate || null;
  if (f.actualStartDate !== antes.actualStartDate) cambios.actualStartDate = f.actualStartDate || null;
  if (f.actualEndDate !== antes.actualEndDate) cambios.actualEndDate = f.actualEndDate || null;
  const inicio = diaDe(f.startDate);
  const fin = diaDe(f.endDate);
  if (inicio !== null && fin !== null && fin < inicio) errores.push("El fin planeado no puede ser antes del inicio.");
  const inicioReal = diaDe(f.actualStartDate);
  const finReal = diaDe(f.actualEndDate);
  if (inicioReal !== null && finReal !== null && finReal < inicioReal) {
    errores.push("La entrega real no puede ser antes del inicio real.");
  }
  if (f.budget.trim() !== antes.budget) {
    const importe = leerImporte(f.budget);
    if (importe !== null && (!Number.isFinite(importe) || importe < 0)) errores.push("El presupuesto debe ser una cantidad.");
    else cambios.budgetAmount = importe;
  }
  if (f.currency !== antes.currency) cambios.currency = f.currency;
  if (f.cotizacionId !== antes.cotizacionId) cambios.cotizacionId = f.cotizacionId ? Number(f.cotizacionId) : null;
  if (f.description !== antes.description) cambios.description = texto(f.description);
  if (f.objective !== antes.objective) cambios.objective = texto(f.objective);
  if (f.scopeSummary !== antes.scopeSummary) cambios.scopeSummary = texto(f.scopeSummary);
  return { cambios, errores };
}

function diferencia(plan?: string | null, real?: string | null, verbo = "llegó"): string {
  const d = diasEntre(plan, real);
  if (d === null) return "";
  if (d === 0) return "En la fecha planeada";
  return d > 0 ? `${verbo} ${d} día${d === 1 ? "" : "s"} tarde` : `${verbo} ${-d} día${d === -1 ? "" : "s"} antes`;
}

export default function SeccionResumen({ proyecto: p, token, hoy, ocupado, personas, mutar }: SeccionProps) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState<FormCabecera>(() => formDe(p));
  const [errores, setErrores] = useState<string[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[] | null>(null);

  useEffect(() => {
    if (!editando) setF(formDe(p));
  }, [p, editando]);

  useEffect(() => {
    if (!editando || cotizaciones !== null) return;
    let vivo = true;
    listarCotizaciones(token)
      .then((rows) => vivo && setCotizaciones(rows))
      .catch(() => vivo && setCotizaciones([]));
    return () => {
      vivo = false;
    };
  }, [editando, cotizaciones, token]);

  const r = p.resumen;
  const avance = r.avance;
  const etapasVivas = p.milestones.filter((m) => m.status !== "CANCELADO");
  const etapasCumplidas = etapasVivas.filter((m) => m.status === "CUMPLIDO").length;
  const textoAvance =
    avance.origen === "actividades"
      ? `${avance.cerradas} de ${avance.total} actividades cerradas`
      : avance.origen === "hitos"
        ? `${etapasCumplidas} de ${etapasVivas.length} etapas cumplidas (aún no hay actividades ligadas)`
        : "Sin actividades ni etapas todavía: el avance aparecerá cuando las haya.";

  const cambiar = <K extends keyof FormCabecera>(campo: K, valor: FormCabecera[K]) =>
    setF((prev) => ({ ...prev, [campo]: valor }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const { cambios, errores: encontrados } = cambiosDe(p, f);
    setErrores(encontrados);
    if (encontrados.length) return;
    if (!Object.keys(cambios).length) {
      setEditando(false);
      return;
    }
    const ok = await mutar(() => guardarCabecera(token, p, cambios), "Datos del proyecto guardados.");
    if (ok) setEditando(false);
  }

  const inicioTexto = p.actualStartDate
    ? diferencia(p.startDate, p.actualStartDate, "Arrancó")
    : p.status === "PLANNED" && (diasEntre(p.startDate, hoy) ?? 0) > 0
      ? `Debió arrancar hace ${diasEntre(p.startDate, hoy)} días`
      : "";
  const finTexto = p.actualEndDate
    ? diferencia(p.endDate, p.actualEndDate, "Se entregó")
    : r.diasDeRetraso > 0
      ? `${r.diasDeRetraso} día${r.diasDeRetraso === 1 ? "" : "s"} de retraso`
      : r.diasRestantes !== null
        ? `Faltan ${r.diasRestantes} día${r.diasRestantes === 1 ? "" : "s"}`
        : "";

  return (
    <div className={styles.gantt} style={{ gap: 12 }}>
      <div className={styles.cards}>
        <section className={styles.panel} aria-labelledby="res-avance">
          <h3 id="res-avance" className={styles.panelTitle}>
            Avance
          </h3>
          <span className={styles.bigNumber}>{avance.porcentaje === null ? "—" : `${avance.porcentaje} %`}</span>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Avance del proyecto"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={avance.porcentaje ?? undefined}
            aria-valuetext={avance.porcentaje === null ? "Sin datos" : `${avance.porcentaje} %`}
          >
            <div className={styles.progressFill} style={{ width: `${avance.porcentaje ?? 0}%` }} />
          </div>
          <span className={styles.rowWrap}>{textoAvance}</span>
        </section>

        <section className={styles.panel} aria-labelledby="res-salud">
          <h3 id="res-salud" className={styles.panelTitle}>
            Semáforo
          </h3>
          <span className={claseTono(SALUD_TONO[r.salud] ?? "neutral")} style={{ alignSelf: "flex-start" }}>
            {r.etiqueta}
          </span>
          <p className={styles.texto}>{r.motivo}</p>
          {r.hitosVencidos > 0 ? (
            <span className={`${styles.rowWrap} ${styles.vencido}`}>
              {r.hitosVencidos} etapa{r.hitosVencidos === 1 ? "" : "s"} con la fecha vencida
            </span>
          ) : null}
        </section>

        <section className={styles.panel} aria-labelledby="res-req">
          <h3 id="res-req" className={styles.panelTitle}>
            Requerimientos
          </h3>
          <span className={styles.bigNumber}>
            {r.requerimientos.total ? `${r.requerimientos.cumplidos} / ${r.requerimientos.total}` : "—"}
          </span>
          <span className={styles.rowWrap}>
            {r.requerimientos.total
              ? r.requerimientos.pendientes
                ? `Faltan ${r.requerimientos.pendientes} para poder entregar sin pendientes`
                : "Todo listo"
              : "Sin requerimientos capturados"}
          </span>
        </section>

        <section className={styles.panel} aria-labelledby="res-dinero">
          <h3 id="res-dinero" className={styles.panelTitle}>
            Presupuesto
          </h3>
          <span className={styles.bigNumber} style={{ fontSize: "1.25rem" }}>
            {p.budgetAmount == null ? "Sin capturar" : formatoMoneda(p.budgetAmount, p.currency ?? "MXN")}
          </span>
          {p.cotizacion ? (
            <span className={styles.rowWrap}>
              Cotización{" "}
              <Link href={`/erp/cotizaciones/${p.cotizacion.id}`}>{p.cotizacion.folioEnviado || p.cotizacion.quoteNumber}</Link>
              {p.cotizacion.total != null ? ` · ${formatoMoneda(p.cotizacion.total, p.cotizacion.currency ?? "MXN")}` : ""}
            </span>
          ) : (
            <span className={styles.rowWrap}>Sin cotización ligada</span>
          )}
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="res-fechas">
        <h3 id="res-fechas" className={styles.panelTitle}>
          Fechas: plan contra realidad
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className={styles.fechas}>
            <thead>
              <tr>
                <th scope="col"> </th>
                <th scope="col">Planeado</th>
                <th scope="col">Real</th>
                <th scope="col">Cómo va</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Inicio</th>
                <td>{formatoFecha(p.startDate)}</td>
                <td>{p.actualStartDate ? formatoFecha(p.actualStartDate) : "Aún no arranca"}</td>
                <td>{inicioTexto || "—"}</td>
              </tr>
              <tr>
                <th scope="row">Entrega</th>
                <td>{p.endDate ? formatoFecha(p.endDate) : "Sin fecha"}</td>
                <td>{p.actualEndDate ? formatoFecha(p.actualEndDate) : "Sin entregar"}</td>
                <td className={r.diasDeRetraso > 0 && !p.actualEndDate ? styles.vencido : undefined}>{finTexto || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {p.status === "CANCELLED" && p.cancelReason ? (
        <section className={styles.errorBox} aria-label="Motivo de cancelación">
          <strong>Cancelado:</strong> {p.cancelReason}
        </section>
      ) : null}

      {!editando ? (
        <section className={styles.panel} aria-labelledby="res-datos">
          <div className={styles.panelHead}>
            <h3 id="res-datos" className={styles.panelTitle}>
              Datos del proyecto
            </h3>
            <button type="button" className={styles.smallBtn} onClick={() => setEditando(true)} disabled={ocupado}>
              Editar datos
            </button>
          </div>
          <div className={styles.cards}>
            <div className={styles.itemMain}>
              <span className={styles.fieldLabel}>Cliente</span>
              <span className={styles.itemTitle}>{p.client?.name ?? "—"}</span>
              {p.client?.contactEmail || p.client?.contactPhone ? (
                <span className={styles.rowWrap}>
                  {[p.client.contactEmail, p.client.contactPhone].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </div>
            <div className={styles.itemMain}>
              <span className={styles.fieldLabel}>Tipo y sitios</span>
              <span className={styles.itemTitle}>{getServiceProjectTypeLabel(p.projectType)}</span>
              <span className={styles.rowWrap}>
                {p.siteCount != null ? `${p.siteCount} sitio${p.siteCount === 1 ? "" : "s"}` : "Sitios sin capturar"}
              </span>
            </div>
            <div className={styles.itemMain}>
              <span className={styles.fieldLabel}>Responsable</span>
              <span className={styles.itemTitle}>{p.responsable?.nombre ?? "Sin asignar"}</span>
              {p.vendor ? <span className={styles.rowWrap}>Lo vendió: {p.vendor.nombre}</span> : null}
            </div>
            {p.salesProject ? (
              <div className={styles.itemMain}>
                <span className={styles.fieldLabel}>Proyecto comercial</span>
                <span className={styles.itemTitle}>{p.salesProject.name}</span>
              </div>
            ) : null}
          </div>
          {p.objective ? (
            <div>
              <span className={styles.fieldLabel}>Objetivo</span>
              <p className={styles.texto}>{p.objective}</p>
            </div>
          ) : null}
          {p.description ? (
            <div>
              <span className={styles.fieldLabel}>Descripción</span>
              <p className={styles.texto}>{p.description}</p>
            </div>
          ) : null}
          {p.scopeSummary ? (
            <div>
              <span className={styles.fieldLabel}>El alcance en una frase</span>
              <p className={styles.texto}>{p.scopeSummary}</p>
            </div>
          ) : null}
          {!p.objective && !p.description ? (
            <p className={styles.hint}>Falta el objetivo y la descripción: con «Editar datos» los agregas.</p>
          ) : null}
        </section>
      ) : (
        <form className={styles.panel} onSubmit={guardar} aria-labelledby="res-editar" noValidate>
          <h3 id="res-editar" className={styles.panelTitle}>
            Editar datos del proyecto
          </h3>
          <div>
            <label className={styles.fieldLabel} htmlFor="ed-titulo">
              Nombre del proyecto
            </label>
            <input
              id="ed-titulo"
              className={styles.input}
              value={f.title}
              maxLength={220}
              onChange={(e) => cambiar("title", e.target.value)}
            />
          </div>
          <div className={styles.grid3}>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-tipo">
                Tipo de proyecto
              </label>
              <select id="ed-tipo" className={styles.select} value={f.projectType} onChange={(e) => cambiar("projectType", e.target.value)}>
                {SERVICE_PROJECT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-sitios">
                Sitios
              </label>
              <input
                id="ed-sitios"
                className={styles.input}
                type="number"
                min={0}
                step={1}
                value={f.siteCount}
                onChange={(e) => cambiar("siteCount", e.target.value)}
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-resp">
                Responsable
              </label>
              <PersonaSelect
                id="ed-resp"
                value={f.responsableId}
                onChange={(v) => cambiar("responsableId", v)}
                personas={personas}
                vacio={f.responsableId ? null : "Sin asignar"}
              />
            </div>
          </div>
          <div className={styles.grid2}>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-inicio">
                Inicio planeado
              </label>
              <input id="ed-inicio" className={styles.input} type="date" value={f.startDate} onChange={(e) => cambiar("startDate", e.target.value)} />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-fin">
                Fin planeado
              </label>
              <input id="ed-fin" className={styles.input} type="date" value={f.endDate} min={f.startDate || undefined} onChange={(e) => cambiar("endDate", e.target.value)} />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-inicio-real">
                Inicio real
              </label>
              <input id="ed-inicio-real" className={styles.input} type="date" value={f.actualStartDate} onChange={(e) => cambiar("actualStartDate", e.target.value)} />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-fin-real">
                Entrega real
              </label>
              <input id="ed-fin-real" className={styles.input} type="date" value={f.actualEndDate} onChange={(e) => cambiar("actualEndDate", e.target.value)} />
              <p className={styles.hint}>Con fecha de entrega real, el semáforo lo da por terminado.</p>
            </div>
          </div>
          <div className={styles.grid3}>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-presupuesto">
                Presupuesto
              </label>
              <input id="ed-presupuesto" className={styles.input} inputMode="decimal" value={f.budget} onChange={(e) => cambiar("budget", e.target.value)} />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-moneda">
                Moneda
              </label>
              <select id="ed-moneda" className={styles.select} value={f.currency} onChange={(e) => cambiar("currency", e.target.value)}>
                <option value="MXN">Pesos mexicanos (MXN)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="ed-cotizacion">
                Cotización
              </label>
              <select id="ed-cotizacion" className={styles.select} value={f.cotizacionId} onChange={(e) => cambiar("cotizacionId", e.target.value)}>
                <option value="">Sin cotización</option>
                {p.cotizacion && !(cotizaciones ?? []).some((c) => c.id === p.cotizacion?.id) ? (
                  <option value={String(p.cotizacion.id)}>{p.cotizacion.quoteNumber}</option>
                ) : null}
                {(cotizaciones ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.folio} · {c.clienteNombre || c.clienteEmpresa || "Sin cliente"}
                  </option>
                ))}
              </select>
              {cotizaciones === null ? <p className={styles.hint}>Cargando cotizaciones…</p> : null}
            </div>
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="ed-objetivo">
              Objetivo
            </label>
            <textarea id="ed-objetivo" className={styles.textarea} value={f.objective} onChange={(e) => cambiar("objective", e.target.value)} />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="ed-descripcion">
              Descripción
            </label>
            <textarea id="ed-descripcion" className={styles.textarea} value={f.description} onChange={(e) => cambiar("description", e.target.value)} />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="ed-alcance">
              El alcance en una frase
            </label>
            <input id="ed-alcance" className={styles.input} value={f.scopeSummary} onChange={(e) => cambiar("scopeSummary", e.target.value)} />
          </div>
          {errores.length ? (
            <div className={styles.errorBox} role="alert">
              <ul>
                {errores.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className={styles.acciones}>
            <button type="submit" className={styles.primaryBtn} disabled={ocupado}>
              {ocupado ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                setErrores([]);
                setEditando(false);
              }}
              disabled={ocupado}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
