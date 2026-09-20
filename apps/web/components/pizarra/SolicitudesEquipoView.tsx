"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import { Alert, Button, EmptyState, fieldClass } from "@/components/base";
import PersonaPhotoCard from "@/components/pizarra/PersonaPhotoCard";
import { formatApiError } from "@/lib/erp-api";
import {
  acceptPeerRequest,
  createPeerRequest,
  fetchPeerRequests,
  rejectPeerRequest,
  type PeerRequestItem,
} from "@/lib/peer-requests-api";
import { fetchTeamBoard } from "@/lib/team-board-api";

function estadoLabel(s: PeerRequestItem["status"]): string {
  if (s === "PENDING") return "Pendiente";
  if (s === "ACCEPTED") return "Aceptada";
  return "Rechazada";
}

/** Cuarta pestaña: solicitudes entre pares (no es el rechazo 403 de OT del jefe). */
export default function SolicitudesEquipoView({ token }: { token: string | null }) {
  const [sent, setSent] = useState<PeerRequestItem[]>([]);
  const [received, setReceived] = useState<PeerRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Array<{ id: number; nombre: string; puesto: string | null; avatarUrl: string | null }>>(
    [],
  );
  const [toUserId, setToUserId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectDraft, setRejectDraft] = useState<Record<number, string>>({});
  const [formMsg, setFormMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Inicia sesión para ver las solicitudes.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [req, board] = await Promise.all([
        fetchPeerRequests(token),
        fetchTeamBoard(token, {}).catch(() => null),
      ]);
      setSent(Array.isArray(req?.sent) ? req.sent : []);
      setReceived(Array.isArray(req?.received) ? req.received : []);
      const users = board?.users ?? [];
      setPeers(
        users.map((u) => ({
          id: u.id,
          nombre: u.nombre,
          puesto: u.puesto,
          avatarUrl: u.avatarUrl,
        })),
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las solicitudes"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const peerOptions = useMemo(
    () => peers.filter((p) => String(p.id) !== toUserId || true),
    [peers, toUserId],
  );

  const onCreate = async () => {
    if (!token) return;
    setFormMsg(null);
    try {
      await createPeerRequest(token, {
        toUserId: Number(toUserId),
        title,
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setToUserId("");
      setFormMsg({ kind: "ok", text: "Solicitud enviada" });
      await load();
    } catch (e) {
      setFormMsg({ kind: "error", text: formatApiError(e, "No se pudo enviar") });
    }
  };

  const onAccept = async (id: number) => {
    if (!token) return;
    setBusyId(id);
    try {
      await acceptPeerRequest(token, id);
      await load();
    } catch (e) {
      setError(formatApiError(e, "No se pudo aceptar"));
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: number) => {
    if (!token) return;
    const reason = (rejectDraft[id] ?? "").trim();
    if (reason.length < 3) return;
    setBusyId(id);
    try {
      await rejectPeerRequest(token, id, reason);
      await load();
    } catch (e) {
      setError(formatApiError(e, "No se pudo rechazar"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && sent.length === 0 && received.length === 0) {
    return <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando solicitudes…</p>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      <section
        style={{
          display: "grid",
          gap: 10,
          padding: 14,
          borderRadius: 14,
          border: "1px solid var(--ui-border, var(--border))",
          background: "var(--ui-surface, var(--surface))",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Nueva solicitud de equipo</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
          Pide apoyo a un compañero de tu mismo rango o superior. No reemplaza una actividad que te asignó tu
          jefe.
        </p>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Para quién
          <select
            className={fieldClass}
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            style={{ minHeight: 44, fontSize: 16 }}
          >
            <option value="">Elige a alguien…</option>
            {peerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.puesto ? ` · ${p.puesto}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          ¿Qué necesitas?
          <input
            className={fieldClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Apoyo en instalación de cámara"
            style={{ minHeight: 44, fontSize: 16 }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Detalle (opcional)
          <textarea
            className={fieldClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ fontSize: 16 }}
          />
        </label>
        {formMsg ? (
          <p style={{ margin: 0, fontSize: 13, color: formMsg.kind === "ok" ? "var(--success)" : "var(--danger)" }}>
            {formMsg.text}
          </p>
        ) : null}
        <Button
          onClick={() => void onCreate()}
          disabled={!token || !toUserId || title.trim().length < 3}
          style={{ minHeight: 44 }}
        >
          Enviar solicitud
        </Button>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recibidas</h3>
        {received.length === 0 ? (
          <EmptyState icon={<HandshakeOutlinedIcon />} title="Nadie te ha pedido apoyo" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {received.map((r) => (
              <PersonaPhotoCard
                key={r.id}
                nombre={r.fromUser.nombre}
                puesto={r.fromUser.puesto}
                avatarUrl={r.fromUser.avatarUrl}
                photoSize={200}
                title={r.title}
                subtitle={r.description}
                meta={
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {estadoLabel(r.status)}
                    {r.activity ? ` · ${r.activity.anNumber}` : ""}
                    {r.rejectReason ? ` · ${r.rejectReason}` : ""}
                  </span>
                }
                href={r.activity ? `/erp/actividades/${r.activity.id}` : undefined}
                actions={
                  r.status === "PENDING" ? (
                    <>
                      <Button
                        onClick={() => void onAccept(r.id)}
                        disabled={busyId === r.id}
                        style={{ minHeight: 40 }}
                      >
                        Aceptar
                      </Button>
                      <div style={{ flex: 1, minWidth: 120, display: "grid", gap: 4 }}>
                        <input
                          className={fieldClass}
                          placeholder="Motivo si rechazas"
                          value={rejectDraft[r.id] ?? ""}
                          onChange={(e) => setRejectDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                          aria-describedby={`reject-hint-${r.id}`}
                          style={{ width: "100%", minHeight: 40, fontSize: 16 }}
                        />
                        {(rejectDraft[r.id] ?? "").trim().length < 3 ? (
                          <span
                            id={`reject-hint-${r.id}`}
                            style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                          >
                            Escribe al menos 3 caracteres para poder rechazar.
                          </span>
                        ) : null}
                      </div>
                      <Button
                        onClick={() => void onReject(r.id)}
                        disabled={busyId === r.id || (rejectDraft[r.id] ?? "").trim().length < 3}
                        style={{ minHeight: 40 }}
                      >
                        Rechazar
                      </Button>
                    </>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Enviadas</h3>
        {sent.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Aún no enviaste solicitudes.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {sent.map((r) => (
              <PersonaPhotoCard
                key={r.id}
                nombre={r.toUser.nombre}
                puesto={r.toUser.puesto}
                avatarUrl={r.toUser.avatarUrl}
                photoSize={200}
                title={r.title}
                subtitle={r.description}
                meta={
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {estadoLabel(r.status)}
                    {r.activity ? ` · ${r.activity.anNumber}` : ""}
                    {r.rejectReason ? ` · Motivo: ${r.rejectReason}` : ""}
                  </span>
                }
                href={r.activity ? `/erp/actividades/${r.activity.id}` : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
