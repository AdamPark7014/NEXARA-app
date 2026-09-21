"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

type ServiceClient = { id: number; name: string };

/**
 * Tope del DTO de la API (`PaginationQueryDto`, `@Max(100)`).
 *
 * Esta pantalla pedía `limit=200`, así que `service-clients` contestaba 400 y
 * el desplegable «Cliente con contrato» se quedaba vacío para siempre: sin
 * cliente no hay ticket, de modo que el puente desde la alarma de Integra
 * nunca llegó a funcionar.
 */
const POR_PAGINA = 100;

/** Techo de seguridad del recorrido. Si se alcanza, se dice en pantalla. */
const MAX_PAGINAS = 20;

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function SupportNewForm() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const params = useSearchParams();
  const router = useRouter();

  const initialTitle = params.get("title")?.trim() || "Alarma Integra";
  const initialDesc =
    params.get("description")?.trim() ||
    params.get("note")?.trim() ||
    "";
  const siteId = params.get("siteId")?.trim() || "";
  const clientHint = params.get("clientHint")?.trim() || "";

  const [clients, setClients] = useState<ServiceClient[]>([]);
  /** Clientes que quedaron fuera del recorrido: se dice, no se recorta callando. */
  const [parciales, setParciales] = useState<{ cargados: number; total: number } | null>(null);
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState(
    [initialTitle, initialDesc].filter(Boolean).join("\n\n"),
  );
  const [urgency, setUrgency] = useState<"LOW" | "MEDIUM" | "HIGH">("HIGH");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void (async () => {
      try {
        // Un desplegable no admite «Cargar más»: o está el cliente o no está.
        // Por eso se piden páginas sucesivas hasta cubrir el `meta.total` que
        // informa la API, en vez de recortar la lista sin decirlo.
        const rows: ServiceClient[] = [];
        let total = 0;
        let completo = false;
        for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
          const data = await apiFetch(
            `service-clients?limit=${POR_PAGINA}&page=${pagina}`,
            token,
          );
          const lote: ServiceClient[] = Array.isArray(data) ? data : (data?.data ?? []);
          rows.push(...lote);
          total = Array.isArray(data) ? rows.length : (data?.meta?.total ?? rows.length);
          if (lote.length < POR_PAGINA || rows.length >= total) {
            completo = true;
            break;
          }
        }
        const mapped: ServiceClient[] = rows.map((c: ServiceClient) => ({
          id: c.id,
          name: c.name,
        }));
        setClients(mapped);
        setParciales(completo ? null : { cargados: mapped.length, total });

        let resolvedId = "";
        if (siteId) {
          try {
            const sites = await apiFetch("integra/sites", token);
            const list = Array.isArray(sites) ? sites : [];
            const site = list.find(
              (s: { id?: number | string; serviceClientId?: number | null }) =>
                String(s.id) === siteId,
            );
            if (site?.serviceClientId) {
              resolvedId = String(site.serviceClientId);
            }
          } catch {
            /* Integra sites may be unavailable for this role */
          }
        }
        if (!resolvedId && clientHint) {
          const hint = clientHint.toLowerCase();
          const match = mapped.find(
            (c: ServiceClient) =>
              c.name.toLowerCase() === hint || c.name.toLowerCase().includes(hint),
          );
          if (match) resolvedId = String(match.id);
        }
        if (resolvedId) setClientId(resolvedId);
      } catch (e) {
        // El cuerpo crudo de Nest no es una frase: se dice qué falló, y el
        // dato del servidor va entrecomillado al final para soporte.
        setError(
          `No se pudo cargar la lista de clientes con contrato, así que el desplegable está vacío y todavía no se puede crear el ticket. Vuelve a intentarlo; si sigue igual, avisa a soporte con este dato: «${formatApiError(e, "el servidor no contestó").replace(/\s*\.?\s*$/, "")}».`,
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [token, clientHint, siteId]);

  const canSubmit = useMemo(
    () => Boolean(token && clientId && description.trim()),
    [token, clientId, description],
  );

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`service-clients/${clientId}/ticket-requests`, token, {
        method: "POST",
        body: JSON.stringify({
          description: description.trim(),
          urgency,
          requestType: "ISSUE",
        }),
      });
      toast.success("Ticket de soporte creado");
      router.push("/ops/support");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
      toast.error("No se pudo crear el ticket");
    } finally {
      setBusy(false);
    }
  };

  const inp: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 13,
    width: "100%",
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Soporte"
        title="Crear ticket desde alarma"
        subtitle="Puente Integra → inbox de soporte (sin inventar Mission Control)."
        actions={
          <Link href="/ops/support" style={{ textDecoration: "none" }}>
            <Button variant="ghost">Volver al inbox</Button>
          </Link>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando clientes…" description="Listando cuentas con contrato." />}
      {!loading && (
        <Section title="Datos del ticket" subtitle="Prefill desde la alarma de Integra; elige el cliente.">
          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--state-danger-bg)",
                color: "var(--state-danger-text)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          {(siteId || clientHint) && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--surface-2, #f1f5f9)",
                fontSize: 12.5,
                color: "var(--text-secondary)",
              }}
            >
              Origen Integra
              {clientHint ? ` · ${clientHint}` : ""}
              {siteId ? ` · site #${siteId}` : ""}
              {clientId
                ? " · cliente preseleccionado"
                : siteId
                  ? " · sin serviceClientId en el sitio (elige cliente)"
                  : ""}
            </div>
          )}
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Cliente con contrato</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inp}>
                <option value="">Selecciona…</option>
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
              {parciales && (
                <span style={{ fontSize: 11.5, color: "var(--state-warning-text)" }}>
                  Se cargaron {parciales.cargados} clientes de {parciales.total}: si el de esta
                  alarma no aparece, créalo desde el inbox de soporte.
                </span>
              )}
              {!parciales && !error && clients.length === 0 && (
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  Tu usuario no ve ningún cliente con contrato, así que no hay a quién
                  asignarle el ticket.
                </span>
              )}
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Urgencia</span>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as typeof urgency)}
                style={inp}
              >
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Media</option>
                <option value="LOW">Baja</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Descripción</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                style={{ ...inp, resize: "vertical", fontFamily: "inherit" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
                {busy ? "Creando…" : "Crear ticket"}
              </Button>
              <Link href="/ops/support" style={{ textDecoration: "none" }}>
                <Button variant="secondary">Cancelar</Button>
              </Link>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

export default function SupportNewFromAlarmPage() {
  return (
    <Suspense fallback={<EmptyState icon="⏳" title="Cargando…" description="Preparando formulario." />}>
      <SupportNewForm />
    </Suspense>
  );
}
