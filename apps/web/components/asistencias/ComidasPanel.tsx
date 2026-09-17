"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SvgIconComponent } from "@mui/icons-material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CameraswitchIcon from "@mui/icons-material/Cameraswitch";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import UndoIcon from "@mui/icons-material/Undo";
import SessionImage from "@/components/SessionImage";
import { IconBadge, IconLabel } from "@/components/ui/IconBadge";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { resolveAssetUrl } from "@/lib/evidence-display";

/** Fila de lunch-breaks tal como la devuelve la API (mi-dia / equipo / revision). */
type Registro = {
  id: number;
  userId: number;
  status: string;
  checkinTime: string;
  checkoutTime: string | null;
  checkinPhotoUrl: string | null;
  checkoutPhotoUrl: string | null;
  isCheckinLate: boolean;
  isCheckoutLate: boolean;
  checkinJustificacion: string | null;
  checkoutJustificacion: string | null;
  /** null = a tiempo · PENDIENTE | APROBADA | RECHAZADA cuando fue a destiempo. */
  revisionEstado: "PENDIENTE" | "APROBADA" | "RECHAZADA" | null;
  revisionNotas: string | null;
  revisadoPor: string | null;
  revisadoAt: string | null;
  minutos: number | null;
};

type MiDia = {
  debeRegistrar: boolean;
  ahora: string;
  ventana: { inicio: string; fin: string; regresoLimite: string; texto: string };
  salidaADestiempo: boolean;
  regresoADestiempo: boolean;
  siguiente: "salida" | "regreso" | "listo" | "no_aplica";
  registro: Registro | null;
};

type FilaEquipo = {
  userId: number;
  nombre: string;
  puesto: string | null;
  avatarUrl: string | null;
  registro: Registro | null;
  puedoRevisar: boolean;
};

type Equipo = {
  fecha: string;
  alcance: "todo" | "equipo" | "propio";
  filas: FilaEquipo[];
  resumen: { total: number; registraron: number; enComida: number; aDestiempo: number; pendientes: number };
};

type Filtro = "todos" | "pendientes" | "destiempo" | "comiendo" | "sin";

const VERDE = "#16a34a";
const NARANJA = "#d97706";
const ROJO = "#dc2626";
const AZUL = "#2563eb";

function hora(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function corto(nombre?: string | null) {
  return (nombre || "").split(/\s+/).slice(0, 2).join(" ");
}

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const tarjeta: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 12,
};

const btn: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 650,
  fontSize: 14,
  padding: "10px 16px",
  minHeight: 44,
  borderRadius: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const btnLleno = (color: string): CSSProperties => ({ ...btn, border: 0, color: "#fff", background: color });

function Chip({ children, color, icon: Icon }: { children: ReactNode; color?: string; icon?: SvgIconComponent }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 650,
        whiteSpace: "nowrap",
        border: `1px solid ${color ? `color-mix(in srgb, ${color} 35%, var(--border))` : "var(--border)"}`,
        background: color ? `color-mix(in srgb, ${color} 10%, var(--surface))` : "var(--surface)",
        color: color ?? "var(--text-secondary)",
      }}
    >
      {Icon ? <Icon aria-hidden="true" sx={{ fontSize: 16, flex: "0 0 auto" }} /> : null}
      {children}
    </span>
  );
}

/** Línea de texto con icono alineado a la primera línea (textos que pueden partirse). */
function ConIcono({ icon: Icon, color, children }: { icon: SvgIconComponent; color?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <Icon aria-hidden="true" sx={{ fontSize: 16, flex: "0 0 auto", mt: "2px", color: color ?? "var(--text-secondary)" }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

function estadoRevision(r: Registro | null): { label: string; color: string; icon: SvgIconComponent } | null {
  if (!r?.revisionEstado) return null;
  if (r.revisionEstado === "APROBADA") return { label: "Justificación aprobada", color: VERDE, icon: TaskAltIcon };
  if (r.revisionEstado === "RECHAZADA") return { label: "Justificación rechazada", color: ROJO, icon: CancelOutlinedIcon };
  return { label: "Por aprobar", color: NARANJA, icon: HourglassTopIcon };
}

/** Foto de comida (protegida) con visor grande al tocarla. */
function FotoComida({ url, titulo, onOpen }: { url: string | null; titulo: string; onOpen: (url: string, titulo: string) => void }) {
  if (!url) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(url, titulo)}
      aria-label={`Ver ${titulo}`}
      style={{
        padding: 0,
        width: 72,
        height: 72,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--text-secondary) 8%, var(--surface))",
        cursor: "zoom-in",
        flex: "0 0 auto",
      }}
    >
      <SessionImage src={resolveAssetUrl(url)} alt={titulo} style={{ width: 72, height: 72, objectFit: "cover", display: "block" }} />
    </button>
  );
}

