"use client";

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import HerramientasChecklistEditor from "@/components/ops/HerramientasChecklistEditor";
import { formatApiError } from "@/lib/erp-api";
import {
  avanceChecklist,
  borradoresDesdeChecklist,
  cargarChecklist,
  definirRequisitos,
  hayErroresRequisitos,
  palomearRequisito,
  validarRequisitos,
  type ChecklistHerramientas,
  type RequisitoBorrador,
  type RequisitoHerramienta,
} from "@/lib/herramientas-checklist";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/lib/permissions";

type Props = {
  activityId: number;
  /** Por omisión: permiso `activities.manage` (el mismo que pide la API para definirlos). */
  canManage?: boolean;
  /** Por omisión: ver o gestionar actividades (lo que pide la API para palomear). */
  canCheck?: boolean;
  style?: CSSProperties;
};

const VERDE = "#16a34a";
const NARANJA = "#d97706";

const AYUDA =
  "Quien ejecuta palomea cada herramienta antes de salir; con pendientes la app no deja iniciar la OT.";

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function corto(nombre?: string | null): string {
  return (nombre || "").split(/\s+/).slice(0, 2).join(" ");
}

/** El 403 de Nest llega ya desenvuelto como «Forbidden resource» desde el cliente. */
function esSinPermiso(e: unknown): boolean {
  return e instanceof Error && /forbidden/i.test(e.message);
}

type Estado = { label: string; color: string; icon: SvgIconComponent };

function estadoDe(r: RequisitoHerramienta): Estado {
  if (!r.check) return { label: "Pendiente", color: NARANJA, icon: HourglassEmptyIcon };
  if (r.check.ok) return { label: "Listo", color: VERDE, icon: CheckCircleOutlineIcon };
  return { label: "Falta", color: "var(--danger)", icon: ErrorOutlineIcon };
}

const fila: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
  padding: "9px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  minWidth: 0,
};

const notaInput: CSSProperties = {
  flex: "1 1 200px",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "7px 10px",
  minHeight: 34,
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  font: "inherit",
  fontSize: 13,
};

/**
 * «Herramientas a llevar» en el detalle de la actividad: qué se pidió, quién lo palomeó y
 * cuándo, y el candado que no deja iniciar mientras algo siga pendiente.
 */
