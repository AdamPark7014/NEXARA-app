"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/ui/Modal";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/base";
import { isNonEmployeeEmail } from "@/lib/platform-accounts";
import { fetchTeamBoard } from "@/lib/team-board-api";
import {
  apiErrorMessage,
  cancelActivity,
  getActivitySuperiorActions,
  listAssignableUsers,
  reassignActivity,
  registrarIncumplimiento,
  reprogramarNoCumplida,
  type ActivitySuperiorActions as Acciones,
} from "@/lib/ops-activities-api";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { MoreMenu, type MenuAction } from "./_piezas";
import s from "./ActivitySuperiorActions.module.css";

type Companero = { id: number; nombre: string };

type Props = {
  activityId: number;
  token: string;
  /** Recargar la actividad después de cancelar o pasarla. */
  onDone: () => void;
  /** Misma fila que Pasar y Cancelar (Editar). */
  extra?: ReactNode;
  /** Más acciones del menú «···», junto a «Cancelar actividad» (p. ej. Eliminar). */
  menuItems?: ReadonlyArray<MenuAction>;
  /**
   * Hueco de la cabecera de la ficha: si se da, los botones se pintan ahí (portal) y aquí
   * solo quedan el aviso y los diálogos.
   */
  actionsTarget?: HTMLElement | null;
};

const MOTIVO_MIN = 10;

type Dialogo = "cancelar" | "pasar" | "incumplimiento" | "reprogramar";

/** Si la API no manda el catálogo (servidor viejo), el mismo de `incumplimiento.ts`. */
const CAUSAS_RESPALDO = [
  { clave: "SIN_ENTREGA", etiqueta: "Sin entrega al cierre de la jornada" },
  { clave: "MATERIAL", etiqueta: "Falta de material, herramienta o equipo" },
  { clave: "ACCESO", etiqueta: "Sin acceso al sitio o cliente no disponible" },
  { clave: "PERSONAL", etiqueta: "Personal asignado no disponible" },
  { clave: "PLANEACION", etiqueta: "Alcance o tiempo mal planeado" },
  { clave: "CALIDAD", etiqueta: "La entrega no cumple lo solicitado" },
  { clave: "OTRA", etiqueta: "Otra causa" },
];

