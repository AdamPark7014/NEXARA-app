"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageChrome from "@/components/ui/PageChrome";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import MetricStrip from "@/components/ui/MetricStrip";
import Modal from "@/components/ui/Modal";
import { useUser } from "@/components/UserContext";
import { getApprovalsSectionConfig } from "@/lib/section-views";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { formatApiError } from "@/lib/erp-api";
import {
  listMyPendingApprovals,
  decideApproval,
  buildApprovalChain,
  labelForEntityType,
  formatRequestedAt,
  entityApprovalHref,
  type PendingApproval,
  type ApprovalChainStep,
} from "@/lib/workflow-api";
import s from "./approvals.module.css";

/**
 * Bandeja de aprobaciones jerárquicas: todo lo que requiere tu firma según tu nivel.
 * GET /api/workflow/my-pending · POST /api/workflow/approvals/:id/decide.
 */

type Prioridad = "Alta" | "Media" | "Baja";
type Filtro = "all" | Prioridad;

type ApprovalRow = {
  key: string;
  approvalId: number;
  instanceId: number;
  type: string;
  titulo: string;
  detalle: string;
  folio: string;
  href: string | null;
  solicita: string;
  solicitaRol: string;
  pasos: ApprovalChainStep[];
  prioridad: Prioridad;
  fechaSolicitud: string;
  createdAt: string;
};

const DAY_MS = 86_400_000;

const toApprovalRow = (approval: PendingApproval): ApprovalRow => {
  const inst = approval.instance;
  const decidedCount = (inst.approvals || []).filter((a) => a.status !== "PENDING").length;
  const totalSteps = inst.workflow?.steps?.length ?? (inst.approvals?.length || 1);
  const ratio = totalSteps > 0 ? decidedCount / totalSteps : 0;
  const prioridad: Prioridad = ratio >= 0.66 ? "Alta" : ratio >= 0.33 ? "Media" : "Baja";
  const tipo = labelForEntityType(inst.entityType);
  const href = entityApprovalHref(inst.entityType, inst.entityId);

  return {
    key: `AP-${approval.id}`,
    approvalId: approval.id,
    instanceId: inst.id,
    type: tipo,
    titulo: inst.workflow?.name ?? tipo,
    detalle: `${tipo} con folio ${inst.entityId}, en espera de tu decisión.`,
    folio: String(inst.entityId),
    href: href && href.startsWith("/erp/") ? href : null,
    solicita: inst.startedBy?.nombre ?? "Sin nombre",
    solicitaRol: inst.startedBy?.role?.nombre ?? "",
    pasos: buildApprovalChain(inst, approval.id),
    prioridad,
    fechaSolicitud: formatRequestedAt(approval.createdAt),
    createdAt: approval.createdAt,
  };
};

const daysWaiting = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
};

const STEP_COLOR: Record<ApprovalChainStep["estado"], string> = {
  Aprobado: "var(--success)",
  Rechazado: "var(--danger)",
  Pendiente: "var(--warning)",
  "En espera": "var(--text-tertiary)",
};

const FILTERS: Array<{ key: Filtro; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "Alta", label: "Alta" },
  { key: "Media", label: "Media" },
  { key: "Baja", label: "Baja" },
];

