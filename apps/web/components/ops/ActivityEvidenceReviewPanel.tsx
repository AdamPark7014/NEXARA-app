"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/DataTable";
import { formatDateTime } from "@/components/detail/DetailFrame";
import {
  evidenceStepStatuses,
  flattenServiceSheetFields,
  mapsUrl,
  resolveAssetUrl,
  type ActivityEvidenceDetail,
} from "@/lib/evidence-display";
import type { ActivityDetail } from "@/lib/ops-activities-api";
import { activityDisplayLabel, activityDisplayVariant } from "@/lib/activity-status";

type Props = {
  activity: ActivityDetail;
  /** En Detalle: oculta cabecera duplicada de la OT. */
  showHeader?: boolean;
};

function PhotoThumb({ url, label }: { url: string; label: string }) {
  const src = resolveAssetUrl(url);
  if (!src) return null;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        borderRadius: 10,
        border: "1px solid var(--border)",
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <img src={src} alt={label} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
      <div style={{ padding: "6px 8px", fontSize: 11, fontWeight: 600, background: "var(--surface-2)" }}>{label}</div>
    </a>
  );
}

export default function ActivityEvidenceReviewPanel({ activity, showHeader = true }: Props) {
  const ev = activity.activityEvidence as ActivityEvidenceDetail | null | undefined;
  if (!ev) return null;

  const steps = evidenceStepStatuses(ev);
  const sheetFields = flattenServiceSheetFields(ev.serviceSheetData);
  const entryMap = mapsUrl(ev.entryLatitude, ev.entryLongitude);
  const exitMap = mapsUrl(ev.exitLatitude, ev.exitLongitude);
  const branch = [activity.branchName, activity.branchCity, activity.branchState].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "grid", gap: 16, marginBottom: showHeader ? 20 : 0 }}>
      {showHeader && (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              OT en revisión
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
              {activity.anNumber} · {activity.titulo}
            </div>
          </div>
          <Tag variant={activityDisplayVariant(activity.estatus, ev)}>
            {activityDisplayLabel(activity.estatus, ev)}
          </Tag>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginTop: 14,
            fontSize: 13,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Cliente</div>
            <div style={{ fontWeight: 600 }}>{activity.client?.name ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Sucursal</div>
            <div style={{ fontWeight: 600 }}>{branch || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Responsable</div>
            <div style={{ fontWeight: 600 }}>{activity.responsable?.nombre ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Tipo</div>
            <div style={{ fontWeight: 600 }}>{activity.ticketType ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Entrega esperada</div>
            <div style={{ fontWeight: 600 }}>{formatDateTime(activity.fechaEntregaEsperada)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Campo finalizado</div>
            <div style={{ fontWeight: 600 }}>{formatDateTime(activity.fechaFinalizacion ?? ev.completedAt)}</div>
          </div>
        </div>

        {activity.descripcion && (
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            <strong>Descripción:</strong> {activity.descripcion}
          </p>
        )}
        {activity.indicaciones && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            <strong>Indicaciones:</strong> {activity.indicaciones}
          </p>
        )}
      </div>

      <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Pasos del paquete</div>
        <div style={{ display: "grid", gap: 8 }}>
          {steps.map((step) => (
            <div
              key={step.step}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 10px",
                borderRadius: 8,
                background: step.done ? "color-mix(in srgb, var(--success) 10%, transparent)" : "var(--surface-2)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: step.done ? 600 : 500 }}>
                {step.done ? "✓" : "○"} {step.label}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {step.at ? formatDateTime(step.at) : step.done ? "Completado" : "Pendiente"}
              </span>
            </div>
          ))}
        </div>

        {(entryMap || exitMap) && (
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            {entryMap && (
              <Link href={entryMap} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>
                📍 GPS entrada
              </Link>
            )}
            {exitMap && (
              <Link href={exitMap} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>
                📍 GPS salida
              </Link>
            )}
          </div>
        )}
      </div>
      )}

      <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Archivos capturados</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {ev.entryPhotoUrl && <PhotoThumb url={ev.entryPhotoUrl} label="Foto entrada" />}
          {(ev.evidencePhotos ?? []).map((photo, idx) => (
            <PhotoThumb key={`${photo}-${idx}`} url={photo} label={`Evidencia ${idx + 1}`} />
          ))}
          {ev.exitPhotoUrl && <PhotoThumb url={ev.exitPhotoUrl} label="Foto salida" />}
        </div>

        {ev.serviceSheetPdfUrl && (
          <div style={{ marginTop: 12 }}>
            <a
              href={resolveAssetUrl(ev.serviceSheetPdfUrl)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
            >
              📄 Ver hoja de servicio (PDF)
            </a>
            {ev.serviceSheetUploadedAt && (
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                · {formatDateTime(ev.serviceSheetUploadedAt)}
              </span>
            )}
          </div>
        )}

        {sheetFields.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
              Plantilla interna (paso 4)
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 8,
                fontSize: 12.5,
              }}
            >
              {sheetFields.slice(0, 24).map((field) => (
                <div key={`${field.label}-${field.value}`} style={{ padding: 8, borderRadius: 8, background: "var(--surface-2)" }}>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{field.label}</div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>{field.value}</div>
                  {field.imageUrl && (
                    <img
                      src={resolveAssetUrl(field.imageUrl)}
                      alt={field.label}
                      style={{ marginTop: 6, width: "100%", maxHeight: 80, objectFit: "cover", borderRadius: 6 }}
                    />
                  )}
                </div>
              ))}
            </div>
            {sheetFields.length > 24 && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                +{sheetFields.length - 24} campos más en la plantilla
              </p>
            )}
          </div>
        )}

        {!ev.entryPhotoUrl && !(ev.evidencePhotos?.length) && !ev.exitPhotoUrl && !ev.serviceSheetPdfUrl && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            No hay archivos visibles en el paquete. Revisa la pestaña Evidencias.
          </p>
        )}
      </div>
    </div>
  );
}
