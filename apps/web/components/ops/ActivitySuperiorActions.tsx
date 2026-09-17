"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import { erpInputStyle } from "@/lib/erp-api";
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

type Companero = { id: number; nombre: string };

type Props = {
  activityId: number;
  token: string;
  /** Recargar la actividad después de cancelar o pasarla. */
  onDone: () => void;
};

const MOTIVO_MIN = 10;

/**
 * «Cancelar actividad» y «Pasar a otro compañero». Solo se muestran a los superiores de quien la
 * ejecuta (la API responde qué puede hacer quien consulta y vuelve a validarlo al guardar).
 */
export default function ActivitySuperiorActions({ activityId, token, onDone }: Props) {
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

  if (!acciones || (!acciones.puedeCancelar && !acciones.puedePasar && !aviso)) return null;

  const etiqueta: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" };
  const contador = (
    <span style={{ fontSize: 11, color: motivoOk ? "var(--text-tertiary)" : "var(--danger)" }}>
      {motivo.trim().length}/{minimo} caracteres mínimo
    </span>
  );

  return (
    <div style={{ marginBottom: 14 }}>
      {aviso ? (
        <div style={{ marginBottom: 10 }}>
          <InlineAlert variant="success" message={aviso} onDismiss={() => setAviso(null)} />
        </div>
      ) : null}
      {acciones.puedeCancelar || acciones.puedePasar ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {acciones.puedePasar ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => abrir("pasar")}
              iconLeft={<SwapHorizIcon fontSize="inherit" aria-hidden="true" />}
            >
              Pasar a otro compañero
            </Button>
          ) : null}
          {acciones.puedeCancelar ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => abrir("cancelar")}
              iconLeft={<BlockOutlinedIcon fontSize="inherit" aria-hidden="true" />}
            >
              Cancelar actividad
            </Button>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={dialogo === "cancelar"}
        onClose={() => !guardando && setDialogo(null)}
        title="Cancelar actividad"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogo(null)} disabled={guardando}>
              Volver
            </Button>
            <Button variant="danger" onClick={() => void confirmarCancelar()} disabled={!motivoOk} loading={guardando}>
              Cancelar actividad
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            La actividad quedará como «Cancelada» con tu motivo en el historial. Se avisa a quienes la ejecutan, al
            responsable, a sus jefes y a Christian.
          </p>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={etiqueta}>Motivo *</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              maxLength={400}
              placeholder="Ej. El cliente pospuso el servicio hasta nuevo aviso."
              style={{ ...erpInputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            {contador}
          </label>
          {error ? <InlineAlert variant="danger" message={error} /> : null}
        </div>
      </Modal>

      <Modal
        open={dialogo === "pasar"}
        onClose={() => !guardando && setDialogo(null)}
        title="Pasar a otro compañero"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogo(null)} disabled={guardando}>
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
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Quien la recibe continúa donde se quedó: ve el avance anterior y toma sus propias fotos de entrada y
            salida. El avance de quien sale queda guardado.
          </p>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={etiqueta}>Quién la deja *</span>
            <select
              value={deUsuarioId}
              onChange={(e) => setDeUsuarioId(e.target.value ? Number(e.target.value) : "")}
              style={erpInputStyle}
            >
              <option value="">Elige a la persona</option>
              {acciones.personas.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.nombre}
                  {p.responsable ? " · responsable" : p.rol === "APOYO" ? " · apoyo" : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={etiqueta}>Compañero que la continúa *</span>
            <select
              value={aUsuarioId}
              onChange={(e) => setAUsuarioId(e.target.value ? Number(e.target.value) : "")}
              style={erpInputStyle}
              disabled={cargandoCompaneros}
            >
              <option value="">{cargandoCompaneros ? "Cargando compañeros…" : "Elige al compañero"}</option>
              {opciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {!cargandoCompaneros && opciones.length === 0 ? (
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                No encontramos compañeros disponibles para ti.
              </span>
            ) : null}
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={etiqueta}>Motivo *</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="Ej. Se enfermó y no puede terminar hoy."
              style={{ ...erpInputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            {contador}
          </label>
          {error ? <InlineAlert variant="danger" message={error} /> : null}
        </div>
      </Modal>
    </div>
  );
}
