"use client";

// Detalle de la actividad. Vivía en /ops/activities/[id] y Core la reexportaba;
// ahora vive aquí, que es la única superficie alcanzable. La cabecera (folio, estado,
// pasos, pestañas y datos clave) la pinta `ActivityDetailShell`; aquí va el contenido.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { buildApiUrl } from "@/lib/api-base";
import { formatDateTime } from "@/components/detail/DetailFrame";
import EquipoEvidencias, { Visor, type Foto } from "@/components/ops/EquipoEvidencias";
import EvidenciaPorCampos from "@/components/ops/EvidenciaPorCampos";
import { puedeSubirFotoDePunto } from "@/lib/evidencia-campos";
import HerramientasChecklist from "@/components/ops/HerramientasChecklist";
import CotizacionDeActividad, { type CotizacionLigada } from "@/components/erp/CotizacionDeActividad";
import ActivityIssuesPanel from "@/components/ops/ActivityIssuesPanel";
import ActivitySuperiorActions from "@/components/ops/ActivitySuperiorActions";
import { quienMira, useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";
import { getMissingEvidence, parseApiErrorWithEvidence } from "@/lib/parse-missing-evidence";
import { formatApiError } from "@/lib/erp-api";
import { esCeoChristian } from "@/lib/ceo-user";
import { deleteActivity } from "@/lib/ops-activities-api";
import { evidenceStepsForKind, textosDeInicioYCierre } from "@/lib/evidence-flow-helpers";
import { resolveAssetUrl } from "@/lib/evidence-display";
import PrioritySemaforo from "@/components/ops/PrioritySemaforo";
import { SesionPropia } from "@/components/pizarra/SesionActividad";
import { normalizarPrioridad } from "@/lib/actividad-tiempos";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DateInput,
  EvidenceGallery,
  EvidenceSlot,
  Field,
  FieldGrid,
  Input,
  Progress,
  RecordSection,
  Select,
  Textarea,
} from "@/components/base";
import { IcoCamara, IcoDocumento, IcoFormulario, ProtectedEvidencePhoto, type MenuAction } from "@/components/ops/_piezas";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import s from "./detalle.module.css";

const STATUSES = [
  "Pendiente",
  "Asignada",
  "En Proceso",
  "Por Validar",
  "Finalizada",
  "Rechazada",
  "Cancelada",
];

function flowStepForStatus(estatus: string): string {
  if (/cancel/i.test(estatus)) return "Cancelada";
  if (/rechaz/i.test(estatus)) return "Rechazada";
  if (/finaliz|complet/i.test(estatus)) return "Finalizada";
  if (/validar|validaci/i.test(estatus)) return "Por Validar";
  if (/proceso|curso/i.test(estatus)) return "En Proceso";
  if (/asignad/i.test(estatus)) return "Asignada";
  return "Pendiente";
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => `HTTP ${res.status}`);
    throw parseApiErrorWithEvidence(raw, res.status);
  }
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

type EditForm = {
  estatus: string;
  prioridad: string;
  descripcion: string;
  indicaciones: string;
  fechaInicio: string;
  fechaEntregaEsperada: string;
  fechaFinalizacion: string;
};