function ApprovalChain({ pasos }: { pasos: ApprovalChainStep[] }) {
  return (
    <div className={s.chain}>
      <h4 className={s.chainTitle}>Cadena de aprobación</h4>
      <ol className={s.chainList}>
        {pasos.map((paso, idx) => {
          const color = STEP_COLOR[paso.estado] ?? "var(--text-tertiary)";
          const filled = paso.estado === "Aprobado" || paso.estado === "Rechazado";
          return (
            <li key={idx} className={s.step}>
              <div className={s.stepRail} aria-hidden="true">
                <span
                  className={s.stepDot}
                  style={{
                    color,
                    background: filled ? color : "transparent",
                    boxShadow: paso.isCurrent ? `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` : undefined,
                  }}
                />
                {idx < pasos.length - 1 && (
                  <span className={`${s.stepLine} ${paso.estado === "Aprobado" ? s.stepLineDone : ""}`} />
                )}
              </div>
              <div>
                <div className={s.stepRole}>
                  {paso.rol}
                  {paso.isCurrent && <span className={s.stepNow}>En curso</span>}
                </div>
                <div className={s.stepInfo}>
                  <span style={{ color, fontWeight: 600 }}>{paso.estado}</span>
                  {paso.quien && <span>{paso.quien}</span>}
                  {paso.fecha && <span>{paso.fecha}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function ApprovalsPage() {
  const { user } = useUser();
  const token = user?.token;
  const cfg = useMemo(() => getApprovalsSectionConfig(user), [user]);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<Filtro>("all");
  const [searchQ, setSearchQ] = useState("");
  const [data, setData] = useState<ApprovalRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [infoTarget, setInfoTarget] = useState<ApprovalRow | null>(null);
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("highlight");
    const id = raw ? Number(raw) : NaN;
    if (!Number.isNaN(id)) setHighlightId(id);
  }, []);

  const fetchPending = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listMyPendingApprovals(token);
      setData(list.map(toApprovalRow));
    } catch (e: unknown) {
      setError(formatApiError(e, "No pudimos cargar tus aprobaciones."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  const rows = useMemo(() => data ?? [], [data]);

  const list = useMemo(() => {
    let out = filter === "all" ? rows : rows.filter((a) => a.prioridad === filter);
    const q = searchQ.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (a) =>
          a.titulo.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q) ||
          a.solicita.toLowerCase().includes(q) ||
          a.folio.includes(q),
      );
    }
    if (highlightId !== null) {
      out = [...out].sort((a, b) => Number(b.instanceId === highlightId) - Number(a.instanceId === highlightId));
    }
    return out;
  }, [rows, filter, searchQ, highlightId]);

  useEffect(() => {
    if (highlightId !== null && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, list]);

  const counts = useMemo(() => {
    const c = { all: rows.length, Alta: 0, Media: 0, Baja: 0, late: 0, oldest: 0 };
    for (const a of rows) {
      c[a.prioridad]++;
      const d = daysWaiting(a.createdAt);
      if (d >= 3) c.late++;
      if (d > c.oldest) c.oldest = d;
    }
    return c;
  }, [rows]);

  const approve = async (row: ApprovalRow) => {
    if (!token) return;
    setDecidingId(row.approvalId);
    setDecideError(null);
    setNotice(null);
    try {
      await decideApproval(token, row.approvalId, "APPROVED", undefined);
      setNotice(`Aprobaste «${row.titulo}».`);
      await fetchPending();
    } catch (e: unknown) {
      setDecideError(formatApiError(e, "No se pudo registrar la aprobación. Intenta de nuevo."));
    } finally {
      setDecidingId(null);
    }
  };

  const openReject = (row: ApprovalRow) => {
    setRejectTarget(row);
    setRejectReason("");
    setDecideError(null);
  };

  const submitReject = async () => {
    if (!token || !rejectTarget) return;
    const target = rejectTarget;
    setDecidingId(target.approvalId);
    setDecideError(null);
    setNotice(null);
    try {
      await decideApproval(token, target.approvalId, "REJECTED", rejectReason.trim() || undefined);
      setRejectTarget(null);
      setNotice(`Rechazaste «${target.titulo}».`);
      await fetchPending();
    } catch (e: unknown) {
      setDecideError(formatApiError(e, "No se pudo registrar el rechazo. Intenta de nuevo."));
    } finally {
      setDecidingId(null);
    }
  };

  const copyInfoRequest = async () => {
    if (!infoTarget) return;
    const text = `Hola ${infoTarget.solicita}, sobre «${infoTarget.titulo}» (folio ${infoTarget.folio}): ${infoMessage.trim()}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Mensaje copiado. Pégalo en el Chat para enviárselo a ${infoTarget.solicita}.`);
    } catch {
      setNotice("No pudimos copiar el mensaje automáticamente. Escríbelo directamente en el Chat.");
    }
    setInfoTarget(null);
  };

  const showSkeleton = loading && data === null;
  const hasFilters = filter !== "all" || searchQ.trim() !== "";

  return (
    <PageChrome
      eyebrow="Hoy"
      title={cfg.title}
      subtitle={cfg.subtitle}
      secondaryActions={
        <Button variant="ghost" iconLeft="↻" onClick={() => void fetchPending()} loading={loading && data !== null} disabled={loading}>
          Actualizar
        </Button>
      }
      filters={
        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por tipo, título, folio o solicitante…" }}
          onClear={() => {
            setSearchQ("");
            setFilter("all");
          }}
          resultCount={showSkeleton ? null : list.length}
          rightActions={
            list.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                iconLeft="⬇"
                onClick={() =>
                  exportToExcel(list, [
                    { key: "type", label: "Tipo" },
                    { key: "titulo", label: "Solicitud" },
                    { key: "folio", label: "Folio" },
                    { key: "solicita", label: "Solicita" },
                    { key: "prioridad", label: "Prioridad" },
                    { key: "fechaSolicitud", label: "Fecha" },
                  ], "aprobaciones-pendientes")
                }
              >
                Excel
              </Button>
            ) : undefined
          }
        />
      }
    >
      {error && (
        <InlineAlert
          variant={data ? "warning" : "danger"}
          message={data ? `No pudimos actualizar la bandeja; mostramos la última versión. ${error}` : error}
          action={<Button size="sm" variant="secondary" onClick={() => void fetchPending()}>Reintentar</Button>}
        />
      )}
      {decideError && !rejectTarget && (
        <InlineAlert variant="danger" message={decideError} onDismiss={() => setDecideError(null)} />
      )}
      {notice && <InlineAlert variant="success" message={notice} onDismiss={() => setNotice(null)} />}

      {!showSkeleton && data && (
        <div style={{ marginBottom: 14 }}>
          <MetricStrip
            ariaLabel="Resumen de la bandeja"
            metrics={[
              { label: "pendientes", value: counts.all, hint: counts.all === 0 ? "bandeja al día" : "esperan tu decisión", tone: counts.all > 0 ? "warning" : "success" },
              { label: "prioridad alta", value: counts.Alta, hint: counts.Alta > 0 ? "atiéndelas primero" : "sin urgentes", tone: counts.Alta > 0 ? "danger" : "default", onClick: counts.Alta > 0 ? () => setFilter("Alta") : undefined },
              { label: "esperando 3 días o más", value: counts.late, tone: counts.late > 0 ? "warning" : "default" },
              { label: "la más antigua", value: counts.all > 0 ? (counts.oldest === 0 ? "hoy" : `${counts.oldest} ${counts.oldest === 1 ? "día" : "días"}`) : "—" },
            ]}
          />
        </div>
      )}

      <div className={s.chips} role="group" aria-label="Filtrar por prioridad">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={s.chip}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className={s.chipCount}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {showSkeleton ? (
        <div className={s.list} aria-busy="true" aria-label="Cargando aprobaciones">
          <div className={s.skeletonCard} />
          <div className={s.skeletonCard} />
        </div>
      ) : !token ? (
        <EmptyState icon="🔒" title="Inicia sesión" description="Necesitas iniciar sesión para ver tus aprobaciones." />
      ) : list.length === 0 ? (
        data === null ? (
          <EmptyState
            icon="⚠️"
            title="No pudimos cargar la bandeja"
            description="Revisa tu conexión e intenta de nuevo."
            action={<Button variant="primary" onClick={() => void fetchPending()}>Reintentar</Button>}
          />
        ) : hasFilters ? (
          <EmptyState
            icon="🔍"
            title="Sin coincidencias"
            description="Ninguna solicitud coincide con la búsqueda o el filtro."
            action={<Button variant="secondary" onClick={() => { setFilter("all"); setSearchQ(""); }}>Ver todas</Button>}
          />
        ) : (
          <EmptyState icon="✅" title="Todo al día" description="No hay solicitudes esperando tu firma. Buen trabajo." />
        )
      ) : (
        <div className={s.list}>
          {highlightId !== null && rows.some((r) => r.instanceId === highlightId) && (
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>
              Abriste esta bandeja desde un enlace: la solicitud señalada aparece primero.
            </p>
          )}
          {list.map((a) => {
            const isHighlighted = highlightId !== null && a.instanceId === highlightId;
            const days = daysWaiting(a.createdAt);
            const busy = decidingId === a.approvalId;
            return (
              <article
                key={a.key}
                ref={isHighlighted ? highlightRef : undefined}
                className={`${s.card} ${isHighlighted ? s.cardHighlighted : ""}`}
                aria-labelledby={`${a.key}-title`}
              >
                <div style={{ minWidth: 0 }}>
                  <div className={s.cardMeta}>
                    <span className={s.tag}>{a.type}</span>
                    <span className={`${s.tag} ${a.prioridad === "Alta" ? s.tagHigh : a.prioridad === "Media" ? s.tagMedium : ""}`}>
                      Prioridad {a.prioridad.toLowerCase()}
                    </span>
                    <span className={`${s.waiting} ${days >= 3 ? s.waitingVeryLate : days >= 1 ? s.waitingLate : ""}`}>
                      {a.fechaSolicitud}
                      {days >= 1 ? ` · ${days} ${days === 1 ? "día" : "días"} esperando` : ""}
                    </span>
                  </div>

                  <h3 id={`${a.key}-title`} className={s.cardTitle}>{a.titulo}</h3>
                  <p className={s.cardDetail}>{a.detalle}</p>

                  <div>
                    <div className={s.fieldLabel}>Solicita</div>
                    <div className={s.fieldValue}>
                      {a.solicita}
                      {a.solicitaRol && <span> · {a.solicitaRol}</span>}
                    </div>
                  </div>

                  <div className={s.actions}>
                    <Button variant="primary" iconLeft="✓" onClick={() => void approve(a)} loading={busy} disabled={decidingId !== null}>
                      {busy ? "Aprobando…" : "Aprobar"}
                    </Button>
                    <Button variant="ghost" iconLeft="✕" onClick={() => openReject(a)} disabled={decidingId !== null} style={{ color: "var(--danger)" }}>
                      Rechazar
                    </Button>
                    <Button variant="secondary" iconLeft="💬" onClick={() => { setInfoTarget(a); setInfoMessage(""); }}>
                      Pedir más info
                    </Button>
                    {a.href && (
                      <Link href={a.href} className={s.entityLink}>
                        Ver solicitud →
                      </Link>
                    )}
                  </div>
                </div>

                <ApprovalChain pasos={a.pasos} />
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Rechazar solicitud"
        dirty={rejectReason.trim().length > 0 && decidingId === null}
        maxWidth={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => void submitReject()}
              loading={rejectTarget !== null && decidingId === rejectTarget.approvalId}
            >
              Confirmar rechazo
            </Button>
          </>
        }
      >
        {rejectTarget && (
          <>
            <p className={s.modalLead}>
              <strong>{rejectTarget.titulo}</strong> · solicitada por {rejectTarget.solicita}
            </p>
            <label style={{ display: "grid", gap: 6 }}>
              <span className={s.fieldLabel}>Motivo (lo verá quien solicitó)</span>
              <textarea
                className={s.textarea}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Explica por qué la rechazas para que puedan corregirla…"
              />
            </label>
            {decideError && <div style={{ marginTop: 12 }}><InlineAlert variant="danger" message={decideError} /></div>}
          </>
        )}
      </Modal>

      <Modal
        open={infoTarget !== null}
        onClose={() => setInfoTarget(null)}
        title="Pedir más información"
        maxWidth={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setInfoTarget(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void copyInfoRequest()} disabled={!infoMessage.trim()}>
              Copiar mensaje
            </Button>
          </>
        }
      >
        {infoTarget && (
          <>
            <p className={s.modalLead}>
              Para <strong>{infoTarget.solicita}</strong>
              {infoTarget.solicitaRol ? ` (${infoTarget.solicitaRol})` : ""}
            </p>
            <label style={{ display: "grid", gap: 6 }}>
              <span className={s.fieldLabel}>¿Qué necesitas saber?</span>
              <textarea
                className={s.textarea}
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                rows={4}
                placeholder={`Escribe tu pregunta para ${infoTarget.solicita}…`}
              />
            </label>
            <div className={s.modalNote}>
              La solicitud seguirá en tu bandeja hasta que la apruebes o rechaces. Copiaremos el mensaje para que lo
              envíes por el <Link href="/erp/chat">Chat</Link>.
            </div>
          </>
        )}
      </Modal>
    </PageChrome>
  );
}