function Visor({ foto, onClose }: { foto: { url: string; titulo: string }; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={foto.titulo}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(2,6,23,0.9)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: "grid", gap: 10, maxWidth: "min(96vw, 900px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", gap: 10, alignItems: "center" }}>
          <strong>{foto.titulo}</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ ...btn, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
          >
            <CloseIcon aria-hidden="true" sx={{ fontSize: 20 }} />
          </button>
        </div>
        <SessionImage
          src={resolveAssetUrl(foto.url)}
          alt={foto.titulo}
          style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 12 }}
        />
      </div>
    </div>,
    document.body,
  );
}

/** Cámara en vivo → vista previa → (justificación si es a destiempo) → registrar. */
function RegistroModal({
  momento,
  aDestiempo,
  ventanaTexto,
  onClose,
  onDone,
}: {
  momento: "salida" | "regreso";
  aDestiempo: boolean;
  ventanaTexto: string;
  onClose: () => void;
  onDone: (aviso: string) => void;
}) {
  const { token } = useUser();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [lista, setLista] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [pideMotivo, setPideMotivo] = useState(aDestiempo);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (foto) return;
    let cancelado = false;
    let stream: MediaStream | null = null;
    setLista(false);
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setLista(true);
        setError(null);
      } catch {
        if (!cancelado) setError("No se pudo abrir la cámara: da permiso de cámara al navegador.");
      }
    })();
    return () => {
      cancelado = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, foto]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !enviando && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, enviando]);

  const tomar = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * escala);
    canvas.height = Math.round(v.videoHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    setFoto(canvas.toDataURL("image/jpeg", 0.7));
  };

  const registrar = async () => {
    if (!foto || !token) return;
    const texto = motivo.trim();
    if (pideMotivo && texto.length < 5) {
      setError("Escribe por qué (al menos 5 letras): tu jefe lo revisará.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const ahora = new Date().toISOString();
      if (momento === "salida") {
        await erpFetch("lunch-breaks/checkin", token, {
          method: "POST",
          body: JSON.stringify({ checkinTime: ahora, checkinPhotoUrl: foto, justificacion: texto || undefined }),
        });
      } else {
        await erpFetch("lunch-breaks/checkout", token, {
          method: "PUT",
          body: JSON.stringify({ checkoutTime: ahora, checkoutPhotoUrl: foto, justificacion: texto || undefined }),
        });
      }
      onDone(
        momento === "salida"
          ? pideMotivo
            ? "Registraste tu salida a comer. Tu justificación quedó por aprobar."
            : "Registraste tu salida a comer. ¡Buen provecho!"
          : pideMotivo
            ? "Registraste tu regreso. Tu justificación quedó por aprobar."
            : "Registraste tu regreso de comer.",
      );
    } catch (e) {
      const msg = formatApiError(e, "No se pudo registrar tu comida");
      // La API decide con su hora: si dice que ya es a destiempo, se pide el motivo.
      if (/horario|hora de regreso|por qué/i.test(msg)) setPideMotivo(true);
      setError(msg);
    } finally {
      setEnviando(false);
    }
  };

  if (typeof document === "undefined") return null;
  const titulo = momento === "salida" ? "Foto de salida a comer" : "Foto de regreso de comer";
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={() => !enviando && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(2,6,23,0.6)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          background: "var(--surface)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px rgba(2,6,23,0.35)",
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <header>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            <IconLabel icon={PhotoCameraOutlinedIcon} size={20} gap={8} iconColor="var(--primary)">
              {titulo}
            </IconLabel>
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {momento === "salida"
              ? "Acomódate y toma la foto: se guarda con la hora en que sales."
              : "Toma la foto al volver a tu lugar: se guarda con la hora en que regresas."}
          </p>
        </header>

        <div
          style={{
            position: "relative",
            borderRadius: 16,
            overflow: "hidden",
            background: "#0f172a",
            aspectRatio: "4 / 3",
            display: "grid",
            placeItems: "center",
          }}
        >
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="Tu foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
          )}
          {!foto && !lista && !error ? (
            <span style={{ position: "absolute", color: "#fff", fontSize: 13 }}>Abriendo cámara…</span>
          ) : null}
        </div>

        {foto && pideMotivo ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                fontSize: 13,
                lineHeight: 1.45,
                padding: "8px 12px",
                borderRadius: 10,
                background: `color-mix(in srgb, ${NARANJA} 10%, var(--surface))`,
                border: `1px solid color-mix(in srgb, ${NARANJA} 35%, var(--border))`,
              }}
            >
              <AccessTimeIcon aria-hidden="true" sx={{ fontSize: 18, flex: "0 0 auto", color: NARANJA }} />
              <span>
                Estás fuera del horario de comida ({ventanaTexto}). Escribe por qué; tu jefe lo aprobará o rechazará y queda en
                el registro.
              </span>
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={
                momento === "salida"
                  ? "Ej. Estaba en sitio con el cliente de 2 a 4 y salí a comer al terminar."
                  : "Ej. La fila del comedor tardó; regresé en cuanto pude."
              }
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 12,
                border: "1px solid var(--border)",
                padding: "10px 12px",
                font: "inherit",
                fontSize: 14.5,
                background: "var(--surface)",
                color: "inherit",
                resize: "vertical",
              }}
            />
          </label>
        ) : null}

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}

        <footer style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" style={btn} onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          {foto ? (
            <>
              <button type="button" style={btn} onClick={() => setFoto(null)} disabled={enviando}>
                <CameraswitchIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                Tomar otra
              </button>
              <button type="button" style={btnLleno(pideMotivo ? NARANJA : VERDE)} onClick={() => void registrar()} disabled={enviando}>
                {enviando ? (
                  "Registrando…"
                ) : (
                  <>
                    <CheckIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                    {momento === "salida" ? "Registrar salida" : "Registrar regreso"}
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button type="button" style={btn} onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}>
                <CameraswitchIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                {facing === "user" ? "Usar trasera" : "Usar frontal"}
              </button>
              <button type="button" style={btnLleno(AZUL)} onClick={tomar} disabled={!lista}>
                <PhotoCameraOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                Tomar foto
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function RevisionModal({
  fila,
  decisionInicial,
  onClose,
  onDone,
}: {
  fila: FilaEquipo;
  decisionInicial: "aprobar" | "rechazar";
  onClose: () => void;
  onDone: (aviso: string) => void;
}) {
  const { token } = useUser();
  const [decision, setDecision] = useState(decisionInicial);
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = fila.registro;

  const guardar = async () => {
    if (!token || !r) return;
    if (decision === "rechazar" && notas.trim().length < 5) {
      setError("Escribe por qué la rechazas (al menos 5 letras).");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await erpFetch(`lunch-breaks/${r.id}/revision`, token, {
        method: "PATCH",
        body: JSON.stringify({ decision, notas: notas.trim() || undefined }),
      });
      onDone(
        decision === "aprobar"
          ? `Aprobaste la comida a destiempo de ${corto(fila.nombre)}.`
          : `Rechazaste la comida a destiempo de ${corto(fila.nombre)}.`,
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar la revisión"));
    } finally {
      setEnviando(false);
    }
  };

  if (typeof document === "undefined" || !r) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Revisar comida de ${fila.nombre}`}
      onClick={() => !enviando && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(2,6,23,0.55)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 500,
          background: "var(--surface)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px rgba(2,6,23,0.35)",
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Comida a destiempo de {corto(fila.nombre)}</h3>
        <div style={{ display: "grid", gap: 8, fontSize: 13.5, lineHeight: 1.45 }}>
          <ConIcono icon={RestaurantOutlinedIcon}>
            Salió <strong>{hora(r.checkinTime)}</strong>
            {r.checkoutTime ? (
              <>
                {" "}
                · regresó <strong>{hora(r.checkoutTime)}</strong>
                {r.minutos != null ? ` (${r.minutos} min)` : ""}
              </>
            ) : (
              " · sigue en comida"
            )}
          </ConIcono>
          {r.checkinJustificacion ? <ConIcono icon={ChatBubbleOutlineIcon}>Salida: «{r.checkinJustificacion}»</ConIcono> : null}
          {r.checkoutJustificacion ? <ConIcono icon={ChatBubbleOutlineIcon}>Regreso: «{r.checkoutJustificacion}»</ConIcono> : null}
        </div>
        <div role="radiogroup" aria-label="Decisión" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(["aprobar", "rechazar"] as const).map((d) => {
            const on = decision === d;
            const color = d === "aprobar" ? VERDE : ROJO;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDecision(d)}
                style={{
                  ...btn,
                  minHeight: 48,
                  border: `2px solid ${on ? color : "var(--border)"}`,
                  background: on ? `color-mix(in srgb, ${color} 12%, var(--surface))` : "var(--surface)",
                  color: on ? color : "inherit",
                }}
              >
                {d === "aprobar" ? (
                  <>
                    <TaskAltIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                    Aprobar
                  </>
                ) : (
                  <>
                    <CancelOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                    Rechazar
                  </>
                )}
              </button>
            );
          })}
        </div>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 750 }}>
            {decision === "aprobar" ? "Comentario (opcional)" : "¿Por qué la rechazas?"}
          </span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            maxLength={1000}
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 12,
              border: "1px solid var(--border)",
              padding: "10px 12px",
              font: "inherit",
              fontSize: 14.5,
              background: "var(--surface)",
              color: "inherit",
              resize: "vertical",
            }}
          />
        </label>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={btn} onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" style={btnLleno(decision === "aprobar" ? VERDE : ROJO)} onClick={() => void guardar()} disabled={enviando}>
            {enviando ? (
              "Guardando…"
            ) : decision === "aprobar" ? (
              <>
                <TaskAltIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                Aprobar
              </>
            ) : (
              <>
                <CancelOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                Rechazar
              </>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function MiComida({
  mi,
  offsetMs,
  onRegistrar,
  onVerFoto,
}: {
  mi: MiDia;
  offsetMs: number;
  onRegistrar: (momento: "salida" | "regreso", aDestiempo: boolean) => void;
  onVerFoto: (url: string, titulo: string) => void;
}) {
  const [ahora, setAhora] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now() + offsetMs), 30_000);
    return () => window.clearInterval(t);
  }, [offsetMs]);

  const inicio = new Date(mi.ventana.inicio).getTime();
  const fin = new Date(mi.ventana.fin).getTime();
  const limite = new Date(mi.ventana.regresoLimite).getTime();
  const r = mi.registro;
  const revision = estadoRevision(r);

  if (mi.siguiente === "salida") {
    const destiempo = ahora < inicio || ahora > fin;
    return (
      <article style={{ ...tarjeta, borderLeft: `4px solid ${destiempo ? NARANJA : VERDE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <IconBadge icon={RestaurantOutlinedIcon} size={32} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Tu hora de comida</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                Horario: {mi.ventana.texto} · registra tu salida y tu regreso con foto.
              </div>
            </div>
          </div>
          <Chip color={destiempo ? NARANJA : VERDE} icon={destiempo ? AccessTimeIcon : CheckIcon}>
            {destiempo ? "Fuera de horario" : "Es tu horario"}
          </Chip>
        </div>
        {destiempo ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "var(--text-secondary)" }}>
            Si sales a comer ahora tendrás que escribir por qué; tu jefe lo aprobará o rechazará.
          </p>
        ) : null}
        <button type="button" style={{ ...btnLleno(destiempo ? NARANJA : VERDE), justifySelf: "start" }} onClick={() => onRegistrar("salida", destiempo)}>
          <RestaurantOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          Salir a comer
        </button>
      </article>
    );
  }

  if (mi.siguiente === "regreso" && r) {
    const destiempo = ahora > limite;
    const minutos = Math.max(0, Math.round((ahora - new Date(r.checkinTime).getTime()) / 60_000));
    return (
      <article style={{ ...tarjeta, borderLeft: `4px solid ${destiempo ? NARANJA : AZUL}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <FotoComida url={r.checkinPhotoUrl} titulo="Tu foto de salida" onOpen={onVerFoto} />
            <IconBadge icon={RestaurantOutlinedIcon} size={32} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Estás en tu hora de comida</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                Saliste a las {hora(r.checkinTime)} · llevas {minutos} min
              </div>
            </div>
          </div>
          {revision ? (
            <Chip color={revision.color} icon={revision.icon}>
              {revision.label}
            </Chip>
          ) : null}
        </div>
        {destiempo ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--text-secondary)",
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
            }}
          >
            <AccessTimeIcon aria-hidden="true" sx={{ fontSize: 16, flex: "0 0 auto", mt: "1px", color: NARANJA }} />
            <span>Ya pasó la hora de regreso (4:00 p.m.): al registrar tendrás que escribir por qué.</span>
          </p>
        ) : null}
        <button type="button" style={{ ...btnLleno(destiempo ? NARANJA : AZUL), justifySelf: "start" }} onClick={() => onRegistrar("regreso", destiempo)}>
          <UndoIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          Ya regresé
        </button>
      </article>
    );
  }

  if (mi.siguiente === "listo" && r) {
    return (
      <article style={{ ...tarjeta, borderLeft: `4px solid ${r.revisionEstado === "RECHAZADA" ? ROJO : r.revisionEstado === "PENDIENTE" ? NARANJA : VERDE}` }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <FotoComida url={r.checkinPhotoUrl} titulo="Tu foto de salida" onOpen={onVerFoto} />
          <FotoComida url={r.checkoutPhotoUrl} titulo="Tu foto de regreso" onOpen={onVerFoto} />
          <div style={{ flex: "1 1 200px", display: "flex", gap: 12, alignItems: "center" }}>
            <IconBadge icon={TaskAltIcon} size={32} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Comida registrada</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {hora(r.checkinTime)} → {hora(r.checkoutTime)}
                {r.minutos != null ? ` · ${r.minutos} min` : ""}
              </div>
            </div>
          </div>
          <Chip color={revision ? revision.color : VERDE} icon={revision?.icon}>
            {revision ? revision.label : "A tiempo"}
          </Chip>
        </div>
        {r.revisionEstado && r.revisionEstado !== "PENDIENTE" ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            {corto(r.revisadoPor) || "Tu jefe"} {r.revisionEstado === "APROBADA" ? "la aprobó" : "la rechazó"}
            {r.revisionNotas ? `: «${r.revisionNotas}»` : "."}
          </p>
        ) : null}
      </article>
    );
  }

  return null;
}

function FilaPersona({
  fila,
  onRevisar,
  onVerFoto,
}: {
  fila: FilaEquipo;
  onRevisar: (fila: FilaEquipo, decision: "aprobar" | "rechazar") => void;
  onVerFoto: (url: string, titulo: string) => void;
}) {
  const r = fila.registro;
  const revision = estadoRevision(r);
  const estado: { label: string; color: string | undefined; icon?: SvgIconComponent } = !r
    ? { label: "Sin registrar", color: undefined }
    : !r.checkoutTime
      ? { label: "En comida", color: AZUL, icon: RestaurantOutlinedIcon }
      : { label: "Completa", color: VERDE, icon: TaskAltIcon };
  const color = revision?.color ?? (r ? (r.checkoutTime ? VERDE : AZUL) : "var(--border)");

  return (
    <article style={{ ...tarjeta, borderLeft: `4px solid ${color}`, gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 14,
            color: "var(--primary)",
            background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
            flex: "0 0 auto",
          }}
        >
          {iniciales(fila.nombre)}
        </div>
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div style={{ fontWeight: 750, fontSize: 14.5 }}>{fila.nombre}</div>
          {fila.puesto ? <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{fila.puesto}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip color={estado.color} icon={estado.icon}>
            {estado.label}
          </Chip>
          {revision ? (
            <Chip color={revision.color} icon={revision.icon}>
              {revision.label}
            </Chip>
          ) : null}
        </div>
      </div>

      {r ? (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <FotoComida url={r.checkinPhotoUrl} titulo={`${corto(fila.nombre)} · salida`} onOpen={onVerFoto} />
          <FotoComida url={r.checkoutPhotoUrl} titulo={`${corto(fila.nombre)} · regreso`} onOpen={onVerFoto} />
          <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: r.isCheckinLate ? NARANJA : "inherit" }}>{hora(r.checkinTime)}</span>
            <span style={{ opacity: 0.45, margin: "0 6px" }}>→</span>
            <span style={{ color: r.isCheckoutLate ? NARANJA : "inherit" }}>{r.checkoutTime ? hora(r.checkoutTime) : "en comida"}</span>
            {r.minutos != null ? <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}> · {r.minutos} min</span> : null}
          </div>
        </div>
      ) : null}

      {r?.checkinJustificacion || r?.checkoutJustificacion ? (
        <div
          style={{
            display: "grid",
            gap: 4,
            fontSize: 13,
            lineHeight: 1.45,
            padding: "8px 12px",
            borderRadius: 10,
            background: "color-mix(in srgb, var(--text-secondary) 6%, var(--surface))",
          }}
        >
          {r.checkinJustificacion ? (
            <ConIcono icon={ChatBubbleOutlineIcon}>
              Salida a las {hora(r.checkinTime)}: «{r.checkinJustificacion}»
            </ConIcono>
          ) : null}
          {r.checkoutJustificacion ? (
            <ConIcono icon={ChatBubbleOutlineIcon}>
              Regreso a las {hora(r.checkoutTime)}: «{r.checkoutJustificacion}»
            </ConIcono>
          ) : null}
          {r.revisionEstado && r.revisionEstado !== "PENDIENTE" ? (
            <div style={{ color: "var(--text-secondary)" }}>
              {corto(r.revisadoPor) || "—"} {r.revisionEstado === "APROBADA" ? "aprobó" : "rechazó"}
              {r.revisionNotas ? `: «${r.revisionNotas}»` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {fila.puedoRevisar && r ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {r.revisionEstado === "PENDIENTE" ? (
            <>
              <button type="button" style={btnLleno(VERDE)} onClick={() => onRevisar(fila, "aprobar")}>
                <TaskAltIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                Aprobar
              </button>
              <button type="button" style={btnLleno(ROJO)} onClick={() => onRevisar(fila, "rechazar")}>
                <CancelOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                Rechazar
              </button>
            </>
          ) : (
            <button
              type="button"
              style={{ ...btn, minHeight: 36, fontSize: 13 }}
              onClick={() => onRevisar(fila, r.revisionEstado === "APROBADA" ? "rechazar" : "aprobar")}
            >
              Cambiar decisión
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Pestaña Comidas de Asistencias: tu salida/regreso con foto (todos menos Christian) y, para jefes,
 * las comidas de su gente con aprobación de las que fueron fuera de 3 a 4 p.m.
 */
export default function ComidasPanel({ fecha }: { fecha: string }) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [mi, setMi] = useState<MiDia | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [registrando, setRegistrando] = useState<{ momento: "salida" | "regreso"; aDestiempo: boolean } | null>(null);
  const [revisando, setRevisando] = useState<{ fila: FilaEquipo; decision: "aprobar" | "rechazar" } | null>(null);
  const [foto, setFoto] = useState<{ url: string; titulo: string } | null>(null);
  const esHoy = fecha === hoyIso();

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const [miDia, eq] = await Promise.all([
        esHoy ? erpFetch<MiDia>("lunch-breaks/mi-dia", token) : Promise.resolve(null),
        erpFetch<Equipo>(`lunch-breaks/equipo?fecha=${encodeURIComponent(fecha)}`, token),
      ]);
      setMi(miDia);
      if (miDia) setOffsetMs(new Date(miDia.ahora).getTime() - Date.now());
      setEquipo(eq);
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las comidas"));
    } finally {
      setCargando(false);
    }
  }, [token, fecha, esHoy]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const filas = useMemo(() => {
    const todas = equipo?.filas ?? [];
    switch (filtro) {
      case "pendientes":
        return todas.filter((f) => f.registro?.revisionEstado === "PENDIENTE");
      case "destiempo":
        return todas.filter((f) => f.registro?.revisionEstado);
      case "comiendo":
        return todas.filter((f) => f.registro && !f.registro.checkoutTime);
      case "sin":
        return todas.filter((f) => !f.registro);
      default:
        return todas;
    }
  }, [equipo, filtro]);

  const verFoto = useCallback((url: string, titulo: string) => setFoto({ url, titulo }), []);
  const cerrarFoto = useCallback(() => setFoto(null), []);
  const cerrarRegistro = useCallback(() => setRegistrando(null), []);
  const cerrarRevision = useCallback(() => setRevisando(null), []);

  const resumen = equipo?.resumen;
  const tieneEquipo = Boolean(equipo && equipo.alcance !== "propio");
  const filtros: Array<{ key: Filtro; label: string; n?: number }> = [
    { key: "todos", label: "Todos", n: resumen?.total },
    { key: "pendientes", label: "Por aprobar", n: resumen?.pendientes },
    { key: "destiempo", label: "A destiempo", n: resumen?.aDestiempo },
    { key: "comiendo", label: "En comida", n: resumen?.enComida },
    { key: "sin", label: "Sin registrar", n: resumen ? resumen.total - resumen.registraron : undefined },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "#b91c1c" }}>
          {error}{" "}
          <button type="button" style={{ ...btn, minHeight: 32, padding: "4px 10px", fontSize: 12.5 }} onClick={() => void cargar()}>
            Reintentar
          </button>
        </p>
      ) : null}

      {aviso ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 650,
            background: `color-mix(in srgb, ${VERDE} 10%, var(--surface))`,
            border: `1px solid color-mix(in srgb, ${VERDE} 35%, var(--border))`,
          }}
        >
          {aviso}
        </p>
      ) : null}

      {cargando && !mi && !equipo ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Cargando comidas…</p>
      ) : null}

      {esHoy && mi?.debeRegistrar ? (
        <MiComida mi={mi} offsetMs={offsetMs} onRegistrar={(momento, aDestiempo) => setRegistrando({ momento, aDestiempo })} onVerFoto={verFoto} />
      ) : null}

      {tieneEquipo && equipo ? (
        <section style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Comidas de tu equipo</h2>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                {equipo.alcance === "todo" ? "Toda la empresa." : "Tu gente por organigrama."} Horario 3:00 a 4:00 p.m.; lo que
                sea fuera de esa hora trae justificación y lo apruebas o rechazas.
              </p>
            </div>
            <button type="button" style={{ ...btn, minHeight: 38, fontSize: 13 }} onClick={() => void cargar()} disabled={cargando}>
              {cargando ? (
                "Actualizando…"
              ) : (
                <>
                  <RefreshIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                  Actualizar
                </>
              )}
            </button>
          </div>

          {resumen?.pendientes ? (
            <p
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: 12,
                fontSize: 13.5,
                fontWeight: 650,
                background: `color-mix(in srgb, ${NARANJA} 10%, var(--surface))`,
                border: `1px solid color-mix(in srgb, ${NARANJA} 35%, var(--border))`,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <HourglassTopIcon aria-hidden="true" sx={{ fontSize: 18, flex: "0 0 auto", color: NARANJA }} />
              <span>
                Tienes {resumen.pendientes} comida{resumen.pendientes === 1 ? "" : "s"} a destiempo por aprobar.
              </span>
            </p>
          ) : null}

          <div role="tablist" aria-label="Filtrar comidas" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {filtros.map((f) => {
              const on = filtro === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFiltro(f.key)}
                  style={{
                    ...btn,
                    minHeight: 36,
                    padding: "6px 12px",
                    fontSize: 13,
                    borderRadius: 999,
                    border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
                    background: on ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
                    color: on ? "var(--primary)" : "inherit",
                  }}
                >
                  {f.label}
                  {f.n != null ? <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{f.n}</span> : null}
                </button>
              );
            })}
          </div>

          {filas.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Nadie en este filtro.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
              {filas.map((fila) => (
                <FilaPersona key={fila.userId} fila={fila} onRevisar={(f, decision) => setRevisando({ fila: f, decision })} onVerFoto={verFoto} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!cargando && !tieneEquipo && !(esHoy && mi?.debeRegistrar) ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          {esHoy ? "No tienes comidas que registrar ni gente a tu cargo." : "Tu comida de ese día no se puede cambiar."}
        </p>
      ) : null}

      {registrando && mi ? (
        <RegistroModal
          momento={registrando.momento}
          aDestiempo={registrando.aDestiempo}
          ventanaTexto={mi.ventana.texto}
          onClose={cerrarRegistro}
          onDone={(texto) => {
            setRegistrando(null);
            setAviso(texto);
            void cargar();
          }}
        />
      ) : null}

      {revisando ? (
        <RevisionModal
          fila={revisando.fila}
          decisionInicial={revisando.decision}
          onClose={cerrarRevision}
          onDone={(texto) => {
            setRevisando(null);
            setAviso(texto);
            void cargar();
          }}
        />
      ) : null}

      {foto ? <Visor foto={foto} onClose={cerrarFoto} /> : null}
    </div>
  );
}
