"use client";

import { useCallback, useMemo, useState } from "react";
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
import { IconLabel } from "@/components/ui/IconBadge";
import DescargarEvidenciaZip from "@/components/ops/DescargarEvidenciaZip";
import { FotoProtegida, Visor, type Foto } from "@/components/ops/EquipoEvidencias";
import CheckIcon from "@mui/icons-material/Check";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";

type Props = {
  activity: ActivityDetail;
  /** En Detalle: oculta cabecera duplicada de la OT. */
  showHeader?: boolean;
};

const FOTO_ALTO = 300;

function PhotoHero({
  url,
  label,
  onOpen,
}: {
  url: string;
  label: string;
  onOpen: () => void;
}) {
  return (
    <figure style={{ margin: 0, display: "grid", gap: 6, minWidth: 0 }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver en grande: ${label}`}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          borderRadius: 12,
          border: "1px solid var(--border)",
          overflow: "hidden",
          background: "color-mix(in srgb, var(--text-secondary) 8%, var(--surface))",
          cursor: "zoom-in",
          height: FOTO_ALTO,
          minHeight: 280,
        }}
      >
        <FotoProtegida
          url={url}
          alt={label}
          alto={FOTO_ALTO}
          style={{ width: "100%", height: FOTO_ALTO, objectFit: "cover", display: "block" }}
        />
      </button>
      <figcaption style={{ fontSize: 12.5, fontWeight: 650, color: "var(--text-secondary)" }}>{label}</figcaption>
    </figure>
  );
}

export default function ActivityEvidenceReviewPanel({ activity, showHeader = true }: Props) {
  const ev = activity.activityEvidence as ActivityEvidenceDetail | null | undefined;
  const [visor, setVisor] = useState<{ fotos: Foto[]; index: number } | null>(null);
  const cerrarVisor = useCallback(() => setVisor(null), []);
  const moverVisor = useCallback((i: number) => setVisor((v) => (v ? { ...v, index: i } : v)), []);

  const galeria = useMemo(() => {
    if (!ev) return [] as Foto[];
    const num = (v: number | string | null | undefined): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "string" ? Number(v) : v;
      return Number.isFinite(n) ? n : null;
    };
    const fotos: Foto[] = [];
    if (ev.entryPhotoUrl) {
      fotos.push({
        url: ev.entryPhotoUrl,
        titulo: "Foto entrada",
        at: ev.entryPhotoUploadedAt ?? null,
        lat: num(ev.entryLatitude),
        lng: num(ev.entryLongitude),
      });
    }
    for (const [idx, photo] of (ev.evidencePhotos ?? []).entries()) {
      fotos.push({ url: photo, titulo: `Evidencia ${idx + 1}` });
    }
    if (ev.exitPhotoUrl) {
      fotos.push({
        url: ev.exitPhotoUrl,
        titulo: "Foto salida",
        at: ev.exitPhotoUploadedAt ?? null,
        lat: num(ev.exitLatitude),
        lng: num(ev.exitLongitude),
      });
    }
    return fotos;
  }, [ev]);

  if (!ev) return null;

  const steps = evidenceStepStatuses(ev);
  const sheetFields = flattenServiceSheetFields(ev.serviceSheetData);
  const entryMap = mapsUrl(ev.entryLatitude, ev.entryLongitude);
  const exitMap = mapsUrl(ev.exitLatitude, ev.exitLongitude);
  const branch = [activity.branchName, activity.branchCity, activity.branchState].filter(Boolean).join(" · ");

  const abrirFoto = (index: number) => {
    if (index >= 0 && galeria[index]) setVisor({ fotos: galeria, index });
  };

  let fotoIdx = 0;
  const entryIdx = ev.entryPhotoUrl ? fotoIdx++ : -1;
  const evidenceStart = fotoIdx;
  const evidenceCount = ev.evidencePhotos?.length ?? 0;
  fotoIdx += evidenceCount;
  const exitIdx = ev.exitPhotoUrl ? fotoIdx : -1;

  return (
    <div style={{ display: "grid", gap: 16, marginBottom: showHeader ? 20 : 0 }}>
      {showHeader && (
        <>
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
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <Tag variant={activityDisplayVariant(activity.estatus, ev)}>
                  {activityDisplayLabel(activity.estatus, ev)}
                </Tag>
                <DescargarEvidenciaZip activityId={activity.id} anNumber={activity.anNumber} titulo={activity.titulo} />
              </div>
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
                  <IconLabel
                    icon={step.done ? CheckIcon : RadioButtonUncheckedIcon}
                    iconColor={step.done ? "var(--success)" : "var(--text-tertiary)"}
                    style={{ fontSize: 13, fontWeight: step.done ? 600 : 500 }}
                  >
                    {step.label}
                  </IconLabel>
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
                    <IconLabel icon={PlaceOutlinedIcon} gap={4}>
                      GPS entrada
                    </IconLabel>
                  </Link>
                )}
                {exitMap && (
                  <Link href={exitMap} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>
                    <IconLabel icon={PlaceOutlinedIcon} gap={4}>
                      GPS salida
                    </IconLabel>
                  </Link>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Archivos capturados</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {ev.entryPhotoUrl && entryIdx >= 0 ? (
            <PhotoHero url={ev.entryPhotoUrl} label="Foto entrada" onOpen={() => abrirFoto(entryIdx)} />
          ) : null}
          {(ev.evidencePhotos ?? []).map((photo, idx) => (
            <PhotoHero
              key={`${photo}-${idx}`}
              url={photo}
              label={`Evidencia ${idx + 1}`}
              onOpen={() => abrirFoto(evidenceStart + idx)}
            />
          ))}
          {ev.exitPhotoUrl && exitIdx >= 0 ? (
            <PhotoHero url={ev.exitPhotoUrl} label="Foto salida" onOpen={() => abrirFoto(exitIdx)} />
          ) : null}
        </div>

        {ev.serviceSheetPdfUrl && (
          <div style={{ marginTop: 12 }}>
            <a
              href={resolveAssetUrl(ev.serviceSheetPdfUrl)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
            >
              <IconLabel icon={DescriptionOutlinedIcon}>Ver hoja de servicio (PDF)</IconLabel>
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAssetUrl(field.imageUrl)}
                      alt={field.label}
                      style={{ marginTop: 6, width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6 }}
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

      {visor ? <Visor fotos={visor.fotos} index={visor.index} onClose={cerrarVisor} onIndex={moverVisor} /> : null}
    </div>
  );
}