/** Mañana a las 10:00, en el formato de `datetime-local`. */
function mananaALasDiez(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T10:00`;
}

/**
 * «Cancelar actividad», «Registrar incumplimiento», «Reprogramar» y «Pasar a otro compañero».
 * Solo se muestran a los superiores de quien la ejecuta (la API responde qué puede hacer quien
 * consulta y vuelve a validarlo al guardar).
 */
export default function ActivitySuperiorActions({ activityId, token, onDone, extra, menuItems, actionsTarget }: Props) {
  const [acciones, setAcciones] = useState<Acciones | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [causa, setCausa] = useState("");
  const [fecha, setFecha] = useState("");
  const [deUsuarioId, setDeUsuarioId] = useState<number | "">("");
  const [aUsuarioId, setAUsuarioId] = useState<number | "">("");
  const [companeros, setCompaneros] = useState<Companero[]>([]);
  const [cargandoCompaneros, setCargandoCompaneros] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !activityId) return;
    try {
      setAcciones(await getActivitySuperiorActions(token, activityId));
    } catch {
      setAcciones(null);
    }
  }, [token, activityId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const minimo = acciones?.motivoMinimo ?? MOTIVO_MIN;
  const motivoOk = motivo.trim().length >= minimo;

  /** Compañeros: la lista de asignables; si el rol no la tiene, su equipo de la pizarra. */
  const cargarCompaneros = useCallback(async () => {
    setCargandoCompaneros(true);
    try {
      let lista: Companero[] = [];
      try {
        lista = (await listAssignableUsers(token)).map((u) => ({ id: u.id, nombre: u.nombre }));
      } catch {
        lista = [];
      }
      if (lista.length === 0) {
        const board = await fetchTeamBoard(token).catch(() => null);
        lista = (board?.users ?? [])
          .filter((u) => !isNonEmployeeEmail(u.email))
          .map((u) => ({ id: u.id, nombre: u.nombre }));
      }
      setCompaneros(lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    } finally {
      setCargandoCompaneros(false);
    }
  }, [token]);

  const abrir = (tipo: Dialogo) => {
    setMotivo("");
    setCausa("");
    setFecha(tipo === "reprogramar" ? mananaALasDiez() : "");
    setError(null);
    setAviso(null);
    setAUsuarioId("");
    setDeUsuarioId(acciones?.personas.length === 1 ? acciones.personas[0].userId : "");
    setDialogo(tipo);
    if (tipo === "pasar" && companeros.length === 0) void cargarCompaneros();
  };

  const enActividad = useMemo(() => new Set((acciones?.personas ?? []).map((p) => p.userId)), [acciones]);
  const opciones = companeros.filter((c) => !enActividad.has(c.id));

  const confirmarCancelar = async () => {
    if (!motivoOk) return;
    setGuardando(true);
    setError(null);
    try {
      await cancelActivity(token, activityId, motivo.trim());
      setDialogo(null);
      setAviso("La actividad quedó cancelada. Avisamos al equipo, a sus jefes y a Christian.");
      await cargar();
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo cancelar la actividad"));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarIncumplimiento = async () => {
    if (!motivoOk || !causa) return;
    setGuardando(true);
    setError(null);
    try {
      await registrarIncumplimiento(token, activityId, causa, motivo.trim());
      setDialogo(null);
      setAviso("Quedó registrada como no cumplida. Avisamos a quienes la tenían, al responsable y a sus jefes.");
      await cargar();
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo registrar el incumplimiento"));
    } finally {
      setGuardando(false);
    }
  };

  const fechaOk = Boolean(fecha) && !Number.isNaN(new Date(fecha).getTime());
  const confirmarReprogramar = async () => {
    if (!motivoOk || !fechaOk) return;
    setGuardando(true);
    setError(null);
    try {
      await reprogramarNoCumplida(token, activityId, new Date(fecha).toISOString(), motivo.trim());
      setDialogo(null);
      setAviso("La actividad se reabrió con la nueva fecha. El incumplimiento queda en su historial.");
      await cargar();
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo reprogramar la actividad"));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarPasar = async () => {
    if (!motivoOk || !deUsuarioId || !aUsuarioId) return;
    setGuardando(true);
    setError(null);
    try {
      await reassignActivity(token, activityId, {
        deUsuarioId: Number(deUsuarioId),
        aUsuarioId: Number(aUsuarioId),
        motivo: motivo.trim(),
      });
      const nuevo = companeros.find((c) => c.id === Number(aUsuarioId))?.nombre ?? "tu compañero";
      setDialogo(null);
      setAviso(`La actividad pasó a ${nuevo}. Continuará donde se quedó con sus propias fotos de entrada y salida.`);
      await cargar();
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo pasar la actividad"));
    } finally {
      setGuardando(false);
    }
  };

  const haySuperiores = Boolean(
    acciones &&
      (acciones.puedeCancelar || acciones.puedePasar || acciones.puedeRegistrarIncumplimiento || acciones.puedeReprogramar),
  );
  const causas = acciones?.causasIncumplimiento?.length ? acciones.causasIncumplimiento : CAUSAS_RESPALDO;
  const menu: MenuAction[] = [
    ...(acciones?.puedeRegistrarIncumplimiento
      ? [
          {
            id: "incumplimiento",
            label: "Registrar incumplimiento",
            danger: true,
            icon: <EventBusyOutlinedIcon fontSize="inherit" />,
            onSelect: () => abrir("incumplimiento"),
          },
        ]
      : []),
    ...(acciones?.puedeCancelar
      ? [
          {
            id: "cancelar",
            label: "Cancelar actividad",
            danger: true,
            icon: <BlockOutlinedIcon fontSize="inherit" />,
            onSelect: () => abrir("cancelar"),
          },
        ]
      : []),
    ...(menuItems ?? []),
  ];
  const hayBotones = haySuperiores || Boolean(extra) || menu.length > 0;
  if (!hayBotones && !aviso) return null;

  const contador = (
    <span className={motivoOk ? undefined : s.corto}>
      {motivo.trim().length}/{minimo} caracteres mínimo
    </span>
  );

  const botones = hayBotones ? (
    <>
      <MoreMenu items={menu} label="Más acciones de la actividad" />
      {extra}
      {acciones?.puedeReprogramar ? (
        <Button
          variant="primary"
          onClick={() => abrir("reprogramar")}
          iconStart={<EditCalendarOutlinedIcon fontSize="inherit" />}
        >
          Reprogramar
        </Button>
      ) : null}
      {acciones?.puedePasar ? (
        <Button variant="secondary" onClick={() => abrir("pasar")} iconStart={<SwapHorizIcon fontSize="inherit" />}>
          Pasar a otro compañero
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <>
      {aviso ? (
        <Alert tone="success" role="status" onDismiss={() => setAviso(null)}>
          {aviso}
        </Alert>
      ) : null}
      {botones ? (actionsTarget ? createPortal(botones, actionsTarget) : <div className={s.fila}>{botones}</div>) : null}

      <Modal
        open={dialogo === "cancelar"}
        onClose={() => !guardando && setDialogo(null)}
        title="Cancelar actividad"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setDialogo(null)} disabled={guardando}>
              Volver
            </Button>
            <Button variant="danger" onClick={() => void confirmarCancelar()} disabled={!motivoOk} loading={guardando}>
              Cancelar actividad
            </Button>
          </>
        }
      >
        <div className={s.cuerpo}>
          <p className={s.nota}>
            La actividad quedará como «Cancelada» con tu motivo en el historial. Se avisa a quienes la ejecutan, al
            responsable, a sus jefes y a Christian.
          </p>
          <Field label="Motivo" required hint={contador}>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              maxLength={400}
              placeholder="Ej. El cliente pospuso el servicio hasta nuevo aviso."
            />
          </Field>
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={dialogo === "incumplimiento"}
        onClose={() => !guardando && setDialogo(null)}
        title="Registrar incumplimiento"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setDialogo(null)} disabled={guardando}>
              Volver
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmarIncumplimiento()}
              disabled={!motivoOk || !causa}
              loading={guardando}
            >
              Registrar como no cumplida
            </Button>
          </>
        }
      >
        <div className={s.cuerpo}>
          <p className={s.nota}>
            La actividad se cierra como «No cumplida» y cuenta en los indicadores de cumplimiento de quienes no la
            entregaron. Queda en su historial con la causa y tus observaciones; si el trabajo sigue pendiente, después
            puedes reprogramarla.
          </p>
          <Field label="Causa" required>
            <Select value={causa} onChange={(e) => setCausa(e.target.value)}>
              <option value="">Elige la causa</option>
              {causas.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.etiqueta}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Observaciones" required hint={contador}>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              maxLength={400}
              placeholder="Ej. No se presentó al sitio y no avisó; el cliente reportó que nadie llegó."
            />
          </Field>
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={dialogo === "reprogramar"}
        onClose={() => !guardando && setDialogo(null)}
        title="Reprogramar actividad no cumplida"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setDialogo(null)} disabled={guardando}>
              Volver
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmarReprogramar()}
              disabled={!motivoOk || !fechaOk}
              loading={guardando}
            >
              Reprogramar
            </Button>
          </>
        }
      >
        <div className={s.cuerpo}>
          <p className={s.nota}>
            Se reabre con la nueva fecha y el equipo recibe el aviso. El incumplimiento anterior no se borra: sigue
            contando en los indicadores.
          </p>
          <Field label="Nueva fecha y hora" required>
            <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Motivo" required hint={contador}>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="Ej. Llegó el material faltante; se ejecuta mañana a primera hora."
            />
          </Field>
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={dialogo === "pasar"}
        onClose={() => !guardando && setDialogo(null)}
        title="Pasar a otro compañero"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setDialogo(null)} disabled={guardando}>
              Volver
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmarPasar()}
              disabled={!motivoOk || !deUsuarioId || !aUsuarioId}
              loading={guardando}
            >
              Pasar actividad
            </Button>
          </>
        }
      >
        <div className={s.cuerpo}>
          <p className={s.nota}>
            Quien la recibe continúa donde se quedó: ve el avance anterior y toma sus propias fotos de entrada y
            salida. El avance de quien sale queda guardado.
          </p>
          <Field label="Quién la deja" required>
            <Select value={deUsuarioId} onChange={(e) => setDeUsuarioId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Elige a la persona</option>
              {(acciones?.personas ?? []).map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.nombre}
                  {p.responsable ? " · responsable" : p.rol === "APOYO" ? " · apoyo" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Compañero que la continúa"
            required
            hint={!cargandoCompaneros && opciones.length === 0 ? "No encontramos compañeros disponibles para ti." : undefined}
          >
            <Select
              value={aUsuarioId}
              onChange={(e) => setAUsuarioId(e.target.value ? Number(e.target.value) : "")}
              disabled={cargandoCompaneros}
            >
              <option value="">{cargandoCompaneros ? "Cargando compañeros…" : "Elige al compañero"}</option>
              {opciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo" required hint={contador}>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="Ej. Se enfermó y no puede terminar hoy."
            />
          </Field>
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
