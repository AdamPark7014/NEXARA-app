"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import {
  canSeeClientSector,
  CLIENT_SECTOR_META,
  type ClientSector,
} from "@/lib/client-sectors";
import { listSalesClients, type SalesClient } from "@/lib/sales-api";
import { ORG_EMAILS } from "@/lib/activity-kinds";

function norm(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

export function ClientesSectorList({ sector }: { sector: ClientSector }) {
  const router = useRouter();
  const { user, token } = useUser();
  const meta = CLIENT_SECTOR_META[sector];
  const allowed = canSeeClientSector(user?.email, sector);
  const showOwner =
    norm(user?.email) === ORG_EMAILS.ceo || Boolean(user?.isSuperAdmin);

  const [items, setItems] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listSalesClients(token, { sector }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar");
    } finally {
      setLoading(false);
    }
  }, [token, sector, allowed]);

  useEffect(() => {
    if (!allowed) {
      router.replace("/erp/clientes");
      return;
    }
    void load();
  }, [allowed, load, router]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.legalName ?? "").toLowerCase().includes(query) ||
        (c.taxId ?? "").toLowerCase().includes(query) ||
        (c.owner?.nombre ?? "").toLowerCase().includes(query),
    );
  }, [items, q]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            {meta.emoji} {meta.title}
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{meta.help}</p>
        </div>
        <Link
          href={`/erp/clientes/nuevo?sector=${CLIENT_SECTOR_META[sector].slug}`}
          style={{
            textDecoration: "none",
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 14px",
            borderRadius: 12,
            whiteSpace: "nowrap",
          }}
        >
          + Nuevo
        </Link>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, RFC o encargado…"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "inherit",
          fontFamily: "inherit",
          fontSize: 14,
        }}
      />

      {error ? <p style={{ color: "#dc2626", margin: 0 }}>{error}</p> : null}
      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>
      ) : visible.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>No hay clientes en este sector todavía.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((c) => (
            <Link
              key={c.id}
              href={`/erp/clientes/${c.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                display: "grid",
                gridTemplateColumns: showOwner ? "1.4fr 1fr 1fr" : "1.6fr 1fr",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 750 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {c.legalName || "Sin razón social"} · {c.taxId || "Sin RFC"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {(c.sectors ?? []).map((s) => s.sector).join(" · ") || sector}
              </div>
              {showOwner ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>
                  Encargado: {c.owner?.nombre?.split(/\s+/).slice(0, 2).join(" ") || "—"}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
