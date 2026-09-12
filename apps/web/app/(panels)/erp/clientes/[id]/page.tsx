"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import {
  ALL_CLIENT_SECTORS,
  canSeeClientesModule,
  canSeeClientSector,
  CLIENT_SECTOR_META,
  clientSectorsForEmail,
  type ClientSector,
} from "@/lib/client-sectors";
import {
  addSalesClientSector,
  getSalesClient,
  type SalesClient,
} from "@/lib/sales-api";
import {
  createOperationalProject,
  listOperationalProjects,
  type OperationalProject,
} from "@/lib/ops-operational-api";

export default function ClienteDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useUser();
  const id = Number(params?.id);

  const [client, setClient] = useState<SalesClient | null>(null);
  const [projects, setProjects] = useState<OperationalProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectStart, setProjectStart] = useState(() => new Date().toISOString().slice(0, 10));

  const mySectors = useMemo(() => clientSectorsForEmail(user?.email), [user?.email]);
  const clientSectors = useMemo(
    () => (client?.sectors ?? []).map((s) => s.sector as ClientSector),
    [client],
  );
  const hasProyecto = clientSectors.includes("PROYECTO");
  const addable = ALL_CLIENT_SECTORS.filter(
    (s) => mySectors.includes(s) && !clientSectors.includes(s),
  );

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    setError(null);
    try {
      const c = await getSalesClient(token, id);
      setClient(c);
      if (c.serviceClientId) {
        const all = await listOperationalProjects(token);
        setProjects(all.filter((p) => p.client?.id === c.serviceClientId));
      } else {
        setProjects([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, [token, id]);

  useEffect(() => {
    if (!canSeeClientesModule(user?.email)) {
      router.replace("/erp/pizarra");
      return;
    }
    void load();
  }, [load, user?.email, router]);

  const addSector = async (sector: ClientSector) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await addSalesClientSector(token, id, sector);
      setClient(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar sector");
    } finally {
      setBusy(false);
    }
  };

  const onCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !client?.serviceClientId || !user?.id) return;
    if (projectTitle.trim().length < 3) {
      setError("Título del proyecto muy corto");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createOperationalProject(token, {
        title: projectTitle.trim(),
        clientId: client.serviceClientId,
        vendorId: user.id,
        startDate: projectStart,
        projectType: "OTRO",
      });
      setProjectTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el proyecto");
    } finally {
      setBusy(false);
    }
  };

  if (!Number.isFinite(id)) return <p style={{ color: "#dc2626" }}>Cliente no válido.</p>;
  if (!client && !error) return <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>;
  if (!client) return <p style={{ color: "#dc2626" }}>{error}</p>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <button
        type="button"
        onClick={() => router.push("/erp/clientes")}
        style={{
          alignSelf: "flex-start",
          border: "none",
          background: "transparent",
          color: "var(--primary)",
          fontWeight: 650,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        ← Clientes
      </button>

      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{client.name}</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Encargado: {client.owner?.nombre || "—"}
        </p>
      </div>

      <section
        style={{
          padding: 14,
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 10, color: "var(--text-secondary)" }}>
          Datos fiscales
        </div>
        <dl
          style={{
            margin: 0,
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: "8px 12px",
            fontSize: 13.5,
          }}
        >
          <dt style={{ color: "var(--text-secondary)" }}>Razón social</dt>
          <dd style={{ margin: 0 }}>{client.legalName || "—"}</dd>
          <dt style={{ color: "var(--text-secondary)" }}>RFC</dt>
          <dd style={{ margin: 0 }}>{client.taxId || "—"}</dd>
          <dt style={{ color: "var(--text-secondary)" }}>Dirección</dt>
          <dd style={{ margin: 0 }}>{client.fiscalAddress || "—"}</dd>
          <dt style={{ color: "var(--text-secondary)" }}>CP</dt>
          <dd style={{ margin: 0 }}>{client.fiscalZipCode || "—"}</dd>
          <dt style={{ color: "var(--text-secondary)" }}>Régimen</dt>
          <dd style={{ margin: 0 }}>{client.fiscalRegime || "—"}</dd>
          <dt style={{ color: "var(--text-secondary)" }}>Email fiscal</dt>
          <dd style={{ margin: 0 }}>{client.billingEmail || "—"}</dd>
          <dt style={{ color: "var(--text-secondary)" }}>Teléfono</dt>
          <dd style={{ margin: 0 }}>{client.billingPhone || "—"}</dd>
        </dl>
      </section>

      <section
        style={{
          padding: 14,
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 10, color: "var(--text-secondary)" }}>
          Sectores
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {clientSectors.map((s) => (
            <span
              key={s}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                fontSize: 12.5,
                fontWeight: 650,
              }}
            >
              {CLIENT_SECTOR_META[s].emoji} {CLIENT_SECTOR_META[s].title}
            </span>
          ))}
        </div>
        {addable.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Añadir a:</span>
            {addable.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => void addSector(s)}
                style={{
                  border: "1px solid var(--primary)",
                  background: "transparent",
                  color: "var(--primary)",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                + {CLIENT_SECTOR_META[s].title}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {hasProyecto ? (
        <section
          style={{
            padding: 14,
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 10, color: "var(--text-secondary)" }}>
            Proyectos ({projects.length})
          </div>
          {!client.serviceClientId ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              Falta puente operativo (ServiceClient). Vuelve a abrir o contacta a sistemas.
            </p>
          ) : (
            <>
              <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13.5 }}>
                {projects.length === 0 ? (
                  <li style={{ color: "var(--text-secondary)" }}>Aún no hay proyectos.</li>
                ) : (
                  projects.map((p) => (
                    <li key={p.id}>
                      {p.title} · {p.status}
                    </li>
                  ))
                )}
              </ul>
              {canSeeClientSector(user?.email, "PROYECTO") ? (
                <form onSubmit={(e) => void onCreateProject(e)} style={{ display: "grid", gap: 8 }}>
                  <input
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="Nombre del nuevo proyecto"
                    style={{
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "inherit",
                      fontFamily: "inherit",
                    }}
                  />
                  <input
                    type="date"
                    value={projectStart}
                    onChange={(e) => setProjectStart(e.target.value)}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "inherit",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      border: "none",
                      background: "var(--primary)",
                      color: "#fff",
                      fontWeight: 700,
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Crear proyecto
                  </button>
                </form>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {error ? <p style={{ color: "#dc2626", margin: 0 }}>{error}</p> : null}
    </div>
  );
}
