"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import { Alert, Button, EmptyState, SkeletonRows } from "@/components/base";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
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
import s from "./SolicitudesEquipoView.module.css";

type Peer = { id: number; nombre: string; puesto: string | null; avatarUrl: string | null };

function estadoLabel(estado: PeerRequestItem["status"]): string {
  if (estado === "PENDING") return "Pendiente";
  if (estado === "ACCEPTED") return "Aceptada";
  return "Rechazada";
}

/**
 * Tono del estado (regla 3 del contrato): color solo cuando el renglón pide
 * acción o algo salió mal. Una solicitud que yo envié y sigue pendiente no me
 * pide nada; una que me llegó, sí.
 */
function estadoTono(estado: PeerRequestItem["status"], lado: "recibida" | "enviada"): StatusTone {
  if (estado === "ACCEPTED") return "success";
  if (estado === "REJECTED") return "danger";
  return lado === "recibida" ? "warning" : "neutral";
}

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Cuarta pestaña: solicitudes entre pares (no es el rechazo 403 de OT del jefe). */
export default function SolicitudesEquipoView({ token }: { token: string | null }) {
  const [sent, setSent] = useState<PeerRequestItem[]>([]);
  const [received, setReceived] = useState<PeerRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [formMsg, setFormMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [rejectDraft, setRejectDraft] = useState<Record<number, string>>({});
  const [motivoCorto, setMotivoCorto] = useState<number | null>(null);
  const paraQuienRef = useRef<HTMLSelectElement>(null);
  const tituloRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setPrimeraCarga(false);
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
      // Si el tablero falla, se queda la lista de compañeros que ya teníamos:
      // un error al refrescar no puede dejar el selector vacío.
      if (board?.users) {
        setPeers(
          board.users.map((u) => ({
            id: u.id,
            nombre: u.nombre,
            puesto: u.puesto,
            avatarUrl: u.avatarUrl,
          })),
        );
      }
    } catch (e) {
      // Sin tocar `sent`/`received`: lo que ya estaba en pantalla sigue ahí.
      setError(formatApiError(e, "No se pudieron cargar las solicitudes"));
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const faltaPersona = toUserId === "";
  const faltaTitulo = title.trim().length < 3;
  const errPersona = intento && faltaPersona ? "Elige a quién le pides apoyo." : null;
  const errTitulo = intento && faltaTitulo ? "Escríbelo en tres letras o más." : null;
  const cargandoCompaneros = primeraCarga && peers.length === 0;

  const onCreate = async () => {
    if (!token) return;
    setFormMsg(null);
    setIntento(true);
    // El botón no se queda muerto: si falta algo, se dice bajo el campo que falta.
    if (faltaPersona || faltaTitulo) {
      (faltaPersona ? paraQuienRef.current : tituloRef.current)?.focus();
      return;
    }
    setEnviando(true);
    try {
      await createPeerRequest(token, {
        toUserId: Number(toUserId),
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setToUserId("");
      setIntento(false);
      setFormMsg({ kind: "ok", text: "Solicitud enviada" });
      await load();
    } catch (e) {
      setFormMsg({ kind: "error", text: formatApiError(e, "No se pudo enviar") });
    } finally {
      setEnviando(false);
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
    if (reason.length < 3) {
      setMotivoCorto(id);
      return;
    }
    setMotivoCorto(null);
    setBusyId(id);
    try {
      await rejectPeerRequest(token, id, reason);
      setRechazando(null);
      setRejectDraft((d) => {
        const resto = { ...d };
        delete resto[id];
        return resto;
      });
      await load();
    } catch (e) {
      setError(formatApiError(e, "No se pudo rechazar"));
    } finally {
      setBusyId(null);
    }
  };

  const meta = (r: PeerRequestItem, lado: "recibida" | "enviada") => (
    <div className={s.bloqueMeta}>
      <StatusDot label={estadoLabel(r.status)} tone={estadoTono(r.status, lado)} />
      <span className={s.pista}>
        {lado === "recibida" ? "Te la pidieron" : "La enviaste"} el {fechaCorta(r.createdAt)}
        {r.activity ? ` · ${r.activity.anNumber}` : ""}
      </span>
      {r.rejectReason ? <span className={s.pista}>Motivo: {r.rejectReason}</span> : null}
    </div>
  );

  const acciones = (r: PeerRequestItem) => {
    if (r.status !== "PENDING") return null;
    if (rechazando !== r.id) {
      return (
        <>
          <Button onClick={() => void onAccept(r.id)} disabled={busyId === r.id}>
            Aceptar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setMotivoCorto(null);
              setRechazando(r.id);
            }}
            disabled={busyId === r.id}
          >
            Rechazar
          </Button>
        </>
      );
    }
    const corto = motivoCorto === r.id;
    return (
      <div className={s.rechazo}>
        <label className={s.etiqueta} htmlFor={`motivo-${r.id}`}>
          Motivo del rechazo
        </label>
        <input
          id={`motivo-${r.id}`}
          className={s.control}
          autoFocus
          value={rejectDraft[r.id] ?? ""}
          onChange={(e) => setRejectDraft((d) => ({ ...d, [r.id]: e.target.value }))}
          aria-describedby={corto ? `motivo-msg-${r.id}` : undefined}
        />
        {corto ? (
          <span id={`motivo-msg-${r.id}`} className={s.error} role="alert">
            Escríbelo en tres letras o más.
          </span>
        ) : null}
        <div className={s.rechazoBotones}>
          <Button
            variant="ghost"
            onClick={() => {
              setRechazando(null);
              setMotivoCorto(null);
            }}
            disabled={busyId === r.id}
          >
            Cancelar
          </Button>
          <Button onClick={() => void onReject(r.id)} disabled={busyId === r.id}>
            Confirmar rechazo
          </Button>
        </div>
      </div>
    );
  };

  const sinSolicitudes = received.length === 0 && sent.length === 0;

  return (
    <div className={s.vista}>
      {error ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button onClick={() => void load()} disabled={loading}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <section className={s.bloque} aria-labelledby="pedir-apoyo">
        <h3 id="pedir-apoyo" className={s.titulo}>
          Pedir apoyo
        </h3>
        <div className={s.formulario}>
          <div className={s.rejilla}>
            <div className={s.campo}>
              <label className={s.etiqueta} htmlFor="solicitud-para">
                Para quién
              </label>
              <select
                id="solicitud-para"
                ref={paraQuienRef}
                className={s.control}
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                disabled={!token || cargandoCompaneros}
                aria-describedby="solicitud-para-msg"
              >
                <option value="">{cargandoCompaneros ? "Cargando compañeros…" : "Elige a alguien…"}</option>
                {peers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.puesto ? ` · ${p.puesto}` : ""}
                  </option>
                ))}
              </select>
              <span
                id="solicitud-para-msg"
                className={errPersona ? s.error : s.pista}
                role={errPersona ? "alert" : undefined}
              >
                {errPersona ?? "De tu mismo rango o superior."}
              </span>
            </div>

            <div className={s.campo}>
              <label className={s.etiqueta} htmlFor="solicitud-titulo">
                ¿Qué necesitas?
              </label>
              <input
                id="solicitud-titulo"
                ref={tituloRef}
                className={s.control}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Apoyo en instalación de cámara"
                aria-describedby={errTitulo ? "solicitud-titulo-msg" : undefined}
              />
              {errTitulo ? (
                <span id="solicitud-titulo-msg" className={s.error} role="alert">
                  {errTitulo}
                </span>
              ) : null}
            </div>

            <div className={`${s.campo} ${s.campoFull}`}>
              <label className={s.etiqueta} htmlFor="solicitud-detalle">
                Detalle
                <span className={s.opcional}> · opcional</span>
              </label>
              <textarea
                id="solicitud-detalle"
                className={s.control}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cuándo, dónde y qué hace falta."
              />
            </div>
          </div>

          {formMsg?.kind === "error" ? (
            <Alert tone="danger" role="alert">
              {formMsg.text}
            </Alert>
          ) : null}

          <div className={s.pie}>
            {formMsg?.kind === "ok" ? (
              <span className={s.ok} role="status">
                {formMsg.text}
              </span>
            ) : null}
            <Button variant="primary" onClick={() => void onCreate()} disabled={!token || enviando}>
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </div>
        </div>
      </section>

      {primeraCarga ? (
        <SkeletonRows rows={3} label="Cargando solicitudes" />
      ) : sinSolicitudes ? (
        // Regla 7: dos encabezados con dos vacíos no informan. Uno solo, con el
        // primer paso a la mano.
        <EmptyState
          icon={<HandshakeOutlinedIcon />}
          title="Todavía no hay solicitudes"
          description="Aquí aparece el apoyo que pidas y el que te pidan tus compañeros."
          action={<Button onClick={() => paraQuienRef.current?.focus()}>Pedir apoyo</Button>}
        />
      ) : (
        <>
          {received.length > 0 ? (
            <section className={s.bloque} aria-labelledby="solicitudes-recibidas">
              <h3 id="solicitudes-recibidas" className={s.titulo}>
                Recibidas
                <span className={s.conteo}>{received.length}</span>
              </h3>
              <div className={s.tarjetas}>
                {received.map((r) => (
                  <PersonaPhotoCard
                    key={r.id}
                    nombre={r.fromUser.nombre}
                    puesto={r.fromUser.puesto}
                    avatarUrl={r.fromUser.avatarUrl}
                    photoSize={200}
                    title={r.title}
                    subtitle={r.description}
                    meta={meta(r, "recibida")}
                    href={r.activity ? `/erp/actividades/${r.activity.id}` : undefined}
                    actions={acciones(r)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {sent.length > 0 ? (
            <section className={s.bloque} aria-labelledby="solicitudes-enviadas">
              <h3 id="solicitudes-enviadas" className={s.titulo}>
                Enviadas
                <span className={s.conteo}>{sent.length}</span>
              </h3>
              <div className={s.tarjetas}>
                {sent.map((r) => (
                  <PersonaPhotoCard
                    key={r.id}
                    nombre={r.toUser.nombre}
                    puesto={r.toUser.puesto}
                    avatarUrl={r.toUser.avatarUrl}
                    photoSize={200}
                    title={r.title}
                    subtitle={r.description}
                    meta={meta(r, "enviada")}
                    href={r.activity ? `/erp/actividades/${r.activity.id}` : undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