function hora(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function ActivityDetailPage() {
  const { activity, error, reload, id, hrefs, core, actionsSlot } = useActivityDetail();
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";
  const puedeEliminar = esCeoChristian(user?.id);
  const v2 = resolveV2RoleKey(user);

  const canEdit =
    user?.isSuperAdmin ||
    v2 === ROLES.COORD_OPERACIONES ||
    v2 === ROLES.DIR_OPERACIONES ||
    v2 === ROLES.COORD_ADMIN ||
    v2 === ROLES.ING_CAMPO;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    estatus: "",
    prioridad: "",
    descripcion: "",
    indicaciones: "",
    fechaInicio: "",
    fechaEntregaEsperada: "",
    fechaFinalizacion: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [missingEvidence, setMissingEvidence] = useState<string[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmState | null>(null);
  const [visor, setVisor] = useState<number | null>(null);

  const toDateLocal = (iso?: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
  };
  const toDateOnly = (iso?: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
  };

  const openEdit = useCallback(() => {
    if (!activity) return;
    setForm({
      estatus: flowStepForStatus(activity.estatus ?? "Pendiente"),
      prioridad: activity.prioridad ? normalizarPrioridad(activity.prioridad) : "MEDIA",
      descripcion: activity.descripcion ?? "",
      indicaciones: activity.indicaciones ?? "",
      fechaInicio: toDateLocal(activity.fechaInicio),
      fechaEntregaEsperada: toDateOnly(activity.fechaEntregaEsperada),
      fechaFinalizacion: toDateLocal(activity.fechaFinalizacion),
    });
    setSaveErr(null);
    setMissingEvidence(null);
    setEditing(true);
  }, [activity]);

  const pedirEliminar = useCallback(() => {
    if (!activity || !puedeEliminar) return;
    const folio = activity.anNumber?.trim() || "esta actividad";
    setConfirmDelete({
      title: "Eliminar actividad",
      message: `¿Eliminar ${folio}? Deja de verse en la pizarra, en Mi equipo, en las listas y en las búsquedas.`,
      confirmLabel: "Eliminar actividad",
      danger: true,
      fn: async () => {
        try {
          await deleteActivity(token, activity.id);
          router.push(hrefs.back);
        } catch (e) {
          setSaveErr(formatApiError(e, "No se pudo eliminar la actividad"));
        }
      },
    });
  }, [activity, puedeEliminar, token, router, hrefs.back]);

  const saveEdit = useCallback(async () => {
    if (!token || !id) return;
    setSaving(true);
    setSaveErr(null);
    setMissingEvidence(null);
    try {
      const payload: Record<string, string | null> = {
        estatus: form.estatus,
        prioridad: form.prioridad || null,
        descripcion: form.descripcion || null,
        indicaciones: form.indicaciones || null,
      };
      if (form.fechaInicio) payload.fechaInicio = new Date(form.fechaInicio).toISOString();
      if (form.fechaEntregaEsperada) payload.fechaEntregaEsperada = new Date(form.fechaEntregaEsperada).toISOString();
      if (form.fechaFinalizacion) payload.fechaFinalizacion = new Date(form.fechaFinalizacion).toISOString();
      await apiFetch(`activities/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(false);
      reload();
    } catch (e) {
      const missing = getMissingEvidence(e);
      if (missing) {
        setMissingEvidence(missing);
        setSaveErr("No se puede terminar todavía: faltan evidencias.");
        return;
      }
      setSaveErr(formatApiError(e, "No se pudieron guardar los cambios. Intenta de nuevo."));
    } finally {
      setSaving(false);
    }
  }, [token, id, form, reload]);

  // La ficha (shell) ya pinta la carga y el error cuando la actividad no llegó.
  if (!activity) return null;

  const branch = [activity.branchName, activity.branchCity, activity.branchState].filter(Boolean).join(" · ");
  const { miFila, despacho, mostrarIniciar } = quienMira(activity, user, core);
  const puedeSubirPuntos = puedeSubirFotoDePunto({
    userId: user?.id,
    responsableId: activity.responsable?.id,
    assignmentCharge: activity.assignmentCharge,
    asignados: (activity.assignees ?? []).map((m) => ({
      userId: m.userId ?? m.user?.id,
      rol: m.rol,
      retirado: Boolean(m.retiradoAt),
    })),
  });

  /* Galería: la evidencia del flujo (la del responsable o la primera que llegó). */
  const ev = activity.activityEvidence ?? null;
  const textos = textosDeInicioYCierre(activity.coreKind);
  const pasos = evidenceStepsForKind(activity.coreKind).filter((p) => p !== "COMPLETED");
  const devueltos = new Set([...(ev?.rejectedSteps ?? []), ...(ev?.rejectedStep ? [ev.rejectedStep] : [])]);
  const aprobada = ev?.reviewStatus === "APPROVED";
  const fotos: Foto[] = [];
  if (ev?.entryPhotoUrl) {
    fotos.push({ url: ev.entryPhotoUrl, titulo: textos.inicio.nombre, at: ev.entryPhotoUploadedAt, lat: num(ev.entryLatitude), lng: num(ev.entryLongitude) });
  }
  (ev?.evidencePhotos ?? []).forEach((url, i) => {
    fotos.push({ url, titulo: `Foto en sitio ${i + 1}`, at: ev?.evidencePhotosUploadedAt });
  });
  if (ev?.exitPhotoUrl) {
    fotos.push({ url: ev.exitPhotoUrl, titulo: textos.cierre.nombre, at: ev.exitPhotoUploadedAt, lat: num(ev.exitLatitude), lng: num(ev.exitLongitude) });
  }
  const hecho: Record<string, boolean> = {
    ENTRY_PHOTO: Boolean(ev?.entryPhotoUrl),
    EVIDENCE_PHOTOS: (ev?.evidencePhotos?.length ?? 0) > 0,
    SERVICE_SHEET_PDF: Boolean(ev?.serviceSheetPdfUrl),
    SERVICE_SHEET_DATA: Boolean(ev?.serviceSheetData),
    EXIT_PHOTO: Boolean(ev?.exitPhotoUrl),
  };
  const pasosHechos = pasos.filter((p) => hecho[p]).length;
  const faltan = pasos.length - pasosHechos;
  const bandera = (paso: string) =>
    devueltos.has(paso) ? (
      <Badge tone="danger" size="sm">
        Devuelta
      </Badge>
    ) : aprobada ? (
      <Badge tone="success" size="sm">
        Validada
      </Badge>
    ) : undefined;
  const pie = (titulo: string, at?: string | null, gps?: boolean) =>
    [titulo, hora(at), gps ? "GPS ✓" : null].filter(Boolean).join(" · ");
  const indiceDe = (url: string) => fotos.findIndex((f) => f.url === url);

  const piezasGaleria = pasos.flatMap((paso) => {
    if (paso === "ENTRY_PHOTO" || paso === "EXIT_PHOTO") {
      const entrada = paso === "ENTRY_PHOTO";
      const url = entrada ? ev?.entryPhotoUrl : ev?.exitPhotoUrl;
      const nombre = entrada ? textos.inicio.nombre : textos.cierre.nombre;
      if (!url) return [<EvidenceSlot key={paso} label={nombre} required />];
      const gps = entrada ? ev?.entryLatitude != null && ev?.entryLongitude != null : ev?.exitLatitude != null && ev?.exitLongitude != null;
      return [
        <ProtectedEvidencePhoto
          key={paso}
          url={url}
          alt={nombre}
          caption={pie(nombre, entrada ? ev?.entryPhotoUploadedAt : ev?.exitPhotoUploadedAt, gps)}
          flag={bandera(paso)}
          onClick={() => setVisor(indiceDe(url))}
        />,
      ];
    }
    if (paso === "EVIDENCE_PHOTOS") {
      const lista = ev?.evidencePhotos ?? [];
      if (lista.length === 0) return [<EvidenceSlot key={paso} label="Fotos en sitio" required />];
      return lista.map((url, i) => (
        <ProtectedEvidencePhoto
          key={`${paso}-${i}`}
          url={url}
          alt={`Foto en sitio ${i + 1}`}
          caption={pie(`Foto en sitio ${i + 1}`, ev?.evidencePhotosUploadedAt)}
          flag={bandera(paso)}
          onClick={() => setVisor(indiceDe(url))}
        />
      ));
    }
    if (paso === "SERVICE_SHEET_PDF") {
      return [
        ev?.serviceSheetPdfUrl ? (
          <EvidenceSlot
            key={paso}
            icon={<IcoDocumento />}
            label="Hoja de servicio (PDF)"
            badge={bandera(paso) ?? <Badge tone="success" size="sm">Subida</Badge>}
            onClick={() => window.open(resolveAssetUrl(ev.serviceSheetPdfUrl), "_blank", "noopener")}
          />
        ) : (
          <EvidenceSlot key={paso} icon={<IcoDocumento />} label="Hoja de servicio (PDF)" required />
        ),
      ];
    }
    return [
      <EvidenceSlot
        key={paso}
        icon={<IcoFormulario />}
        label="Formulario"
        required={!hecho.SERVICE_SHEET_DATA}
        badge={hecho.SERVICE_SHEET_DATA ? bandera(paso) ?? <Badge tone="success" size="sm">Llenado</Badge> : undefined}
      />,
    ];
  });

  const menu: MenuAction[] =
    puedeEliminar && !editing
      ? [
          {
            id: "eliminar",
            label: "Eliminar actividad",
            danger: true,
            icon: <DeleteOutlineIcon fontSize="inherit" />,
            onSelect: pedirEliminar,
          },
        ]
      : [];

  return (
    <>
      <ActivitySuperiorActions
        activityId={activity.id}
        token={token}
        onDone={reload}
        actionsTarget={actionsSlot}
        menuItems={menu}
        extra={
          canEdit && !editing ? (
            <Button variant="secondary" onClick={openEdit} iconStart={<EditOutlinedIcon fontSize="inherit" />}>
              Editar
            </Button>
          ) : null
        }
      />
      {error ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" variant="tertiary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          No se pudo actualizar: {error}
        </Alert>
      ) : null}
      {saveErr && !editing ? (
        <Alert tone="danger" role="alert" onDismiss={() => setSaveErr(null)}>
          {saveErr}
        </Alert>
      ) : null}
      {mostrarIniciar ? (
        <Alert tone="brand" title="Te asignaron esta actividad">
          Pulsa «Iniciar actividad» en la cabecera: queda registrada tu hora real de inicio.
        </Alert>
      ) : null}
      {/* Ya la inicié: mi reloj corre (Pausar) o está detenido (En pausa · Reanudar). */}
      {token && miFila && !mostrarIniciar ? (
        <SesionPropia
          token={token}
          activityId={activity.id}
          actividad={{ ...miFila, despachador: despacho && miFila.rol === "LEAD", estatus: activity.estatus }}
          miId={user?.id}
          onDone={reload}
        />
      ) : null}
      {/cancel/i.test(activity.estatus) && (activity.cancelReason || activity.cancelledAt) ? (
        <Alert
          tone="danger"
          role="status"
          title={`Cancelada${activity.cancelledBy?.nombre ? ` por ${activity.cancelledBy.nombre}` : ""}${
            activity.cancelledAt ? ` · ${formatDateTime(activity.cancelledAt)}` : ""
          }`}
        >
          {activity.cancelReason ? `Motivo: ${activity.cancelReason}` : null}
        </Alert>
      ) : null}
      {missingEvidence && missingEvidence.length > 0 ? (
        <Alert
          tone="warning"
          title="Faltan evidencias para marcar la actividad como terminada"
          onDismiss={() => setMissingEvidence(null)}
          action={
            <ButtonLink href={hrefs.evidences} size="sm" variant="primary" iconStart={<IcoCamara />}>
              Subir evidencias
            </ButtonLink>
          }
        >
          <ul className={s.lista}>
            {missingEvidence.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <RecordSection
        title="Evidencias"
        subtitle={
          pasos.length === 0
            ? "Esta actividad no pide evidencia por pasos."
            : faltan === 0
              ? `${pasosHechos} de ${pasos.length} pasos · completas`
              : `${pasosHechos} de ${pasos.length} pasos · faltan ${faltan} obligatorio${faltan === 1 ? "" : "s"} para mandar a revisión`
        }
        end={
          pasos.length ? (
            <div className={s.galeriaFin}>
              <Progress value={pasosHechos} max={pasos.length} ariaLabel="Avance de evidencias" />
              <ButtonLink href={hrefs.evidences} size="sm" variant="tertiary">
                Ver todo
              </ButtonLink>
            </div>
          ) : null
        }
      >
        {pasos.length ? <EvidenceGallery>{piezasGaleria}</EvidenceGallery> : null}
      </RecordSection>

      {editing ? (
        <RecordSection title="Editar actividad" subtitle={`${activity.client?.name ?? "Sin cliente"} · ${branch || activity.branchAddress || "Sin sucursal"}`}>
          <div className={s.edicion}>
            <FieldGrid>
              <Field label="Estado" required>
                <Select value={form.estatus} onChange={(e) => setForm((f) => ({ ...f, estatus: e.target.value }))}>
                  {/* Cancelar tiene su propio botón con motivo obligatorio (solo superiores). */}
                  {STATUSES.filter((st) => st !== "Cancelada" || /cancel/i.test(activity.estatus)).map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </Select>
              </Field>
              <div className={s.prioridad}>
                <PrioritySemaforo
                  compact
                  allowEmpty
                  value={form.prioridad}
                  onChange={(prioridad) => setForm((f) => ({ ...f, prioridad }))}
                />
              </div>
              <Field label="Fecha inicio">
                <Input type="datetime-local" value={form.fechaInicio} onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} />
              </Field>
              <Field label="Entrega esperada">
                <DateInput value={form.fechaEntregaEsperada} onChange={(e) => setForm((f) => ({ ...f, fechaEntregaEsperada: e.target.value }))} />
              </Field>
              <Field label="Fecha finalización">
                <Input type="datetime-local" value={form.fechaFinalizacion} onChange={(e) => setForm((f) => ({ ...f, fechaFinalizacion: e.target.value }))} />
              </Field>
            </FieldGrid>
            <Field label="Descripción" fullWidth>
              <Textarea
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={3}
                placeholder="Descripción de la actividad…"
              />
            </Field>
            <Field label="Indicaciones / Notas internas" fullWidth>
              <Textarea
                value={form.indicaciones}
                onChange={(e) => setForm((f) => ({ ...f, indicaciones: e.target.value }))}
                rows={3}
                placeholder="Instrucciones para el ingeniero, accesos, contactos…"
              />
            </Field>
            {saveErr ? (
              <Alert tone="danger" role="alert">
                {saveErr}
              </Alert>
            ) : null}
            <div className={s.edicionPie}>
              <Button variant="tertiary" size="lg" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" size="lg" onClick={() => void saveEdit()} disabled={!form.estatus} loading={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </RecordSection>
      ) : activity.descripcion || activity.indicaciones ? (
        <RecordSection title="Qué hay que hacer">
          <div className={s.textos}>
            {activity.descripcion ? (
              <div>
                <h3 className={s.textoT}>Descripción</h3>
                <p className={s.texto}>{activity.descripcion}</p>
              </div>
            ) : null}
            {activity.indicaciones ? (
              <div>
                <h3 className={s.textoT}>Indicaciones</h3>
                <p className={s.texto}>{activity.indicaciones}</p>
              </div>
            ) : null}
          </div>
        </RecordSection>
      ) : null}

      {String(activity.coreKind ?? "").toLowerCase() === "comercial" ? (
        <RecordSection title="Cotización">
          <CotizacionDeActividad
            activityId={activity.id}
            coreKind={activity.coreKind}
            cotizacion={(activity as { cotizacion?: CotizacionLigada | null }).cotizacion ?? null}
            onLigada={() => void reload()}
          />
        </RecordSection>
      ) : null}

      {/* El checklist va antes de la evidencia: se revisa lo que se lleva y luego se trabaja. */}
      <HerramientasChecklist activityId={activity.id} />

      <RecordSection title="Evidencias del equipo" subtitle="Lo que subió cada persona y su revisión.">
        <EquipoEvidencias activityId={activity.id} compact verMasHref={hrefs.evidences} />
      </RecordSection>

      <EvidenciaPorCampos
        activityId={activity.id}
        anNumber={activity.anNumber}
        titulo={activity.titulo}
        puedeSubir={puedeSubirPuntos}
      />

      <RecordSection title="Incidencias y recomendaciones">
        <ActivityIssuesPanel activityId={Number(id)} token={token} canManage={Boolean(canEdit)} />
      </RecordSection>

      {visor != null && visor >= 0 && fotos.length > 0 ? (
        <Visor fotos={fotos} index={Math.min(visor, fotos.length - 1)} onClose={() => setVisor(null)} onIndex={setVisor} />
      ) : null}
      <ConfirmDialog state={confirmDelete} onClose={() => setConfirmDelete(null)} />
    </>
  );
}

function num(v?: number | string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
