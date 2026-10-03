"use client";

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Alert, Badge, Button, Input, type Tone } from "@/components/base";
import s from "./HerramientasChecklist.module.css";
import { useUser } from "@/components/UserContext";
import HerramientasChecklistEditor from "@/components/ops/HerramientasChecklistEditor";
import { formatApiError } from "@/lib/erp-api";
import {
  definirRequisitos,
  avanceChecklist,
  borradoresDesdeChecklist,
  cargarChecklist,
  hayErroresRequisitos,
  palomearRequisito,
  validarRequisitos,
  type ChecklistHerramientas,
  type RequisitoBorrador,
  type RequisitoHerramienta,
} from "@/lib/herramientas-checklist";
import { getActivity, listActivityTeam } from "@/lib/ops-activities-api";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/lib/permissions";

type Props = {
  activityId: number;
  /** Por omisión: permiso `activities.manage` (el mismo que pide la API para definirlos). */
  canManage?: boolean;
  /** Por omisión: ver o gestionar actividades (lo que pide la API para palomear). */
  canCheck?: boolean;
  style?: CSSProperties;
};


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

type Estado = { label: string; tone: Tone; icon: SvgIconComponent };

function estadoDe(r: RequisitoHerramienta): Estado {
  if (!r.check) return { label: "Pendiente", tone: "warning", icon: HourglassEmptyIcon };
  if (r.check.ok) return { label: "Listo", tone: "success", icon: CheckCircleOutlineIcon };
  return { label: "Falta", tone: "danger", icon: ErrorOutlineIcon };
}

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
  const [responsableId, setResponsableId] = useState<number | null>(null);
  const [equipoIds, setEquipoIds] = useState<number[]>([]);
  const [responsableNombreCorto, setResponsableNombreCorto] = useState<string | undefined>(undefined);
  const [usaKit, setUsaKit] = useState<boolean>(false);

  const cargar = useCallback(async () => {
    if (!token || !activityId) return;
    setCargando(true);
    try {
      // Meta para selector (responsable + equipo actual)
      try {
        const [act, team] = await Promise.all([getActivity(token, activityId), listActivityTeam(token, activityId)]);
        const rid = Number(act?.responsable?.id ?? 0) || null;
        setResponsableId(rid);
        setResponsableNombreCorto(
          act?.responsable?.nombre ? act.responsable.nombre.split(/\s+/).slice(0, 2).join(" ") : undefined,
        );
        const miembros = (team ?? []).map((m) => Number(m.user?.id ?? m.id ?? 0)).filter((n) => n > 0);
        setEquipoIds(miembros);
      } catch {
        setResponsableId(null);
        setEquipoIds([]);
      }

      setChecklist(await cargarChecklist(token, activityId));
      // Flag de kit personal
      try {
        const loaded = await cargarChecklist(token, activityId);
        setChecklist(loaded);
        setUsaKit(Boolean(loaded?.usesPersonalKit));
      } catch {
        /* ignore, checklist ya se intentó cargar arriba */
      }
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
        borrador.map((f) => ({
          id: f.id ?? undefined,
          descripcion: f.descripcion.trim(),
          cantidad: f.cantidad,
          ...(f.toolId ? { toolId: f.toolId } : {}),
          ...(f.source ? { source: f.source } : {}),
        })),
        // Responsable + quienes ya están en el equipo hoy
        [
          ...(responsableId ? [responsableId] : []),
          ...equipoIds.filter((id) => !responsableId || id !== responsableId),
        ],
        usaKit,
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
    <section aria-labelledby={tituloId} className={s.caja} style={style}>
      <div className={s.cabeza}>
        <div className={s.titulo}>
          <span className={s.ico} aria-hidden="true">
            <BuildOutlinedIcon fontSize="inherit" />
          </span>
          <h2 id={tituloId} className={s.tituloT}>
            Herramientas a llevar
          </h2>
          {lista.length > 0 ? <span className={s.cuantas}>({lista.length})</span> : null}
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={() => setAyuda((v) => !v)}
            aria-expanded={ayuda}
            aria-label="Qué es el checklist de herramientas"
            title={AYUDA}
          >
            <InfoOutlinedIcon fontSize="inherit" />
          </Button>
        </div>
        {puedeEditar && !editando && checklist ? (
          <Button
            size="sm"
            variant={lista.length ? "secondary" : "tonal"}
            onClick={abrirEditor}
            iconStart={lista.length ? <EditOutlinedIcon fontSize="inherit" /> : <BuildOutlinedIcon fontSize="inherit" />}
          >
            {lista.length ? "Editar herramientas" : "Definir herramientas"}
          </Button>
        ) : null}
      </div>

      {ayuda ? <p className={s.ayuda}>{AYUDA}</p> : null}

      {error && !checklist ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" variant="secondary" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {aviso ? (
        <Alert tone="success" role="status" dense>
          {aviso}
        </Alert>
      ) : null}

      {editando ? (
        <div className={s.editor}>
          <HerramientasChecklistEditor
            value={borrador}
            onChange={setBorrador}
            errores={intentado ? errores : null}
            disabled={guardando}
            responsableId={responsableId ?? undefined}
            extraTeamUserIds={equipoIds}
            responsableNombreCorto={responsableNombreCorto}
            usePersonalKit={usaKit}
            onToggleUsePersonalKit={setUsaKit}
          />
          {errorGuardar ? (
            <p role="alert" className={s.error}>
              {errorGuardar}
            </p>
          ) : null}
          <div className={s.editorPie}>
            <Button variant="tertiary" onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void guardar()} loading={guardando}>
              {guardando ? "Guardando…" : "Guardar herramientas"}
            </Button>
          </div>
        </div>
      ) : null}

      {!editando && lista.length > 0 ? (
        <>
          <div className={s.avance}>
            <strong className={s.avanceN}>
              {avance.listos} de {avance.total} lista{avance.total === 1 ? "" : "s"}
            </strong>
            {!avance.completo ? (
              <Badge tone="warning" size="sm" dot>
                No se puede iniciar aún.
              </Badge>
            ) : null}
          </div>

          <ul className={s.lista}>
            {lista.map((r) => {
              const estado = estadoDe(r);
              const Icono = estado.icon;
              const meta = r.check
                ? [corto(r.check.por?.nombre), fmt(r.check.at)].filter(Boolean).join(" · ")
                : null;
              const nota = notaDe?.id === r.id ? notaDe : null;
              const ocupada = palomeando === r.id;
              return (
                <li key={r.id} className={s.fila} data-estado={estado.tone}>
                  <div className={s.filaTexto}>
                    <span className={s.filaT}>
                      {r.descripcion}
                      {r.cantidad > 1 ? <span className={s.cantidad}> ×{r.cantidad}</span> : null}
                    </span>
                    <span className={s.filaM}>{[meta, r.check?.nota].filter(Boolean).join(" · ") || "Sin revisar"}</span>
                  </div>

                  <div className={s.filaAcciones}>
                    <Badge tone={estado.tone} size="sm" icon={<Icono fontSize="inherit" />}>
                      {estado.label}
                    </Badge>
                    {puedePalomear ? (
                      <>
                        <Button
                          size="sm"
                          variant={r.check?.ok ? "secondary" : "tonal"}
                          onClick={() => void palomear(r, true)}
                          disabled={ocupada}
                        >
                          Lo traigo
                        </Button>
                        <Button
                          size="sm"
                          variant="tertiary"
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
                    <div className={s.nota}>
                      <Input
                        controlSize="sm"
                        wrapperClassName={s.notaInput}
                        className={s.notaInput}
                        value={nota.texto}
                        maxLength={300}
                        autoFocus
                        placeholder="Qué pasó (opcional)"
                        aria-label={`Nota de ${r.descripcion}`}
                        disabled={ocupada}
                        onChange={(e) => setNotaDe({ id: r.id, texto: e.target.value })}
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
                    <p role="alert" className={s.error}>
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
        <p className={s.vacio}>Sin checklist de herramientas</p>
      ) : null}
    </section>
  );
}
