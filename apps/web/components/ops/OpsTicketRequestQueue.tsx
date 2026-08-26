"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Section from "@/components/ui/Section";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { openExternalUrl } from "@/lib/open-external-url";
import {
  closeTicketRequest,
  listApprovedTicketRequests,
  type ClientTicketRequestRow,
} from "@/lib/ops-activities-api";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

function hasCoordinates(lat?: number | null, lng?: number | null) {
  return typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng);
}

function getMapsUrl(lat?: number | null, lng?: number | null) {
  if (!hasCoordinates(lat, lng)) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function getStaticMapPreviewUrl(lat?: number | null, lng?: number | null) {
  if (!hasCoordinates(lat, lng)) return "";
  if (GOOGLE_MAPS_API_KEY) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=800x280&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
  }
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=800x280&markers=${lat},${lng},red-pushpin`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
}

/** Cola de tickets de clientes aprobados — precarga el formulario moderno de OT. */
export default function OpsTicketRequestQueue() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<ClientTicketRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listApprovedTicketRequests(token);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar solicitudes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) return null;

  const pending = rows.filter((r) => r.status === "NEW").length;

  return (
    <Section
      title="Tickets de clientes"
      subtitle="Solicitudes aprobadas listas para convertir en OT."
      actions={
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Pendientes: {pending}</span>
      }
    >
      {loading && <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Cargando solicitudes…</p>}
      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Reintentar
          </button>
        </p>
      )}
      {!loading && rows.length === 0 && !error && (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin solicitudes pendientes.</p>
      )}
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((request) => (
          <div
            key={request.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
              background: "var(--surface-2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>
                {request.client?.name || "Cliente"} · {request.branchName || "Sucursal"}
              </strong>
              <span className="badge">{request.status}</span>
            </div>
            <p style={{ fontSize: 13, margin: "0 0 6px" }}>{request.description}</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              Urgencia: {request.urgency} · Límite: {formatDateTime(request.dueAt)}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>
              {request.address || "—"} {request.city || ""} {request.state || ""}
            </p>
            {hasCoordinates(request.latitud, request.longitud) && (
              <img
                src={getStaticMapPreviewUrl(request.latitud, request.longitud)}
                alt="Mapa sucursal"
                style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, marginTop: 10 }}
                loading="lazy"
              />
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {hasCoordinates(request.latitud, request.longitud) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void openExternalUrl(getMapsUrl(request.latitud, request.longitud))}
                >
                  Ver mapa
                </Button>
              )}
              <Link href={`/ops/activities/new?requestId=${request.id}`} style={{ textDecoration: "none" }}>
                <Button size="sm">Crear OT</Button>
              </Link>
              {request.status !== "CLOSED" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!token) return;
                    void closeTicketRequest(token, request.id).then(() => load());
                  }}
                >
                  Cerrar solicitud
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
