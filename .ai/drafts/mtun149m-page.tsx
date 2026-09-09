import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { CrossPanelLink, DetailField, DetailFieldGrid, DetailSection, Button } from "@/components";
import { formatDateTime, formatDate, countEvidenceFiles } from "@/utils";
import { useActivity } from "@/hooks";
import { useAuth } from "@/auth";
import { useMutation } from "@apollo/client";
import { UPDATE_ACTIVITY } from "@/graphql/mutations";

const ActivityDetail = ({ id }) => {
  const router = useRouter();
  const { activity, loading, error } = useActivity(id);
  const { user, token } = useAuth();
  const canEdit = user && user.roles.includes("admin"); // Cambiado a "admin" para demostración
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saveErr, setSaveErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [updateActivity] = useMutation(UPDATE_ACTIVITY, {
    onCompleted: () => {
      setEditing(false);
      setSaveErr("");
      setForm({});
    },
    onError: (err) => {
      setSaveErr(err.message);
    },
  });

  useEffect(() => {
    if (loading) return;
    if (error) return;
    if (!activity) return;

    setForm({
      estatus: activity.estatus,
      prioridad: activity.prioridad,
      fechaInicio: formatDateTime(activity.fechaInicio),
      fechaEntregaEsperada: formatDate(activity.fechaEntregaEsperada),
      fechaFinalizacion: formatDateTime(activity.fechaFinalizacion),
      descripcion: activity.descripcion,
      indicaciones: activity.indicaciones,
    });
  }, [loading, error, activity]);

  const saveEdit = async () => {
    if (!form.estatus) {
      setSaveErr("Por favor selecciona un estado.");
      return;
    }

    setSaving(true);
    await updateActivity({
      variables: {
        id: Number(id),
        estatus: form.estatus,
        prioridad: form.prioridad,
        fechaInicio: form.fechaInicio,
        fechaEntregaEsperada: form.fechaEntregaEsperada,
        fechaFinalizacion: form.fechaFinalizacion,
        descripcion: form.descripcion,
        indicaciones: form.indicaciones,
      },
    });
    setSaving(false);
  };

  const branch = activity?.branch?.nombre;

  return (
    <>
      <DetailSection title="Información general">
        {editing ? (
          <>
            <DetailFieldGrid>
              <DetailField label="Cliente">
                {activity.client?.name ? (
                  <CrossPanelLink href={`/ops/clients/${activity.client?.id}`}>
                    {activity.client.name}
                  </CrossPanelLink>
                ) : (activity.client?.name ?? "—")} />
              <DetailField label="Sucursal" value={branch || activity.branchAddress} />
              <DetailField label="Responsable" value={activity.responsable?.nombre} />
              <DetailField label="Creador" value={activity.creador?.nombre} />
              <DetailField label="Asignación" value={formatDateTime(activity.fechaAsignacion)} />
              <DetailField label="Inicio" value={formatDateTime(activity.fechaInicio)} />
              {activity.acsEnteredAt && (
                <DetailField
                  label="ACS"
                  value={
                    <span style={{ color: "var(--success, #15803d)", fontWeight: 600 }}>
                      {(() => {
                        try {
                          const hhmm = new Intl.DateTimeFormat("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                            timeZone: "America/Mexico_City",
                          }).format(new Date(activity.acsEnteredAt));
                          const who = activity.acsEnteredByUser?.nombre
                            ? ` · ${activity.acsEnteredByUser.nombre}`
                            : "";
                          const door = activity.acsEntryDoor ? ` (${activity.acsEntryDoor})` : "";
                          return `Entró por ACS a las ${hhmm}${who}${door}`;
                        } catch {
                          return "Entró por ACS";
                        }
                      })()}
                      {activity.acsLeftSite && activity.acsExitedAt
                        ? ` · Salió ${formatDateTime(activity.acsExitedAt)}`
                        : ""}
                    </span>
                  }
                />
              )}
              <DetailField label="Entrega esperada" value={formatDate(activity.fechaEntregaEsperada)} />
              <DetailField label="Finalización" value={formatDateTime(activity.fechaFinalizacion)} />
            </DetailFieldGrid>
            {activity.descripcion && (
              <div style={{ marginTop: 12 }}>
                <DetailField label="Descripción" value={activity.descripcion} />
              </div>
            )}
            {activity.indicaciones && (
              <div style={{ marginTop: 12 }}>
                <DetailField label="Indicaciones" value={activity.indicaciones} />
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
            {/* Read-only context */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
              <div><strong>Cliente:</strong> {activity.client?.name ?? "—"}</div>
              <div><strong>Sucursal:</strong> {branch || activity.branchAddress || "—"}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} style={{ marginTop: 16 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Estado *</span>
                <select value={form.estatus} onChange={(e) => setForm((f) => ({ ...f, estatus: e.target.value }))} style={inp}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Prioridad</span>
                <select value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))} style={inp}>
                  <option value="">— Sin prioridad —</option>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} style={{ marginTop: 16 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha inicio</span>
                <input type="datetime-local" value={form.fechaInicio} onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Entrega esperada</span>
                <input type="date" value={form.fechaEntregaEsperada} onChange={(e) => setForm((f) => ({ ...f, fechaEntregaEsperada: e.target.value }))} style={inp} />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }} style={{ marginTop: 16 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha finalización</span>
              <input type="datetime-local" value={form.fechaFinalizacion} onChange={(e) => setForm((f) => ({ ...f, fechaFinalizacion: e.target.value }))} style={inp} />
            </label>

            <label style={{ display: "grid", gap: 4 }} style={{ marginTop: 16 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción</span>
              <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={3} placeholder="Descripción de la actividad…"
                style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} />
            </label>

            <label style={{ display: "grid", gap: 4 }} style={{ marginTop: 16 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Indicaciones</span>
              <textarea value={form.indicaciones} onChange={(e) => setForm((f) => ({ ...f, indicaciones: e.target.value }))}
                rows={3} placeholder="Indicaciones adicionales..."
                style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <Button onClick={() => setEditing(true)} style={{ marginRight: 8 }}>Editar</Button>
              <Button onClick={saveEdit} disabled={!form.estatus} style={{ backgroundColor: form.estatus ? "#28a745" : "#ccc", color: "#fff" }}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Evidencia">
        {/* Aquí puedes agregar el componente de evidencia */}
      </DetailSection>

      <DetailSection title="Notas">
        {/* Aquí puedes agregar el componente de notas */}
      </DetailSection>
    </>
  );
};

const inp = {
  padding: "8px",
  borderRadius: "4px",
  border: "1px solid #ced4da",
  fontSize: "14px",
  width: "100%",
};

const STATUSES = ["pendiente", "en proceso", "completado", "cancelado"];
const PRIORITIES = ["baja", "media", "alta"];

export default ActivityDetail;