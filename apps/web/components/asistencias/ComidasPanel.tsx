"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import Modal from "@/components/ui/Modal";
import { useUser } from "@/components/UserContext";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  Field,
  FilterChip,
  FilterChips,
  Segmented,
  SkeletonRows,
  Textarea,
  type Tone,
} from "@/components/base";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { horaCorta, minutosCortos } from "./formato";
import s from "./comidas.module.css";

/** Registro de comida tal como lo devuelve la API (mi día / equipo / revisión). */
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

/** «3:02 p.m.» (sin segundos). */
const hora = (iso?: string | null) => horaCorta(iso);

function corto(nombre?: string | null) {
  return (nombre || "").split(/\s+/).slice(0, 2).join(" ");
}

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Línea de texto con icono alineado a la primera línea (textos que pueden partirse). */
function ConIcono({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={s.conIcono}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

function estadoRevision(r: Registro | null): { label: string; tone: Tone; icon: ReactNode } | null {
  if (!r?.revisionEstado) return null;
  if (r.revisionEstado === "APROBADA")
    return { label: "Justificación aprobada", tone: "success", icon: <TaskAltIcon fontSize="inherit" aria-hidden="true" /> };
  if (r.revisionEstado === "RECHAZADA")
    return { label: "Justificación rechazada", tone: "danger", icon: <CancelOutlinedIcon fontSize="inherit" aria-hidden="true" /> };
  return { label: "Por aprobar", tone: "warning", icon: <HourglassTopIcon fontSize="inherit" aria-hidden="true" /> };
}

/** Foto de comida (protegida) con visor grande al tocarla. */
function FotoComida({ url, titulo, onOpen }: { url: string | null; titulo: string; onOpen: (url: string, titulo: string) => void }) {
  if (!url) return null;
  return (
    <Button variant="ghost" icon className={s.foto} onClick={() => onOpen(url, titulo)} aria-label={`Ver ${titulo}`} title={`Ver ${titulo}`}>
      <SessionImage src={resolveAssetUrl(url)} alt={titulo} className={s.fotoImg} />
    </Button>
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
    <div role="dialog" aria-modal="true" aria-label={foto.titulo} onClick={onClose} className={s.visor}>
      <div onClick={(e) => e.stopPropagation()} className={s.visorCaja}>
        <div className={s.visorHead}>
          <strong>{foto.titulo}</strong>
          <Button variant="secondary" icon aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <CloseIcon fontSize="small" aria-hidden="true" />
          </Button>
        </div>
        <SessionImage src={resolveAssetUrl(foto.url)} alt={foto.titulo} className={s.visorImg} />
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

  const titulo = momento === "salida" ? "Foto de salida a comer" : "Foto de regreso de comer";
  return (
    <Modal
      open
      onClose={() => !enviando && onClose()}
      title={titulo}
      description={
        momento === "salida"
          ? "Acomódate y toma la foto: se guarda con la hora en que sales."
          : "Toma la foto al volver a tu lugar: se guarda con la hora en que regresas."
      }
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          {foto ? (
            <>
              <Button iconStart={<CameraswitchIcon fontSize="inherit" aria-hidden="true" />} onClick={() => setFoto(null)} disabled={enviando}>
                Tomar otra
              </Button>
              <Button
                variant="primary"
                iconStart={<CheckIcon fontSize="inherit" aria-hidden="true" />}
                onClick={() => void registrar()}
                disabled={enviando}
                loading={enviando}
              >
                {enviando ? "Registrando…" : momento === "salida" ? "Registrar salida" : "Registrar regreso"}
              </Button>
            </>
          ) : (
            <>
              <Button
                iconStart={<CameraswitchIcon fontSize="inherit" aria-hidden="true" />}
                onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
              >
                {facing === "user" ? "Usar trasera" : "Usar frontal"}
              </Button>
              <Button
                variant="primary"
                iconStart={<PhotoCameraOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                onClick={tomar}
                disabled={!lista}
              >
                Tomar foto
              </Button>
            </>
          )}
        </>
      }
    >
      <div className={s.cuerpo}>
        <div className={s.camara}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="Tu foto" className={s.camaraMedio} />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`${s.camaraMedio} ${facing === "user" ? s.camaraEspejo : ""}`}
            />
          )}
          {!foto && !lista && !error ? <span className={s.camaraAviso}>Abriendo cámara…</span> : null}
        </div>

        {foto && pideMotivo ? (
          <>
            <Alert tone="warning" icon={<AccessTimeIcon fontSize="inherit" aria-hidden="true" />}>
              Estás fuera del horario de comida ({ventanaTexto}). Escribe por qué; tu jefe lo aprobará o rechazará y queda en
              el registro.
            </Alert>
            <Field label="¿Por qué?" required>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={
                  momento === "salida"
                    ? "Ej. Estaba en sitio con el cliente de 2 a 4 y salí a comer al terminar."
                    : "Ej. La fila del comedor tardó; regresé en cuanto pude."
                }
              />
            </Field>
          </>
        ) : null}

        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
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

  if (!r) return null;
  return (
    <Modal
      open
      onClose={() => !enviando && onClose()}
      title={`Comida a destiempo de ${corto(fila.nombre)}`}
      maxWidth={500}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant={decision === "aprobar" ? "primary" : "danger"}
            iconStart={
              decision === "aprobar" ? (
                <TaskAltIcon fontSize="inherit" aria-hidden="true" />
              ) : (
                <CancelOutlinedIcon fontSize="inherit" aria-hidden="true" />
              )
            }
            onClick={() => void guardar()}
            disabled={enviando}
            loading={enviando}
          >
            {enviando ? "Guardando…" : decision === "aprobar" ? "Aprobar" : "Rechazar"}
          </Button>
        </>
      }
    >
      <div className={s.cuerpo}>
        <div className={s.resumenRevision}>
          <ConIcono icon={<RestaurantOutlinedIcon fontSize="inherit" aria-hidden="true" />}>
            Salió <strong>{hora(r.checkinTime)}</strong>
            {r.checkoutTime ? (
              <>
                {" "}
                · regresó <strong>{hora(r.checkoutTime)}</strong>
                {r.minutos != null ? ` (${minutosCortos(r.minutos)})` : ""}
              </>
            ) : (
              " · sigue en comida"
            )}
          </ConIcono>
          {r.checkinJustificacion ? (
            <ConIcono icon={<ChatBubbleOutlineIcon fontSize="inherit" aria-hidden="true" />}>Salida: «{r.checkinJustificacion}»</ConIcono>
          ) : null}
          {r.checkoutJustificacion ? (
            <ConIcono icon={<ChatBubbleOutlineIcon fontSize="inherit" aria-hidden="true" />}>Regreso: «{r.checkoutJustificacion}»</ConIcono>
          ) : null}
        </div>
        <Field label="Decisión">
          <Segmented
            ariaLabel="Decisión"
            value={decision}
            onChange={setDecision}
            items={[
              { id: "aprobar", label: "Aprobar" },
              { id: "rechazar", label: "Rechazar" },
            ]}
          />
        </Field>
        <Field
          label={decision === "aprobar" ? "Comentario" : "¿Por qué la rechazas?"}
          optional={decision === "aprobar"}
          required={decision === "rechazar"}
        >
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} maxLength={1000} />
        </Field>
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
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
      <Card className={`${s.mia} ${destiempo ? s.tonoWarning : ""}`} aria-label="Tu comida">
        <div className={s.miaHead}>
          <div className={s.miaQuien}>
            <span className={s.icono} aria-hidden="true">
              <RestaurantOutlinedIcon />
            </span>
            <div>
              <h2 className={s.miaTitulo}>Tu hora de comida</h2>
              <p className={s.miaSub}>Horario: {mi.ventana.texto} · registra tu salida y tu regreso con foto.</p>
            </div>
          </div>
          <Badge tone={destiempo ? "warning" : "success"} dot>
            {destiempo ? "Fuera de horario" : "Es tu horario"}
          </Badge>
        </div>
        {destiempo ? (
          <p className={s.nota}>Si sales a comer ahora tendrás que escribir por qué; tu jefe lo aprobará o rechazará.</p>
        ) : null}
        <Button
          size="lg"
          variant="primary"
          className={s.accion}
          iconStart={<RestaurantOutlinedIcon fontSize="inherit" aria-hidden="true" />}
          onClick={() => onRegistrar("salida", destiempo)}
        >
          Salir a comer
        </Button>
      </Card>
    );
  }

  if (mi.siguiente === "regreso" && r) {
    const destiempo = ahora > limite;
    const minutos = Math.max(0, Math.round((ahora - new Date(r.checkinTime).getTime()) / 60_000));
    return (
      <Card className={`${s.mia} ${destiempo ? s.tonoWarning : s.tonoInfo}`} aria-label="Tu comida">
        <div className={s.miaHead}>
          <div className={s.miaQuien}>
            <FotoComida url={r.checkinPhotoUrl} titulo="Tu foto de salida" onOpen={onVerFoto} />
            <span className={s.icono} aria-hidden="true">
              <RestaurantOutlinedIcon />
            </span>
            <div>
              <h2 className={s.miaTitulo}>Estás en tu hora de comida</h2>
              <p className={s.miaSub}>
                Saliste a las {hora(r.checkinTime)} · llevas {minutosCortos(minutos)}
              </p>
            </div>
          </div>
          {revision ? (
            <Badge tone={revision.tone} icon={revision.icon}>
              {revision.label}
            </Badge>
          ) : null}
        </div>
        {destiempo ? (
          <Alert tone="warning" dense icon={<AccessTimeIcon fontSize="inherit" aria-hidden="true" />}>
            Ya pasó la hora de regreso (4:00 p.m.): al registrar tendrás que escribir por qué.
          </Alert>
        ) : null}
        <Button
          size="lg"
          variant="primary"
          className={s.accion}
          iconStart={<UndoIcon fontSize="inherit" aria-hidden="true" />}
          onClick={() => onRegistrar("regreso", destiempo)}
        >
          Ya regresé
        </Button>
      </Card>
    );
  }

  if (mi.siguiente === "listo" && r) {
    const tono = r.revisionEstado === "RECHAZADA" ? s.tonoDanger : r.revisionEstado === "PENDIENTE" ? s.tonoWarning : "";
    return (
      <Card className={`${s.mia} ${tono}`} aria-label="Tu comida">
        <div className={s.miaHead}>
          <div className={s.miaQuien}>
            <span className={s.fotos}>
              <FotoComida url={r.checkinPhotoUrl} titulo="Tu foto de salida" onOpen={onVerFoto} />
              <FotoComida url={r.checkoutPhotoUrl} titulo="Tu foto de regreso" onOpen={onVerFoto} />
            </span>
            <span className={s.icono} aria-hidden="true">
              <TaskAltIcon />
            </span>
            <div>
              <h2 className={s.miaTitulo}>Comida registrada</h2>
              <p className={s.miaSub}>
                {hora(r.checkinTime)} → {hora(r.checkoutTime)}
                {r.minutos != null ? ` · ${minutosCortos(r.minutos)}` : ""}
              </p>
            </div>
          </div>
          <Badge tone={revision ? revision.tone : "success"} icon={revision?.icon} dot={!revision}>
            {revision ? revision.label : "A tiempo"}
          </Badge>
        </div>
        {r.revisionEstado && r.revisionEstado !== "PENDIENTE" ? (
          <p className={s.nota}>
            {corto(r.revisadoPor) || "Tu jefe"} {r.revisionEstado === "APROBADA" ? "la aprobó" : "la rechazó"}
            {r.revisionNotas ? `: «${r.revisionNotas}»` : "."}
          </p>
        ) : null}
      </Card>
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
  const estado: { label: string; tone: Tone } = !r
    ? { label: "Sin registrar", tone: "neutral" }
    : !r.checkoutTime
      ? { label: "En comida", tone: "info" }
      : { label: "Completa", tone: "success" };

  return (
    <li className={s.fila} data-pendiente={r?.revisionEstado === "PENDIENTE" ? "true" : undefined}>
      <div className={s.filaHead}>
        <Avatar name={fila.nombre} avatarUrl={fila.avatarUrl} size={40} />
        <div className={s.filaQuien}>
          <span className={s.filaNombre}>{fila.nombre}</span>
          {fila.puesto ? <span className={s.filaPuesto}>{fila.puesto}</span> : null}
        </div>
        <span className={s.insignias}>
          <Badge tone={estado.tone} size="sm" dot>
            {estado.label}
          </Badge>
          {revision ? (
            <Badge tone={revision.tone} size="sm" icon={revision.icon}>
              {revision.label}
            </Badge>
          ) : null}
        </span>
      </div>

      {r ? (
        <div className={s.horario}>
          <span className={s.fotos}>
            <FotoComida url={r.checkinPhotoUrl} titulo={`${corto(fila.nombre)} · salida`} onOpen={onVerFoto} />
            <FotoComida url={r.checkoutPhotoUrl} titulo={`${corto(fila.nombre)} · regreso`} onOpen={onVerFoto} />
          </span>
          <span className={s.horas}>
            <span className={r.isCheckinLate ? s.tarde : undefined}>{hora(r.checkinTime)}</span>
            <span className={s.flecha} aria-hidden="true">
              →
            </span>
            <span className={r.isCheckoutLate ? s.tarde : undefined}>{r.checkoutTime ? hora(r.checkoutTime) : "en comida"}</span>
            {r.minutos != null ? <span className={s.minutos}> · {minutosCortos(r.minutos)}</span> : null}
          </span>
        </div>
      ) : null}

      {r?.checkinJustificacion || r?.checkoutJustificacion ? (
        <div className={s.porque}>
          {r.checkinJustificacion ? (
            <ConIcono icon={<ChatBubbleOutlineIcon fontSize="inherit" aria-hidden="true" />}>
              Salida a las {hora(r.checkinTime)}: «{r.checkinJustificacion}»
            </ConIcono>
          ) : null}
          {r.checkoutJustificacion ? (
            <ConIcono icon={<ChatBubbleOutlineIcon fontSize="inherit" aria-hidden="true" />}>
              Regreso a las {hora(r.checkoutTime)}: «{r.checkoutJustificacion}»
            </ConIcono>
          ) : null}
          {r.revisionEstado && r.revisionEstado !== "PENDIENTE" ? (
            <div className={s.tenue}>
              {corto(r.revisadoPor) || "—"} {r.revisionEstado === "APROBADA" ? "aprobó" : "rechazó"}
              {r.revisionNotas ? `: «${r.revisionNotas}»` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {fila.puedoRevisar && r ? (
        <div className={s.acciones}>
          {r.revisionEstado === "PENDIENTE" ? (
            <>
              <Button size="sm" variant="primary" iconStart={<TaskAltIcon fontSize="inherit" aria-hidden="true" />} onClick={() => onRevisar(fila, "aprobar")}>
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                iconStart={<CancelOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                onClick={() => onRevisar(fila, "rechazar")}
              >
                Rechazar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="tertiary" onClick={() => onRevisar(fila, r.revisionEstado === "APROBADA" ? "rechazar" : "aprobar")}>
              Cambiar decisión
            </Button>
          )}
        </div>
      ) : null}
    </li>
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
      // Lo que ya se veía se queda: solo se avisa.
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
  const filtros: Array<{ key: Filtro; label: string; n?: number; dot?: Tone }> = [
    { key: "todos", label: "Todos", n: resumen?.total },
    { key: "pendientes", label: "Por aprobar", n: resumen?.pendientes, dot: "warning" },
    { key: "destiempo", label: "A destiempo", n: resumen?.aDestiempo, dot: "danger" },
    { key: "comiendo", label: "En comida", n: resumen?.enComida, dot: "info" },
    { key: "sin", label: "Sin registrar", n: resumen ? resumen.total - resumen.registraron : undefined, dot: "neutral" },
  ];

  return (
    <div className={s.panel}>
      {error ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" onClick={() => void cargar()} loading={cargando}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {aviso ? (
        <Alert tone="success" role="status" onDismiss={() => setAviso(null)}>
          {aviso}
        </Alert>
      ) : null}

      {cargando && !mi && !equipo ? <SkeletonRows rows={4} label="Cargando comidas" /> : null}

      {esHoy && mi?.debeRegistrar ? (
        <MiComida mi={mi} offsetMs={offsetMs} onRegistrar={(momento, aDestiempo) => setRegistrando({ momento, aDestiempo })} onVerFoto={verFoto} />
      ) : null}

      {tieneEquipo && equipo ? (
        <Card aria-label="Comidas de tu equipo">
          <CardHead
            title="Comidas de tu equipo"
            subtitle={`${equipo.alcance === "todo" ? "Toda la empresa." : "Tu gente por organigrama."} Horario 3:00 a 4:00 p.m.; lo que sea fuera de esa hora trae justificación y lo apruebas o rechazas.`}
            actions={
              <Button
                size="sm"
                variant="ghost"
                iconStart={<RefreshIcon fontSize="inherit" aria-hidden="true" />}
                onClick={() => void cargar()}
                disabled={cargando}
                loading={cargando}
              >
                {cargando ? "Actualizando…" : "Actualizar"}
              </Button>
            }
          />
          <div className={s.equipoBody}>
            {resumen?.pendientes ? (
              <Alert
                tone="warning"
                icon={<HourglassTopIcon fontSize="inherit" aria-hidden="true" />}
                action={
                  filtro !== "pendientes" ? (
                    <Button size="sm" onClick={() => setFiltro("pendientes")}>
                      Ver por aprobar
                    </Button>
                  ) : undefined
                }
              >
                Tienes {resumen.pendientes} comida{resumen.pendientes === 1 ? "" : "s"} a destiempo por aprobar.
              </Alert>
            ) : null}

            <FilterChips ariaLabel="Filtrar comidas">
              {filtros.map((f) => (
                <FilterChip key={f.key} active={filtro === f.key} count={f.n} dot={f.dot} onClick={() => setFiltro(f.key)}>
                  {f.label}
                </FilterChip>
              ))}
            </FilterChips>

            {filas.length === 0 ? (
              <p className={s.vacio}>Nadie en este filtro.</p>
            ) : (
              <ul className={s.filas}>
                {filas.map((fila) => (
                  <FilaPersona key={fila.userId} fila={fila} onRevisar={(f, decision) => setRevisando({ fila: f, decision })} onVerFoto={verFoto} />
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      {!cargando && !tieneEquipo && !(esHoy && mi?.debeRegistrar) ? (
        <p className={s.vacio}>
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
