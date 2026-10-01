"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import PersonaPhotoCard from "@/components/pizarra/PersonaPhotoCard";
import { Alert, EmptyState, PageHead, SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import { formatApiError } from "@/lib/erp-api";
import {
  WORKFLOW_BUCKET_LABELS,
  fetchWorkflowBucket,
  rangoDePreset,
  type BoardRange,
  type RangoPreset,
  type WorkflowBucket,
  type WorkflowBucketItem,
  type WorkflowBucketResponse,
} from "@/lib/team-board-api";

const BUCKETS = new Set<string>(Object.keys(WORKFLOW_BUCKET_LABELS));

function esBucketValido(v: string | string[] | undefined): v is WorkflowBucket {
  return typeof v === "string" && BUCKETS.has(v);
}

function fecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Subtítulo de cada tarjeta: estatus (si hay) y la fecha que la metió en este balde. */
function subtitulo(item: WorkflowBucketItem): string {
  const partes = [item.estatus, fecha(item.fecha)].filter(Boolean);
  return partes.join(" · ");
}

export default function FlujoBucketPage() {
  const params = useParams();
  const bucketParam = params?.bucket;
  const bucket = esBucketValido(bucketParam) ? bucketParam : null;
  const { user } = useUser();
  const token = user?.token ?? "";
  const [preset, setPreset] = useState<RangoPreset>("semana");
  const [rango, setRango] = useState<BoardRange>(() => rangoDePreset("semana"));
  const [data, setData] = useState<WorkflowBucketResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !bucket) return;
    setCargando(true);
    setError(null);
    try {
      setData(await fetchWorkflowBucket(token, bucket, rango));
    } catch (e) {
      setData(null);
      setError(formatApiError(e, "No se pudo cargar el detalle"));
    } finally {
      setCargando(false);
    }
  }, [token, bucket, rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!bucket) {
    return (
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <PageHead back={{ href: "/erp/pizarra/flujo", label: "Flujo de actividades" }} title="Balde desconocido" />
        <Alert tone="danger" role="alert">
          No reconozco ese dato del flujo.
        </Alert>
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <PageHead
        back={{ href: "/erp/pizarra/flujo", label: "Flujo de actividades" }}
        title={WORKFLOW_BUCKET_LABELS[bucket]}
        description={
          bucket === "peerRejected"
            ? "Solicitudes entre compañeros que no se aceptaron."
            : "Las actividades que componen este número."
        }
        actions={
          <RangoSelector
            preset={preset}
            rango={rango}
            onChange={(p, r) => {
              setPreset(p);
              setRango(r);
            }}
          />
        }
      />

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {cargando && !data ? <SkeletonRows rows={4} /> : null}

      {!cargando && data && items.length === 0 ? (
        <EmptyState title="Nada en este balde para el periodo elegido" />
      ) : null}

      {items.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {items.map((item) => (
            <PersonaPhotoCard
              key={item.id}
              href={item.activityId ? `/erp/actividades/${item.activityId}` : undefined}
              nombre={item.persona?.nombre ?? "—"}
              puesto={item.persona?.puesto}
              avatarUrl={item.persona?.avatarUrl}
              photoSize={72}
              title={item.anNumber ? `${item.anNumber} · ${item.titulo}` : item.titulo}
              subtitle={subtitulo(item)}
              meta={
                item.detalle ? (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.detalle}</div>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