export default function HerramientasChecklist({ activityId, canManage, canCheck, style }: Props) {
  const { user, token } = useUser();
  const tituloId = useId();
  const puedeEditar = canManage ?? hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE);
  const puedePalomear =
    canCheck ?? hasAnyPermission(user, [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE]);

  const [checklist, setChecklist] = useState<ChecklistHerramientas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [ayuda, setAyuda] = useState(false);

  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<RequisitoBorrador[]>([]);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [palomeando, setPalomeando] = useState<number | null>(null);
  const [notaDe, setNotaDe] = useState<{ id: number; texto: string } | null>(null);
  const [errorFila, setErrorFila] = useState<{ id: number; mensaje: string } | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !activityId) return;
    setCargando(true);
    try {
      setChecklist(await cargarChecklist(token, activityId));
      setError(null);
      setSinPermiso(false);
    } catch (e) {
      if (esSinPermiso(e)) setSinPermiso(true);
      else setError(formatApiError(e, "No se pudo cargar el checklist de herramientas"));
    } finally {
      setCargando(false);
    }
  }, [token, activityId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const lista = useMemo(() => checklist?.requisitos ?? [], [checklist]);
  const avance = useMemo(() => avanceChecklist(lista), [lista]);
  const errores = useMemo(() => validarRequisitos(borrador), [borrador]);

  const abrirEditor = () => {
    setBorrador(borradoresDesdeChecklist(lista));
    setIntentado(false);
    setErrorGuardar(null);
    setAviso(null);
    setEditando(true);
  };

  const guardar = async () => {
    if (!token || guardando) return;
    setIntentado(true);
    setErrorGuardar(null);
    if (hayErroresRequisitos(errores)) return;
    setGuardando(true);
    try {
      const nuevo = await definirRequisitos(
        token,
        activityId,
        borrador.map((f) => ({ id: f.id ?? undefined, descripcion: f.descripcion.trim(), cantidad: f.cantidad })),
      );
      setChecklist(nuevo);
      setEditando(false);
      setAviso(
        nuevo.requisitos.length === 0
          ? "Sin checklist: la actividad puede iniciar sin revisar herramientas."
          : `Guardado: ${nuevo.requisitos.length} herramienta${nuevo.requisitos.length === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setErrorGuardar(formatApiError(e, "No se pudo guardar el checklist de herramientas"));
    } finally {
      setGuardando(false);
    }
  };

  const palomear = async (requisito: RequisitoHerramienta, ok: boolean, nota?: string) => {
    if (!token || palomeando) return;
    setPalomeando(requisito.id);
    setErrorFila(null);
    try {
      const limpia = (nota ?? "").trim();
      setChecklist(
        await palomearRequisito(token, activityId, requisito.id, {
          ok,
          ...(limpia ? { nota: limpia } : {}),
        }),
      );
      setNotaDe(null);
    } catch (e) {
      setErrorFila({ id: requisito.id, mensaje: formatApiError(e, "No se pudo guardar el palomeo") });
    } finally {
      setPalomeando(null);
    }
  };

  if (sinPermiso) return null;

  return (
    <section aria-labelledby={tituloId} style={{ display: "grid", gap: 10, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <h2 id={tituloId} style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            Herramientas a llevar
          </h2>
          {lista.length > 0 ? (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>({lista.length})</span>
          ) : null}
          <button
            type="button"
            onClick={() => setAyuda((v) => !v)}
            aria-expanded={ayuda}
            aria-label="Qué es el checklist de herramientas"
            title={AYUDA}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              padding: 0,
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
          </button>
        </div>
        {puedeEditar && !editando && checklist ? (
          <Button
            size="sm"
            variant={lista.length ? "secondary" : "primary"}
            onClick={abrirEditor}
            iconLeft={lista.length ? <EditOutlinedIcon fontSize="inherit" /> : <BuildOutlinedIcon fontSize="inherit" />}
          >
            {lista.length ? "Editar herramientas" : "Definir herramientas"}
          </Button>
        ) : null}
      </div>

      {ayuda ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>{AYUDA}</p>
      ) : null}

      {error && !checklist ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>
            {error}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {aviso ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "9px 12px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 650,
            background: `color-mix(in srgb, ${VERDE} 10%, var(--surface))`,
            border: `1px solid color-mix(in srgb, ${VERDE} 35%, var(--border))`,
          }}
        >
          {aviso}
        </p>
      ) : null}

      {editando ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            padding: 14,
            borderRadius: 16,
            border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))",
            background: "color-mix(in srgb, var(--primary) 4%, var(--surface))",
          }}
        >
          <HerramientasChecklistEditor
            value={borrador}
            onChange={setBorrador}
            errores={intentado ? errores : null}
            disabled={guardando}
          />
          {errorGuardar ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
              {errorGuardar}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button size="sm" variant="secondary" onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" onClick={() => void guardar()} loading={guardando}>
              {guardando ? "Guardando…" : "Guardar herramientas"}
            </Button>
          </div>
        </div>
      ) : null}

      {!editando && lista.length > 0 ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>
              {avance.listos} de {avance.total} lista{avance.total === 1 ? "" : "s"}
            </strong>
            {!avance.completo ? (
              <span style={{ fontSize: 12.5, fontWeight: 650, color: NARANJA }}>No se puede iniciar aún.</span>
            ) : null}
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {lista.map((r) => {
              const estado = estadoDe(r);
              const Icono = estado.icon;
              const meta = r.check
                ? [corto(r.check.por?.nombre), fmt(r.check.at)].filter(Boolean).join(" · ")
                : null;
              const nota = notaDe?.id === r.id ? notaDe : null;
              const ocupada = palomeando === r.id;
              return (
                <li key={r.id} style={{ display: "grid", gap: 8, ...fila }}>
                  <div style={{ display: "grid", gap: 2, minWidth: 0, flex: "1 1 220px" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>
                      {r.descripcion}
                      {r.cantidad > 1 ? (
                        <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}> ×{r.cantidad}</span>
                      ) : null}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.35 }}>
                      {[meta, r.check?.nota].filter(Boolean).join(" · ") || "Sin revisar"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 9px",
                        borderRadius: 999,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: estado.color,
                        border: `1px solid color-mix(in srgb, ${estado.color} 35%, var(--border))`,
                        background: `color-mix(in srgb, ${estado.color} 9%, var(--surface))`,
                      }}
                    >
                      <Icono aria-hidden="true" sx={{ fontSize: 14 }} />
                      {estado.label}
                    </span>
                    {puedePalomear ? (
                      <>
                        <Button
                          size="sm"
                          variant={r.check?.ok ? "secondary" : "primary"}
                          onClick={() => void palomear(r, true)}
                          disabled={ocupada}
                        >
                          Lo traigo
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setNotaDe(nota ? null : { id: r.id, texto: r.check?.nota ?? "" })}
                          disabled={ocupada}
                          aria-expanded={Boolean(nota)}
                        >
                          Falta / dañado
                        </Button>
                      </>
                    ) : null}
                  </div>

                  {nota ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%", alignItems: "center" }}>
                      <input
                        value={nota.texto}
                        maxLength={300}
                        autoFocus
                        placeholder="Qué pasó (opcional)"
                        aria-label={`Nota de ${r.descripcion}`}
                        disabled={ocupada}
                        onChange={(e) => setNotaDe({ id: r.id, texto: e.target.value })}
                        style={notaInput}
                      />
                      <Button size="sm" variant="danger" onClick={() => void palomear(r, false, nota.texto)} loading={ocupada}>
                        Marcar faltante
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNotaDe(null)} disabled={ocupada}>
                        Cancelar
                      </Button>
                    </div>
                  ) : null}

                  {errorFila?.id === r.id ? (
                    <p role="alert" style={{ margin: 0, width: "100%", fontSize: 12.5, color: "var(--danger)" }}>
                      {errorFila.mensaje}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {!editando && checklist && lista.length === 0 && !cargando ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Sin checklist de herramientas</p>
      ) : null}
    </section>
  );
}
