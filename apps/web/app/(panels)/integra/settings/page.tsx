"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";
import { getActiveCompanyId } from "@/lib/tenant";
import { btnGhost, btnPrimary, inputStyle, integraApi } from "../_lib";

type Site = {
  id: number;
  name: string;
  label?: string | null;
  host: string;
  isActive: boolean;
  isDefault: boolean;
  lastSyncAt?: string | null;
  lastHealthOkAt?: string | null;
  modulesOverride?: Record<string, boolean> | null;
  _count?: {
    cameras: number;
    doors: number;
    people: number;
    devices: number;
    vehicles: number;
  };
};

const MODULE_KEYS = [
  "video",
  "access",
  "people",
  "events",
  "vehicles",
  "anpr",
  "visitors",
  "alarms",
] as const;

export default function IntegraSettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [targetCompanyId, setTargetCompanyId] = useState("");
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
    const active = getActiveCompanyId();
    if (active) setTargetCompanyId(String(active));
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name,
        host,
        appKey,
        appSecret,
        label: label || undefined,
        isDefault: sites.length === 0,
      };
      if (targetCompanyId) body.companyId = Number(targetCompanyId);
      await integraApi("integra/sites", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setName("");
      setLabel("");
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

  const toggleModule = async (site: Site, key: string) => {
    const current = { ...(site.modulesOverride || {}) };
    const inferredOn = current[key] !== false;
    current[key] = !inferredOn;
    setBusy(true);
    try {
      await integraApi(`integra/sites/${site.id}`, {
        method: "PATCH",
        body: JSON.stringify({ modulesOverride: current }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Configuración multi-cliente"
        title="Sitios Integra"
        subtitle="Desde NEXARA creas un sitio Artemis por CompanyProfile. Credenciales AES-GCM. Sync alimenta el espejo → módulos."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashPanel title="Sitios de la empresa activa" subtitle={`${sites.length} sitios`}>
        {sites.map((s) => (
          <div key={s.id} style={{ marginBottom: 14 }}>
            <ListRow
              title={s.label || s.name}
              sub={`${s.host} · cam ${s._count?.cameras ?? "—"} · puertas ${s._count?.doors ?? "—"} · sync ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("es-MX") : "nunca"}`}
              trail={
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {s.isDefault && <DashPill tone="accent">default</DashPill>}
                  <DashPill tone={s.isActive ? "positive" : "warning"}>
                    {s.isActive ? "activo" : "off"}
                  </DashPill>
                  <button
                    type="button"
                    style={btnGhost}
                    disabled={busy}
                    onClick={() => void sync(s.id)}
                  >
                    Sync
                  </button>
                  <button type="button" style={btnGhost} onClick={() => void remove(s.id)}>
                    Borrar
                  </button>
                </div>
              }
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                paddingLeft: 8,
                marginTop: 6,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Override módulos:</span>
              {MODULE_KEYS.map((k) => {
                const on = s.modulesOverride?.[k] !== false;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleModule(s, k)}
                    style={{
                      ...btnGhost,
                      opacity: on ? 1 : 0.45,
                      textDecoration: on ? "none" : "line-through",
                    }}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {sites.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Sin sitios DB — se usará INTEGRA_HIK_* si está definido (un solo tenant env).
          </p>
        )}
      </DashPanel>

      <DashPanel
        title="Nuevo sitio Artemis"
        subtitle="Cambia CompanySwitcher (o companyId) para aprovisionar otro cliente"
      >
        <div style={{ display: "grid", gap: 10, maxWidth: 440 }}>
          <input
            placeholder="CompanyId destino (super-admin)"
            value={targetCompanyId}
            onChange={(e) => setTargetCompanyId(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Nombre interno"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Etiqueta visible (opcional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Host https://hikcentral…"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="App Key"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            style={inputStyle}
          />
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
