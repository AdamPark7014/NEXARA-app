"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";
import { btnGhost, btnPrimary, inputStyle, integraApi } from "../_lib";

type Site = {
  id: number;
  name: string;
  host: string;
  isActive: boolean;
  isDefault: boolean;
  lastSyncAt?: string | null;
  lastHealthOkAt?: string | null;
};

export default function IntegraSettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSites(await integraApi<Site[]>("integra/sites"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await integraApi("integra/sites", {
        method: "POST",
        body: JSON.stringify({
          name,
          host,
          appKey,
          appSecret,
          isDefault: sites.length === 0,
        }),
      });
      setName("");
      setHost("");
      setAppKey("");
      setAppSecret("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const sync = async (siteId: number) => {
    setBusy(true);
    try {
      await integraApi(`integra/sync?siteId=${siteId}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync falló");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar sitio?")) return;
    await integraApi(`integra/sites/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Configuración"
        title="Sitios Integra"
        subtitle="Credenciales Artemis cifradas por companyId. Fallback env INTEGRA_HIK_*."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashPanel title="Sitios registrados" subtitle={`${sites.length} sitios`}>
        {sites.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            sub={`${s.host} · sync ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("es-MX") : "nunca"}`}
            trail={
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {s.isDefault && <DashPill tone="accent">default</DashPill>}
                <DashPill tone={s.isActive ? "positive" : "warning"}>
                  {s.isActive ? "activo" : "off"}
                </DashPill>
                <button type="button" style={btnGhost} disabled={busy} onClick={() => void sync(s.id)}>
                  Sync
                </button>
                <button type="button" style={btnGhost} onClick={() => void remove(s.id)}>
                  Borrar
                </button>
              </div>
            }
          />
        ))}
        {sites.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Sin sitios DB — se usará INTEGRA_HIK_* si está definido.
          </p>
        )}
      </DashPanel>

      <DashPanel title="Nuevo sitio" subtitle="AppKey/Secret se cifran (AES-GCM)">
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <input
            placeholder="Host https://hikcentral…"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            style={inputStyle}
          />
          <input placeholder="App Key" value={appKey} onChange={(e) => setAppKey(e.target.value)} style={inputStyle} />
          <input
            placeholder="App Secret"
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            style={btnPrimary}
            disabled={busy || !name || !host || !appKey || !appSecret}
            onClick={() => void create()}
          >
            Crear sitio
          </button>
        </div>
      </DashPanel>
    </DashPage>
  );
}
