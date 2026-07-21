"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getActiveCompanyId, setActiveCompanyId, subscribeActiveCompany } from "@/lib/tenant";

type Company = {
  id: number;
  slug?: string | null;
  tradeName?: string | null;
  legalName: string;
  logoUrl?: string | null;
  isPrimary: boolean;
};

export default function CompanySwitcher({ compact = false }: { compact?: boolean }) {
  const { user } = useUser();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<number | null>(getActiveCompanyId());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    try {
      const res = await fetch(buildApiUrl("company/mine"), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        setCompanies(await res.json());
        return;
      }
      const fallback = await fetch(buildApiUrl("company-public/list"));
      if (fallback.ok) setCompanies(await fallback.json());
    } catch {
      // silent
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const unsub = subscribeActiveCompany((id) => setActiveId(id));
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Solo mostrar si hay más de 1 empresa
  if (companies.length < 2) return null;

  const active = activeId != null
    ? companies.find((c) => c.id === activeId)
    : companies.find((c) => c.isPrimary) || companies[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: compact ? "4px 8px" : "6px 12px",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: compact ? 11 : 12,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {active?.logoUrl ? (
          <img src={active.logoUrl} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: "contain" }} />
        ) : (
          <span style={{ width: 18, height: 18, borderRadius: 4, background: "#0ea5e9", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
            {(active?.tradeName || active?.legalName || "?").charAt(0)}
          </span>
        )}
        <span>{active?.tradeName || active?.legalName || "(empresa)"}</span>
        <span style={{ opacity: 0.5 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            minWidth: 240,
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "6px 12px", fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Cambiar empresa activa
          </div>
          {companies.map((c) => {
            const isActive = active?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setActiveCompanyId(c.isPrimary ? null : c.id);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 10,
                  background: isActive ? "var(--bg-secondary)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--text-primary)",
                }}
              >
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "contain" }} />
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: 4, background: "#0ea5e9", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                    {(c.tradeName || c.legalName).charAt(0)}
                  </span>
                )}
                <span style={{ flex: 1, fontSize: 12 }}>{c.tradeName || c.legalName}</span>
                {c.isPrimary && <span style={{ fontSize: 9, color: "#f59e0b" }}>★</span>}
                {isActive && <span style={{ color: "#16a34a" }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
