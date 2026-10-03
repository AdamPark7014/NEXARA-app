"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/ui/Modal";
import { Alert, Button, Field, Select, Textarea } from "@/components/base";
import { isNonEmployeeEmail } from "@/lib/platform-accounts";
import { fetchTeamBoard } from "@/lib/team-board-api";
import {
  apiErrorMessage,
  cancelActivity,
  getActivitySuperiorActions,
  listAssignableUsers,
  reassignActivity,
  type ActivitySuperiorActions as Acciones,
} from "@/lib/ops-activities-api";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
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

/**
 * «Cancelar actividad» y «Pasar a otro compañero». Solo se muestran a los superiores de quien la
 * ejecuta (la API responde qué puede hacer quien consulta y vuelve a validarlo al guardar).
 */
export default function ActivitySuperiorActions({ activityId, token, onDone, extra, menuItems, actionsTarget }: Props) {
  const [acciones, setAcciones] = useState<Acciones | null>(null);
  const [dialogo, setDialogo] = useState<"cancelar" | "pasar" | null>(null);
  const [motivo, setMotivo] = useState("");
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

  const abrir = (tipo: "cancelar" | "pasar") => {
    setMotivo("");
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

  const haySuperiores = Boolean(acciones && (acciones.puedeCancelar || acciones.puedePasar));
  const menu: MenuAction[] = [
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
